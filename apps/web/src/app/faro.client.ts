/**
 * 🌐 Grafana Faro Client-Side Initialization
 * Clean client-only setup that avoids double-init and integrates with tracing
 */

'use client';

import { getWebInstrumentations, initializeFaro, faro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

// Guard against HMR/fast-refresh double initialization
if (typeof window !== 'undefined' && !faro) {
  // Only initialize if we have the required URL
  if (process.env.NEXT_PUBLIC_FARO_URL) {
    try {
      initializeFaro({
        url: process.env.NEXT_PUBLIC_FARO_URL,
        app: {
          name: 'sheenapps',
          version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
          environment: process.env.NEXT_PUBLIC_ENV || 'development',
        },
        instrumentations: [
          // Basic web instrumentations: errors, web vitals (LCP/CLS/INP/TTFB), console, fetch/XHR
          ...getWebInstrumentations(),
          
          // Distributed tracing: adds traceparent on fetch/XHR for backend correlation
          new TracingInstrumentation(),
        ],
        
        // Privacy and filtering hooks
        beforeSend: (event) => {
          // Environment-based filtering (respecting existing analytics patterns)
          const isDev = process.env.NEXT_PUBLIC_ENV === 'development';
          const forceEnable = process.env.NEXT_PUBLIC_FORCE_GRAFANA === 'true';
          const forceDisable = process.env.NEXT_PUBLIC_DISABLE_GRAFANA === 'true';
          
          // CRITICAL: Respect existing analytics environment detection
          if (forceDisable) return null;
          if (isDev && !forceEnable) return null;
          
          // ADDITIONAL PROTECTION: Block localhost/dev domains
          if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
            const isDevDomain = hostname.includes('dev') || hostname.includes('staging') || hostname.includes('test');
            
            if ((isLocalhost || isDevDomain) && !forceEnable) {
              console.log('🛡️ Grafana Faro: Blocked dev/localhost event', { hostname });
              return null;
            }
          }
          
          // Example privacy filters (customize as needed)
          const payload = event.payload as any;
          
          // Drop events with sensitive URLs or PII
          if (payload?.url && /[?&](email|token|key|password)=/.test(payload.url)) {
            return null;
          }
          
          // Truncate long error messages for privacy
          if (payload?.message && payload.message.length > 1000) {
            payload.message = payload.message.substring(0, 1000) + '... [truncated]';
          }
          
          return event;
        },
        
        // Performance and batching configuration
        batching: {
          enabled: true,
          sendTimeout: 5000, // 5 second batch timeout
          itemLimit: 100     // Max 100 events per batch
        },
        
        // Session configuration
        sessionTracking: {
          enabled: true,
          persistent: false // Don't persist across browser sessions for privacy
        },
      });
      
      // Development logging
      if (process.env.NEXT_PUBLIC_ENV === 'development') {
        console.log('🌐 Grafana Faro initialized successfully', {
          app: {
            name: 'sheenapps',
            version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
            environment: process.env.NEXT_PUBLIC_ENV || 'development',
          },
          url: process.env.NEXT_PUBLIC_FARO_URL ? 'configured' : 'missing'
        });
      }
      
    } catch (error) {
      console.error('Failed to initialize Grafana Faro:', error);
    }
  } else {
    // Only log in development to avoid production console noise
    if (process.env.NEXT_PUBLIC_ENV === 'development') {
      console.log('🌐 Faro initialization skipped: NEXT_PUBLIC_FARO_URL not configured');
    }
  }
}

// Helper functions for application use (global access)
export function trackUserAction(action: string, properties: Record<string, any> = {}) {
  if (typeof window !== 'undefined' && faro?.api) {
    faro.api.pushEvent('user_action', {
      action,
      ...properties,
      timestamp: Date.now().toString()
    });
  }
}

export function trackPerformance(metric: string, value: number, attributes: Record<string, any> = {}) {
  if (typeof window !== 'undefined' && faro?.api) {
    faro.api.pushMeasurement({
      type: 'performance',
      values: { [metric]: value }
    });
  }
}

export function setUserContext(userId: string, attributes: Record<string, any> = {}) {
  if (typeof window !== 'undefined' && faro?.api) {
    faro.api.setUser({
      id: userId,
      attributes: {
        ...attributes,
        login_timestamp: Date.now().toString()
      }
    });
  }
}

export function trackError(error: Error, context?: Record<string, any>) {
  if (typeof window !== 'undefined' && faro?.api) {
    faro.api.pushError(error, {
      context: {
        ...context,
        timestamp: Date.now().toString(),
        url: window.location.href
      }
    });
  }
}

// Development helper
if (process.env.NEXT_PUBLIC_ENV === 'development' && typeof window !== 'undefined') {
  (window as any).faroHelpers = {
    trackUserAction,
    trackPerformance,
    setUserContext,
    trackError,
    getFaro: () => faro
  };
}