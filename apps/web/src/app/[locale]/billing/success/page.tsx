/**
 * Billing Success Page - Expert Hardened Implementation
 * Shows success UI only for users with real entitlements (active subscription OR AI credits)
 * 
 * Expert improvements:
 * - Real entitlements verification via worker API
 * - Request timeout prevention for SSR
 * - Graceful fallback on worker errors
 * - Support for trialing subscriptions
 */

import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { CheckCircle } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { getUserEntitlements, hasAccess } from '@/lib/billing/entitlements';

// Expert: Cache prevention triple-layer
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session_id?: string }>; // Expert: For future Phase 2
}

export default async function BillingSuccessPage(props: PageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { locale } = params;
  
  // 1. Require authentication - billing success pages require authentication
  // to prevent unauthorized access to payment success content
  try {
    const supabase = await createServerSupabaseClientNew();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      // Expert: Use returnTo (matches middleware expectation) + validate local scope
      const returnTo = `/${locale}/billing/success`;
      redirect(`/${locale}/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
    }

    // 2. Check real entitlements - Expert hardened implementation
    const entitlements = await getUserEntitlements(user.id);
    
    if (!hasAccess(entitlements)) {
      // Expert: Redirect to pricing with neutral message (no standalone billing page)
      redirect(`/${locale}/pricing?message=no_active_subscription`);
    }

    // 3. Success! User has valid entitlements - show success UI
    // (Implementation continues below...)
    
  } catch (authError) {
    // If there's an auth error, redirect to login instead of throwing
    console.error('Auth check failed in success page:', authError);
    const returnTo = `/${locale}/billing/success`;
    redirect(`/${locale}/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Payment Successful!
          </h1>
          <p className="text-gray-600 mb-8">
            Your subscription has been activated successfully. You can now access all premium features and start building amazing projects.
          </p>
          
          <div className="space-y-4">
            <Link 
              href="/dashboard"
              className="w-full inline-flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Go to Dashboard
            </Link>
            
            <Link
              href="/builder/new"
              className="w-full inline-flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Start Building
            </Link>
          </div>
          
          <p className="mt-6 text-sm text-gray-500">
            Questions? Contact us at{' '}
            <a 
              href="mailto:support@sheenapps.com" 
              className="text-blue-600 hover:text-blue-500"
            >
              support@sheenapps.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}