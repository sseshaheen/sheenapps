'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getProvidersForRegion } from '@/utils/regional-config'
import { deriveProviderFeatures } from '@/lib/admin/promotion-validation'
import type { ProviderCapabilities } from '@/types/admin-promotions'
import type { PaymentProvider, RegionCode, SupportedCurrency } from '@/types/billing'

interface ProviderSelectorProps {
  selectedProviders: PaymentProvider[]
  onProvidersChange: (providers: PaymentProvider[]) => void
  region?: RegionCode
  currency?: SupportedCurrency
  capabilities: ProviderCapabilities[]
}

interface ProviderCardProps {
  provider: ProviderCapabilities
  selected: boolean
  disabled: boolean
  onToggle: () => void
}

function ProviderCard({ provider, selected, disabled, onToggle }: ProviderCardProps) {
  const features = deriveProviderFeatures(provider)
  
  return (
    <Card className={`p-3 transition-colors ${
      disabled 
        ? 'opacity-50 bg-gray-50' 
        : selected 
          ? 'bg-blue-50 border-blue-200' 
          : 'hover:bg-gray-50'
    }`}>
      <div className="flex items-start space-x-3">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          className="mt-1 rounded border-gray-300 focus:ring-blue-500"
        />
        
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm">{provider.name}</h4>
            <Badge variant={features.is_active ? 'default' : 'secondary'}>
              {provider.status || 'active'}
            </Badge>
          </div>
          
          <div className="space-y-1">
            <div className="text-xs text-gray-500">
              Currencies: {provider.supported_currencies.join(', ')}
            </div>
            <div className="text-xs text-gray-500">
              Types: {provider.checkout_types.join(', ')}
            </div>
            <div className="text-xs text-gray-500">
              Regions: {provider.supported_regions.join(', ')}
            </div>
          </div>
          
          <div className="flex space-x-1 mt-2">
            {features.supports_vouchers && (
              <Badge variant="outline" className="text-xs">Voucher</Badge>
            )}
            {features.supports_redirect && (
              <Badge variant="outline" className="text-xs">Redirect</Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function ProviderSelector({
  selectedProviders,
  onProvidersChange,
  region,
  currency,
  capabilities
}: ProviderSelectorProps) {
  // Group providers by region for better UX
  const providersByRegion = {
    global: capabilities.filter(p => p.key === 'stripe'),
    regional: capabilities.filter(p => p.key !== 'stripe')
  }
  
  const toggleProvider = (providerKey: PaymentProvider) => {
    if (selectedProviders.includes(providerKey)) {
      onProvidersChange(selectedProviders.filter(p => p !== providerKey))
    } else {
      onProvidersChange([...selectedProviders, providerKey])
    }
  }
  
  const isProviderDisabled = (provider: ProviderCapabilities): boolean => {
    // Disable if currency is selected and provider doesn't support it
    if (currency && !provider.supported_currencies.includes(currency)) {
      return true
    }
    
    // Disable if region is selected and provider doesn't support it
    if (region && !provider.supported_regions.includes(region)) {
      return true
    }
    
    // Disable if provider is not active
    const features = deriveProviderFeatures(provider)
    if (!features.is_active) {
      return true
    }
    
    return false
  }
  
  return (
    <div className="space-y-4">
      {providersByRegion.global.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Global Providers</h4>
          <div className="grid grid-cols-1 gap-2">
            {providersByRegion.global.map(provider => (
              <ProviderCard
                key={provider.key}
                provider={provider}
                selected={selectedProviders.includes(provider.key)}
                disabled={isProviderDisabled(provider)}
                onToggle={() => toggleProvider(provider.key)}
              />
            ))}
          </div>
        </div>
      )}
      
      {providersByRegion.regional.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Regional Providers</h4>
          <div className="grid grid-cols-2 gap-2">
            {providersByRegion.regional.map(provider => (
              <ProviderCard
                key={provider.key}
                provider={provider}
                selected={selectedProviders.includes(provider.key)}
                disabled={isProviderDisabled(provider)}
                onToggle={() => toggleProvider(provider.key)}
              />
            ))}
          </div>
        </div>
      )}
      
      {capabilities.length === 0 && (
        <div className="text-center py-6 text-gray-500">
          <p>No provider capabilities loaded</p>
        </div>
      )}
    </div>
  )
}