'use client';

import { useEffect } from 'react';

// Analytics tracking functions for advisor landing page
export function trackHeroCTAClick(ctaType: 'primary' | 'secondary' | 'enterprise', destination: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'advisor_hero_cta_click', {
      cta_type: ctaType,
      destination: destination,
      page_location: window.location.href,
    });
  }
}

export function trackSectionView(sectionName: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'advisor_section_view', {
      section_name: sectionName,
      page_location: window.location.href,
    });
  }
}

export function trackFAQExpand(questionText: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'advisor_faq_expand', {
      question: questionText.substring(0, 100), // Limit length for analytics
      page_location: window.location.href,
    });
  }
}

export function trackCalculatorInteraction(hoursStuck: number, hourlyRate: number, calculatedSavings: number) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'advisor_calculator_used', {
      hours_stuck: hoursStuck,
      hourly_rate: hourlyRate,
      calculated_savings: calculatedSavings,
      page_location: window.location.href,
    });
  }
}

export function trackFinalCTAClick(ctaType: 'primary' | 'secondary' | 'enterprise', destination: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'advisor_final_cta_click', {
      cta_type: ctaType,
      destination: destination,
      page_location: window.location.href,
    });
  }
}

// Hook to track page sections as they come into view
export function useScrollTracking() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.IntersectionObserver) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && (entry.target as HTMLElement).dataset.section) {
            trackSectionView((entry.target as HTMLElement).dataset.section!);
          }
        });
      },
      { threshold: 0.5 }
    );

    // Track sections as they come into view
    const sections = document.querySelectorAll('[data-section]');
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);
}

// Enhanced tracking for A/B testing potential
export function trackPageVariant(variantName: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'advisor_page_variant', {
      variant: variantName,
      page_location: window.location.href,
    });
  }
}

// Track user engagement depth
export function trackEngagementDepth(depth: 'shallow' | 'medium' | 'deep') {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'advisor_engagement_depth', {
      depth: depth,
      page_location: window.location.href,
    });
  }
}