/**
 * Multi-Provider Checkout Component
 * 
 * Expert-validated frontend integration for handling both voucher and redirect
 * checkout results across all payment providers.
 * 
 * Features:
 * - Voucher UI with QR codes, expiry timers, localized instructions
 * - Redirect handling with proper loading states
 * - Currency-aware price display with fallback messaging
 * - Resume-token flow for 402 → pay → auto-resume
 * - Provider-specific UI optimizations
 */

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { format, parseISO } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';

interface CheckoutResult {
  // Standard fields
  checkout_url?: string;
  currency: string;
  unit_amount_cents: number;
  display_price: number;
  package_minutes: number;
  currency_fallback_from?: string;
  session_id: string;
  order_id: string;
  
  // Multi-provider fields
  payment_provider: 'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs';
  checkout_type: 'voucher' | 'redirect';
  
  // Voucher-specific fields (for cash payments like Fawry)
  voucher_reference?: string;
  voucher_expires_at?: string;
  voucher_instructions?: string;
  voucher_barcode_url?: string;
  
  // Redirect-specific fields
  redirect_expires_at?: string;
}

interface MultiProviderCheckoutProps {
  packageKey: string;
  currency?: string;
  region?: string;
  locale?: 'en' | 'ar';
  resumeToken?: string;
  onSuccess?: (result: CheckoutResult) => void;
  onError?: (error: any) => void;
}

const PROVIDER_DISPLAY_NAMES = {
  stripe: 'Stripe',
  fawry: 'Fawry',
  paymob: 'Paymob',
  stcpay: 'STC Pay',
  paytabs: 'PayTabs'
};

const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  EGP: 'ج.م',
  SAR: '﷼'
};

