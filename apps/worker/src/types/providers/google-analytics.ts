// Placeholder for Google Analytics integration types
// This file will be implemented when Google Analytics integration is added

export interface GoogleAnalyticsConfig {
  trackingId: string;
  measurementId?: string;
  apiSecret?: string;
}

export interface GoogleAnalyticsProvider {
  name: 'google-analytics';
  config: GoogleAnalyticsConfig;
}