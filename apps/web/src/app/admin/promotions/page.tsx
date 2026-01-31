'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { PromotionForm } from '@/components/admin/promotions/promotion-form'
import { ScenarioTester } from '@/components/admin/promotions/scenario-tester'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import type { PromotionRequest } from '@/types/admin-promotions'

export const dynamic = 'force-dynamic'

export default function AdminPromotionsPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingPromotion, setEditingPromotion] = useState<any>(null)
  const [formData, setFormData] = useState<Partial<PromotionRequest>>({
    discount_type: 'percentage',
    codes: [''],
    supported_providers: []
  })

  const queryClient = useQueryClient()

  // Fetch existing promotions
  const { data: promotionsData, isLoading, error } = useQuery({
    queryKey: ['admin-promotions'],
    queryFn: async () => {
      const response = await fetch('/api/admin/promotions', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch promotions: ${response.status}`)
      }
      return response.json()
    },
    staleTime: 0, // Always consider stale for fresh data
    refetchOnWindowFocus: true
  })

  const promotions = promotionsData?.promotions || []
  const hasPromotions = promotions.length > 0
  
  // ✅ EXPERT: Server-side gating - don't ship UI when disabled
  const isEnabled = FEATURE_FLAGS.ENABLE_MULTI_PROVIDER_PROMOTIONS
  
  if (!isEnabled) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <Icon name="settings" className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Multi-Provider Promotions
          </h2>
          <p className="text-gray-600 mb-6">
            This feature is currently disabled. Please contact your administrator.
          </p>
          <Button onClick={() => window.location.href = '/admin'}>
            Back to Admin Dashboard
          </Button>
        </div>
      </div>
    )
  }
  
  const handleFormSuccess = (promotionId: string) => {
    if (editingPromotion) {
      alert(`Promotion updated successfully! ID: ${promotionId}`)
    } else {
      alert(`Promotion created successfully! ID: ${promotionId}`)
    }
    setShowForm(false)
    setEditingPromotion(null)
    // Reset form data
    setFormData({
      discount_type: 'percentage',
      codes: [''],
      supported_providers: []
    })
    // Refresh promotions list
    queryClient.invalidateQueries({ queryKey: ['admin-promotions'] })
  }

  const handleEditPromotion = (promotion: any) => {
    setEditingPromotion(promotion)
    // Pre-populate form data with promotion details
    setFormData({
      name: promotion.name,
      description: promotion.description,
      discount_type: promotion.discount_type,
      discount_value: promotion.discount_value,
      currency: promotion.currency,
      codes: promotion.codes || [promotion.code] || [''],
      supported_providers: promotion.supported_providers ? 
        (typeof promotion.supported_providers === 'string' 
          ? promotion.supported_providers.replace(/[{}]/g, '').split(',') 
          : promotion.supported_providers) 
        : [],
      minimum_order_amount: promotion.minimum_order_minor_units ? 
        promotion.minimum_order_minor_units / 100 : undefined,
      minimum_order_currency: promotion.minimum_order_currency,
      max_total_uses: promotion.max_total_uses,
      max_uses_per_user: promotion.max_uses_per_user,
      valid_from: promotion.valid_from ? new Date(promotion.valid_from).toISOString().slice(0, 16) : undefined,
      valid_until: promotion.valid_until ? new Date(promotion.valid_until).toISOString().slice(0, 16) : undefined
    })
    setShowForm(true)
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {editingPromotion ? 'Edit Promotion' : 'Promotion Management'}
          </h1>
          <p className="text-gray-600 mt-1">
            {editingPromotion 
              ? `Editing: ${editingPromotion.name || 'Unnamed Promotion'}` 
              : 'Create and manage multi-provider promotions across all regions'
            }
          </p>
        </div>
        
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Icon name="plus" className="w-4 h-4 mr-2" />
            Create Promotion
          </Button>
        )}
      </div>
      
      {showForm ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <PromotionForm 
              editingPromotion={editingPromotion}
              initialData={formData}
              onCancel={() => {
                setShowForm(false)
                setEditingPromotion(null)
                setFormData({
                  discount_type: 'percentage',
                  codes: [''],
                  supported_providers: []
                })
              }}
              onSuccess={handleFormSuccess}
            />
          </div>
          <div>
            <ScenarioTester formData={formData as PromotionRequest} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Loading State */}
          {isLoading && (
            <Card className="p-6 text-center">
              <Icon name="loader-2" className="w-8 h-8 mx-auto text-gray-400 mb-4 animate-spin" />
              <p className="text-gray-500">Loading promotions...</p>
            </Card>
          )}

          {/* Error State */}
          {error && (
            <Card className="p-6 text-center border-red-200">
              <Icon name="alert-circle" className="w-8 h-8 mx-auto text-red-400 mb-4" />
              <h3 className="text-lg font-medium text-red-900 mb-2">Failed to load promotions</h3>
              <p className="text-red-600 mb-4">{error.message}</p>
              <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-promotions'] })}>
                Try Again
              </Button>
            </Card>
          )}

          {/* Promotions List */}
          {!isLoading && !error && hasPromotions && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Active Promotions</h3>
              <div className="grid gap-4">
                {promotions.map((promotion: any) => (
                  <Card key={promotion.id || promotion.code} className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">
                          {promotion.name || promotion.code || promotion.codes?.[0] || 'Unnamed'}
                        </h4>
                        {promotion.description && (
                          <p className="text-sm text-gray-600 mt-1">{promotion.description}</p>
                        )}
                        {(promotion.discount_type || promotion.type) && (promotion.discount_value || promotion.value) && (
                          <p className="text-gray-600 mt-1">
                            {(promotion.discount_type || promotion.type) === 'percentage' 
                              ? `${promotion.discount_value || promotion.value}% off` 
                              : `$${promotion.discount_value || promotion.value} off`
                            }
                          </p>
                        )}
                        {promotion.status && (
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium mt-2 ${
                            promotion.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {promotion.status}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 text-right">
                        {(promotion.total_redemptions !== undefined && promotion.max_total_uses) && (
                          <p className="mb-1">{promotion.total_redemptions}/{promotion.max_total_uses} used</p>
                        )}
                        {promotion.max_uses_per_user && (
                          <p className="mb-1">Max {promotion.max_uses_per_user} per user</p>
                        )}
                        {promotion.total_codes && (
                          <p className="mb-1">{promotion.total_codes} code(s)</p>
                        )}
                        {promotion.total_discount_given !== undefined && (
                          <p className="mb-1 text-green-600">${promotion.total_discount_given} saved</p>
                        )}
                        {promotion.created_at && (
                          <p className="text-xs">Created {new Date(promotion.created_at).toLocaleDateString()}</p>
                        )}
                        {promotion.valid_until && (
                          <p className="text-xs text-orange-600">
                            Expires {new Date(promotion.valid_until).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-start space-x-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPromotion(promotion)}
                          className="flex items-center space-x-1"
                        >
                          <Icon name="edit" className="w-4 h-4" />
                          <span>Edit</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && !hasPromotions && (
            <Card className="p-6 text-center">
              <Icon name="tag" className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No promotions yet
              </h3>
              <p className="text-gray-500 mb-4">
                Create your first multi-provider promotion to get started
              </p>
              <Button onClick={() => setShowForm(true)}>
                Create First Promotion
              </Button>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}