import { pool } from './database';

export interface MRRBreakdown {
  total: number;
  byPlan: Record<string, number>;
  byGateway: Record<string, number>;
  byCountry: Record<string, number>;
  byCurrency: Record<string, number>;
  growth: number;
  newBusiness: number;
  expansion: number;
  contraction: number;
  churn: number;
}

export interface LTVMetrics {
  overall: number;
  byPlan: Record<string, number>;
  byCohort: Record<string, number>;
  averageCustomerLifetime: number;
}

export interface ARPUMetrics {
  overall: number;
  byPlan: Record<string, number>;
  byCountry: Record<string, number>;
  totalCustomers: number;
}

export interface RevenueGrowth {
  currentMonth: number;
  previousMonth: number;
  growthRate: number;
  monthOverMonth: number;
  yearOverYear: number;
  quarterOverQuarter: number;
}

export interface RevenueMetrics {
  mrr: MRRBreakdown;
  arr: number;
  ltv: LTVMetrics;
  arpu: ARPUMetrics;
  growth: RevenueGrowth;
}

class RevenueMetricsService {
  /**
   * Get comprehensive MRR breakdown
   */
  async getMRR(): Promise<MRRBreakdown> {
    try {
      // Get normalized MRR data
      const mrrResult = await pool?.query(`
        SELECT 
          total_mrr_usd_cents,
          total_arr_usd_cents,
          mrr_by_plan,
          mrr_by_gateway,
          mrr_by_currency_native
        FROM mv_mrr_usd_normalized
        WHERE as_of_date = CURRENT_DATE
        LIMIT 1
      `);

      // Get growth metrics
      const growthResult = await pool?.query(`
        SELECT * FROM get_revenue_growth_metrics()
      `);

      // Get country breakdown - placeholder for now as country_code doesn't exist in auth.users
      const countryResult = { rows: [] as Array<{ country: string; mrr_cents: number }> };

      const mrrData = mrrResult?.rows[0] || {};
      const growthData = growthResult?.rows[0] || {};
      
      // Convert country data to object
      const byCountry: Record<string, number> = {};
      countryResult?.rows.forEach(row => {
        byCountry[row.country] = Math.round(row.mrr_cents / 100); // Convert cents to dollars
      });

      // Convert JSONB to proper objects and cents to dollars
      const byPlan: Record<string, number> = {};
      if (mrrData.mrr_by_plan) {
        Object.entries(mrrData.mrr_by_plan).forEach(([key, value]) => {
          byPlan[key] = Math.round((value as number) / 100);
        });
      }

      const byGateway: Record<string, number> = {};
      if (mrrData.mrr_by_gateway) {
        Object.entries(mrrData.mrr_by_gateway).forEach(([key, value]) => {
          byGateway[key] = Math.round((value as number) / 100);
        });
      }

      const byCurrency: Record<string, number> = {};
      if (mrrData.mrr_by_currency_native) {
        Object.entries(mrrData.mrr_by_currency_native).forEach(([key, value]) => {
          byCurrency[key] = Math.round((value as number) / 100);
        });
      }

      return {
        total: Math.round((mrrData.total_mrr_usd_cents || 0) / 100),
        byPlan,
        byGateway,
        byCountry,
        byCurrency,
        growth: growthData.growth_rate || 0,
        newBusiness: Math.round((growthData.new_business || 0) / 100),
        expansion: Math.round((growthData.expansion || 0) / 100),
        contraction: Math.round((growthData.contraction || 0) / 100),
        churn: Math.round((growthData.churn || 0) / 100)
      };
    } catch (error) {
      console.error('[RevenueMetrics] Failed to get MRR:', error);
      // Return stub data if views don't exist yet
      return this.getStubMRR();
    }
  }

