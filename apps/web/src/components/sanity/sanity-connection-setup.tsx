/**
 * Sanity Connection Setup Component
 * Multi-step wizard for testing and creating Sanity connections
 * Follows existing UI patterns and design system
 */

'use client'

import { useState } from 'react';
import { useSanityConnection } from '@/hooks/use-sanity-connection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, AlertCircle, Loader2, ExternalLink, Zap } from 'lucide-react';
import type { 
  SanityConnectionSetupProps,
  CreateSanityConnectionRequest,
  TestSanityConnectionRequest
} from '@/types/sanity-integration';
import { SanityIntegrationError } from '@/types/sanity-integration';

type SetupStep = 'form' | 'testing' | 'creating' | 'success';

// Helper function to convert Error to SanityIntegrationError
function toSanityError(error: Error): SanityIntegrationError {
  return new SanityIntegrationError(
    error.message,
    'UNKNOWN_ERROR',
    500,
    error
  );
}

export function SanityConnectionSetup({ 
  projectId, 
  onSuccess, 
  onError 
}: SanityConnectionSetupProps) {
  const [step, setStep] = useState<SetupStep>('form');
  const [formData, setFormData] = useState<CreateSanityConnectionRequest>({
    sanity_project_id: '',
    dataset_name: 'production',
    project_title: '',
    auth_token: '',
    robot_token: '',
    api_version: '2023-05-03',
    use_cdn: true,
    perspective: 'published',
    realtime_enabled: true,
    i18n_strategy: 'document'
  });

  const {
    testConnection,
    createConnection,
    isTestingConnection,
    isCreatingConnection,
    testResult,
    testError,
    createError
  } = useSanityConnection();

  const handleTestConnection = () => {
    if (!formData.sanity_project_id || !formData.dataset_name || !formData.auth_token) {
      return;
    }

    const testParams: TestSanityConnectionRequest = {
      projectId: formData.sanity_project_id,
      dataset: formData.dataset_name,
      apiVersion: formData.api_version,
      token: formData.auth_token,
      useCdn: formData.use_cdn,
      perspective: formData.perspective
    };

    setStep('testing');
    testConnection(testParams, {
      onSuccess: (result) => {
        if (result.success) {
          // Auto-populate project title from test result
          if (result.projectInfo?.title && !formData.project_title) {
            setFormData(prev => ({ ...prev, project_title: result.projectInfo.title }));
          }
          setStep('form'); // Return to form for final review
        }
      },
      onError: (error) => {
        setStep('form');
        onError?.(toSanityError(error));
      }
    });
  };

  const handleCreateConnection = () => {
    if (!testResult?.success) return;

    const connectionData: CreateSanityConnectionRequest = {
      ...formData,
      project_id: projectId
    };

    setStep('creating');
    createConnection(connectionData, {
      onSuccess: (connection) => {
        setStep('success');
        onSuccess?.(connection);
      },
      onError: (error) => {
        setStep('form');
        onError?.(toSanityError(error));
      }
    });
  };

  const updateFormData = (field: keyof CreateSanityConnectionRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (step === 'testing') {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Testing Connection
          </CardTitle>
          <CardDescription>
            Verifying your Sanity project credentials...
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-8">
          <div className="text-muted-foreground">
            This may take a few seconds while we validate your project access and permissions.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'creating') {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Creating Connection
          </CardTitle>
          <CardDescription>
            Setting up your Sanity CMS integration...
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-8">
          <div className="text-muted-foreground">
            We're configuring webhooks and setting up real-time synchronization.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'success') {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-green-600">
            <CheckCircle className="h-6 w-6" />
            Connection Created Successfully
          </CardTitle>
          <CardDescription>
            Your Sanity CMS is now integrated and ready to use
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-medium text-green-800 mb-2">What's Next?</h4>
            <ul className="text-green-700 text-sm space-y-1">
              <li>• Real-time content synchronization is active</li>
              <li>• You can now browse and query your Sanity content</li>
              <li>• Preview system is configured for draft content</li>
              <li>• Webhooks will keep your content up-to-date</li>
            </ul>
          </div>
          
          <div className="flex justify-center">
            <Button 
              onClick={() => setStep('form')} 
              variant="outline"
            >
              Create Another Connection
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-orange-500" />
          Connect Sanity CMS
        </CardTitle>
        <CardDescription>
          Connect your Sanity project to enable headless CMS functionality for your applications
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Connection Status */}
        {testResult && (
          <Alert className={testResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            {testResult.success ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription className={testResult.success ? "text-green-800" : "text-red-800"}>
              {testResult.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Error Display */}
        {(testError || createError) && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {(testError || createError)?.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Basic Connection Info */}
        <div className="space-y-4">
          <h4 className="font-medium">Project Information</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sanity_project_id">Sanity Project ID *</Label>
              <Input
                id="sanity_project_id"
                value={formData.sanity_project_id}
                onChange={(e) => updateFormData('sanity_project_id', e.target.value)}
                placeholder="abc123def"
                required
              />
              <div className="text-xs text-muted-foreground">
                Found in your Sanity studio URL or project settings
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="dataset_name">Dataset *</Label>
              <Select 
                value={formData.dataset_name} 
                onValueChange={(value) => updateFormData('dataset_name', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">production</SelectItem>
                  <SelectItem value="staging">staging</SelectItem>
                  <SelectItem value="development">development</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project_title">Project Title</Label>
            <Input
              id="project_title"
              value={formData.project_title}
              onChange={(e) => updateFormData('project_title', e.target.value)}
              placeholder="My Awesome Blog"
            />
            <div className="text-xs text-muted-foreground">
              Display name for this connection
            </div>
          </div>
        </div>

        <Separator />

        {/* Authentication */}
        <div className="space-y-4">
          <h4 className="font-medium">Authentication</h4>
          
          <div className="space-y-2">
            <Label htmlFor="auth_token">API Token *</Label>
            <Input
              id="auth_token"
              type="password"
              value={formData.auth_token}
              onChange={(e) => updateFormData('auth_token', e.target.value)}
              placeholder="sk..."
              required
            />
            <div className="text-xs text-muted-foreground">
              Read token from your Sanity project settings
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="robot_token">Robot Token (Optional)</Label>
            <Input
              id="robot_token"
              type="password"
              value={formData.robot_token || ''}
              onChange={(e) => updateFormData('robot_token', e.target.value)}
              placeholder="skr..."
            />
            <div className="text-xs text-muted-foreground">
              For write operations and webhook management
            </div>
          </div>
        </div>

        <Separator />

        {/* Configuration Options */}
        <div className="space-y-4">
          <h4 className="font-medium">Configuration</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="api_version">API Version</Label>
              <Select 
                value={formData.api_version} 
                onValueChange={(value) => updateFormData('api_version', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2023-05-03">2023-05-03 (Recommended)</SelectItem>
                  <SelectItem value="2022-03-07">2022-03-07</SelectItem>
                  <SelectItem value="v2021-10-21">v2021-10-21</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="perspective">Content Perspective</Label>
              <Select 
                value={formData.perspective} 
                onValueChange={(value: 'published' | 'previewDrafts') => updateFormData('perspective', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Published Only</SelectItem>
                  <SelectItem value="previewDrafts">Include Drafts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Toggle Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="use_cdn">Use CDN</Label>
                <div className="text-xs text-muted-foreground">
                  Faster content delivery for published content
                </div>
              </div>
              <Switch
                id="use_cdn"
                checked={formData.use_cdn}
                onCheckedChange={(checked) => updateFormData('use_cdn', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="realtime_enabled">Real-time Updates</Label>
                <div className="text-xs text-muted-foreground">
                  Automatically sync content changes via webhooks
                </div>
              </div>
              <Switch
                id="realtime_enabled"
                checked={formData.realtime_enabled}
                onCheckedChange={(checked) => updateFormData('realtime_enabled', checked)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleTestConnection}
            disabled={!formData.sanity_project_id || !formData.dataset_name || !formData.auth_token || isTestingConnection}
            variant="outline"
            className="flex-1"
          >
            {isTestingConnection ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>

          <Button
            onClick={handleCreateConnection}
            disabled={!testResult?.success || isCreatingConnection}
            className="flex-1"
          >
            {isCreatingConnection ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Connection'
            )}
          </Button>
        </div>

        {/* Help Links */}
        <div className="flex justify-center">
          <a 
            href="https://www.sanity.io/docs/http-api#authentication"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            Need help getting API tokens?
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}