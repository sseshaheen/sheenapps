import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { 
  ReferralPartner, 
  CreatePartnerRequest, 
  CreatePartnerResponse,
  PartnerDashboardResponse,
  TrackReferralRequest,
  FraudCheckResult,
  VelocityCheck,
  REFERRAL_CONSTANTS,
  TIER_THRESHOLDS
} from '../types/referrals';

// Initialize middleware
const hmacMiddleware = requireHmacSignature;

// Database connection
const { pool } = require('../services/database');

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function generateReferralLink(partnerCode: string): Promise<string> {
  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://app.sheenapps.com';
  return `${baseUrl}/?ref=${partnerCode}`;
}

async function checkFraudRisk(
  partnerId: string, 
  ipAddress: string, 
  userAgent?: string
): Promise<FraudCheckResult> {
  try {
    // Check velocity - max 10 referrals per IP per day
    const velocityResult = await pool.query(`
      SELECT COUNT(*) as referral_count
      FROM referrals r
      WHERE r.partner_id = $1 
        AND r.referred_ip_address = $2
        AND r.created_at > NOW() - INTERVAL '24 hours'
    `, [partnerId, ipAddress]);

    const velocityCount = parseInt(velocityResult.rows[0]?.referral_count || '0');
    
    // Check for self-referral patterns
    const selfReferralResult = await pool.query(`
      SELECT COUNT(*) as self_referral_count
      FROM referrals r
      JOIN referral_partners rp ON r.partner_id = rp.id
      JOIN auth.users u ON rp.user_id = u.id
      JOIN auth.users ru ON r.referred_user_id = ru.id
      WHERE r.partner_id = $1
        AND (u.email = ru.email OR r.referrer_ip_address = r.referred_ip_address)
    `, [partnerId]);

    const selfReferralCount = parseInt(selfReferralResult.rows[0]?.self_referral_count || '0');

    let riskScore = 0;
    const reasons: string[] = [];

    if (velocityCount > REFERRAL_CONSTANTS.VELOCITY_LIMIT_PER_DAY) {
      riskScore += 50;
      reasons.push('High velocity from single IP');
    }

    if (selfReferralCount > 0) {
      riskScore += 80;
      reasons.push('Self-referral detected');
    }

    // Check for suspicious IP patterns
    const ipClusterResult = await pool.query(`
      SELECT COUNT(DISTINCT partner_id) as partner_count
      FROM referrals 
      WHERE referred_ip_address = $1
        AND created_at > NOW() - INTERVAL '7 days'
    `, [ipAddress]);

    const ipClusterCount = parseInt(ipClusterResult.rows[0]?.partner_count || '0');
    if (ipClusterCount > 3) {
      riskScore += 30;
      reasons.push('IP used by multiple partners');
    }

    return {
      is_suspicious: riskScore > 60,
      risk_score: Math.min(riskScore, 100),
      reasons,
      action: riskScore > 80 ? 'block' : riskScore > 60 ? 'flag' : 'allow'
    };

  } catch (error) {
    console.error('[Referrals] Fraud check error:', error);
    return {
      is_suspicious: false,
      risk_score: 0,
      reasons: ['Fraud check failed - allowing with caution'],
      action: 'allow'
    };
  }
}

