'use client';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { Icon } from '@/components/ui/icon';
import { useTranslations } from 'next-intl';
import { trackHeroCTAClick, trackFinalCTAClick, useScrollTracking } from './advisor-analytics';

// Analytics-enhanced CTA Button
interface AnalyticsButtonProps {
  href: string;
  ctaType: 'primary' | 'secondary' | 'enterprise';
  trackingContext: 'hero' | 'final';
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'lg';
  className?: string;
}

export function AnalyticsButton({
  href,
  ctaType,
  trackingContext,
  children,
  variant = 'default',
  size = 'default',
  className = ''
}: AnalyticsButtonProps) {
  const handleClick = () => {
    if (trackingContext === 'hero') {
      trackHeroCTAClick(ctaType, href);
    } else {
      trackFinalCTAClick(ctaType, href);
    }
  };

  return (
    <Button 
      asChild 
      variant={variant} 
      size={size} 
      className={className}
      onClick={handleClick}
    >
      <Link href={href}>
        {children}
      </Link>
    </Button>
  );
}

// Analytics wrapper for the entire landing page
export function AdvisorLandingAnalytics({ children }: { children: React.ReactNode }) {
  useScrollTracking();
  
  return <>{children}</>;
}

// Enhanced Hero CTAs with analytics
export function HeroCTAButtons() {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
      <AnalyticsButton
        href="/advisor/browse"
        ctaType="primary"
        trackingContext="hero"
        size="lg"
        className="px-8 py-3 text-lg"
      >
        <Icon name="search" className="w-5 h-5 me-2" />
        Find an expert now
      </AnalyticsButton>

      <AnalyticsButton
        href="#advisor-matcher"
        ctaType="secondary"
        trackingContext="hero"
        variant="outline"
        size="lg"
        className="px-8 py-3 text-lg"
      >
        <Icon name="message-square" className="w-5 h-5 me-2" />
        Describe your challenge
      </AnalyticsButton>
    </div>
  );
}

// Enhanced Final CTAs with analytics
export function FinalCTAButtons() {
  const tClient = useTranslations('advisor.client');
  
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
      <AnalyticsButton
        href="/advisor/browse"
        ctaType="primary"
        trackingContext="final"
        size="lg"
        className="px-8 py-3 text-lg"
      >
        <Icon name="search" className="w-5 h-5 me-2" />
        {tClient('hero.findExpert')}
      </AnalyticsButton>
      
      <AnalyticsButton
        href="/advisor/browse"
        ctaType="secondary"
        trackingContext="final"
        variant="outline"
        size="lg"
        className="px-8 py-3 text-lg"
      >
        <Icon name="users" className="w-5 h-5 me-2" />
        {tClient('advisorShowcase.title')}
      </AnalyticsButton>
    </div>
  );
}