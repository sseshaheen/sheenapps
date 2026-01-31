#!/usr/bin/env tsx

/**
 * Test data seeding for E2E tests
 * Creates deterministic test data for P0 critical flows via worker backend API
 * 
 * Usage:
 * npm run db:seed:test
 * npm run db:seed:test cleanup
 * MOCK_SUPABASE=true npm run db:seed:test  # For environments without backend
 * 
 * Expert-validated architecture using API endpoints that proxy to worker backend
 * This follows your established pattern of never using service role keys directly
 * 
 * @see /src/app/api/test/seed/route.ts - API endpoint implementation
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env files in order of precedence
// This follows Next.js environment loading pattern
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env.test.local') })
config({ path: resolve(process.cwd(), '.env.development') })
config({ path: resolve(process.cwd(), '.env') })

// Seeding version for tracking changes
const SEED_VERSION = '1.0.0'

interface SeedResult {
  success: boolean
  message: string
  data?: any
}

/**
 * Get base URL for API calls
 */
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 
         process.env.NEXT_PUBLIC_APP_URL || 
         process.env.BASE_URL || 
         'http://localhost:3000'
}

/**
 * Main seeding function via API endpoint
 * Calls worker backend through secure API proxy
 */
async function seedTestData(): Promise<SeedResult> {
  console.log('🌱 Starting test data seeding via API...')
  console.log(`📦 Version: ${SEED_VERSION}`)
  
  try {
    // Check if mock mode is enabled
    if (process.env.MOCK_SUPABASE === 'true') {
      console.log('🎭 Mock mode enabled - simulating test data seeding')
      return {
        success: true,
        message: 'Test data seeding completed successfully (mock mode)',
        data: { version: SEED_VERSION, mode: 'mock' }
      }
    }
    
    const baseUrl = getBaseUrl()
    console.log(`🔗 Calling seeding API: ${baseUrl}/api/test/seed`)
    
    // Call the API endpoint which proxies to worker backend
    const response = await fetch(`${baseUrl}/api/test/seed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Mode': 'true'
      },
      body: JSON.stringify({ version: SEED_VERSION })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      return {
        success: false,
        message: `API seeding failed (${response.status}): ${errorData.message || errorData.error}`
      }
    }
    
    const result: SeedResult = await response.json()
    
    console.log('✅ Test data seeding completed via API')
    return result
    
  } catch (error: any) {
    console.error('❌ Test data seeding failed:', error)
    
    // Provide helpful troubleshooting information
    if (error.code === 'ECONNREFUSED') {
      return {
        success: false,
        message: `Connection refused - is the development server running at ${getBaseUrl()}?\n\nTry: npm run dev\n\nFor mock mode: MOCK_SUPABASE=true npm run db:seed:test`
      }
    }
    
    return {
      success: false,
      message: `Seeding failed: ${error.message}`
    }
  }
}

/**
 * Cleanup test data via API endpoint
 * Calls worker backend through secure API proxy
 */
async function cleanupTestData(): Promise<SeedResult> {
  console.log('🧹 Cleaning up test data via API...')
  
  try {
    // Check if mock mode is enabled
    if (process.env.MOCK_SUPABASE === 'true') {
      console.log('🎭 Mock mode enabled - simulating test data cleanup')
      return {
        success: true,
        message: 'Test data cleanup completed successfully (mock mode)'
      }
    }
    
    const baseUrl = getBaseUrl()
    console.log(`🔗 Calling cleanup API: ${baseUrl}/api/test/seed`)
    
    // Call the API endpoint which proxies to worker backend
    const response = await fetch(`${baseUrl}/api/test/seed`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Mode': 'true'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      return {
        success: false,
        message: `API cleanup failed (${response.status}): ${errorData.message || errorData.error}`
      }
    }
    
    const result: SeedResult = await response.json()
    
    console.log('✅ Test data cleanup completed via API')
    return result
    
  } catch (error: any) {
    console.error('❌ Test data cleanup failed:', error)
    
    // Provide helpful troubleshooting information
    if (error.code === 'ECONNREFUSED') {
      return {
        success: false,
        message: `Connection refused - is the development server running at ${getBaseUrl()}?\n\nTry: npm run dev\n\nFor mock mode: MOCK_SUPABASE=true npm run db:seed:test cleanup`
      }
    }
    
    return {
      success: false,
      message: `Cleanup failed: ${error.message}`
    }
  }
}

// CLI interface
async function main() {
  const command = process.argv[2]
  
  let result: SeedResult
  
  switch (command) {
    case 'cleanup':
      result = await cleanupTestData()
      break
    default:
      result = await seedTestData()
      break
  }
  
  if (result.success) {
    console.log(`✅ ${result.message}`)
    process.exit(0)
  } else {
    console.error(`❌ ${result.message}`)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { seedTestData, cleanupTestData }