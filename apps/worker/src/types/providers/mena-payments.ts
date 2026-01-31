/**
 * MENA Payment Provider Type Definitions
 * 
 * This file contains type definitions specific to Middle East payment providers
 */

import { IntegrationProvider, PaymentCapability } from '../integrations';

// ============================================
// Tap Payments Types
// ============================================

export interface TapPaymentsConfig {
  secretKey: string;
  publishableKey?: string;
  environment?: 'sandbox' | 'production';
  merchantId?: string;
}

export interface TapCharge {
  id: string;
  amount: number;
  currency: string;
  status: 'INITIATED' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'CANCELLED';
  customer: {
    email?: string;
    phone?: string;
    name?: string;
  };
  source: {
    type: 'CARD' | 'MADA' | 'KNET' | 'BENEFIT' | 'OMANNET' | 'APPLE_PAY' | 'GOOGLE_PAY';
    payment_method?: string;
  };
  metadata?: Record<string, any>;
  reference?: {
    order?: string;
    invoice?: string;
  };
  redirect?: {
    url: string;
  };
  post?: {
    url: string;
  };
}

export interface TapCustomer {
  id: string;
  email: string;
  phone?: {
    country_code: string;
    number: string;
  };
  name: {
    first: string;
    last?: string;
  };
  cards?: Array<{
    id: string;
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  }>;
}

// ============================================
// Paymob Types
// ============================================

export interface PaymobConfig {
  apiKey: string;
  integrationId: number;
  iframeId?: number;
  hmacSecret: string;
  environment?: 'sandbox' | 'production';
}

export interface PaymobOrder {
  id: number;
  amount_cents: number;
  currency: string;
  merchant_order_id?: string;
  items?: Array<{
    name: string;
    amount_cents: number;
    quantity: number;
    description?: string;
  }>;
}

export interface PaymobPaymentKey {
  token: string;
  order_id: number;
  billing_data: {
    email: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    country?: string;
    city?: string;
    street?: string;
    building?: string;
    floor?: string;
    apartment?: string;
  };
  amount_cents: number;
  currency: string;
  integration_id: number;
  lock_order_when_paid?: boolean;
}

export interface PaymobTransaction {
  id: number;
  pending: boolean;
  amount_cents: number;
  success: boolean;
  is_auth: boolean;
  is_capture: boolean;
  is_voided: boolean;
  is_refunded: boolean;
  error_occured: boolean;
  has_parent_transaction: boolean;
  order: PaymobOrder;
  source_data: {
    type: string;
    sub_type: string;
    pan?: string;
  };
}

// ============================================
// Tabby Types
// ============================================

export interface TabbyConfig {
  secretKey: string;
  publicKey: string;
  merchantCode: string;
  environment?: 'sandbox' | 'production';
}

export interface TabbyCheckout {
  payment: {
    amount: string;
    currency: string;
    description?: string;
    buyer: {
      email: string;
      phone: string;
      name: string;
      dob?: string;
    };
    shipping_address?: {
      city: string;
      address: string;
      zip: string;
    };
    order: {
      reference_id: string;
      items: Array<{
        title: string;
        quantity: number;
        unit_price: string;
        category?: string;
      }>;
    };
  };
  lang?: 'en' | 'ar';
  merchant_urls: {
    success: string;
    cancel: string;
    failure: string;
  };
}

export interface TabbySession {
  id: string;
  configuration: {
    available_products: Array<{
      type: 'installments' | 'pay_later';
      is_available: boolean;
      rejection_reason?: string;
    }>;
  };
  payment: {
    id: string;
    amount: string;
    currency: string;
    status: 'created' | 'approved' | 'rejected' | 'closed' | 'expired';
  };
}

// ============================================
// Tamara Types
// ============================================

export interface TamaraConfig {
  apiToken: string;
  notificationToken: string;
  environment?: 'sandbox' | 'production';
}

