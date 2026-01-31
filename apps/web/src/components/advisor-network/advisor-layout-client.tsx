'use client'

import { useState, useEffect, Suspense, useMemo } from 'react';
import './advisor-mobile.css';
import { useRouter, usePathname } from '@/i18n/routing';
import { useAuthStore } from '@/store';
import { AdvisorClientAPIService } from '@/services/advisor-client-api';
import { AdvisorErrorBoundary } from './advisor-error-boundary';
import { AdvisorMobileNavigation } from './advisor-mobile-navigation';
import { AdvisorMobileHeader } from './advisor-mobile-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useResponsive } from '@/hooks/use-responsive';
import type { Advisor } from '@/types/advisor-network';
import type { AdvisorProfile } from '@/services/advisor-api';
import { logger } from '@/utils/logger';
import { 
  getAdvisorRedirect, 
  type AdvisorApplicationState,
  type AdvisorStateInfo 
} from '@/utils/advisor-state';
import { isPublicAdvisorPath } from '@/utils/advisor-routes';

interface AdvisorLayoutClientProps {
  children: React.ReactNode;
  translations: {
    advisor: {
      navigation: {
        dashboard: string;
        profile: string;
        consultations: string;
        availability: string;
        earnings: string;
        analytics: string;
        settings: string;
        more: string;
      };
      layout: {
        backToDashboard: string;
        viewPublicProfile: string;
        quickStats: string;
        status: string;
        rating: string;
        reviews: string;
        available: string;
        unavailable: string;
      };
      dashboard: {
        title: string;
        welcome: string;
      };
      errors: {
        title: string;
        description: string;
        actions: {
          retry: string;
          goHome: string;
          applyToAdvisor: string;
        };
      };
    };
    common: {
      loading: string;
      close: string;
    };
  };
  locale: string;
}

const navigationItems = [
  { key: 'dashboard', href: '/advisor/dashboard', icon: 'activity' },
  { key: 'profile', href: '/advisor/dashboard/profile', icon: 'user' },
  { key: 'consultations', href: '/advisor/dashboard/consultations', icon: 'calendar' },
  { key: 'availability', href: '/advisor/dashboard/availability', icon: 'clock' },
  { key: 'earnings', href: '/advisor/dashboard/earnings', icon: 'dollar-sign' },
  { key: 'analytics', href: '/advisor/dashboard/analytics', icon: 'bar-chart-3' },
  { key: 'settings', href: '/advisor/dashboard/settings', icon: 'settings' }
] as const;

// Loading component for Suspense
function AdvisorLayoutLoading({ translations }: { translations: AdvisorLayoutClientProps['translations'] }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <Icon name="loader-2" className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{translations.common.loading}</p>
        </div>
      </div>
    </div>
  )
}

