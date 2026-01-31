'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import Icon from '@/components/ui/icon'
import { PromotionsAdminClient } from '@/lib/admin/promotions-admin-client'
import { getAdminFriendlyError } from '@/lib/admin/promotion-validation'
import type { PromotionRequest } from '@/types/admin-promotions'
import type { RegionCode, SupportedCurrency, PaymentProvider } from '@/types/billing'

interface ScenarioTesterProps {
  formData: PromotionRequest
}

interface TestScenario {
  region: RegionCode
  currency: SupportedCurrency
  order_amount: number
  provider: PaymentProvider
}

const regions: RegionCode[] = ['us', 'eu', 'gb', 'ca', 'eg', 'sa']
const currencies: SupportedCurrency[] = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'CAD']
const providers: PaymentProvider[] = ['stripe', 'fawry', 'paymob', 'stcpay', 'paytabs']

function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', EGP: 'E£', SAR: 'SR', CAD: 'C$'
  }
  return `${symbols[currency] || currency}${amount.toFixed(2)}`
}

export function ScenarioTester({ formData }: ScenarioTesterProps) {
  const [testScenarios, setTestScenarios] = useState<TestScenario[]>([
    { region: 'eg', currency: 'EGP', order_amount: 10000, provider: 'fawry' },
    { region: 'us', currency: 'USD', order_amount: 5000, provider: 'stripe' }
  ])
  
  // ✅ EXPERT FINAL: Explicit "Run scenarios" button instead of auto-fetch
  const { data: results, isPending: isLoading, mutate: runScenarios, error } = useMutation({
    mutationFn: async () => {
      // Batch all scenarios in one call to backend
      const response = await fetch('/api/admin/promotions/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Reason': 'Scenario testing'
        },
        body: JSON.stringify({
          promotion_config: formData,
          test_scenarios: testScenarios
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || 'Validation failed')
      }
      
      const data = await response.json()
      return data.scenario_results
    },
    retry: false // ✅ EXPERT: Don't retry on rate limits
  })
  
  // ✅ EXPERT FINAL: Explicit button prevents API bursts while typing
  const handleRunScenarios = () => {
    if (testScenarios.length > 0 && testScenarios.length <= 10 && formData.name) {
      runScenarios()
    }
  }
  
  const updateScenario = (index: number, field: keyof TestScenario, value: any) => {
    setTestScenarios(prev => prev.map((scenario, i) => 
      i === index ? { ...scenario, [field]: value } : scenario
    ))
  }
  
  const addScenario = () => {
    if (testScenarios.length < 10) {
      setTestScenarios(prev => [...prev, {
        region: 'us',
        currency: 'USD',
        order_amount: 1000,
        provider: 'stripe'
      }])
    }
  }
  
  const removeScenario = (index: number) => {
    if (testScenarios.length > 1) {
      setTestScenarios(prev => prev.filter((_, i) => i !== index))
    }
  }
  
  return (
    <Card className="p-4">
      <h3 className="text-lg font-medium mb-4">Scenario Testing</h3>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Test Scenarios ({testScenarios.length}/10)</span>
          
          {/* ✅ EXPERT FINAL: Explicit "Run scenarios" button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRunScenarios}
            disabled={isLoading || !formData.name || testScenarios.length === 0}
          >
            {isLoading ? 'Running...' : 'Run Scenarios'}
          </Button>
        </div>
        
        <div className="space-y-3">
          {testScenarios.map((scenario, index) => (
            <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded">
              <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={scenario.region}
                onChange={(e) => updateScenario(index, 'region', e.target.value)}
              >
                {regions.map(region => (
                  <option key={region} value={region}>{region.toUpperCase()}</option>
                ))}
              </select>
              
              <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={scenario.currency}
                onChange={(e) => updateScenario(index, 'currency', e.target.value)}
              >
                {currencies.map(currency => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
              
              <Input
                type="number"
                value={scenario.order_amount}
                onChange={(e) => updateScenario(index, 'order_amount', parseInt(e.target.value))}
                className="w-24 text-sm"
                placeholder="Amount"
              />
              
              <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={scenario.provider}
                onChange={(e) => updateScenario(index, 'provider', e.target.value)}
              >
                {providers.map(provider => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
              
              {/* Results only show after explicit "Run scenarios" */}
              {results?.[index] ? (
                <div className="flex-1 space-y-1">
                  <Badge variant={results[index].eligible ? 'default' : 'destructive'}>
                    {results[index].eligible 
                      ? `✓ ${formatCurrency(results[index].final_amount, scenario.currency)}` 
                      : '✗ Not Eligible'
                    }
                  </Badge>
                  {/* ✅ EXPERT: Show which provider was selected by backend */}
                  {results[index].eligible && (
                    <div className="text-xs text-gray-500">
                      Provider: {results[index].selected_provider}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 text-sm text-gray-400">Click "Run Scenarios" to test</div>
              )}
              
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeScenario(index)}
                disabled={testScenarios.length <= 1}
              >
                <Icon name="x" className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      
        {/* ✅ EXPERT: Cap scenarios at 10 to stay under rate limits */}
        {testScenarios.length < 10 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addScenario}
            className="mt-3 w-full"
          >
            <Icon name="plus" className="w-4 h-4 mr-1" />
            Add Test Scenario ({testScenarios.length}/10)
          </Button>
        )}
        
        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <p>Scenario testing failed: {getAdminFriendlyError(error)}</p>
          </Alert>
        )}
      </div>
    </Card>
  )
}