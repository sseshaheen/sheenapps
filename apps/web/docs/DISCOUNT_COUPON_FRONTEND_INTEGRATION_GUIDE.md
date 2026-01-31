# Discount Coupon System - Frontend Integration Guide
*For Next.js Team - SheenApps Claude Worker*

## 📋 Overview

This guide provides complete frontend integration instructions for the discount coupon system implemented in the SheenApps Claude Worker backend. The system uses a canonical control plane architecture with Stripe integration for native checkout experiences.

## 🚀 Quick Start

### Key Integration Points

1. **Promotion Code Validation**: Real-time validation during checkout
2. **Stripe Checkout Integration**: Enhanced checkout with promotion support  
3. **Admin Panel Integration**: Promotion management interface
4. **Analytics Dashboard**: Usage tracking and reporting

## 🔧 API Integration

### Base Configuration

```typescript
// types/promotion.ts
export interface PromotionValidationRequest {
  code: string;
  planId: 'starter' | 'growth' | 'scale';
  currency?: string;
}

export interface PromotionValidationResponse {
  valid: boolean;
  discount_amount?: number;
  discount_type?: 'percentage' | 'fixed_amount';
  discount_value?: number;
  error?: string;
  error_code?: string;
}

export interface CheckoutParams {
  planId: 'starter' | 'growth' | 'scale';
  locale?: string;
  trial?: boolean;
  promotionCode?: string; // New field for promotion support
  currency?: string;
}
```

### API Endpoints

#### 1. Promotion Code Validation

**Endpoint**: `POST /api/promotions/validate`

```typescript
// utils/api/promotions.ts
export async function validatePromotionCode(
  code: string, 
  planId: string,
  options: {
    currency?: string;
    signal?: AbortSignal;
  } = {}
): Promise<PromotionValidationResponse> {
  const response = await fetch('/api/promotions/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      code: code.trim().toUpperCase(),
      planId,
      currency: options.currency || 'usd'
    }),
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error('Promotion validation failed');
  }

  return response.json();
}
```

#### 2. Enhanced Checkout Creation

**Endpoint**: `POST /api/payment/checkout` (Enhanced)

```typescript
// utils/api/checkout.ts
export async function createCheckoutSession(params: {
  planId: 'starter' | 'growth' | 'scale';
  locale?: string;
  trial?: boolean;
  promotionCode?: string; // New parameter
  currency?: string;
}): Promise<{
  success: boolean;
  url?: string;
  sessionId?: string;
  error?: string;
}> {
  const response = await fetch('/api/payment/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
      'X-Idempotency-Key': generateIdempotencyKey(),
      'X-Correlation-Id': generateCorrelationId(),
    },
    body: JSON.stringify({
      ...params,
      // Promotion code will be validated and applied server-side
      promotionCode: params.promotionCode?.trim().toUpperCase()
    })
  });

  return response.json();
}
```

## 🎨 UI Components

### 1. Promotion Code Input Component