async function updatePartnerTier(partnerId: string): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT successful_referrals FROM referral_partners WHERE id = $1
    `, [partnerId]);

    const successfulReferrals = parseInt(result.rows[0]?.successful_referrals || '0');
    
    let newTier: 'bronze' | 'silver' | 'gold' = 'bronze';
    if (successfulReferrals >= TIER_THRESHOLDS.GOLD.min) {
      newTier = 'gold';
    } else if (successfulReferrals >= TIER_THRESHOLDS.SILVER.min) {
      newTier = 'silver';
    }

    await pool.query(`
      UPDATE referral_partners 
      SET tier = $1, updated_at = NOW() 
      WHERE id = $2
    `, [newTier, partnerId]);

  } catch (error) {
    console.error('[Referrals] Failed to update partner tier:', error);
  }
}

// =====================================================
// ROUTE HANDLERS
// =====================================================

async function createPartner(
  request: FastifyRequest<{ Body: CreatePartnerRequest & { userId: string } }>,
  reply: FastifyReply
) {
  const { userId, company_name, website_url, marketing_channels, payout_method, terms_accepted } = request.body;

  try {
    if (!terms_accepted) {
      return reply.code(400).send({ 
        success: false, 
        error: 'Terms and conditions must be accepted' 
      });
    }

    // Check if user already has a partner account
    const existingResult = await pool.query(`
      SELECT id FROM referral_partners WHERE user_id = $1
    `, [userId]);

    if (existingResult.rows.length > 0) {
      return reply.code(409).send({ 
        success: false, 
        error: 'User already has a referral partner account' 
      });
    }

    // Create new partner
    const insertResult = await pool.query(`
      INSERT INTO referral_partners (
        user_id, company_name, website_url, marketing_channels, payout_method, terms_accepted_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [userId, company_name, website_url, marketing_channels, payout_method]);

    const partner = insertResult.rows[0] as ReferralPartner;
    const referral_link = await generateReferralLink(partner.partner_code);

    console.log(`[Referrals] Created new partner ${partner.id} for user ${userId}`);

    return reply.send({
      success: true,
      partner,
      referral_link
    } as CreatePartnerResponse);

  } catch (error) {
    console.error('[Referrals] Failed to create partner:', error);
    return reply.code(500).send({ 
      success: false, 
      error: 'Failed to create referral partner account' 
    });
  }
}

