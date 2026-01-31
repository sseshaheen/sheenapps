/**
 * Vercel Auto-Deploy Configuration Component
 * Allows users to configure automatic deployments from Git branches
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icon } from '@/components/ui/icon';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  getAutoDeployConfig,
  updateAutoDeployConfig
} from '@/lib/actions/vercel-integration-actions';
import { logger } from '@/utils/logger';
import type { VercelAutoDeploy } from '@/types/vercel-integration';

interface VercelAutoDeployProps {
  projectId: string;
  className?: string;
}

export function VercelAutoDeploy({ projectId, className }: VercelAutoDeployProps) {
  const [config, setConfig] = useState<VercelAutoDeploy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  
  // Form state
  const [enabled, setEnabled] = useState(false);
  const [branchPatterns, setBranchPatterns] = useState<string>('');
  const [targetEnvironment, setTargetEnvironment] = useState<'auto' | 'production' | 'preview'>('auto');
  const [requiresApproval, setRequiresApproval] = useState(false);

  // Load configuration on mount
  useEffect(() => {
    loadConfig();
  }, [projectId]);

  // Update form state when config loads
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setBranchPatterns(config.branch_patterns.join(', '));
      setTargetEnvironment(config.target_environment);
      setRequiresApproval(config.requires_approval);
    }
  }, [config]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(undefined);
      
      const result = await getAutoDeployConfig(projectId);
      setConfig(result);
    } catch (err) {
      logger.error('Failed to load auto-deploy config:', err);
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(undefined);

    try {
      const updates: Partial<VercelAutoDeploy> = {
        enabled,
        branch_patterns: branchPatterns
          .split(',')
          .map(pattern => pattern.trim())
          .filter(Boolean),
        target_environment: targetEnvironment,
        requires_approval: requiresApproval
      };

      await updateAutoDeployConfig(projectId, updates);
      
      // Update local config
      setConfig(prev => prev ? { ...prev, ...updates } : null);
      
      logger.info('Auto-deploy configuration updated successfully');
    } catch (err) {
      logger.error('Failed to update auto-deploy config:', err);
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = config && (
    enabled !== config.enabled ||
    branchPatterns !== config.branch_patterns.join(', ') ||
    targetEnvironment !== config.target_environment ||
    requiresApproval !== config.requires_approval
  );

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="git-branch" className="w-5 h-5" />
          Auto-Deploy Configuration
        </CardTitle>
        <CardDescription>
          Configure automatic deployments from your Git repository
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <Icon name="alert-circle" className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Enable/Disable Auto-Deploy */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-deploy-enabled">Enable Auto-Deploy</Label>
            <p className="text-sm text-muted-foreground">
              Automatically deploy when code is pushed to specified branches
            </p>
          </div>
          <Switch
            id="auto-deploy-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            {/* Branch Patterns */}
            <div className="space-y-2">
              <Label htmlFor="branch-patterns">Branch Patterns</Label>
              <Input
                id="branch-patterns"
                value={branchPatterns}
                onChange={(e) => setBranchPatterns(e.target.value)}
                placeholder="main, develop, feature/*"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of branch patterns. Use * for wildcards.
              </p>
              <div className="flex flex-wrap gap-1">
                {branchPatterns.split(',').map(pattern => pattern.trim()).filter(Boolean).map((pattern) => (
                  <Badge key={pattern} variant="outline" className="text-xs">
                    {pattern}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Target Environment */}
            <div className="space-y-2">
              <Label htmlFor="target-environment">Target Environment</Label>
              <Select value={targetEnvironment} onValueChange={(value: any) => setTargetEnvironment(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <div className="space-y-1">
                      <div>Auto (Recommended)</div>
                      <div className="text-xs text-muted-foreground">
                        main/master → production, others → preview
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="production">Always Production</SelectItem>
                  <SelectItem value="preview">Always Preview</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Requires Approval */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="requires-approval">Require Approval</Label>
                <p className="text-sm text-muted-foreground">
                  Require manual approval before deploying to production
                </p>
              </div>
              <Switch
                id="requires-approval"
                checked={requiresApproval}
                onCheckedChange={setRequiresApproval}
              />
            </div>
          </div>
        )}

        {/* Save Button */}
        {hasChanges && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <LoadingSpinner className="mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Icon name="save" className="w-4 h-4 mr-2" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        )}

        {/* Configuration Preview */}
        {enabled && !hasChanges && config && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <h4 className="font-medium text-sm mb-2">Current Configuration</h4>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>• Branches: {config.branch_patterns.join(', ')}</p>
              <p>• Environment: {config.target_environment}</p>
              <p>• Approval: {config.requires_approval ? 'Required' : 'Not required'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}