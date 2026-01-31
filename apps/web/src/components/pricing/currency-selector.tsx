'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrencyPreference, SUPPORTED_CURRENCIES, getCurrencySymbol } from '@/hooks/use-pricing-catalog'
import type { SupportedCurrency } from '@/hooks/use-pricing-catalog'
import { cn } from '@/lib/utils'

interface CurrencySelectorProps {
  translations: any
  className?: string
}

// Currency display names
const CURRENCY_NAMES: Record<SupportedCurrency, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  EGP: 'Egyptian Pound',
  SAR: 'Saudi Riyal',
  AED: 'UAE Dirham'
}

export function CurrencySelector({ translations, className }: CurrencySelectorProps) {
  const { currency, setCurrencyPreference } = useCurrencyPreference()
  const [isOpen, setIsOpen] = useState(false)

  const handleCurrencyChange = (newCurrency: SupportedCurrency) => {
    setCurrencyPreference(newCurrency)
    setIsOpen(false)
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "border-gray-600 bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 hover:text-white",
            className
          )}
          data-testid="currency-selector"
        >
          <span className="font-medium">
            {getCurrencySymbol(currency)} {currency}
          </span>
          <Icon 
            name="chevron-down" 
            className={cn(
              "w-4 h-4 ml-2 transition-transform",
              isOpen && "rotate-180"
            )} 
          />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="center" 
        className="w-48 bg-gray-800 border-gray-600"
        data-testid="currency-dropdown"
      >
        {SUPPORTED_CURRENCIES.map((optionCurrency) => (
          <DropdownMenuItem
            key={optionCurrency}
            onClick={() => handleCurrencyChange(optionCurrency)}
            className={cn(
              "cursor-pointer text-gray-300 hover:text-white hover:bg-gray-700 focus:bg-gray-700",
              currency === optionCurrency && "bg-purple-600/20 text-purple-300"
            )}
            data-testid={`currency-option-${optionCurrency.toLowerCase()}`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <span className="font-medium w-8">
                  {getCurrencySymbol(optionCurrency)}
                </span>
                <span className="text-sm">
                  {optionCurrency}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                {CURRENCY_NAMES[optionCurrency]}
              </span>
              {currency === optionCurrency && (
                <Icon name="check" className="w-4 h-4 text-purple-400 ml-2" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}