async function getPartnerDashboard(
  request: FastifyRequest<{ Querystring: { userId: string } }>,
  reply: FastifyReply
) {
  const { userId } = request.query;

  try {
    // Get partner info
    const partnerResult = await pool.query(`
      SELECT * FROM referral_partners WHERE user_id = $1
    `, [userId]);

    if (partnerResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Referral partner not found' });
    }

    const partner = partnerResult.rows[0] as ReferralPartner;

    // Get comprehensive stats
    const statsResult = await pool.query(`
      SELECT 
        -- Click tracking from sessions
        COALESCE(SUM(rts.click_count), 0) as total_clicks,
        
        -- Total referrals (signups)
        COUNT(DISTINCT r.id) as total_signups,
        
        -- Conversion rate calculation
        CASE 
          WHEN COALESCE(SUM(rts.click_count), 0) > 0 
          THEN ROUND((COUNT(DISTINCT r.id)::decimal / SUM(rts.click_count)) * 100, 2)
          ELSE 0
        END as conversion_rate,
        
        -- Commission calculations
        COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.commission_amount_cents ELSE 0 END), 0) as pending_commissions_cents,
        COALESCE(SUM(CASE WHEN c.status IN ('approved', 'paid') THEN c.commission_amount_cents ELSE 0 END), 0) as approved_commissions_cents,
        
        -- Estimated monthly payout (pending + approved commissions that haven't been paid)
        COALESCE(SUM(CASE WHEN c.status IN ('pending', 'approved') THEN c.commission_amount_cents ELSE 0 END), 0) as estimated_monthly_payout_cents
        
      FROM referral_partners rp
      LEFT JOIN referral_tracking_sessions rts ON rp.id = rts.partner_id
      LEFT JOIN referrals r ON rp.id = r.partner_id
      LEFT JOIN referral_commissions c ON r.id = c.referral_id
      WHERE rp.id = $1
      GROUP BY rp.id
    `, [partner.id]);

    const stats = statsResult.rows[0] || {
      total_clicks: 0,
      total_signups: 0,
      conversion_rate: 0,
      pending_commissions_cents: 0,
      approved_commissions_cents: 0,
      estimated_monthly_payout_cents: 0
    };

    // Get recent referrals
    const recentReferralsResult = await pool.query(`
      SELECT r.*, u.email as referred_user_email
      FROM referrals r
      LEFT JOIN auth.users u ON r.referred_user_id = u.id
      WHERE r.partner_id = $1
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [partner.id]);

    // Get recent commissions
    const recentCommissionsResult = await pool.query(`
      SELECT c.*, r.referral_code
      FROM referral_commissions c
      LEFT JOIN referrals r ON c.referral_id = r.id
      WHERE c.partner_id = $1
      ORDER BY c.created_at DESC
      LIMIT 10
    `, [partner.id]);

    return reply.send({
      partner,
      stats: {
        total_clicks: parseInt(stats.total_clicks),
        total_signups: parseInt(stats.total_signups),
        conversion_rate: parseFloat(stats.conversion_rate),
        pending_commissions_cents: parseInt(stats.pending_commissions_cents),
        approved_commissions_cents: parseInt(stats.approved_commissions_cents),
        estimated_monthly_payout_cents: parseInt(stats.estimated_monthly_payout_cents)
      },
      recent_referrals: recentReferralsResult.rows,
      recent_commissions: recentCommissionsResult.rows
    } as PartnerDashboardResponse);

  } catch (error) {
    console.error('[Referrals] Failed to get partner dashboard:', error);
    return reply.code(500).send({ error: 'Failed to retrieve partner dashboard' });
  }
}

async function trackReferralClick(
  request: FastifyRequest<{ Body: { partner_code: string; ip_address: string; user_agent?: string } }>,
  reply: FastifyReply
) {
  const { partner_code, ip_address, user_agent } = request.body;

  try {
    // Get partner ID from code
    const partnerResult = await pool.query(`
      SELECT id FROM referral_partners WHERE partner_code = $1 AND status = 'active'
    `, [partner_code]);

    if (partnerResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Invalid referral code' });
    }

    const partnerId = partnerResult.rows[0].id;

    // Create or update tracking session
    const sessionId = `${ip_address}-${user_agent || 'unknown'}`.substring(0, 100);
    
    await pool.query(`
      INSERT INTO referral_tracking_sessions (partner_id, session_id, ip_address, user_agent, click_count)
      VALUES ($1, $2, $3, $4, 1)
      ON CONFLICT (session_id, partner_id) 
      DO UPDATE SET 
        click_count = referral_tracking_sessions.click_count + 1,
        last_seen = NOW()
    `, [partnerId, sessionId, ip_address, user_agent]);

    return reply.send({ success: true, tracked: true });

  } catch (error) {
    console.error('[Referrals] Failed to track referral click:', error);
    return reply.code(500).send({ error: 'Failed to track referral' });
  }
}

async function createReferral(
  request: FastifyRequest<{ Body: TrackReferralRequest & { userId: string } }>,
  reply: FastifyReply
) {
  const { 
    userId, partner_code, attribution_method, utm_source, utm_medium, 
    utm_campaign, ip_address, user_agent 
  } = request.body;

  try {
    // Get partner
    const partnerResult = await pool.query(`
      SELECT id, user_id FROM referral_partners WHERE partner_code = $1 AND status = 'active'
    `, [partner_code]);

    if (partnerResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Invalid referral code' });
    }

    const partner = partnerResult.rows[0];

    // Prevent self-referral
    if (partner.user_id === userId) {
      return reply.code(400).send({ error: 'Self-referral not allowed' });
    }

    // Check if referral already exists
    const existingResult = await pool.query(`
      SELECT id FROM referrals WHERE partner_id = $1 AND referred_user_id = $2
    `, [partner.id, userId]);

    if (existingResult.rows.length > 0) {
      return reply.send({ success: true, message: 'Referral already tracked' });
    }

    // Fraud check
    const fraudCheck = await checkFraudRisk(partner.id, ip_address, user_agent);
    
    if (fraudCheck.action === 'block') {
      console.log(`[Referrals] Blocked suspicious referral: ${JSON.stringify(fraudCheck)}`);
      return reply.code(403).send({ error: 'Referral blocked due to suspicious activity' });
    }

    // Create referral
    const insertResult = await pool.query(`
      INSERT INTO referrals (
        partner_id, referred_user_id, attribution_method, referral_code,
        referrer_ip_address, referred_ip_address, user_agent,
        utm_source, utm_medium, utm_campaign
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      partner.id, userId, attribution_method, partner_code,
      ip_address, ip_address, user_agent,
      utm_source, utm_medium, utm_campaign
    ]);

    const referralId = insertResult.rows[0].id;

    // Update tracking session
    const sessionId = `${ip_address}-${user_agent || 'unknown'}`.substring(0, 100);
    await pool.query(`
      UPDATE referral_tracking_sessions 
      SET signup_count = signup_count + 1, unique_users_referred = unique_users_referred + 1
      WHERE partner_id = $1 AND session_id = $2
    `, [partner.id, sessionId]);

    // Flag if suspicious
    if (fraudCheck.action === 'flag') {
      await pool.query(`
        UPDATE referral_tracking_sessions 
        SET is_suspicious = true, suspicion_reasons = $1
        WHERE partner_id = $2 AND session_id = $3
      `, [fraudCheck.reasons, partner.id, sessionId]);
    }

    console.log(`[Referrals] Created referral ${referralId} for partner ${partner.id}`);

    return reply.send({ 
      success: true, 
      referral_id: referralId,
      fraud_check: fraudCheck.action === 'flag' ? 'flagged' : 'clean'
    });

  } catch (error) {
    console.error('[Referrals] Failed to create referral:', error);
    return reply.code(500).send({ error: 'Failed to create referral' });
  }
}

