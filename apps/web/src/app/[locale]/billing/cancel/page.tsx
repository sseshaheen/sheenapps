/**
 * Billing Cancel Page
 * Shown when user cancels during Stripe checkout
 * 
 * Provides reassurance and alternative paths forward
 */

import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { XCircle, ArrowLeft, HelpCircle } from 'lucide-react';
import { Link } from '@/i18n/routing';

// Force dynamic rendering - billing pages can't be statically generated
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function BillingCancelPage(props: PageProps) {
  const params = await props.params;
  const { locale } = params;
  
  // Check authentication - but handle errors gracefully
  try {
    const supabase = await createServerSupabaseClientNew();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      redirect(`/${locale}/auth/login?redirect=${encodeURIComponent('/billing/cancel')}`);
    }
  } catch (authError) {
    // If there's an auth error, redirect to login instead of throwing
    console.error('Auth check failed in cancel page:', authError);
    redirect(`/${locale}/auth/login?redirect=${encodeURIComponent('/billing/cancel')}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <XCircle className="mx-auto h-16 w-16 text-gray-400 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Payment Cancelled
          </h1>
          <p className="text-gray-600 mb-8">
            No charges were made to your account. You can try again anytime or continue using our free features.
          </p>
          
          <div className="space-y-4">
            <Link 
              href="/pricing"
              className="w-full inline-flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 me-2" />
              View Pricing
            </Link>
            
            <Link
              href="/dashboard"
              className="w-full inline-flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Continue with Free Plan
            </Link>
          </div>
          
          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start">
              <HelpCircle className="w-5 h-5 text-blue-400 mt-0.5 me-3 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Need help choosing a plan?</p>
                <p>
                  Contact our team at{' '}
                  <a 
                    href="mailto:support@sheenapps.com" 
                    className="text-blue-600 hover:text-blue-500 font-medium underline"
                  >
                    support@sheenapps.com
                  </a>
                  {' '}and we'll help you find the perfect fit.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}