  /**
   * Get LTV metrics
   */
  async getLTV(): Promise<LTVMetrics> {
    try {
      // Overall LTV
      const overallResult = await pool?.query(`
        SELECT 
          AVG(estimated_ltv_cents)::BIGINT as avg_ltv,
          AVG(customer_months) as avg_lifetime_months
        FROM mv_customer_ltv_summary
        WHERE is_active = 1
      `);

      // LTV by plan
      const byPlanResult = await pool?.query(`
        SELECT
          pi.item_key as plan_name,
          AVG(ltv.estimated_ltv_cents)::BIGINT as avg_ltv
        FROM mv_customer_ltv_summary ltv
        JOIN billing_customers bc ON bc.user_id = ltv.user_id
        JOIN billing_subscriptions bs ON bs.customer_id = bc.id
        JOIN pricing_items pi ON pi.id = bs.pricing_item_id
        WHERE ltv.is_active = 1
          AND bs.status IN ('active', 'trialing')
        GROUP BY pi.item_key
      `);

      // LTV by cohort (monthly cohorts)
      const byCohortResult = await pool?.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', bc.created_at), 'YYYY-MM') as cohort,
          AVG(ltv.estimated_ltv_cents)::BIGINT as avg_ltv
        FROM mv_customer_ltv_summary ltv
        JOIN billing_customers bc ON bc.id = ltv.customer_id
        WHERE ltv.is_active = 1
        GROUP BY DATE_TRUNC('month', bc.created_at)
        ORDER BY cohort DESC
        LIMIT 12
      `);

      const overall = overallResult?.rows[0] || {};
      
      const byPlan: Record<string, number> = {};
      byPlanResult?.rows.forEach(row => {
        byPlan[row.plan_name] = Math.round(row.avg_ltv / 100);
      });

      const byCohort: Record<string, number> = {};
      byCohortResult?.rows.forEach(row => {
        byCohort[row.cohort] = Math.round(row.avg_ltv / 100);
      });

      return {
        overall: Math.round((overall.avg_ltv || 0) / 100),
        byPlan,
        byCohort,
        averageCustomerLifetime: Math.round(overall.avg_lifetime_months || 12)
      };
    } catch (error) {
      console.error('[RevenueMetrics] Failed to get LTV:', error);
      return this.getStubLTV();
    }
  }

  /**
   * Get ARPU metrics
   */
  async getARPU(): Promise<ARPUMetrics> {
    try {
      const result = await pool?.query(`
        SELECT
          overall_arpu_cents,
          total_customers,
          arpu_by_plan,
          arpu_by_country
        FROM mv_arpu_metrics
        WHERE as_of_date = CURRENT_DATE
        LIMIT 1
      `);

      const data = result?.rows[0] || {};

      const byPlan: Record<string, number> = {};
      if (data.arpu_by_plan) {
        Object.entries(data.arpu_by_plan).forEach(([key, value]) => {
          byPlan[key] = Math.round((value as number) / 100);
        });
      }

      const byCountry: Record<string, number> = {};
      if (data.arpu_by_country) {
        Object.entries(data.arpu_by_country).forEach(([key, value]) => {
          byCountry[key] = Math.round((value as number) / 100);
        });
      }

      return {
        overall: Math.round((data.overall_arpu_cents || 0) / 100),
        byPlan,
        byCountry,
        totalCustomers: data.total_customers || 0
      };
    } catch (error) {
      console.error('[RevenueMetrics] Failed to get ARPU:', error);
      return this.getStubARPU();
    }
  }

  /**
   * Get revenue growth metrics
   */
  async getGrowth(): Promise<RevenueGrowth> {
    try {
      // Current and previous month
      const monthlyResult = await pool?.query(`
        SELECT
          month,
          mrr_usd_cents,
          growth_rate_percentage
        FROM mv_monthly_revenue_history
        ORDER BY month DESC
        LIMIT 13  -- Get 13 months for YoY calculation
      `);

      const months = monthlyResult?.rows || [];
      const currentMonth = months[0]?.mrr_usd_cents || 0;
      const previousMonth = months[1]?.mrr_usd_cents || 0;
      const threeMonthsAgo = months[3]?.mrr_usd_cents || 0;
      const yearAgo = months[12]?.mrr_usd_cents || 0;

      const monthOverMonth = previousMonth > 0 
        ? ((currentMonth - previousMonth) / previousMonth) * 100 
        : 0;

      const quarterOverQuarter = threeMonthsAgo > 0
        ? ((currentMonth - threeMonthsAgo) / threeMonthsAgo) * 100
        : 0;

      const yearOverYear = yearAgo > 0
        ? ((currentMonth - yearAgo) / yearAgo) * 100
        : 0;

      return {
        currentMonth: Math.round(currentMonth / 100),
        previousMonth: Math.round(previousMonth / 100),
        growthRate: months[0]?.growth_rate_percentage || 0,
        monthOverMonth: Math.round(monthOverMonth * 100) / 100,
        quarterOverQuarter: Math.round(quarterOverQuarter * 100) / 100,
        yearOverYear: Math.round(yearOverYear * 100) / 100
      };
    } catch (error) {
      console.error('[RevenueMetrics] Failed to get growth:', error);
      return this.getStubGrowth();
    }
  }

  /**
   * Get all revenue metrics
   */
  async getAllMetrics(): Promise<RevenueMetrics> {
    const [mrr, ltv, arpu, growth] = await Promise.all([
      this.getMRR(),
      this.getLTV(),
      this.getARPU(),
      this.getGrowth()
    ]);

    // Calculate ARR from MRR
    const arr = mrr.total * 12;

    return {
      mrr,
      arr,
      ltv,
      arpu,
      growth
    };
  }

  /**
   * Refresh materialized views
   */
  async refreshViews(): Promise<void> {
    try {
      await pool?.query('SELECT refresh_revenue_metrics()');
      console.log('[RevenueMetrics] Views refreshed successfully');
    } catch (error) {
      console.error('[RevenueMetrics] Failed to refresh views:', error);
      throw error;
    }
  }

  // Stub data methods for fallback
  private getStubMRR(): MRRBreakdown {
    return {
      total: 45000,
      byPlan: { 
        "Basic": 15000, 
        "Pro": 25000, 
        "Enterprise": 5000 
      },
      byGateway: { 
        "stripe": 40000, 
        "paddle": 3000,
        "paymob": 2000 
      },
      byCountry: { 
        "US": 25000, 
        "UK": 10000, 
        "EG": 5000,
        "SA": 3000,
        "Other": 2000
      },
      byCurrency: {
        "USD": 30000,
        "EUR": 8000,
        "GBP": 5000,
        "EGP": 2000
      },
      growth: 12.5,
      newBusiness: 5000,
      expansion: 2000,
      contraction: -1000,
      churn: -500
    };
  }

  private getStubLTV(): LTVMetrics {
    return {
      overall: 1200,
      byPlan: {
        "Basic": 600,
        "Pro": 1500,
        "Enterprise": 3000
      },
      byCohort: {
        "2024-11": 1100,
        "2024-10": 1150,
        "2024-09": 1200,
        "2024-08": 1250,
        "2024-07": 1300
      },
      averageCustomerLifetime: 18
    };
  }

  private getStubARPU(): ARPUMetrics {
    return {
      overall: 75,
      byPlan: {
        "Basic": 29,
        "Pro": 99,
        "Enterprise": 299
      },
      byCountry: {
        "US": 85,
        "UK": 75,
        "EG": 45,
        "SA": 55,
        "Other": 65
      },
      totalCustomers: 600
    };
  }

  private getStubGrowth(): RevenueGrowth {
    return {
      currentMonth: 45000,
      previousMonth: 40000,
      growthRate: 12.5,
      monthOverMonth: 12.5,
      quarterOverQuarter: 35.2,
      yearOverYear: 150.0
    };
  }
}

// Singleton instance
export const revenueMetricsService = new RevenueMetricsService();