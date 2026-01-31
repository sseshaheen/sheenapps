/**
 * Vercel OAuth Callback Page
 * Handles the OAuth flow completion after user authorizes on Vercel
 */

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { handleVercelOAuthCallback } from '@/lib/actions/vercel-integration-actions';
import { logger } from '@/utils/logger';
import { useNavigationHelpers } from '@/utils/navigation';

export default function VercelCallbackPage() {
  const searchParams = useSearchParams();
  const { navigateToIntegrations } = useNavigationHelpers();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Handle OAuth errors (user denied access, etc.)
      if (error) {
        logger.warn('Vercel OAuth error:', { error, errorDescription });
        setStatus('error');
        setErrorMessage(errorDescription || `OAuth error: ${error}`);
        return;
      }

      // Validate required parameters
      if (!code || !state) {
        logger.error('Missing required OAuth parameters:', { hasCode: !!code, hasState: !!state });
        setStatus('error');
        setErrorMessage('Invalid callback parameters received');
        return;
      }

      try {
        logger.info('Processing Vercel OAuth callback', { state, hasCode: !!code });

        // Call backend to complete OAuth flow
        const result = await handleVercelOAuthCallback(code, state);

        if (result.success) {
          logger.info('Vercel OAuth callback processed successfully');
          setStatus('success');
          
          // Redirect to integrations page after short delay
          setTimeout(() => {
            navigateToIntegrations();
          }, 2000);
        } else {
          throw new Error('Backend processing failed');
        }
      } catch (error) {
        logger.error('Failed to process Vercel OAuth callback:', error);
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Failed to complete connection');
      }
    };

    processCallback();
  }, [searchParams, navigateToIntegrations]);

  const handleRetry = () => {
    navigateToIntegrations();
  };

  if (status === 'processing') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mb-4">
              <Icon name="globe" className="w-6 h-6 text-purple-600" />
            </div>
            <CardTitle>Connecting to Vercel</CardTitle>
            <CardDescription>
              Please wait while we complete your Vercel integration...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <LoadingSpinner size="lg" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-4">
              <Icon name="check" className="w-6 h-6 text-green-600" />
            </div>
            <CardTitle className="text-green-900 dark:text-green-100">
              Successfully Connected!
            </CardTitle>
            <CardDescription>
              Your Vercel account has been connected successfully. You can now deploy your projects to Vercel.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Redirecting you back to integrations...
            </p>
            <div className="flex justify-center">
              <LoadingSpinner />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
            <Icon name="x-circle" className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle className="text-red-900 dark:text-red-100">
            Connection Failed
          </CardTitle>
          <CardDescription>
            We couldn't complete your Vercel integration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <Icon name="alert-circle" className="h-4 w-4" />
            <AlertDescription>
              {errorMessage}
            </AlertDescription>
          </Alert>
          
          <div className="flex flex-col gap-2">
            <Button onClick={handleRetry} className="w-full">
              <Icon name="arrow-left" className="w-4 h-4 mr-2" />
              Back to Integrations
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()} 
              className="w-full"
            >
              <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}