```tsx
// components/PromotionCodeInput.tsx
'use client';

import { useState, useEffect } from 'react';
import { validatePromotionCode } from '@/utils/api/promotions';
import { debounce } from 'lodash';

interface PromotionCodeInputProps {
  planId: 'starter' | 'growth' | 'scale';
  onValidCode: (code: string, discount: { amount: number; type: 'percentage' | 'fixed_amount'; value: number }) => void;
  onInvalidCode: (error: string) => void;
  onClearCode: () => void;
  className?: string;
}

export function PromotionCodeInput({ 
  planId, 
  onValidCode, 
  onInvalidCode, 
  onClearCode,
  className = '' 
}: PromotionCodeInputProps) {
  const [code, setCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState<{
    valid: boolean;
    error?: string;
    discount?: { amount: number; type: 'percentage' | 'fixed_amount'; value: number };
  } | null>(null);

  // Debounced validation
  const debouncedValidate = debounce(async (codeToValidate: string) => {
    if (!codeToValidate.trim()) {
      setValidation(null);
      onClearCode();
      return;
    }

    setIsValidating(true);
    
    try {
      const result = await validatePromotionCode(codeToValidate, planId);
      
      if (result.valid) {
        const discount = {
          amount: result.discount_amount!,
          type: result.discount_type!,
          value: result.discount_value!
        };
        setValidation({ valid: true, discount });
        onValidCode(codeToValidate, discount);
      } else {
        setValidation({ valid: false, error: result.error });
        onInvalidCode(result.error || 'Invalid promotion code');
      }
    } catch (error) {
      setValidation({ valid: false, error: 'Validation failed' });
      onInvalidCode('Failed to validate promotion code');
    } finally {
      setIsValidating(false);
    }
  }, 500);

  useEffect(() => {
    debouncedValidate(code);
    return () => debouncedValidate.cancel();
  }, [code, planId]);

  const handleCodeChange = (value: string) => {
    // Format code: uppercase, alphanumeric + hyphens/underscores only
    const formatted = value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    setCode(formatted);
  };

  const clearCode = () => {
    setCode('');
    setValidation(null);
    onClearCode();
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          placeholder="Enter promo code (e.g. SAVE20)"
          className={`
            w-full px-4 py-3 border rounded-lg font-mono text-sm
            ${validation?.valid ? 'border-green-500 bg-green-50' : 
              validation?.error ? 'border-red-500 bg-red-50' : 
              'border-gray-300'}
            focus:outline-none focus:ring-2 focus:ring-blue-500
          `}
          maxLength={20}
        />
        
        {/* Loading spinner */}
        {isValidating && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          </div>
        )}
        
        {/* Clear button */}
        {code && !isValidating && (
          <button
            onClick={clearCode}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Validation feedback */}
      {validation?.valid && validation.discount && (
        <div className="flex items-center space-x-2 text-green-600 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>
            Code applied! Save {validation.discount.type === 'percentage' 
              ? `${validation.discount.value}%` 
              : `$${(validation.discount.value / 100).toFixed(2)}`}
          </span>
        </div>
      )}
      
      {validation?.error && (
        <div className="flex items-center space-x-2 text-red-600 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{validation.error}</span>
        </div>
      )}
    </div>
  );
}
```

### 2. Enhanced Checkout Component

```tsx
// components/CheckoutFlow.tsx
'use client';

import { useState } from 'react';
import { PromotionCodeInput } from './PromotionCodeInput';
import { createCheckoutSession } from '@/utils/api/checkout';

interface CheckoutFlowProps {
  planId: 'starter' | 'growth' | 'scale';
  planPrice: number; // Original price in dollars
  planName: string;
}

export function CheckoutFlow({ planId, planPrice, planName }: CheckoutFlowProps) {
  const [promotionCode, setPromotionCode] = useState<string>('');
  const [discount, setDiscount] = useState<{
    amount: number;
    type: 'percentage' | 'fixed_amount';
    value: number;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const calculateFinalPrice = () => {
    if (!discount) return planPrice;
    
    if (discount.type === 'percentage') {
      return planPrice * (1 - discount.value / 100);
    } else {
      return Math.max(0, planPrice - (discount.value / 100));
    }
  };

  const handleValidCode = (code: string, discountData: any) => {
    setPromotionCode(code);
    setDiscount(discountData);
  };

  const handleInvalidCode = (error: string) => {
    setPromotionCode('');
    setDiscount(null);
  };

  const handleClearCode = () => {
    setPromotionCode('');
    setDiscount(null);
  };

  const handleCheckout = async () => {
    setIsProcessing(true);
    
    try {
      const result = await createCheckoutSession({
        planId,
        promotionCode: promotionCode || undefined,
        locale: navigator.language.split('-')[0] // e.g., 'en' from 'en-US'
      });
      
      if (result.success && result.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.url;
      } else {
        throw new Error(result.error || 'Checkout creation failed');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      // Handle error (show toast, etc.)
    } finally {
      setIsProcessing(false);
    }
  };

  const finalPrice = calculateFinalPrice();
  const savings = planPrice - finalPrice;

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{planName}</h2>
        <div className="mt-2">
          <span className={`text-3xl font-bold ${discount ? 'text-green-600' : 'text-gray-900'}`}>
            ${finalPrice.toFixed(2)}
          </span>
          {discount && (
            <div className="text-sm text-gray-500">
              <span className="line-through">${planPrice.toFixed(2)}</span>
              <span className="ml-2 text-green-600 font-medium">
                Save ${savings.toFixed(2)}!
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <PromotionCodeInput
          planId={planId}
          onValidCode={handleValidCode}
          onInvalidCode={handleInvalidCode}
          onClearCode={handleClearCode}
        />

        <button
          onClick={handleCheckout}
          disabled={isProcessing}
          className={`
            w-full py-3 px-4 rounded-lg font-medium transition-colors
            ${isProcessing 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
            }
            text-white
          `}
        >
          {isProcessing ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Processing...
            </div>
          ) : (
            `Continue to Payment`
          )}
        </button>
      </div>

      <div className="mt-4 text-xs text-gray-500 text-center">
        Secure checkout powered by Stripe
        {discount && (
          <div className="mt-1 text-green-600">
            🎉 Promotion "{promotionCode}" applied
          </div>
        )}
      </div>
    </div>
  );
}
```

