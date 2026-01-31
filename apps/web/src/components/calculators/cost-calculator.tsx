'use client'

import { useState, useEffect } from 'react'

interface PricingTier {
  name: string
  nameAr: string
  basePrice: number
  features: string[]
  featuresAr: string[]
}

interface Currency {
  code: string
  symbol: string
  symbolAr: string
  rate: number // Conversion rate from USD
}

const currencies: Currency[] = [
  { code: 'USD', symbol: '$', symbolAr: '$', rate: 1 },
  { code: 'EGP', symbol: 'EGP', symbolAr: 'ج.م', rate: 31 },
  { code: 'SAR', symbol: 'SAR', symbolAr: 'ر.س', rate: 3.75 },
  { code: 'AED', symbol: 'AED', symbolAr: 'د.إ', rate: 3.67 }
]

const pricingTiers: PricingTier[] = [
  {
    name: 'Starter',
    nameAr: 'البداية',
    basePrice: 29,
    features: ['5 pages', 'Basic SEO', 'Contact form', 'Mobile responsive'],
    featuresAr: ['٥ صفحات', 'سيو أساسي', 'نموذج اتصال', 'متجاوب مع الجوال']
  },
  {
    name: 'Professional',
    nameAr: 'احترافي',
    basePrice: 79,
    features: ['15 pages', 'Advanced SEO', 'WhatsApp integration', 'Analytics', 'Custom domain'],
    featuresAr: ['١٥ صفحة', 'سيو متقدم', 'تكامل واتساب', 'تحليلات', 'دومين خاص']
  },
  {
    name: 'Business',
    nameAr: 'الأعمال',
    basePrice: 199,
    features: ['Unlimited pages', 'Full SEO suite', 'E-commerce ready', 'Multi-language', 'Priority support'],
    featuresAr: ['صفحات غير محدودة', 'سيو كامل', 'جاهز للتجارة', 'متعدد اللغات', 'دعم أولوية']
  }
]

const additionalFeatures = [
  { name: 'E-commerce', nameAr: 'متجر إلكتروني', price: 100 },
  { name: 'Booking system', nameAr: 'نظام حجز', price: 50 },
  { name: 'Multi-language', nameAr: 'متعدد اللغات', price: 30 },
  { name: 'Custom integrations', nameAr: 'تكاملات خاصة', price: 150 },
  { name: 'Advanced analytics', nameAr: 'تحليلات متقدمة', price: 40 }
]

interface CostCalculatorProps {
  locale?: string
  defaultCurrency?: string
  onPriceCalculated?: (price: number, currency: string) => void
}

