import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClientNew } from '@/lib/supabase';
import { withApiAuth } from '@/lib/auth-middleware';
import { QuotaLogger } from '@/services/quota/quota-logger';
import crypto from 'crypto';

interface QuotaCheckOptions {
  metric: 'ai_generations' | 'exports' | 'projects';
  amount?: number;
  extractAmount?: (req: NextRequest) => number;
  skipOnError?: boolean;
}

export function withQuotaCheck(
  handler: (request: NextRequest, context: any) => Promise<NextResponse>,
  options: QuotaCheckOptions
) {
  return withApiAuth(async (
    request: NextRequest,
    context: { user: any }
  ) => {
    const supabase = await createServerSupabaseClientNew();
    const amount = options.extractAmount?.(request) || options.amount || 1;
    
    // Generate idempotency key from request
    const idempotencyKey = request.headers.get('x-idempotency-key') || 
      generateIdempotencyKey(request, context.user.id, options.metric);
    
    try {
      // Call atomic RPC function
      const { data, error } = await supabase.rpc('check_and_consume_quota', {
        p_user_id: context.user.id,
        p_metric: options.metric,
        p_amount: amount,
        p_idempotency_key: idempotencyKey
      });
      
      if (error) throw error;
      
      const result = data && data.length > 0 ? data[0] : null;
      
      if (!result) {
        throw new Error('No result from quota check');
      }
      
      // If already processed, return success
      if (result.already_processed) {
        return NextResponse.json({ 
          success: true, 
          cached: true 
        });
      }
      
      // If not allowed, return quota error
      if (!result.allowed) {
        // Log denial for monitoring
        await QuotaLogger.logDenial(
          context.user.id,
          options.metric,
          amount,
          result.remaining,
          request.url
        );
        
        // Note: Audit logging already handled in RPC function
        return NextResponse.json({
          error: 'Quota exceeded',
          code: 'QUOTA_EXCEEDED',
          details: {
            metric: options.metric,
            requested: amount,
            remaining: result.remaining,
            limit: result.limit_amount
          },
          upgradeUrl: '/dashboard/billing'
        }, { status: 403 });
      }
      
      // Log successful consumption for monitoring
      await QuotaLogger.logConsumption(
        context.user.id,
        options.metric,
        amount,
        result.remaining,
        result.bonus_used,
        request.url
      );

      // Analyze usage patterns for anomaly detection
      const analysis = await QuotaLogger.analyzeUsagePattern(
        context.user.id,
        options.metric
      );

      // Add quota info to context
      const enrichedContext = {
        ...context,
        quota: {
          consumed: amount,
          remaining: result.remaining,
          bonusUsed: result.bonus_used,
          idempotencyKey,
          usageAnalysis: analysis
        }
      };
      
      // Call the actual handler
      return handler(request, enrichedContext);
      
    } catch (error) {
      console.error('Quota check failed:', error);
      
      if (options.skipOnError) {
        // Continue without quota check (risky!)
        return handler(request, context);
      }
      
      return NextResponse.json({
        error: 'Failed to check quota',
        code: 'QUOTA_CHECK_FAILED'
      }, { status: 500 });
    }
  }, { requireAuth: true });
}

function generateIdempotencyKey(
  request: NextRequest, 
  userId: string,
  metric: string
): string {
  const method = request.method;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const searchParams = url.searchParams.toString();
  
  // Check if client provided an idempotency key
  const clientKey = request.headers.get('x-idempotency-key');
  if (clientKey) {
    // Scope client key to user and metric to prevent cross-user/metric replay
    return crypto.createHash('sha256')
      .update(`${userId}:${metric}:${clientKey}`)
      .digest('hex');
  }
  
  // For GET/DELETE requests, URL alone is sufficient for idempotency
  if (method === 'GET' || method === 'DELETE') {
    const data = `${method}:${pathname}:${searchParams}:${userId}:${metric}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  // For POST/PUT without client key, we use a time window approach
  // This prevents accidental duplicate submissions within a short window
  // while still allowing legitimate repeated requests after the window
  const timeWindow = Math.floor(Date.now() / 5000); // 5-second windows
  let data = `${method}:${pathname}:${userId}:${metric}:window-${timeWindow}`;
  
  // Include key query params that might differentiate requests
  const keyParams = ['projectId', 'templateId', 'format'];
  keyParams.forEach(param => {
    const value = url.searchParams.get(param);
    if (value) data += `:${param}-${value}`;
  });
  
  return crypto.createHash('sha256').update(data).digest('hex');
}