## 🔐 Admin Panel Integration

### Admin Promotion Management

```tsx
// app/admin/promotions/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';

interface Promotion {
  id: string;
  name: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  status: 'active' | 'paused' | 'disabled';
  current_uses: number;
  max_total_uses?: number;
  valid_from: string;
  valid_until?: string;
  total_codes: number;
  total_redemptions: number;
  total_discount_given: number;
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: '',
    search: ''
  });

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(filters.status && { status: filters.status }),
        ...(filters.search && { search: filters.search })
      });

      const response = await fetch(`/admin/promotions?${params}`, {
        headers: {
          'Authorization': `Bearer ${getAdminToken()}`,
        }
      });

      const data = await response.json();
      setPromotions(data.promotions);
    } catch (error) {
      console.error('Failed to fetch promotions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, [page, filters]);

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const formatDiscount = (type: string, value: number) => {
    return type === 'percentage' ? `${value}%` : formatCurrency(value);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Promotions</h1>
          <button 
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            onClick={() => {/* Open create modal */}}
          >
            Create Promotion
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Search promotions..."
              className="border border-gray-300 rounded-lg px-3 py-2"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        {/* Promotions Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Promotion
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Discount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Revenue Impact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {promotions.map((promotion) => (
                <tr key={promotion.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {promotion.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {promotion.total_codes} codes
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDiscount(promotion.discount_type, promotion.discount_value)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>
                      {promotion.current_uses}
                      {promotion.max_total_uses && ` / ${promotion.max_total_uses}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {promotion.total_redemptions} redemptions
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      promotion.status === 'active' ? 'bg-green-100 text-green-800' :
                      promotion.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {promotion.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    -{formatCurrency(promotion.total_discount_given)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                      className="text-blue-600 hover:text-blue-900 mr-3"
                      onClick={() => {/* View details */}}
                    >
                      View
                    </button>
                    <button 
                      className="text-gray-600 hover:text-gray-900"
                      onClick={() => {/* Edit promotion */}}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-center">
          <nav className="flex space-x-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-3 py-2">Page {page}</span>
            <button
              onClick={() => setPage(page + 1)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              Next
            </button>
          </nav>
        </div>
      </div>
    </AdminLayout>
  );
}
```

## 📊 Analytics Integration

### Promotion Analytics Dashboard

```tsx
// components/admin/PromotionAnalytics.tsx
'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AnalyticsData {
  period_days: number;
  overall_stats: {
    total_promotions: number;
    total_codes: number;
    total_redemptions: number;
    unique_users: number;
    total_discount_given: number;
    avg_discount_per_use: number;
  };
  top_promotions: Array<{
    id: string;
    name: string;
    redemption_count: number;
    unique_users: number;
    total_discount_given: number;
  }>;
  daily_trends: Array<{
    date: string;
    redemptions: number;
    unique_users: number;
    discount_given: number;
  }>;
}

export function PromotionAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/admin/promotions/analytics?days=${period}`, {
        headers: {
          'Authorization': `Bearer ${getAdminToken()}`,
        }
      });
      
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  if (loading) {
    return <div className="p-6 text-center">Loading analytics...</div>;
  }

  if (!analytics) {
    return <div className="p-6 text-center text-red-600">Failed to load analytics</div>;
  }

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Promotion Analytics</h2>
        <select
          value={period}
          onChange={(e) => setPeriod(parseInt(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-2xl font-bold text-blue-600">
            {analytics.overall_stats.total_redemptions}
          </div>
          <div className="text-sm text-gray-500">Total Redemptions</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(analytics.overall_stats.total_discount_given)}
          </div>
          <div className="text-sm text-gray-500">Total Discounts Given</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-2xl font-bold text-purple-600">
            {analytics.overall_stats.unique_users}
          </div>
          <div className="text-sm text-gray-500">Unique Users</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-2xl font-bold text-orange-600">
            {formatCurrency(analytics.overall_stats.avg_discount_per_use)}
          </div>
          <div className="text-sm text-gray-500">Avg Discount/Use</div>
        </div>
      </div>

      {/* Daily Trends Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Daily Usage Trends</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.daily_trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(date) => new Date(date).toLocaleDateString()}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
                formatter={(value, name) => [
                  name === 'discount_given' ? formatCurrency(value as number) : value,
                  name === 'redemptions' ? 'Redemptions' :
                  name === 'unique_users' ? 'Unique Users' :
                  'Discount Given'
                ]}
              />
              <Line 
                type="monotone" 
                dataKey="redemptions" 
                stroke="#3B82F6" 
                strokeWidth={2}
              />
              <Line 
                type="monotone" 
                dataKey="unique_users" 
                stroke="#10B981" 
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Promotions */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Top Performing Promotions</h3>
        <div className="space-y-4">
          {analytics.top_promotions.map((promotion, index) => (
            <div key={promotion.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">#{index + 1} {promotion.name}</div>
                <div className="text-sm text-gray-500">
                  {promotion.redemption_count} redemptions • {promotion.unique_users} unique users
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium text-red-600">
                  -{formatCurrency(promotion.total_discount_given)}
                </div>
                <div className="text-sm text-gray-500">Total Impact</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

## 🎯 Testing Guidelines

### 1. Unit Testing

```typescript
// __tests__/utils/api/promotions.test.ts
import { validatePromotionCode } from '@/utils/api/promotions';