export interface TamaraCheckoutSession {
  order_reference_id: string;
  total_amount: {
    amount: string;
    currency: string;
  };
  description?: string;
  country_code: string;
  payment_type: 'PAY_BY_INSTALMENTS' | 'PAY_BY_LATER';
  instalments?: number;
  locale?: 'en-US' | 'ar-SA';
  items: Array<{
    reference_id: string;
    type: string;
    name: string;
    sku: string;
    quantity: number;
    unit_price: {
      amount: string;
      currency: string;
    };
  }>;
  consumer: {
    first_name: string;
    last_name: string;
    phone_number: string;
    email: string;
  };
  billing_address?: {
    first_name: string;
    last_name: string;
    line1: string;
    city: string;
    country_code: string;
    phone_number: string;
  };
  shipping_address?: {
    first_name: string;
    last_name: string;
    line1: string;
    city: string;
    country_code: string;
    phone_number: string;
  };
  merchant_url: {
    success: string;
    failure: string;
    cancel: string;
    notification: string;
  };
}

export interface TamaraOrder {
  order_id: string;
  order_reference_id: string;
  status: 'new' | 'approved' | 'declined' | 'expired' | 'canceled';
  payment_type: string;
  consumer: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
  };
  total_amount: {
    amount: string;
    currency: string;
  };
}

// ============================================
// Moyasar Types
// ============================================

export interface MoyasarConfig {
  secretKey: string;
  publishableKey: string;
  environment?: 'sandbox' | 'production';
}

export interface MoyasarPayment {
  id: string;
  status: 'initiated' | 'paid' | 'failed' | 'authorized' | 'captured' | 'refunded' | 'voided';
  amount: number;
  currency: string;
  description?: string;
  callback_url?: string;
  source: {
    type: 'creditcard' | 'mada' | 'applepay' | 'stcpay';
    name?: string;
    number?: string;
    gateway_response?: any;
  };
  metadata?: Record<string, any>;
}

export interface MoyasarInvoice {
  id: string;
  status: 'initiated' | 'paid' | 'expired' | 'canceled';
  amount: number;
  currency: string;
  description?: string;
  logo_url?: string;
  link?: string;
  expired_at?: string;
  metadata?: Record<string, any>;
}

// ============================================
// PayTabs Types
// ============================================

export interface PayTabsConfig {
  profileId: string;
  serverKey: string;
  clientKey?: string;
  region: 'ARE' | 'SAU' | 'OMN' | 'JOR' | 'EGY' | 'GLOBAL';
  environment?: 'sandbox' | 'production';
}

export interface PayTabsPaymentRequest {
  profile_id: string;
  tran_type: 'sale' | 'auth';
  tran_class: 'ecom' | 'moto' | 'cont';
  cart_id: string;
  cart_currency: string;
  cart_amount: number;
  cart_description: string;
  paypage_lang?: 'en' | 'ar';
  customer_details: {
    name: string;
    email: string;
    phone: string;
    street1: string;
    city: string;
    state: string;
    country: string;
    zip?: string;
  };
  shipping_details?: {
    name: string;
    email: string;
    phone: string;
    street1: string;
    city: string;
    state: string;
    country: string;
    zip?: string;
  };
  callback?: string;
  return?: string;
  hide_shipping?: boolean;
  tokenise?: '2' | false;
  token?: string;
}

export interface PayTabsPaymentResponse {
  tran_ref: string;
  tran_type: string;
  cart_id: string;
  cart_description: string;
  cart_currency: string;
  cart_amount: string;
  tran_currency: string;
  tran_total: string;
  customer_details: {
    name: string;
    email: string;
    phone: string;
  };
  payment_result: {
    response_status: 'A' | 'H' | 'P' | 'V' | 'E' | 'D' | 'F' | 'C';
    response_code: string;
    response_message: string;
    transaction_time: string;
  };
  payment_info?: {
    card_type: string;
    card_scheme: string;
    payment_description: string;
  };
  token?: string;
}

// ============================================
// Shared Types
// ============================================

export interface MENAPaymentProvider {
  provider: IntegrationProvider;
  capabilities: PaymentCapability[];
  supportedCountries: string[];
  supportedCurrencies: string[];
  supportedPaymentMethods: string[];
}

export interface MENAWebhookPayload {
  provider: IntegrationProvider;
  eventType: string;
  signature?: string;
  timestamp: string;
  data: any;
}

export interface MENARefundRequest {
  transactionId: string;
  amount?: number; // Optional for partial refunds
  currency?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface MENARefundResponse {
  refundId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: number;
  currency: string;
  originalTransactionId: string;
  createdAt: string;
  processedAt?: string;
  failureReason?: string;
}