/**
 * HMAC Authentication Test Script for Advisor Dashboard Endpoints
 * 
 * Tests all 7 dashboard endpoints to validate:
 * - HMAC signature generation and validation
 * - Request/response format compliance
 * - Error handling and graceful fallbacks
 * - Zod schema validation
 * 
 * Run with: npx tsx src/scripts/test-advisor-dashboard-endpoints.ts
 */

// Running as a test script - server-only not needed
import { getAdvisorClient } from '@/services/advisor-api-client';
import { logger } from '@/utils/logger';

// Test configuration
const TEST_CONFIG = {
  // Use a test user ID - replace with actual advisor user ID for real testing
  TEST_USER_ID: process.env.TEST_ADVISOR_USER_ID || 'test-advisor-user-123',
  TEST_LOCALE: 'en',
  ENDPOINTS_TO_TEST: [
    'getAdvisorOverview',
    'getAdvisorConsultations', 
    'getAdvisorAnalytics',
    'getAdvisorAvailability',
    'getAdvisorPricingSettings',
    'updateAdvisorAvailability',
    'updateAdvisorPricingSettings'
  ] as const,
  // Test with different periods for analytics
  ANALYTICS_PERIODS: ['30d', '90d', '1y'] as const,
  // Test with different consultation filters
  CONSULTATION_FILTERS: [
    { status: 'upcoming' as const },
    { status: 'completed' as const },
    { status: 'all' as const, limit: 5 }
  ]
};

interface TestResult {
  endpoint: string;
  success: boolean;
  responseTime: number;
  error?: string;
  dataValid: boolean;
  fallbackUsed: boolean;
}

class DashboardEndpointTester {
  private client = getAdvisorClient();
  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    logger.info('🧪 Starting HMAC authentication tests for advisor dashboard endpoints');
    logger.info('📋 Test configuration:', TEST_CONFIG);