// Mock fetch
global.fetch = jest.fn();

describe('validatePromotionCode', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('should validate a correct promotion code', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        valid: true,
        discount_amount: 500,
        discount_type: 'percentage',
        discount_value: 20
      })
    });

    const result = await validatePromotionCode('SAVE20', 'starter');
    
    expect(result.valid).toBe(true);
    expect(result.discount_value).toBe(20);
    expect(fetch).toHaveBeenCalledWith('/api/promotions/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': expect.any(String)
      },
      body: JSON.stringify({
        code: 'SAVE20',
        planId: 'starter',
        currency: 'usd'
      })
    });
  });

  it('should handle invalid promotion codes', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        valid: false,
        error: 'Promotion code not found'
      })
    });

    const result = await validatePromotionCode('INVALID', 'starter');
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Promotion code not found');
  });
});
```

### 2. Component Testing

```typescript
// __tests__/components/PromotionCodeInput.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromotionCodeInput } from '@/components/PromotionCodeInput';

// Mock the API
jest.mock('@/utils/api/promotions', () => ({
  validatePromotionCode: jest.fn()
}));

describe('PromotionCodeInput', () => {
  it('should format input to uppercase', () => {
    const mockOnValidCode = jest.fn();
    const mockOnInvalidCode = jest.fn();
    const mockOnClearCode = jest.fn();

    render(
      <PromotionCodeInput
        planId="starter"
        onValidCode={mockOnValidCode}
        onInvalidCode={mockOnInvalidCode}
        onClearCode={mockOnClearCode}
      />
    );

    const input = screen.getByPlaceholderText(/enter promo code/i);
    fireEvent.change(input, { target: { value: 'save20' } });

    expect(input).toHaveValue('SAVE20');
  });

  it('should call onValidCode when promotion is valid', async () => {
    const { validatePromotionCode } = require('@/utils/api/promotions');
    validatePromotionCode.mockResolvedValue({
      valid: true,
      discount_amount: 500,
      discount_type: 'percentage',
      discount_value: 20
    });

    const mockOnValidCode = jest.fn();
    const mockOnInvalidCode = jest.fn();
    const mockOnClearCode = jest.fn();

    render(
      <PromotionCodeInput
        planId="starter"
        onValidCode={mockOnValidCode}
        onInvalidCode={mockOnInvalidCode}
        onClearCode={mockOnClearCode}
      />
    );

    const input = screen.getByPlaceholderText(/enter promo code/i);
    fireEvent.change(input, { target: { value: 'SAVE20' } });

    await waitFor(() => {
      expect(mockOnValidCode).toHaveBeenCalledWith('SAVE20', {
        amount: 500,
        type: 'percentage',
        value: 20
      });
    });
  });
});
```

## 🚨 Error Handling

### Common Error Scenarios

```typescript
// utils/errorHandling.ts
export enum PromotionErrorCode {
  CODE_NOT_FOUND = 'CODE_NOT_FOUND',
  PROMOTION_NOT_ACTIVE = 'PROMOTION_NOT_ACTIVE',
  PROMOTION_EXPIRED = 'PROMOTION_EXPIRED',
  USAGE_LIMIT_REACHED = 'USAGE_LIMIT_REACHED',
  USER_USAGE_LIMIT_REACHED = 'USER_USAGE_LIMIT_REACHED',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

export const getErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case PromotionErrorCode.CODE_NOT_FOUND:
      return "This promotion code doesn't exist or has been deactivated.";
    case PromotionErrorCode.PROMOTION_NOT_ACTIVE:
      return "This promotion is currently not active.";
    case PromotionErrorCode.PROMOTION_EXPIRED:
      return "This promotion code has expired.";
    case PromotionErrorCode.USAGE_LIMIT_REACHED:
      return "This promotion code has reached its usage limit.";
    case PromotionErrorCode.USER_USAGE_LIMIT_REACHED:
      return "You've already used this promotion code the maximum number of times.";
    default:
      return "Please check your promotion code and try again.";
  }
};
```

## 📱 Mobile Considerations

### Responsive Design

```css
/* styles/components/promotion-input.css */
@media (max-width: 768px) {
  .promotion-code-input {
    font-size: 16px; /* Prevents zoom on iOS */
  }
  
  .checkout-flow {
    padding: 1rem;
    margin: 0 0.5rem;
  }
  
  .promotion-feedback {
    font-size: 14px;
  }
}
```

## 🔄 State Management

### Using React Context for Promotion State

```tsx
// contexts/PromotionContext.tsx
'use client';

