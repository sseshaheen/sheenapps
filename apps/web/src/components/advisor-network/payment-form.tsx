'use client'

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icon } from '@/components/ui/icon';
import { logger } from '@/utils/logger';

// Initialize Stripe with proper error handling
const getStripePromise = () => {
  // eslint-disable-next-line no-restricted-globals
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY;
  
  if (!publishableKey) {
    logger.warn('⚠️ Stripe publishable key not found - payment form will not work');
    return Promise.resolve(null);
  }

  if (!publishableKey.startsWith('pk_')) {
    logger.error('❌ Invalid Stripe publishable key format');
    return Promise.resolve(null);
  }

  logger.info('🔧 Initializing Stripe with key:', publishableKey.substring(0, 12) + '...');
  return loadStripe(publishableKey);
};

const stripePromise = getStripePromise();

interface PaymentFormProps {
  clientSecret: string;
  amount: number;
  currency: string;
  onSuccess: () => void;
  translations: {
    consultations: {
      book: {
        payment: {
          title: string;
          secure: string;
          processing: string;
          success: string;
        };
      };
    };
  };
}

export function PaymentForm({ 
  clientSecret, 
  amount, 
  currency,
  onSuccess, 
  translations 
}: PaymentFormProps) {
  const [stripeLoadError, setStripeLoadError] = useState<string | null>(null);
  const [isCheckingStripe, setIsCheckingStripe] = useState(true);

  useEffect(() => {
    // Check if Stripe loaded successfully
    stripePromise
      .then((stripe) => {
        if (!stripe) {
          setStripeLoadError('Stripe could not be initialized. Please check your configuration.');
        }
        setIsCheckingStripe(false);
      })
      .catch((error) => {
        logger.error('❌ Failed to load Stripe:', error);
        setStripeLoadError('Failed to load payment system. Please try again.');
        setIsCheckingStripe(false);
      });
  }, []);

  // Show loading while checking Stripe
  if (isCheckingStripe) {
    return (
      <div className="space-y-6">
        <Alert>
          <Icon name="shield-check" className="h-4 w-4" />
          <AlertDescription>
            {translations.consultations.book.payment.secure}
          </AlertDescription>
        </Alert>
        
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <Icon name="loader-2" className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Initializing secure payment...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show fallback if Stripe failed to load
  if (stripeLoadError) {
    logger.info('🎭 Using payment fallback due to Stripe error:', stripeLoadError);
    return (
      <PaymentFormFallback 
        amount={amount}
        currency={currency}
        onSuccess={onSuccess}
        translations={translations}
      />
    );
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
      borderRadius: '6px'
    }
  };

  const options = {
    clientSecret,
    appearance
  };

  return (
    <div className="space-y-6">
      {/* Payment Security Notice */}
      <Alert>
        <Icon name="shield-check" className="h-4 w-4" />
        <AlertDescription>
          {translations.consultations.book.payment.secure}
        </AlertDescription>
      </Alert>

      {/* Stripe Elements */}
      <Elements options={options} stripe={stripePromise}>
        <PaymentFormContent 
          amount={amount}
          currency={currency}
          onSuccess={onSuccess}
          translations={translations}
        />
      </Elements>
    </div>
  );
}

function PaymentFormContent({
  amount,
  currency,
  onSuccess,
  translations
}: {
  amount: number;
  currency: string;
  onSuccess: () => void;
  translations: PaymentFormProps['translations'];
}) {
  const stripe = useStripe();
  const elements = useElements();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Handle form ready
  useEffect(() => {
    if (stripe && elements) {
      setIsReady(true);
    }
  }, [stripe, elements]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      setError('Payment system not ready. Please try again.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      logger.info('💳 Processing payment', { amount, currency });

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          // Return URL after payment
          return_url: `${window.location.origin}/consultations?payment=success`
        },
        redirect: 'if_required'
      });

      if (result.error) {
        // Payment failed
        const errorMessage = result.error.message || 'Payment failed';
        setError(errorMessage);
        logger.error('❌ Payment failed:', result.error);
      } else if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
        // Payment succeeded
        logger.info('✅ Payment succeeded', { paymentIntentId: result.paymentIntent.id });
        onSuccess();
      } else {
        // Unexpected state
        setError('Payment status unclear. Please check your consultations.');
        logger.warn('⚠️ Unexpected payment state:', result);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Payment processing failed';
      setError(errorMessage);
      logger.error('❌ Payment processing error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAmount = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(cents / 100);
  };

  if (!isReady) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <Icon name="loader-2" className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading payment form...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Payment Amount */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center text-lg">
            <span>Total Amount:</span>
            <span className="font-semibold">{formatAmount(amount, currency)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Payment Element */}
      <Card>
        <CardContent className="pt-6">
          <PaymentElement 
            options={{
              layout: 'tabs'
            }}
          />
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <Icon name="alert-circle" className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Submit Button */}
      <Button 
        type="submit" 
        disabled={isLoading || !stripe || !elements}
        className="w-full"
        size="lg"
      >
        {isLoading ? (
          <>
            <Icon name="loader-2" className="h-4 w-4 animate-spin me-2" />
            {translations.consultations.book.payment.processing}
          </>
        ) : (
          <>
            <Icon name="credit-card" className="h-4 w-4 me-2" />
            Pay {formatAmount(amount, currency)}
          </>
        )}
      </Button>

      {/* Payment Security Footer */}
      <div className="text-xs text-muted-foreground text-center space-y-1">
        <p>Your payment information is secure and encrypted</p>
        <p>Powered by Stripe • PCI DSS compliant</p>
      </div>
    </form>
  );
}

// Development/Demo fallback component when Stripe is unavailable
export function PaymentFormFallback({
  amount,
  currency,
  onSuccess,
  translations
}: {
  amount: number;
  currency: string;
  onSuccess: () => void;
  translations: PaymentFormProps['translations'];
}) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDemoPayment = async () => {
    setIsProcessing(true);
    
    // Simulate realistic payment processing time
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    logger.info('💳 Demo payment completed successfully', { amount, currency });
    onSuccess();
  };

  const formatAmount = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6">
      {/* Development Notice */}
      <Alert>
        <Icon name="code" className="h-4 w-4" />
        <AlertDescription>
          <strong>Development Mode:</strong> Stripe integration not available. Using demo payment flow.
        </AlertDescription>
      </Alert>

      {/* Payment Amount */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center text-lg">
            <span>Total Amount:</span>
            <span className="font-semibold">{formatAmount(amount, currency)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Mock Payment Form */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Card Number</label>
              <div className="p-3 border rounded-lg bg-muted text-sm">
                4242 4242 4242 4242 (Demo)
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Expiry</label>
                <div className="p-3 border rounded-lg bg-muted text-sm">12/34</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">CVC</label>
                <div className="p-3 border rounded-lg bg-muted text-sm">123</div>
              </div>
            </div>
          </div>

          <Button 
            onClick={handleDemoPayment}
            disabled={isProcessing}
            className="w-full"
            size="lg"
          >
            {isProcessing ? (
              <>
                <Icon name="loader-2" className="h-4 w-4 animate-spin me-2" />
                Processing Demo Payment...
              </>
            ) : (
              <>
                <Icon name="play" className="h-4 w-4 me-2" />
                Complete Demo Payment {formatAmount(amount, currency)}
              </>
            )}
          </Button>

          {/* Demo Notice */}
          <div className="text-xs text-muted-foreground text-center space-y-1 pt-2">
            <p>🎭 This is a demo payment - no real charges will be made</p>
            <p>In production, this would process through Stripe</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