// =====================================================
// ROUTE REGISTRATION
// =====================================================

export function registerReferralPartnerRoutes(app: FastifyInstance) {
  console.log('[Referrals] Registering referral partner API routes...');

  // POST /v1/referrals/partners - Create new referral partner
  app.post<{ Body: CreatePartnerRequest & { userId: string } }>(
    '/v1/referrals/partners',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            company_name: { type: 'string', maxLength: 255 },
            website_url: { type: 'string', maxLength: 500 },
            marketing_channels: { type: 'array', items: { type: 'string' } },
            payout_method: { type: 'string', enum: ['stripe', 'paypal', 'wire', 'wise'] },
            terms_accepted: { type: 'boolean' }
          },
          required: ['userId', 'terms_accepted']
        }
      }
    },
    createPartner
  );

  // GET /v1/referrals/dashboard - Get partner dashboard
  app.get<{ Querystring: { userId: string } }>(
    '/v1/referrals/dashboard',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' }
          },
          required: ['userId']
        }
      }
    },
    getPartnerDashboard
  );

  // POST /v1/referrals/track-click - Track referral link click (no auth required)
  app.post<{ Body: { partner_code: string; ip_address: string; user_agent?: string } }>(
    '/v1/referrals/track-click',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            partner_code: { type: 'string', maxLength: 20 },
            ip_address: { type: 'string' },
            user_agent: { type: 'string', maxLength: 1000 }
          },
          required: ['partner_code', 'ip_address']
        }
      }
    },
    trackReferralClick
  );

  // POST /v1/referrals/signup - Track successful referral signup
  app.post<{ Body: TrackReferralRequest & { userId: string } }>(
    '/v1/referrals/signup',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            partner_code: { type: 'string', maxLength: 20 },
            attribution_method: { type: 'string', enum: ['cookie', 'email_match', 'referral_code'] },
            utm_source: { type: 'string', maxLength: 100 },
            utm_medium: { type: 'string', maxLength: 100 },
            utm_campaign: { type: 'string', maxLength: 100 },
            ip_address: { type: 'string' },
            user_agent: { type: 'string', maxLength: 1000 }
          },
          required: ['userId', 'partner_code', 'attribution_method', 'ip_address']
        }
      }
    },
    createReferral
  );

  console.log('[Referrals] Referral partner API routes registered successfully');
}