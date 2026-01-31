'use client'

import { useState, useEffect } from 'react';
import { useRouter } from '@/i18n/routing';
import { useAuthStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { AdvisorProfile } from '@/services/advisor-api';
import { logger } from '@/utils/logger';

interface AdvisorWorkflowHeaderProps {
  locale: string;
  translations: {
    backToDashboard: string;
    viewPublicProfile: string;
  };
}

/**
 * Minimal header for advisor workflow pages (onboarding, apply, etc.)
 * Designed to work with full-screen page layouts without causing conflicts
 */
export function AdvisorWorkflowHeader({ locale, translations }: AdvisorWorkflowHeaderProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [advisor, setAdvisor] = useState<AdvisorProfile | null>(null);

  // Load advisor profile for header display
  useEffect(() => {
    if (!user?.id) return;

    const loadAdvisorProfile = async () => {
      try {
        const response = await fetch('/api/advisor/profile', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setAdvisor(result.data);
          }
        }
      } catch (error) {
        logger.error('❌ Failed to load advisor profile for workflow header:', error);
        // Silently fail - header will just show minimal info
      }
    };

    loadAdvisorProfile();
  }, [user?.id]);

  // Generate avatar fallback
  const avatarFallback = advisor?.display_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AD';

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Start side - Back navigation */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/dashboard')}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <Icon name="arrow-left" className="h-4 w-4 ltr:block rtl:hidden" />
              <Icon name="arrow-right" className="h-4 w-4 ltr:hidden rtl:block" />
              <span className="hidden sm:inline">{translations.backToDashboard}</span>
            </Button>

            {/* Advisor identity (if available) */}
            {advisor && (
              <div className="flex items-center gap-3 ps-4 border-s border-border">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={advisor.avatar_url} alt={advisor.display_name} />
                  <AvatarFallback className="text-xs">{avatarFallback}</AvatarFallback>
                </Avatar>
                <div className="hidden sm:block">
                  <div className="text-sm font-medium">{advisor.display_name}</div>
                </div>
                <Badge
                  variant={advisor.approval_status === 'approved' ? 'default' : 'secondary'}
                  className="text-xs hidden md:inline-flex"
                >
                  {advisor.approval_status}
                </Badge>
              </div>
            )}
          </div>

          {/* End side - Actions */}
          <div className="flex items-center gap-3">
            {advisor?.approval_status === 'approved' && (
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <a 
                  href={`/${locale}/advisors/${advisor.user_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-2"
                >
                  <Icon name="external-link" className="h-4 w-4" />
                  <span className="hidden sm:inline">{translations.viewPublicProfile}</span>
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}