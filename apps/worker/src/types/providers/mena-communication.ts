/**
 * MENA Communication Provider Type Definitions
 * 
 * This file contains type definitions specific to Middle East communication providers
 * including WhatsApp Business API, SMS, and voice services
 */

import { IntegrationProvider } from '../integrations';

// ============================================
// Unifonic Types
// ============================================

export interface UnifonicConfig {
  appSid: string;
  apiKey?: string;
  senderName: string;
  environment?: 'sandbox' | 'production';
}

export interface UnifonicSMSRequest {
  recipient: string | string[]; // E.164 format
  body: string;
  sender?: string;
  priority?: 'high' | 'normal';
  messageType?: 'text' | 'unicode';
  correlationId?: string;
  baseEncode?: boolean;
  scheduled?: string; // ISO 8601 format
}

export interface UnifonicSMSResponse {
  messageId: string;
  correlationId?: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  recipient: string;
  cost: number;
  currency: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface UnifonicWhatsAppTemplate {
  namespace: string;
  name: string;
  language: {
    code: string; // e.g., 'ar', 'en_US'
    policy: 'deterministic';
  };
  components: Array<{
    type: 'header' | 'body' | 'footer' | 'button';
    parameters?: Array<{
      type: 'text' | 'image' | 'document' | 'video';
      text?: string;
      image?: {
        link: string;
      };
      document?: {
        link: string;
        filename: string;
      };
      video?: {
        link: string;
      };
    }>;
  }>;
}

export interface UnifonicWhatsAppMessage {
  recipient: string; // WhatsApp ID or phone number
  type: 'template' | 'text' | 'image' | 'document' | 'location';
  template?: UnifonicWhatsAppTemplate;
  text?: {
    body: string;
    preview_url?: boolean;
  };
  image?: {
    link: string;
    caption?: string;
  };
  document?: {
    link: string;
    filename: string;
    caption?: string;
  };
  location?: {
    longitude: number;
    latitude: number;
    name?: string;
    address?: string;
  };
}

export interface UnifonicNumberLookup {
  number: string;
  carrier?: string;
  country?: string;
  countryCode?: string;
  lineType?: 'mobile' | 'landline' | 'voip';
  isValid?: boolean;
  isPorted?: boolean;
}

export interface Unifonic2FARequest {
  recipient: string;
  body?: string; // Custom message template
  expiry?: number; // Seconds
  codeLength?: number;
  codeType?: 'numeric' | 'alphanumeric';
}

export interface Unifonic2FAVerification {
  recipient: string;
  code: string;
}

// ============================================
// Infobip Types
// ============================================

export interface InfobipConfig {
  apiKey: string;
  baseUrl?: string; // Regional base URL
  sender?: string;
}

export interface InfobipSMSMessage {
  from: string;
  to: string | string[];
  text: string;
  language?: {
    languageCode?: 'TR' | 'ES' | 'PT' | 'AR'; // For Arabic
  };
  transliteration?: 'TURKISH' | 'GREEK' | 'CYRILLIC' | 'SERBIAN_CYRILLIC' | 'ARABIC';
  notifyUrl?: string;
  notifyContentType?: 'application/json' | 'application/xml';
  callbackData?: string;
  validityPeriod?: number;
  sendAt?: string; // ISO 8601
}

export interface InfobipWhatsAppMessage {
  from: string;
  to: string;
  messageId?: string;
  content: {
    templateName: string;
    templateData: {
      body: {
        placeholders: string[];
      };
      header?: {
        type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
        placeholder?: string;
        mediaUrl?: string;
        filename?: string;
        latitude?: number;
        longitude?: number;
      };
      buttons?: Array<{
        type: 'QUICK_REPLY' | 'URL';
        parameter: string;
      }>;
    };
    language: string; // e.g., 'ar', 'en'
  };
  callbackData?: string;
  notifyUrl?: string;
}

export interface InfobipViberMessage {
  from: string;
  to: string;
  content: {
    text: string;
    button?: {
      text: string;
      url: string;
    };
    image?: {
      url: string;
    };
  };
  callbackData?: string;
  notifyUrl?: string;
}

export interface InfobipRCSMessage {
  from: string;
  to: string;
  validityPeriod?: number;
  validityPeriodTimeUnit?: 'SECONDS' | 'MINUTES' | 'HOURS' | 'DAYS';
  content: {
    text: string;
    suggestions?: Array<{
      text: string;
      postbackData: string;
      type: 'REPLY' | 'OPEN_URL' | 'DIAL_PHONE' | 'VIEW_LOCATION' | 'REQUEST_LOCATION';
      url?: string;
      phoneNumber?: string;
      latitude?: number;
      longitude?: number;
      label?: string;
    }>;
    card?: {
      title: string;
      description: string;
      media: {
        url: string;
        thumbnail?: string;
        height: 'SHORT' | 'MEDIUM' | 'TALL';
      };
      suggestions?: Array<any>;
    };
  };
  smsFailover?: boolean;
  callbackData?: string;
  notifyUrl?: string;
}

export interface InfobipOmniMessage {
  destinations: Array<{
    to: {
      phoneNumber?: string;
      emailAddress?: string;
    };
  }>;
  messages: Array<{
    channel: 'SMS' | 'WHATSAPP' | 'VIBER_SERVICE' | 'EMAIL' | 'VOICE' | 'RCS';
    sender?: string;
    content: any; // Channel-specific content
  }>;
  failover?: {
    channels: string[];
    delay?: number;
  };
}

export interface InfobipMessageStatus {
  bulkId?: string;
  messageId: string;
  to: string;
  from?: string;
  sentAt?: string;
  doneAt?: string;
  status: {
    groupId: number;
    groupName: 'PENDING' | 'UNDELIVERABLE' | 'DELIVERED' | 'EXPIRED' | 'REJECTED';
    id: number;
    name: string;
    description?: string;
  };
  error?: {
    groupId: number;
    groupName: string;
    id: number;
    name: string;
    description?: string;
    permanent?: boolean;
  };
  price?: {
    pricePerMessage: number;
    currency: string;
  };
}

// ============================================
// Shared Communication Types
// ============================================

export interface MENACommunicationProvider {
  provider: IntegrationProvider;
  supportedChannels: CommunicationChannel[];
  supportedCountries: string[];
  supportedLanguages: string[];
  features: CommunicationFeature[];
}

export enum CommunicationChannel {
  SMS = 'sms',
  WhatsApp = 'whatsapp',
  WhatsAppBusiness = 'whatsapp_business',
  Voice = 'voice',
  Email = 'email',
  Viber = 'viber',
  RCS = 'rcs',
  Push = 'push'
}

export enum CommunicationFeature {
  Templates = 'templates',
  TwoWayMessaging = 'two_way_messaging',
  MediaMessages = 'media_messages',
  BulkMessaging = 'bulk_messaging',
  Scheduling = 'scheduling',
  NumberLookup = 'number_lookup',
  TwoFactorAuth = '2fa',
  Failover = 'failover',
  Analytics = 'analytics',
  ArabicSupport = 'arabic_support',
  Transliteration = 'transliteration'
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  components: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    text?: string;
    example?: any;
  }>;
  rejectedReason?: string;
}