export function CostCalculator({ 
  locale = 'ar', 
  defaultCurrency = 'EGP',
  onPriceCalculated 
}: CostCalculatorProps) {
  const [selectedTier, setSelectedTier] = useState<number>(1) // Default to Professional
  const [selectedCurrency, setSelectedCurrency] = useState<string>(defaultCurrency)
  const [selectedFeatures, setSelectedFeatures] = useState<Set<number>>(new Set())
  const [pages, setPages] = useState<number>(10)
  const [monthlyVisitors, setMonthlyVisitors] = useState<number>(1000)
  const isRTL = locale.startsWith('ar')

  const calculatePrice = () => {
    const tier = pricingTiers[selectedTier]
    let basePrice = tier.basePrice

    // Add price for additional pages (beyond tier limit)
    const tierPageLimits = [5, 15, 999]
    if (pages > tierPageLimits[selectedTier]) {
      const extraPages = pages - tierPageLimits[selectedTier]
      basePrice += extraPages * 5 // $5 per additional page
    }

    // Add price for high traffic
    if (monthlyVisitors > 10000) {
      basePrice += Math.floor(monthlyVisitors / 10000) * 20
    }

    // Add selected additional features
    selectedFeatures.forEach(featureIndex => {
      basePrice += additionalFeatures[featureIndex].price
    })

    // Convert to selected currency
    const currency = currencies.find(c => c.code === selectedCurrency) || currencies[0]
    const finalPrice = Math.round(basePrice * currency.rate)

    return { price: finalPrice, currency }
  }

  const { price, currency } = calculatePrice()

  useEffect(() => {
    if (onPriceCalculated) {
      onPriceCalculated(price, currency.code)
    }
  }, [price, currency.code, onPriceCalculated])

  const toggleFeature = (index: number) => {
    const newFeatures = new Set(selectedFeatures)
    if (newFeatures.has(index)) {
      newFeatures.delete(index)
    } else {
      newFeatures.add(index)
    }
    setSelectedFeatures(newFeatures)
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-card rounded-lg shadow-lg" dir={isRTL ? 'rtl' : 'ltr'}>
      <h2 className="text-2xl font-bold mb-6 text-foreground">
        {isRTL ? 'حاسبة التكلفة' : 'Cost Calculator'}
      </h2>

      {/* Currency Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-foreground">
          {isRTL ? 'العملة' : 'Currency'}
        </label>
        <select
          value={selectedCurrency}
          onChange={(e) => setSelectedCurrency(e.target.value)}
          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          {currencies.map(curr => (
            <option key={curr.code} value={curr.code}>
              {curr.code} ({isRTL ? curr.symbolAr : curr.symbol})
            </option>
          ))}
        </select>
      </div>

      {/* Pricing Tier Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-foreground">
          {isRTL ? 'الباقة الأساسية' : 'Base Package'}
        </label>
        <div className="grid md:grid-cols-3 gap-4">
          {pricingTiers.map((tier, index) => (
            <button
              key={index}
              onClick={() => setSelectedTier(index)}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedTier === index
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-semibold mb-2 text-foreground">
                {isRTL ? tier.nameAr : tier.name}
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                {(isRTL ? tier.featuresAr : tier.features).map((feature, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <svg className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </div>

      {/* Pages Slider */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-foreground">
          {isRTL ? `عدد الصفحات: ${pages}` : `Number of Pages: ${pages}`}
        </label>
        <input
          type="range"
          min="1"
          max="100"
          value={pages}
          onChange={(e) => setPages(Number(e.target.value))}
          className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>1</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>

      {/* Monthly Visitors */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-foreground">
          {isRTL ? `الزوار الشهريون: ${monthlyVisitors.toLocaleString()}` : `Monthly Visitors: ${monthlyVisitors.toLocaleString()}`}
        </label>
        <input
          type="range"
          min="100"
          max="100000"
          step="100"
          value={monthlyVisitors}
          onChange={(e) => setMonthlyVisitors(Number(e.target.value))}
          className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>100</span>
          <span>50K</span>
          <span>100K</span>
        </div>
      </div>

      {/* Additional Features */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-foreground">
          {isRTL ? 'مميزات إضافية' : 'Additional Features'}
        </label>
        <div className="space-y-2">
          {additionalFeatures.map((feature, index) => (
            <label key={index} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedFeatures.has(index)}
                onChange={() => toggleFeature(index)}
                className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary focus:ring-2"
              />
              <span className="text-foreground">
                {isRTL ? feature.nameAr : feature.name}
              </span>
              <span className="text-sm text-muted-foreground ms-auto">
                +{Math.round(feature.price * (currencies.find(c => c.code === selectedCurrency)?.rate || 1))} {isRTL ? currency.symbolAr : currency.symbol}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Total Price */}
      <div className="mt-8 p-6 bg-primary/10 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-lg font-medium text-foreground">
            {isRTL ? 'السعر الشهري المقدر' : 'Estimated Monthly Price'}
          </span>
          <div className="text-3xl font-bold text-primary">
            {price.toLocaleString()} {isRTL ? currency.symbolAr : currency.symbol}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {isRTL 
            ? 'الأسعار تقديرية وقد تختلف حسب المتطلبات الخاصة'
            : 'Prices are estimates and may vary based on specific requirements'}
        </p>
      </div>

      {/* CTA Buttons */}
      <div className="flex gap-4 mt-6">
        <button className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors">
          {isRTL ? 'ابدأ الآن' : 'Get Started'}
        </button>
        <button className="flex-1 px-6 py-3 bg-card text-foreground rounded-lg font-semibold hover:bg-card/80 transition-colors border border-border">
          {isRTL ? 'تحدث مع مستشار' : 'Talk to Advisor'}
        </button>
      </div>
    </div>
  )
}