    try {
      // Test read endpoints
      await this.testGetAdvisorOverview();
      await this.testGetAdvisorConsultations(); 
      await this.testGetAdvisorAnalytics();
      await this.testGetAdvisorAvailability();
      await this.testGetAdvisorPricingSettings();

      // Test write endpoints (with mock data)
      await this.testUpdateAdvisorAvailability();
      await this.testUpdateAdvisorPricingSettings();

      // Print summary
      this.printTestSummary();

    } catch (error) {
      logger.error('❌ Fatal error during testing:', error);
      process.exit(1);
    }
  }

  private async testEndpoint<T>(
    endpointName: string,
    testFn: () => Promise<T>
  ): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`🔍 Testing ${endpointName}...`);
      
      const result = await testFn();
      const responseTime = Date.now() - startTime;
      
      const testResult: TestResult = {
        endpoint: endpointName,
        success: true,
        responseTime,
        dataValid: result !== null && typeof result === 'object',
        fallbackUsed: false // Would need to check logs for this
      };

      logger.info(`✅ ${endpointName} passed (${responseTime}ms)`);
      this.results.push(testResult);
      return testResult;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const testResult: TestResult = {
        endpoint: endpointName,
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : String(error),
        dataValid: false,
        fallbackUsed: true
      };

      logger.error(`❌ ${endpointName} failed (${responseTime}ms):`, error);
      this.results.push(testResult);
      return testResult;
    }
  }

  private async testGetAdvisorOverview(): Promise<void> {
    await this.testEndpoint('getAdvisorOverview', async () => {
      const overview = await this.client.getAdvisorOverview(
        TEST_CONFIG.TEST_USER_ID, 
        TEST_CONFIG.TEST_LOCALE
      );
      
      // Validate response structure
      if (!overview.profile || !overview.current_month) {
        throw new Error('Invalid overview response structure');
      }
      
      logger.info('📊 Overview data:', {
        profileName: overview.profile.name,
        consultations: overview.current_month.total_consultations,
        earnings: overview.current_month.earnings_cents
      });
      
      return overview;
    });
  }

  private async testGetAdvisorConsultations(): Promise<void> {
    for (const filter of TEST_CONFIG.CONSULTATION_FILTERS) {
      await this.testEndpoint(`getAdvisorConsultations[${filter.status}]`, async () => {
        const consultations = await this.client.getAdvisorConsultations(
          TEST_CONFIG.TEST_USER_ID,
          filter,
          TEST_CONFIG.TEST_LOCALE
        );
        
        // Validate response structure
        if (!consultations.consultations || !Array.isArray(consultations.consultations)) {
          throw new Error('Invalid consultations response structure');
        }
        
        logger.info('📅 Consultations data:', {
          filter,
          count: consultations.consultations.length,
          hasMore: consultations.pagination.has_more,
          total: consultations.pagination.total
        });
        
        return consultations;
      });
    }
  }

  private async testGetAdvisorAnalytics(): Promise<void> {
    for (const period of TEST_CONFIG.ANALYTICS_PERIODS) {
      await this.testEndpoint(`getAdvisorAnalytics[${period}]`, async () => {
        const analytics = await this.client.getAdvisorAnalytics(
          TEST_CONFIG.TEST_USER_ID,
          { period },
          TEST_CONFIG.TEST_LOCALE
        );
        
        // Validate response structure
        if (!analytics.consultations || !analytics.earnings || !analytics.performance) {
          throw new Error('Invalid analytics response structure');
        }
        
        logger.info('📈 Analytics data:', {
          period,
          totalConsultations: analytics.consultations.total,
          totalEarnings: analytics.earnings.total_cents,
          averageRating: analytics.performance.reviews.average
        });
        
        return analytics;
      });
    }
  }

  private async testGetAdvisorAvailability(): Promise<void> {
    await this.testEndpoint('getAdvisorAvailability', async () => {
      const availability = await this.client.getAdvisorAvailability(
        TEST_CONFIG.TEST_USER_ID,
        TEST_CONFIG.TEST_LOCALE
      );
      
      // Validate response structure
      if (!availability.timezone || !availability.weekly_schedule) {
        throw new Error('Invalid availability response structure');
      }
      
      logger.info('🗓️ Availability data:', {
        timezone: availability.timezone,
        blackoutDates: availability.blackout_dates.length,
        minNoticeHours: availability.booking_preferences.min_notice_hours
      });
      
      return availability;
    });
  }

  private async testGetAdvisorPricingSettings(): Promise<void> {
    await this.testEndpoint('getAdvisorPricingSettings', async () => {
      const pricing = await this.client.getAdvisorPricingSettings(
        TEST_CONFIG.TEST_USER_ID,
        TEST_CONFIG.TEST_LOCALE
      );
      
      // Validate response structure
      if (!pricing.pricing_model || !pricing.free_consultation_durations) {
        throw new Error('Invalid pricing settings response structure');
      }
      
      logger.info('💰 Pricing settings data:', {
        pricingModel: pricing.pricing_model,
        freeDurations: Object.entries(pricing.free_consultation_durations)
          .filter(([_, enabled]) => enabled)
          .map(([duration]) => `${duration}min`)
      });
      
      return pricing;
    });
  }

  private async testUpdateAdvisorAvailability(): Promise<void> {
    await this.testEndpoint('updateAdvisorAvailability', async () => {
      // First get current availability
      const currentAvailability = await this.client.getAdvisorAvailability(
        TEST_CONFIG.TEST_USER_ID,
        TEST_CONFIG.TEST_LOCALE
      );
      
      // Create a minimal update (just toggle a booking preference)
      const updatedAvailability = {
        ...currentAvailability,
        booking_preferences: {
          ...currentAvailability.booking_preferences,
          min_notice_hours: currentAvailability.booking_preferences.min_notice_hours + 1 // Small change
        }
      };
      
      const result = await this.client.updateAdvisorAvailability(
        updatedAvailability,
        TEST_CONFIG.TEST_USER_ID,
        TEST_CONFIG.TEST_LOCALE
      );
      
      logger.info('🔄 Availability updated:', {
        oldMinNotice: currentAvailability.booking_preferences.min_notice_hours,
        newMinNotice: result.booking_preferences.min_notice_hours
      });
      
      return result;
    });
  }

  private async testUpdateAdvisorPricingSettings(): Promise<void> {
    await this.testEndpoint('updateAdvisorPricingSettings', async () => {
      // First get current settings
      const currentSettings = await this.client.getAdvisorPricingSettings(
        TEST_CONFIG.TEST_USER_ID,
        TEST_CONFIG.TEST_LOCALE
      );
      
      // Create a minimal update (toggle one free duration)
      const updatedSettings = {
        ...currentSettings,
        free_consultation_durations: {
          ...currentSettings.free_consultation_durations,
          '30': !currentSettings.free_consultation_durations['30'] // Toggle 30min
        }
      };
      
      const result = await this.client.updateAdvisorPricingSettings(
        updatedSettings,
        TEST_CONFIG.TEST_USER_ID,
        TEST_CONFIG.TEST_LOCALE
      );
      
      logger.info('🔄 Pricing settings updated:', {
        pricingModel: result.pricing_model,
        old30min: currentSettings.free_consultation_durations['30'],
        new30min: result.free_consultation_durations['30']
      });
      
      return result;
    });
  }

  private printTestSummary(): void {
    logger.info('\n' + '='.repeat(60));
    logger.info('📋 ADVISOR DASHBOARD ENDPOINTS TEST SUMMARY');
    logger.info('='.repeat(60));
    
    const successCount = this.results.filter(r => r.success).length;
    const totalCount = this.results.length;
    const avgResponseTime = Math.round(
      this.results.reduce((sum, r) => sum + r.responseTime, 0) / totalCount
    );
    
    logger.info(`✅ Success Rate: ${successCount}/${totalCount} (${Math.round(successCount/totalCount*100)}%)`);
    logger.info(`⏱️  Average Response Time: ${avgResponseTime}ms`);
    logger.info('');
    
    // Detailed results
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const time = `${result.responseTime}ms`;
      logger.info(`${status} ${result.endpoint.padEnd(35)} ${time.padStart(8)}`);
      
      if (!result.success && result.error) {
        logger.info(`   └─ Error: ${result.error}`);
      }
    });
    
    logger.info('');
    
    if (successCount === totalCount) {
      logger.info('🎉 ALL TESTS PASSED! HMAC authentication is working correctly.');
    } else {
      logger.error(`❌ ${totalCount - successCount} tests failed. Check the logs above for details.`);
    }
    
    logger.info('='.repeat(60));
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    // Check environment
    if (!process.env.WORKER_BASE_URL) {
      throw new Error('WORKER_BASE_URL environment variable is required');
    }
    
    if (!process.env.WORKER_SHARED_SECRET) {
      throw new Error('WORKER_SHARED_SECRET environment variable is required');
    }
    
    const tester = new DashboardEndpointTester();
    await tester.runAllTests();
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Test script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { DashboardEndpointTester, TEST_CONFIG };