'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, ArrowLeft, CheckCircle, XCircle, Loader2, CreditCard, ShieldCheck } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDomainSearch, useDomainRegister, type DomainContact, type DomainRegisterResponse } from '@/hooks/use-registered-domains'
import { COUNTRIES } from './countries'
import { logger } from '@/utils/logger'

// Initialize Stripe
const getStripePromise = () => {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    logger.warn('Stripe publishable key not found - domain payment will not work')
    return Promise.resolve(null)
  }
  if (!publishableKey.startsWith('pk_')) {
    logger.error('Invalid Stripe publishable key format')
    return Promise.resolve(null)
  }
  return loadStripe(publishableKey)
}

const stripePromise = getStripePromise()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface DomainRegistrationProps {
  projectId: string
  onBack: () => void
}

interface PaymentData {
  clientSecret: string
  paymentIntentId: string
  domain: string
  priceCents: number
}

const EMPTY_CONTACT: DomainContact = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address1: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
}

export function DomainRegistration({ projectId, onBack }: DomainRegistrationProps) {
  const t = useTranslations('project-email')
  const tErrors = useTranslations('errors')
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [step, setStep] = useState<'search' | 'contact' | 'payment' | 'success'>('search')
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [selectedPrice, setSelectedPrice] = useState<number>(0)
  const [period, setPeriod] = useState(1)
  const [contact, setContact] = useState<DomainContact>(EMPTY_CONTACT)
  const [contactErrors, setContactErrors] = useState<Partial<Record<keyof DomainContact, string>>>({})
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)

  const search = useDomainSearch(projectId)
  const register = useDomainRegister(projectId)

  // Handle Stripe redirect return with payment=success
  useEffect(() => {
    const paymentStatus = searchParams.get('payment')
    if (paymentStatus === 'success') {
      setStep('success')
      // Clean up the URL param
      const url = new URL(window.location.href)
      url.searchParams.delete('payment')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

  function handleSearch() {
    if (!query.trim()) return
    search.mutate({ query: query.trim() })
  }

  function handleSelectDomain(domain: string, priceCents: number) {
    setSelectedDomain(domain)
    setSelectedPrice(priceCents)
    setStep('contact')
  }

  function validateContact(): boolean {
    const errors: Partial<Record<keyof DomainContact, string>> = {}
    const required: (keyof DomainContact)[] = [
      'firstName', 'lastName', 'email', 'phone', 'address1', 'city', 'state', 'postalCode', 'country',
    ]

    for (const field of required) {
      if (!contact[field]?.trim()) {
        errors[field] = t('registration.contact.required')
      }
    }

    if (contact.email && !EMAIL_REGEX.test(contact.email)) {
      errors.email = t('registration.contact.invalidEmail')
    }

    if (contact.country && (contact.country.length !== 2 || !/^[A-Z]{2}$/.test(contact.country))) {
      errors.country = t('registration.contact.invalidCountry')
    }

    setContactErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleRegister() {
    if (!selectedDomain) return
    if (!validateContact()) return

    try {
      const result: DomainRegisterResponse = await register.mutateAsync({
        domain: selectedDomain,
        period,
        autoRenew: true,
        whoisPrivacy: true,
        contacts: { owner: contact },
      })

      // Check if payment action is required (3DS, new card, etc.)
      if (result.requiresPaymentAction && result.paymentIntentClientSecret) {
        setPaymentData({
          clientSecret: result.paymentIntentClientSecret,
          paymentIntentId: result.paymentIntentId || '',
          domain: selectedDomain,
          priceCents: selectedPrice * period,
        })
        setStep('payment')
        return
      }

      // Domain registered successfully (payment was processed or not needed)
      if (result.domain) {
        setStep('success')
      }
    } catch {
      // Error handled by mutation
    }
  }

  function handlePaymentSuccess() {
    setStep('success')
  }

  function updateContact(field: keyof DomainContact, value: string) {
    setContact(prev => ({ ...prev, [field]: value }))
    if (contactErrors[field]) {
      setContactErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  if (step === 'success') {
    return (
      <div className="text-center space-y-4 py-8">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
        <div>
          <p className="text-base font-medium">{t('registration.success')}</p>
          <p className="text-sm text-muted-foreground mt-1 font-mono">{selectedDomain}</p>
        </div>
        <Button variant="outline" onClick={onBack}>
          {t('common.back')}
        </Button>
      </div>
    )
  }

  if (step === 'contact') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setStep('search')}>
          <ArrowLeft className="h-4 w-4 me-1.5" />
          {t('common.back')}
        </Button>

        <div>
          <h3 className="text-base font-medium">{t('registration.contact.title')}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('registration.contact.description')}
          </p>
          <p className="text-sm font-mono text-muted-foreground mt-1">{selectedDomain}</p>
        </div>

        {/* Contact form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ContactField
            label={t('registration.contact.firstName')}
            value={contact.firstName}
            error={contactErrors.firstName}
            onChange={(v) => updateContact('firstName', v)}
            required
          />
          <ContactField
            label={t('registration.contact.lastName')}
            value={contact.lastName}
            error={contactErrors.lastName}
            onChange={(v) => updateContact('lastName', v)}
            required
          />
          <ContactField
            label={t('registration.contact.orgName')}
            value={contact.orgName || ''}
            onChange={(v) => updateContact('orgName', v)}
          />
          <ContactField
            label={t('registration.contact.email')}
            value={contact.email}
            error={contactErrors.email}
            onChange={(v) => updateContact('email', v)}
            type="email"
            required
          />
          <ContactField
            label={t('registration.contact.phone')}
            value={contact.phone}
            error={contactErrors.phone}
            onChange={(v) => updateContact('phone', v)}
            type="tel"
            required
          />
          <ContactField
            label={t('registration.contact.address1')}
            value={contact.address1}
            error={contactErrors.address1}
            onChange={(v) => updateContact('address1', v)}
            required
          />
          <ContactField
            label={t('registration.contact.address2')}
            value={contact.address2 || ''}
            onChange={(v) => updateContact('address2', v)}
          />
          <ContactField
            label={t('registration.contact.city')}
            value={contact.city}
            error={contactErrors.city}
            onChange={(v) => updateContact('city', v)}
            required
          />
          <ContactField
            label={t('registration.contact.state')}
            value={contact.state}
            error={contactErrors.state}
            onChange={(v) => updateContact('state', v)}
            required
          />
          <ContactField
            label={t('registration.contact.postalCode')}
            value={contact.postalCode}
            error={contactErrors.postalCode}
            onChange={(v) => updateContact('postalCode', v)}
            required
          />
          <div className="space-y-1.5">
            <Label className={contactErrors.country ? 'text-destructive' : ''}>
              {t('registration.contact.country')} *
            </Label>
            <select
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background"
              value={contact.country}
              onChange={(e) => updateContact('country', e.target.value)}
            >
              <option value="">{t('registration.contact.selectCountry')}</option>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
            {contactErrors.country && (
              <p className="text-xs text-destructive">{contactErrors.country}</p>
            )}
          </div>
        </div>

        {/* Registration options + submit */}
        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium font-mono">{selectedDomain}</span>
            <select
              className="text-sm border border-border rounded px-2 py-1 bg-background"
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
            >
              {[1, 2, 3].map(y => (
                <option key={y} value={y}>{t('registration.years', { count: y })}</option>
              ))}
            </select>
          </div>
          <Button
            className="w-full"
            onClick={handleRegister}
            disabled={register.isPending}
          >
            {register.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin me-1.5" />{t('registration.registering')}</>
            ) : (
              t('registration.registerDomain')
            )}
          </Button>
          {register.isError && (
            <p className="text-sm text-destructive text-center">
              {register.error?.message || t('common.error')}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Payment step
  if (step === 'payment' && paymentData) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setStep('contact')}>
          <ArrowLeft className="h-4 w-4 me-1.5" />
          {t('common.back')}
        </Button>

        <div>
          <h3 className="text-base font-medium">{t('registration.payment.title')}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('registration.payment.description')}
          </p>
          <p className="text-sm font-mono text-muted-foreground mt-1">{selectedDomain}</p>
        </div>

        {/* Security notice */}
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            {t('registration.payment.secure')}
          </AlertDescription>
        </Alert>

        {/* Stripe Elements */}
        <DomainPaymentForm
          clientSecret={paymentData.clientSecret}
          domain={paymentData.domain}
          priceCents={paymentData.priceCents}
          onSuccess={handlePaymentSuccess}
          translations={{
            processing: t('registration.payment.processing'),
            payButton: t('registration.payment.payButton'),
            total: t('registration.payment.total'),
            loadingPaymentForm: t('registration.payment.loadingForm'),
            paymentNotReady: t('registration.payment.notReady'),
            paymentFailed: t('registration.payment.failed'),
            paymentUnclear: t('registration.payment.unclear'),
            paymentSecure: t('registration.payment.secure'),
            poweredByStripe: t('registration.payment.poweredByStripe'),
            stripeInitFailed: t('registration.payment.stripeInitFailed'),
            stripeLoadFailed: t('registration.payment.stripeLoadFailed'),
          }}
        />
      </div>
    )
  }

  // Search step
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 me-1.5" />
        {t('common.back')}
      </Button>

      <h3 className="text-base font-medium">{t('registration.title')}</h3>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          placeholder={t('registration.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={search.isPending || !query.trim()}>
          {search.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4 me-1.5" />
          )}
          {t('registration.search')}
        </Button>
      </div>

      {/* Results */}
      {search.data && (
        <div className="space-y-2">
          {(search.data as any)?.results?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('registration.noResults')}
            </p>
          ) : (
            (search.data as any)?.results?.map((result: any) => (
              <Card
                key={result.domain}
                className={`cursor-pointer transition-colors ${
                  selectedDomain === result.domain ? 'border-primary' : 'hover:border-primary/50'
                } ${!result.available ? 'opacity-60' : ''}`}
                onClick={() => result.available && handleSelectDomain(result.domain, result.priceCents || 1999)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{result.domain}</span>
                    {result.available ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle className="h-3 w-3 me-1" />
                        {t('registration.available')}
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <XCircle className="h-3 w-3 me-1" />
                        {t('registration.unavailable')}
                      </Badge>
                    )}
                  </div>
                  {result.priceCents && (
                    <span className="text-sm font-medium">
                      ${(result.priceCents / 100).toFixed(2)}{t('registration.perYear')}
                    </span>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ContactField({
  label,
  value,
  error,
  onChange,
  type = 'text',
  required,
}: {
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label className={error ? 'text-destructive' : ''}>
        {label}{required ? ' *' : ''}
      </Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={error ? 'border-destructive' : ''}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// =============================================================================
// STRIPE PAYMENT FORM
// =============================================================================

interface DomainPaymentFormProps {
  clientSecret: string
  domain: string
  priceCents: number
  onSuccess: () => void
  translations: {
    processing: string
    payButton: string
    total: string
    loadingPaymentForm: string
    paymentNotReady: string
    paymentFailed: string
    paymentUnclear: string
    paymentSecure: string
    poweredByStripe: string
    stripeInitFailed: string
    stripeLoadFailed: string
  }
}

function DomainPaymentForm({ clientSecret, domain, priceCents, onSuccess, translations }: DomainPaymentFormProps) {
  const [stripeLoadError, setStripeLoadError] = useState<string | null>(null)
  const [isCheckingStripe, setIsCheckingStripe] = useState(true)

  useEffect(() => {
    stripePromise
      .then((stripe) => {
        if (!stripe) {
          setStripeLoadError(translations.stripeInitFailed)
        }
        setIsCheckingStripe(false)
      })
      .catch((error) => {
        logger.error('Failed to load Stripe:', error)
        setStripeLoadError(translations.stripeLoadFailed)
        setIsCheckingStripe(false)
      })
  }, [translations.stripeInitFailed, translations.stripeLoadFailed])

  if (isCheckingStripe) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{translations.loadingPaymentForm}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (stripeLoadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{stripeLoadError}</AlertDescription>
      </Alert>
    )
  }

  const appearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: 'hsl(var(--primary))',
      colorBackground: 'hsl(var(--background))',
      colorText: 'hsl(var(--foreground))',
      colorDanger: 'hsl(var(--destructive))',
      fontFamily: 'system-ui, sans-serif',
      spacingUnit: '4px',
      borderRadius: '6px',
    },
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret, appearance }}
    >
      <DomainPaymentFormContent
        domain={domain}
        priceCents={priceCents}
        onSuccess={onSuccess}
        translations={translations}
      />
    </Elements>
  )
}

function DomainPaymentFormContent({
  domain,
  priceCents,
  onSuccess,
  translations,
}: {
  domain: string
  priceCents: number
  onSuccess: () => void
  translations: DomainPaymentFormProps['translations']
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (stripe && elements) {
      setIsReady(true)
    }
  }, [stripe, elements])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!stripe || !elements) {
      setError(translations.paymentNotReady)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}?payment=success`,
        },
        redirect: 'if_required',
      })

      if (result.error) {
        setError(result.error.message || translations.paymentFailed)
        logger.error('Payment failed:', result.error)
      } else if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
        logger.info('Payment succeeded', { paymentIntentId: result.paymentIntent.id })
        onSuccess()
      } else {
        // Payment may still be processing
        setError(translations.paymentUnclear)
        logger.warn('Unexpected payment state:', result)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Payment processing failed'
      setError(errorMessage)
      logger.error('Payment processing error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  if (!isReady) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{translations.loadingPaymentForm}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Total */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center text-lg">
            <span>{translations.total}</span>
            <span className="font-semibold">{formatAmount(priceCents)}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-mono">{domain}</p>
        </CardContent>
      </Card>

      {/* Payment Element */}
      <Card>
        <CardContent className="pt-6">
          <PaymentElement options={{ layout: 'tabs' }} />
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={isLoading || !stripe || !elements}
        className="w-full"
        size="lg"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin me-2" />
            {translations.processing}
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4 me-2" />
            {translations.payButton} {formatAmount(priceCents)}
          </>
        )}
      </Button>

      {/* Security footer */}
      <div className="text-xs text-muted-foreground text-center space-y-1">
        <p>{translations.paymentSecure}</p>
        <p>{translations.poweredByStripe}</p>
      </div>
    </form>
  )
}