// Private layout that actually uses the auth store (only for protected routes)
function AdvisorPrivateLayout({ children, translations, locale }: AdvisorLayoutClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { showMobileUI, isTablet, isDesktop, isHydrated } = useResponsive();
  
  const [advisor, setAdvisor] = useState<AdvisorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Always call useState for sidebar state, even if not used in all layouts
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Load advisor state and profile for protected routes
  useEffect(() => {
    async function loadAdvisorData() {
      logger.info('🔍 AdvisorPrivateLayout loading data', { pathname });
      
      // For protected routes, we need authentication
      if (!isAuthenticated || !user) {
        // Auth state still loading - wait
        if (authLoading) {
          logger.info('⏳ Auth state still loading, waiting...', { pathname });
          return;
        }
        
        // Check if we can bypass auth check due to connectivity issues
        const hasConnectivityIssues = error && error.includes('fetch failed');
        
        if (hasConnectivityIssues) {
          logger.warn('🔌 Network connectivity issues detected, allowing access', { pathname });
          setLoading(false);
          return;
        }
        
        // No auth - this should be handled by middleware, but fallback redirect
        logger.warn('⚠️ Unauthenticated user accessing advisor protected route', { pathname });
        router.push(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        logger.info('🔍 Loading advisor state and profile', { 
          userId: user.id.slice(0, 8),
          pathname 
        });
        
        // Try to load advisor profile
        const profile = await AdvisorClientAPIService.getProfile();
        
        if (profile) {
          setAdvisor(profile);
          logger.info('✅ Advisor profile loaded', { 
            name: profile.display_name,
            status: profile.approval_status
          });
        } else {
          logger.info('ℹ️ No advisor profile found - user may need to apply');
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load advisor data';
        setError(errorMessage);
        logger.error('❌ Failed to load advisor data:', {
          error: errorMessage,
          userId: user?.id?.slice(0, 8),
          pathname
        });
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadAdvisorData();
    }
  }, [isAuthenticated, user, authLoading, router, pathname, locale]);

  // Show loading state
  if (authLoading || loading) {
    return <AdvisorLayoutLoading translations={translations} />;
  }

  // Show error state - will be caught by error boundary
  if (error) {
    throw new Error(error);
  }

  // Get advisor's avatar fallback
  const avatarFallback = advisor?.display_name
    .split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AD';

  // Don't render layout until hydrated to prevent flash
  if (!isHydrated) {
    return <AdvisorLayoutLoading translations={translations} />;
  }

  // Mobile Layout
  if (showMobileUI) {
    return (
      <div className="min-h-screen bg-background">
        <div 
          style={{
            minHeight: '100svh', // Small viewport height for mobile
            paddingTop: 'calc(56px + env(safe-area-inset-top))',
            paddingBottom: 'calc(60px + env(safe-area-inset-bottom))'
          }}
          className="container-query"
        >
          <AdvisorMobileHeader 
            advisor={advisor}
            translations={{
              layout: translations.advisor.layout
            }}
            locale={locale}
            pageTitle={(() => {
              if (pathname === '/advisor/dashboard') return translations.advisor.dashboard.title;
              if (pathname.includes('/earnings')) return translations.advisor.navigation.earnings;
              if (pathname.includes('/consultations')) return translations.advisor.navigation.consultations;
              if (pathname.includes('/profile')) return translations.advisor.navigation.profile;
              if (pathname.includes('/availability')) return translations.advisor.navigation.availability;
              if (pathname.includes('/analytics')) return translations.advisor.navigation.analytics;
              if (pathname.includes('/settings')) return translations.advisor.navigation.settings;
              if (pathname.includes('/onboarding')) return 'Setup';
              return undefined;
            })()}
          />
          
          {/* Main Content - Full height with proper scroll */}
          <main className="h-full overflow-y-auto px-4 py-4">
            <div className="max-w-full">
              {children}
            </div>
          </main>
          
          <AdvisorMobileNavigation 
            translations={{
              navigation: translations.advisor.navigation,
              common: translations.common
            }}
            locale={locale}
          />
        </div>
      </div>
    );
  }

  // Tablet Layout - Collapsible sidebar
  if (isTablet) {

    return (
      <div className="min-h-screen bg-background">
        {/* Top Navigation - Compact for tablet */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="p-2 hover:bg-muted rounded-lg"
                >
                  <Icon name="menu" className="h-4 w-4" />
                </button>
                
                {advisor && (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={advisor.avatar_url} alt={advisor.display_name} />
                      <AvatarFallback className="text-xs">{avatarFallback}</AvatarFallback>
                    </Avatar>
                    <div className="hidden md:block">
                      <div className="font-medium text-sm">{advisor.display_name}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                {advisor?.approval_status === 'approved' && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/${locale}/advisors/${(advisor as any).user_id}`} target="_blank" rel="noopener noreferrer">
                      <Icon name="external-link" className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex h-[calc(100vh-56px)]">
          {/* Collapsible Sidebar */}
          <aside className={cn(
            "border-r border-border bg-background transition-all duration-300 flex-shrink-0",
            sidebarCollapsed ? "w-16" : "w-64"
          )}>
            <nav className="p-2 space-y-1">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href;
                const label = translations.advisor.navigation[item.key];
                
                return (
                  <button
                    key={item.key}
                    onClick={() => router.push(item.href)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      sidebarCollapsed ? "justify-center" : "justify-start",
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon name={item.icon as any} className="h-4 w-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span>{label}</span>}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Desktop Layout - Full sidebar (original design)
  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Left side - Logo and advisor info */}
            <div className="flex items-center gap-6">
              <button 
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <Icon name="arrow-left" className="h-4 w-4" />
                <span className="text-sm text-muted-foreground">{translations.advisor.layout.backToDashboard}</span>
              </button>
              
              {advisor && (
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={advisor.avatar_url} alt={advisor.display_name} />
                    <AvatarFallback>{avatarFallback}</AvatarFallback>
                  </Avatar>
                  <div className="block">
                    <div className="font-medium text-sm">{advisor.display_name}</div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={advisor.approval_status === 'approved' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {advisor.approval_status}
                      </Badge>
                      {advisor.approval_status === 'approved' && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <div className={`h-2 w-2 rounded-full ${
                            advisor.is_accepting_bookings ? 'bg-green-500' : 'bg-gray-400'
                          }`} />
                          <span>
                            {advisor.is_accepting_bookings ? translations.advisor.layout.available : translations.advisor.layout.unavailable}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right side - Quick actions */}
            <div className="flex items-center gap-4">
              {advisor?.approval_status === 'approved' && (
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href={`/${locale}/advisors/${(advisor as any).user_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="external-link" className="h-4 w-4 me-2" />
                    {translations.advisor.layout.viewPublicProfile}
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-6 pb-6">
        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <aside className="w-64 flex-shrink-0">
            <nav className="space-y-2">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href;
                const label = translations.advisor.navigation[item.key];
                
                return (
                  <button
                    key={item.key}
                    onClick={() => router.push(item.href)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon name={item.icon as any} className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </nav>

            {/* Advisor Status Card */}
            {advisor && (
              <Card className="mt-6">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="text-sm font-medium">{translations.advisor.layout.quickStats}</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{translations.advisor.layout.status}:</span>
                        <Badge variant="secondary" className="text-xs">
                          {advisor.approval_status}
                        </Badge>
                      </div>
                      {(Number(advisor.rating) || 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{translations.advisor.layout.rating}:</span>
                          <div className="flex items-center gap-1">
                            <Icon name="star" className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <span>{(Number(advisor.rating) || 0).toFixed(1)}</span>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{translations.advisor.layout.reviews}:</span>
                        <span>{Number(advisor.review_count) || 0}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

// Switcher that decides PUBLIC vs PRIVATE before touching auth store
function AdvisorLayoutSwitcher({ isPublic, ...props }: AdvisorLayoutClientProps & { isPublic: boolean }) {
  const pathname = usePathname();

  // ✅ EARLY RETURN: do not even call useAuthStore() on public routes
  if (isPublic) {
    logger.info('🎯 Rendering public advisor page without layout', { pathname, isPublic });
    // Render children without any auth/layout chrome
    return <>{props.children}</>;
  }

  // Otherwise, mount the authenticated layout (this may call /api/auth/me)
  logger.info('🔒 Rendering private advisor layout', { pathname, isPublic });
  return <AdvisorPrivateLayout {...props} />;
}

// Main export with error boundary wrapper
export function AdvisorLayoutClient(props: AdvisorLayoutClientProps) {
  const pathname = usePathname();
  const isPublic = useMemo(() => isPublicAdvisorPath(pathname), [pathname]);
  
  return (
    <AdvisorErrorBoundary translations={props.translations.advisor.errors}>
      <Suspense fallback={isPublic ? null : <AdvisorLayoutLoading translations={props.translations} />}>
        <AdvisorLayoutSwitcher {...props} isPublic={isPublic} />
      </Suspense>
    </AdvisorErrorBoundary>
  );
}