#!/usr/bin/env tsx
/**
 * Seed Data Script for Admin Panel Development
 * 
 * This script populates the database with test data for:
 * - Support tickets with various statuses and SLA metrics
 * - Pricing catalogs and items
 * - Test advisors and applications
 * 
 * Usage: npm run seed:admin
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function createTestUsers() {
  console.log('📦 Creating test users...');
  
  const testUsers = [
    { email: 'test.customer1@example.com', name: 'John Customer', role: 'user' },
    { email: 'test.customer2@example.com', name: 'Jane Customer', role: 'user' },
    { email: 'test.advisor1@example.com', name: 'Alice Advisor', role: 'advisor' },
    { email: 'test.advisor2@example.com', name: 'Bob Advisor', role: 'advisor' },
    { email: 'test.support@example.com', name: 'Support Agent', role: 'support' },
  ];

  const createdUsers = [];
  
  for (const user of testUsers) {
    try {
      // Check if user exists
      const { data: existingUser } = await supabase.auth.admin.listUsers();
      const exists = existingUser?.users.find(u => u.email === user.email);
      
      if (!exists) {
        const { data, error } = await supabase.auth.admin.createUser({
          email: user.email,
          password: 'TestPassword123!',
          email_confirm: true,
          user_metadata: {
            display_name: user.name,
            role: user.role
          }
        });
        
        if (data?.user) {
          createdUsers.push(data.user);
          console.log(`  ✅ Created user: ${user.email}`);
        } else if (error) {
          console.log(`  ⚠️  Error creating ${user.email}:`, error.message);
        }
      } else {
        createdUsers.push(exists);
        console.log(`  ℹ️  User already exists: ${user.email}`);
      }
    } catch (err) {
      console.error(`  ❌ Failed to create ${user.email}:`, err);
    }
  }
  
  return createdUsers;
}

async function seedSupportTickets(users: any[]) {
  console.log('\n📋 Creating support tickets...');
  
  const customerIds = users.filter(u => u.email?.includes('customer')).map(u => u.id);
  const supportAgentId = users.find(u => u.email?.includes('support'))?.id;
  
  if (customerIds.length === 0) {
    console.log('  ⚠️  No customer users found, skipping tickets');
    return;
  }

  const tickets = [
    {
      ticket_number: 'TKT-2024-001',
      subject: 'Cannot access my account',
      category: 'account',
      priority: 'urgent',
      status: 'open',
      user_id: customerIds[0],
      description: 'I keep getting an error when trying to login',
      sla_due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // Due in 2 hours
      created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // Created 1 hour ago
    },
    {
      ticket_number: 'TKT-2024-002', 
      subject: 'Billing question about subscription',
      category: 'billing',
      priority: 'high',
      status: 'in_progress',
      user_id: customerIds[1] || customerIds[0],
      assigned_to: supportAgentId,
      description: 'I was charged twice for my subscription',
      sla_due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      first_response_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      ticket_number: 'TKT-2024-003',
      subject: 'Feature request: dark mode',
      category: 'feature_request', 
      priority: 'low',
      status: 'resolved',
      user_id: customerIds[0],
      assigned_to: supportAgentId,
      description: 'Would love to have a dark mode option',
      sla_due_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      first_response_at: new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(),
      resolved_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    },
    {
      ticket_number: 'TKT-2024-004',
      subject: 'Bug report: Page not loading',
      category: 'bug',
      priority: 'medium',
      status: 'waiting_user',
      user_id: customerIds[1] || customerIds[0],
      description: 'The dashboard page shows a blank screen',
      sla_due_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    },
    {
      ticket_number: 'TKT-2024-005',
      subject: 'SLA breach test - overdue ticket',
      category: 'technical',
      priority: 'urgent', 
      status: 'open',
      user_id: customerIds[0],
      description: 'This ticket is for testing SLA breach scenarios',
      sla_due_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // Already breached
      created_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
    }
  ];

  for (const ticket of tickets) {
    try {
      const result = await pool.query(`
        INSERT INTO support_tickets (
          ticket_number, subject, category, priority, status, 
          user_id, assigned_to, description, sla_due_at,
          created_at, first_response_at, resolved_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (ticket_number) DO UPDATE
        SET 
          subject = EXCLUDED.subject,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING id
      `, [
        ticket.ticket_number,
        ticket.subject,
        ticket.category,
        ticket.priority,
        ticket.status,
        ticket.user_id,
        ticket.assigned_to || null,
        ticket.description,
        ticket.sla_due_at,
        ticket.created_at,
        ticket.first_response_at || null,
        ticket.resolved_at || null
      ]);
      
      console.log(`  ✅ Created ticket: ${ticket.ticket_number} - ${ticket.subject}`);
    } catch (err) {
      console.error(`  ❌ Failed to create ticket ${ticket.ticket_number}:`, err);
    }
  }
}

async function seedPricingCatalogs() {
  console.log('\n💰 Creating pricing catalogs...');
  
  try {
    // Create active catalog
    const catalogResult = await pool.query(`
      INSERT INTO pricing_catalog_versions (
        id, version_tag, is_active, rollover_days, created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (version_tag) DO UPDATE
      SET is_active = EXCLUDED.is_active
      RETURNING id
    `, [
      uuidv4(),
      'v2025.01',
      true,
      90,
      'system'
    ]);
    
    const catalogId = catalogResult.rows[0].id;
    console.log(`  ✅ Created catalog: v2025.01 (active)`);
    
    // Create pricing items
    const pricingItems = [
      // Subscriptions
      {
        item_key: 'basic_monthly',
        item_type: 'subscription',
        display_name: 'Basic Monthly',
        description: 'Basic plan with 100 AI minutes per month',
        price_cents: 999,
        currency: 'USD',
        billing_period: 'monthly',
        features: { ai_minutes: 100, projects: 5, support: 'email' },
        limits: { api_calls: 1000, storage_gb: 5 },
        display_order: 1
      },
      {
        item_key: 'pro_monthly', 
        item_type: 'subscription',
        display_name: 'Pro Monthly',
        description: 'Pro plan with 500 AI minutes per month',
        price_cents: 2999,
        currency: 'USD',
        billing_period: 'monthly',
        features: { ai_minutes: 500, projects: 20, support: 'priority' },
        limits: { api_calls: 10000, storage_gb: 25 },
        display_order: 2
      },
      {
        item_key: 'enterprise_monthly',
        item_type: 'subscription',
        display_name: 'Enterprise Monthly',
        description: 'Enterprise plan with unlimited AI minutes',
        price_cents: 9999,
        currency: 'USD',
        billing_period: 'monthly',
        features: { ai_minutes: 'unlimited', projects: 'unlimited', support: 'dedicated' },
        limits: { api_calls: 'unlimited', storage_gb: 500 },
        display_order: 3
      },
      // Packages (one-time purchases)
      {
        item_key: 'starter_pack',
        item_type: 'package',
        display_name: 'Starter Pack',
        description: '50 AI minutes one-time purchase',
        price_cents: 499,
        currency: 'USD',
        billing_period: 'once',
        features: { ai_minutes: 50 },
        limits: { validity_days: 30 },
        display_order: 4
      },
      {
        item_key: 'power_pack',
        item_type: 'package',
        display_name: 'Power Pack',
        description: '200 AI minutes one-time purchase',
        price_cents: 1499,
        currency: 'USD',
        billing_period: 'once',
        features: { ai_minutes: 200 },
        limits: { validity_days: 60 },
        display_order: 5
      },
      {
        item_key: 'mega_pack',
        item_type: 'package',
        display_name: 'Mega Pack',
        description: '1000 AI minutes one-time purchase',
        price_cents: 4999,
        currency: 'USD',
        billing_period: 'once',
        features: { ai_minutes: 1000 },
        limits: { validity_days: 90 },
        display_order: 6
      }
    ];
    
    for (const item of pricingItems) {
      await pool.query(`
        INSERT INTO pricing_items (
          id, catalog_version_id, item_key, item_type, display_name,
          description, price_cents, currency, billing_period,
          features, limits, is_active, display_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (catalog_version_id, item_key) DO UPDATE
        SET 
          display_name = EXCLUDED.display_name,
          price_cents = EXCLUDED.price_cents,
          updated_at = NOW()
      `, [
        uuidv4(),
        catalogId,
        item.item_key,
        item.item_type,
        item.display_name,
        item.description,
        item.price_cents,
        item.currency,
        item.billing_period,
        JSON.stringify(item.features),
        JSON.stringify(item.limits),
        true,
        item.display_order
      ]);
      
      console.log(`  ✅ Created pricing item: ${item.display_name} (${item.item_key})`);
    }
    
    // Create an inactive catalog for testing
    await pool.query(`
      INSERT INTO pricing_catalog_versions (
        id, version_tag, is_active, rollover_days, created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (version_tag) DO NOTHING
    `, [
      uuidv4(),
      'v2024.12',
      false,
      90,
      'system'
    ]);
    console.log(`  ✅ Created catalog: v2024.12 (inactive)`);
    
  } catch (err) {
    console.error('  ❌ Failed to create pricing catalogs:', err);
  }
}

async function seedAdvisors(users: any[]) {
  console.log('\n👩‍💼 Creating test advisors...');
  
  const advisorUsers = users.filter(u => u.email?.includes('advisor'));
  
  if (advisorUsers.length === 0) {
    console.log('  ⚠️  No advisor users found, skipping advisors');
    return;
  }

  const advisors = [
    {
      user_id: advisorUsers[0].id,
      display_name: 'Alice Anderson',
      bio: 'Senior software architect with 10+ years of experience in cloud solutions',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
      skills: ['AWS', 'Kubernetes', 'Microservices', 'DevOps'],
      specialties: ['cloud-architecture', 'devops', 'scalability'],
      languages: ['en', 'es'],
      cal_com_event_type_url: 'https://cal.com/alice-anderson/consultation',
      country_code: 'US',
      approval_status: 'approved',
      is_accepting_bookings: true,
      rating: 4.8,
      review_count: 42,
      pricing_model: 'hybrid',
      free_consultation_durations: { '15': true, '30': false, '60': false }
    },
    {
      user_id: advisorUsers[1] || advisorUsers[0].id,
      display_name: 'Bob Brown',
      bio: 'Full-stack developer specializing in React and Node.js applications',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
      skills: ['React', 'Node.js', 'TypeScript', 'GraphQL'],
      specialties: ['web-development', 'frontend', 'backend'],
      languages: ['en', 'fr'],
      cal_com_event_type_url: 'https://cal.com/bob-brown/consultation',
      country_code: 'CA',
      approval_status: 'approved',
      is_accepting_bookings: true,
      rating: 4.6,
      review_count: 28,
      pricing_model: 'platform_fixed',
      free_consultation_durations: {}
    },
    {
      user_id: uuidv4(), // Pending advisor without user
      display_name: 'Charlie Chen',
      bio: 'Mobile app developer with expertise in React Native and Flutter',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
      skills: ['React Native', 'Flutter', 'iOS', 'Android'],
      specialties: ['mobile-development', 'cross-platform'],
      languages: ['en', 'zh'],
      country_code: 'SG',
      approval_status: 'pending',
      is_accepting_bookings: false
    }
  ];

  for (const advisor of advisors) {
    try {
      await pool.query(`
        INSERT INTO advisors (
          user_id, display_name, bio, avatar_url, skills, specialties,
          languages, cal_com_event_type_url, country_code, approval_status,
          is_accepting_bookings, rating, review_count, pricing_model,
          free_consultation_durations, approved_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (user_id) DO UPDATE
        SET 
          display_name = EXCLUDED.display_name,
          approval_status = EXCLUDED.approval_status,
          updated_at = NOW()
      `, [
        advisor.user_id,
        advisor.display_name,
        advisor.bio,
        advisor.avatar_url,
        advisor.skills,
        advisor.specialties,
        advisor.languages,
        advisor.cal_com_event_type_url || null,
        advisor.country_code,
        advisor.approval_status,
        advisor.is_accepting_bookings || false,
        advisor.rating || null,
        advisor.review_count || 0,
        advisor.pricing_model || 'platform_fixed',
        JSON.stringify(advisor.free_consultation_durations || {}),
        advisor.approval_status === 'approved' ? new Date().toISOString() : null
      ]);
      
      console.log(`  ✅ Created advisor: ${advisor.display_name} (${advisor.approval_status})`);
    } catch (err) {
      console.error(`  ❌ Failed to create advisor ${advisor.display_name}:`, err);
    }
  }
}

async function main() {
  console.log('🚀 Starting Admin Panel Data Seeding...\n');
  
  try {
    // Create test users first
    const users = await createTestUsers();
    
    // Seed data
    await seedSupportTickets(users);
    await seedPricingCatalogs();
    await seedAdvisors(users);
    
    console.log('\n✨ Seeding completed successfully!');
    console.log('\n📝 Test Credentials:');
    console.log('  Email: test.customer1@example.com');
    console.log('  Password: TestPassword123!');
    console.log('\n  Other test users use the same password.');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main().catch(console.error);