import { createContext, useContext, useReducer, ReactNode } from 'react';

interface PromotionState {
  appliedCode: string | null;
  discount: {
    amount: number;
    type: 'percentage' | 'fixed_amount';
    value: number;
  } | null;
  isValidating: boolean;
}

type PromotionAction = 
  | { type: 'SET_VALIDATING'; payload: boolean }
  | { type: 'SET_VALID_CODE'; payload: { code: string; discount: any } }
  | { type: 'CLEAR_CODE' };

const initialState: PromotionState = {
  appliedCode: null,
  discount: null,
  isValidating: false
};

const PromotionContext = createContext<{
  state: PromotionState;
  dispatch: React.Dispatch<PromotionAction>;
} | null>(null);

function promotionReducer(state: PromotionState, action: PromotionAction): PromotionState {
  switch (action.type) {
    case 'SET_VALIDATING':
      return { ...state, isValidating: action.payload };
    case 'SET_VALID_CODE':
      return {
        ...state,
        appliedCode: action.payload.code,
        discount: action.payload.discount,
        isValidating: false
      };
    case 'CLEAR_CODE':
      return { ...initialState };
    default:
      return state;
  }
}

export function PromotionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(promotionReducer, initialState);

  return (
    <PromotionContext.Provider value={{ state, dispatch }}>
      {children}
    </PromotionContext.Provider>
  );
}

export function usePromotion() {
  const context = useContext(PromotionContext);
  if (!context) {
    throw new Error('usePromotion must be used within PromotionProvider');
  }
  return context;
}
```

## 🚀 Deployment Checklist

### Pre-deployment Testing
- [ ] **Promotion Code Validation**: Test with valid/invalid codes
- [ ] **Checkout Integration**: Verify Stripe checkout with promotions
- [ ] **Admin Panel**: Test promotion creation and management
- [ ] **Analytics**: Confirm data visualization and reporting
- [ ] **Error Handling**: Test all error scenarios
- [ ] **Mobile Responsiveness**: Test on various device sizes
- [ ] **Loading States**: Verify all loading indicators work properly
- [ ] **Accessibility**: Test keyboard navigation and screen readers

### Performance Optimization
- [ ] **Code Splitting**: Lazy load admin components
- [ ] **API Debouncing**: Implement proper debouncing for validation
- [ ] **Caching**: Cache promotion validation results appropriately
- [ ] **Bundle Analysis**: Ensure no unnecessary dependencies

### Security Considerations
- [ ] **Input Sanitization**: All user inputs are properly sanitized
- [ ] **Rate Limiting**: Implement client-side rate limiting for validation
- [ ] **Error Messages**: Don't expose sensitive information in errors
- [ ] **HTTPS Only**: Ensure all API calls use HTTPS

## 📖 Additional Resources

### API Documentation
- Backend API endpoints are documented in `/docs/API_REFERENCE_FOR_NEXTJS.md`
- Admin panel patterns follow existing conventions in `/src/routes/admin.ts`

### Styling Guidelines  
- Follow existing component patterns in the Next.js application
- Use Tailwind CSS classes consistently with the current design system
- Maintain accessibility standards with proper ARIA labels

### Monitoring and Analytics
- Track promotion usage with existing analytics patterns
- Monitor checkout conversion rates with and without promotions
- Set up alerts for unusual promotion redemption patterns

The discount coupon system is now fully integrated and ready for deployment. All components follow Next.js best practices and integrate seamlessly with the existing SheenApps architecture.