export const MultiProviderCheckout: React.FC<MultiProviderCheckoutProps> = ({
  packageKey,
  currency = 'USD',
  region,
  locale = 'en',
  resumeToken,
  onSuccess,
  onError
}) => {
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const isRTL = locale === 'ar';
  const dateLocale = locale === 'ar' ? ar : enUS;

  // Purchase handler
  const handlePurchase = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/purchase-package', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          ...(locale && { 'x-sheen-locale': locale })
        },
        body: JSON.stringify({
          package_key: packageKey,
          currency,
          region,
          locale
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Purchase failed');
      }

      const result: CheckoutResult = await response.json();
      setCheckoutResult(result);
      
      // Handle redirect immediately
      if (result.checkout_type === 'redirect' && result.checkout_url) {
        window.location.href = result.checkout_url;
        return;
      }

      // Set up voucher expiry timer
      if (result.checkout_type === 'voucher' && result.voucher_expires_at) {
        const expiryTime = parseISO(result.voucher_expires_at).getTime();
        const updateTimer = () => {
          const now = Date.now();
          const remaining = Math.max(0, Math.floor((expiryTime - now) / 1000));
          setTimeRemaining(remaining);
          
          if (remaining <= 0) {
            setError(locale === 'ar' ? 'انتهت صلاحية الدفع' : 'Payment expired');
          }
        };
        
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
      }

      onSuccess?.(result);

    } catch (err: any) {
      const errorMessage = err.message || 'Unknown error';
      setError(errorMessage);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-initiate purchase if resumeToken provided (402 → pay → auto-resume flow)
  useEffect(() => {
    if (resumeToken && !checkoutResult && !loading) {
      handlePurchase();
    }
  }, [resumeToken]);

  // Format time remaining
  const formatTimeRemaining = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Render voucher UI (for cash payments like Fawry)
  const renderVoucherUI = (result: CheckoutResult) => {
    return (
      <div className={`voucher-checkout ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="voucher-header">
          <h3>
            {locale === 'ar' 
              ? `الدفع عبر ${PROVIDER_DISPLAY_NAMES[result.payment_provider]}` 
              : `Pay with ${PROVIDER_DISPLAY_NAMES[result.payment_provider]}`}
          </h3>
          <div className="payment-details">
            <span className="amount">
              {CURRENCY_SYMBOLS[result.currency as keyof typeof CURRENCY_SYMBOLS] || result.currency} 
              {result.display_price}
            </span>
            <span className="package-info">
              {result.package_minutes} {locale === 'ar' ? 'دقيقة' : 'minutes'}
            </span>
          </div>
        </div>

        <div className="voucher-content">
          {/* QR Code */}
          {result.voucher_reference && (
            <div className="qr-section">
              <QRCodeSVG 
                value={result.voucher_barcode_url || result.voucher_reference}
                size={200}
                level="M"
                includeMargin={true}
              />
              <div className="reference-number">
                <label>
                  {locale === 'ar' ? 'رقم المرجع:' : 'Reference:'}
                </label>
                <code>{result.voucher_reference}</code>
              </div>
            </div>
          )}

          {/* Instructions */}
          {result.voucher_instructions && (
            <div className="instructions">
              <h4>{locale === 'ar' ? 'تعليمات الدفع:' : 'Payment Instructions:'}</h4>
              <div className="instruction-text">
                {result.voucher_instructions}
              </div>
            </div>
          )}

          {/* Expiry Timer */}
          {timeRemaining !== null && timeRemaining > 0 && (
            <div className="expiry-timer">
              <div className="timer-label">
                {locale === 'ar' ? 'الوقت المتبقي:' : 'Time Remaining:'}
              </div>
              <div className="timer-display">
                {formatTimeRemaining(timeRemaining)}
              </div>
            </div>
          )}

          {/* Provider-specific information */}
          {result.payment_provider === 'fawry' && (
            <div className="provider-info">
              <p>
                {locale === 'ar' 
                  ? 'يمكنك الدفع في أي فرع من فروع فوري أو من خلال التطبيق'
                  : 'You can pay at any Fawry location or through the Fawry app'}
              </p>
            </div>
          )}
        </div>

        {/* Currency fallback warning */}
        {result.currency_fallback_from && (
          <div className="currency-fallback-warning">
            {locale === 'ar'
              ? `تم التحويل من ${result.currency_fallback_from} إلى ${result.currency}`
              : `Converted from ${result.currency_fallback_from} to ${result.currency}`}
          </div>
        )}
      </div>
    );
  };

  // Render loading state for redirects
  const renderRedirectLoading = (result: CheckoutResult) => {
    return (
      <div className={`redirect-checkout ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="redirect-header">
          <h3>
            {locale === 'ar'
              ? `جاري التحويل إلى ${PROVIDER_DISPLAY_NAMES[result.payment_provider]}...`
              : `Redirecting to ${PROVIDER_DISPLAY_NAMES[result.payment_provider]}...`}
          </h3>
        </div>
        
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>
            {locale === 'ar'
              ? 'يرجى الانتظار...'
              : 'Please wait...'}
          </p>
        </div>

        <div className="manual-redirect">
          <p>
            {locale === 'ar'
              ? 'إذا لم يتم التحويل تلقائياً، انقر على الرابط أدناه:'
              : 'If you are not redirected automatically, click the link below:'}
          </p>
          <a 
            href={result.checkout_url} 
            className="manual-redirect-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            {locale === 'ar' ? 'متابعة الدفع' : 'Continue Payment'}
          </a>
        </div>
      </div>
    );
  };

  // Main render
  if (loading) {
    return (
      <div className={`checkout-loading ${isRTL ? 'rtl' : 'ltr'}`}>
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>{locale === 'ar' ? 'جاري تجهيز عملية الدفع...' : 'Preparing payment...'}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`checkout-error ${isRTL ? 'rtl' : 'ltr'}`}>
        <div className="error-message">
          <h4>{locale === 'ar' ? 'خطأ في عملية الدفع' : 'Payment Error'}</h4>
          <p>{error}</p>
          <button onClick={() => { setError(null); handlePurchase(); }}>
            {locale === 'ar' ? 'إعادة المحاولة' : 'Try Again'}
          </button>
        </div>
      </div>
    );
  }

  if (checkoutResult) {
    if (checkoutResult.checkout_type === 'voucher') {
      return renderVoucherUI(checkoutResult);
    } else if (checkoutResult.checkout_type === 'redirect') {
      return renderRedirectLoading(checkoutResult);
    }
  }

  // Initial state - show purchase button
  return (
    <div className={`checkout-initial ${isRTL ? 'rtl' : 'ltr'}`}>
      <button 
        onClick={handlePurchase}
        disabled={loading}
        className="purchase-button"
      >
        {locale === 'ar' ? 'شراء الباقة' : 'Purchase Package'}
      </button>
    </div>
  );
};

// CSS styles (would typically be in a separate file)
const styles = `
.voucher-checkout {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
}

.voucher-header {
  text-align: center;
  margin-bottom: 30px;
  border-bottom: 1px solid #eee;
  padding-bottom: 20px;
}

.payment-details {
  display: flex;
  justify-content: space-around;
  margin-top: 10px;
}

.qr-section {
  text-align: center;
  margin: 30px 0;
}

.reference-number {
  margin-top: 15px;
}

.reference-number code {
  font-size: 18px;
  font-weight: bold;
  background: #f5f5f5;
  padding: 8px 16px;
  border-radius: 4px;
}

.instructions {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 6px;
  margin: 20px 0;
}

.expiry-timer {
  text-align: center;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  padding: 15px;
  border-radius: 6px;
  margin: 20px 0;
}

.timer-display {
  font-size: 24px;
  font-weight: bold;
  color: #856404;
  margin-top: 10px;
}

.currency-fallback-warning {
  background: #d1ecf1;
  border: 1px solid #bee5eb;
  padding: 10px;
  border-radius: 4px;
  margin-top: 20px;
  text-align: center;
  font-size: 14px;
}

.loading-spinner {
  text-align: center;
  padding: 40px;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.rtl {
  direction: rtl;
  text-align: right;
}

.error-message {
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  padding: 20px;
  border-radius: 6px;
  text-align: center;
}

.purchase-button {
  background: #007bff;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.purchase-button:hover:not(:disabled) {
  background: #0056b3;
}

.purchase-button:disabled {
  background: #6c757d;
  cursor: not-allowed;
}
`;

export default MultiProviderCheckout;