export interface MessageDeliveryReport {
  messageId: string;
  recipient: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'expired';
  timestamp: string;
  channel: CommunicationChannel;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface BulkMessageRequest {
  recipients: Array<{
    phone?: string;
    email?: string;
    customerId?: string;
    variables?: Record<string, string>; // For template variables
  }>;
  template?: string;
  message?: string;
  channel: CommunicationChannel;
  scheduled?: string; // ISO 8601
  priority?: 'high' | 'normal' | 'low';
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface NumberValidation {
  number: string;
  isValid: boolean;
  formatted: {
    international: string;
    national: string;
    e164: string;
  };
  carrier?: {
    name: string;
    type: 'mobile' | 'landline' | 'voip';
    mcc?: string;
    mnc?: string;
  };
  country?: {
    code: string;
    name: string;
    prefix: string;
  };
  isPorted?: boolean;
  isRoaming?: boolean;
}

// ============================================
// Arabic-specific Types
// ============================================

export interface ArabicMessageOptions {
  direction: 'rtl' | 'ltr';
  encoding?: 'UTF-8' | 'UTF-16' | 'GSM7' | 'UCS2';
  transliterate?: boolean;
  font?: 'naskh' | 'kufi' | 'thuluth'; // For image generation
}

export interface ArabicTemplateVariable {
  key: string;
  value: string;
  isArabic: boolean;
  direction?: 'rtl' | 'ltr';
}