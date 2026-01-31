'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { ProviderSelector } from './provider-selector'
import { PromotionsAdminClient } from '@/lib/admin/promotions-admin-client'
import { 
  validatePromotionRequest, 
  getCurrencyProviderWarning, 
  getAdminFriendlyError 
} from '@/lib/admin/promotion-validation'
import type { PromotionRequest } from '@/types/admin-promotions'
import type { SupportedCurrency } from '@/types/billing'

interface PromotionFormProps {
  editingPromotion?: any
  initialData?: Partial<PromotionRequest>
  onCancel?: () => void
  onSuccess?: (promotionId: string) => void
}

const currencies: SupportedCurrency[] = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'CAD', 'JPY', 'AUD', 'AED', 'MAD']

export function PromotionForm({ editingPromotion, initialData, onCancel, onSuccess }: PromotionFormProps) {
  const [formData, setFormData] = useState<Partial<PromotionRequest>>(
    initialData || {
      discount_type: 'percentage',
      codes: [''],
      supported_providers: []
    }
  )
  const [adminReason, setAdminReason] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  // ✅ EXPERT FINAL: Refined validation strategy - less aggressive auto-validation
  const validationController = useRef<AbortController | undefined>(undefined)
  
  // Load provider capabilities
  const { data: providerCapabilities = [], isLoading: loadingCapabilities } = useQuery({
    queryKey: ['provider-capabilities'],
    queryFn: async () => {
      const response = await fetch('/api/admin/promotions/providers')
      if (!response.ok) throw new Error('Failed to load provider capabilities')
      return response.json()
    },
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    enabled: showAdvanced // Only fetch when advanced section is shown
  })
  
  // ✅ EXPERT FINAL: Live pre-warnings for currency/provider mismatch
  const currencyWarning = useMemo(() => {
    if (!providerCapabilities || !formData.currency || !formData.supported_providers?.length) return null
    return getCurrencyProviderWarning(formData.currency, formData.supported_providers, providerCapabilities)
  }, [formData.currency, formData.supported_providers, providerCapabilities])
  
  // Update form data when initialData changes (for editing mode)
  useEffect(() => {
    if (initialData) {
      setFormData(initialData)
    }
  }, [initialData])

  // Clean up AbortController on unmount
  useEffect(() => {
    return () => validationController.current?.abort()
  }, [])
  
  // Create/Update promotion mutation
  const { mutate: createPromotion, isPending: isCreating, error: createError } = useMutation({
    mutationFn: async ({ data, reason }: { data: PromotionRequest; reason: string }) => {
      const url = editingPromotion 
        ? `/api/admin/promotions/${editingPromotion.id}`
        : '/api/admin/promotions'
      const method = editingPromotion ? 'PATCH' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Reason': reason
        },
        body: JSON.stringify(data)
      })
      
      if (!response.ok) {
        const error = await response.json()
        
        // Enhanced error handling with user-friendly messages
        let userMessage = 'Failed to create promotion'
        
        if (response.status === 409) {
          if (error.error?.includes('promotion codes already exist')) {
            userMessage = 'One or more promotion codes are already in use. Please choose different codes.'
          } else {
            userMessage = 'This promotion conflicts with an existing one. Please check your settings.'
          }
        } else if (response.status === 400) {
          if (error.error?.includes('validation')) {
            userMessage = `Invalid promotion data: ${error.message || error.details}`
          } else if (error.error?.includes('required')) {
            userMessage = `Missing required information: ${error.message || error.details}`
          } else {
            userMessage = `Invalid request: ${error.message || error.details}`
          }
        } else if (response.status === 403) {
          userMessage = 'You do not have permission to create promotions.'
        } else if (response.status === 500) {
          userMessage = 'Server error occurred. Please try again or contact support.'
        }
        
        // Include correlation ID if available for support
        const correlationId = error.correlation_id
        if (correlationId) {
          userMessage += ` (ID: ${correlationId})`
        }
        
        console.error('❌ Promotion creation failed:', {
          status: response.status,
          error,
          userMessage
        })
        
        throw new Error(userMessage)
      }
      
      return response.json()
    },
    onSuccess: (data) => {
      // Debug logging to see the response structure
      console.log('🎉 Promotion creation response:', data)
      console.log('🔍 Looking for ID in:', JSON.stringify(data, null, 2))
      
      // Try different possible ID locations
      const promotionId = data.id || data.promotion?.id || data.promotion_id || data.data?.id
      console.log('📝 Extracted promotion ID:', promotionId)
      
      onSuccess?.(promotionId)
    }
  })
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Client-side validation
    const validation = validatePromotionRequest(formData as PromotionRequest)
    if (!validation.isValid) {
      alert(`Validation failed: ${validation.errors.join(', ')}`)
      return
    }
    
    // Ensure required fields
    if (!formData.name || !formData.discount_value || !formData.codes?.length) {
      alert('Please fill in all required fields')
      return
    }
    
    // Ensure admin reason is provided
    if (!adminReason.trim()) {
      alert('Admin reason is required for audit trail')
      return
    }
    
    createPromotion({ 
      data: formData as PromotionRequest,
      reason: adminReason.trim()
    })
  }
  
  const addCode = () => {
    setFormData(prev => ({
      ...prev,
      codes: [...(prev.codes || []), '']
    }))
  }
  
  const removeCode = (index: number) => {
    setFormData(prev => ({
      ...prev,
      codes: prev.codes?.filter((_, i) => i !== index) || []
    }))
  }
  
  const updateCode = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      codes: prev.codes?.map((code, i) => i === index ? value : code) || []
    }))
  }
  
  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Promotion Name *</label>
            <Input
              value={formData.name || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter promotion name"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <Textarea
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
              rows={3}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Admin Reason *</label>
            <Textarea
              value={adminReason}
              onChange={(e) => setAdminReason(e.target.value)}
              placeholder={editingPromotion 
                ? "Explain why this promotion is being modified (for audit trail)"
                : "Explain why this promotion is being created (for audit trail)"
              }
              rows={2}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              This reason will be logged for audit purposes and compliance.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Discount Type *</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                value={formData.discount_type || 'percentage'}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  discount_type: e.target.value as 'percentage' | 'fixed_amount',
                  currency: e.target.value === 'percentage' ? undefined : prev.currency
                }))}
              >
                <option value="percentage">Percentage Discount</option>
                <option value="fixed_amount">Fixed Amount Discount</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Discount Value *</label>
              <Input
                type="number"
                value={formData.discount_value || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, discount_value: parseFloat(e.target.value) || 0 }))}
                placeholder={formData.discount_type === 'percentage' ? '10' : '5.00'}
                required
              />
            </div>
          </div>
          
          {/* Currency field - only show for fixed_amount */}
          {formData.discount_type === 'fixed_amount' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium mb-2">Currency *</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                value={formData.currency || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value as SupportedCurrency }))}
                required
              >
                <option value="">Select currency</option>
                {currencies.map(currency => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
              
              {/* ✅ EXPERT FINAL: Live pre-warning for currency/provider mismatch */}
              {currencyWarning && (
                <Alert variant="destructive" className="text-sm">
                  {currencyWarning}
                </Alert>
              )}
            </div>
          )}
          
          {/* Promotion Codes */}
          <div>
            <label className="block text-sm font-medium mb-2">Promotion Codes *</label>
            <div className="space-y-2">
              {formData.codes?.map((code, index) => (
                <div key={index} className="flex space-x-2">
                  <Input
                    value={code}
                    onChange={(e) => updateCode(index, e.target.value)}
                    placeholder={`Code ${index + 1}`}
                    required
                  />
                  {formData.codes!.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeCode(index)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              )) || []}
              <Button
                type="button"
                variant="outline"
                onClick={addCode}
              >
                Add Another Code
              </Button>
            </div>
          </div>
        </div>
        
        {/* Advanced Settings */}
        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2"
          >
            <span>Advanced Settings</span>
            <span className={`transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>↓</span>
          </Button>
          
          {showAdvanced && (
            <div className="mt-4 space-y-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Minimum Order Amount</label>
                  <Input
                    type="number"
                    value={formData.minimum_order_amount || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      minimum_order_amount: parseFloat(e.target.value) || undefined 
                    }))}
                    placeholder="0.00"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Minimum Order Currency</label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    value={formData.minimum_order_currency || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      minimum_order_currency: e.target.value as SupportedCurrency || undefined 
                    }))}
                  >
                    <option value="">Select currency</option>
                    {currencies.map(currency => (
                      <option key={currency} value={currency}>{currency}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Payment Providers</label>
                {loadingCapabilities ? (
                  <div className="p-4 text-center text-gray-500">Loading providers...</div>
                ) : (
                  <ProviderSelector
                    selectedProviders={formData.supported_providers || []}
                    onProvidersChange={(providers) => setFormData(prev => ({ 
                      ...prev, 
                      supported_providers: providers 
                    }))}
                    currency={formData.currency}
                    capabilities={providerCapabilities}
                  />
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Error Display */}
        {createError && (
          <Alert variant="destructive">
            <div className="space-y-2">
              <p>Creation failed: {getAdminFriendlyError(createError)}</p>
            </div>
          </Alert>
        )}
        
        {/* Form Actions */}
        <div className="flex justify-end space-x-3">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button 
            type="submit" 
            disabled={isCreating}
          >
            {isCreating 
              ? (editingPromotion ? 'Updating...' : 'Creating...') 
              : (editingPromotion ? 'Update Promotion' : 'Create Promotion')
            }
          </Button>
        </div>
      </form>
    </Card>
  )
}