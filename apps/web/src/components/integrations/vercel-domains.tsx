/**
 * Vercel Domain Management Component
 * Handles custom domain addition, verification, and management
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import {
  listVercelDomains,
  addVercelDomain,
  verifyVercelDomain,
  removeVercelDomain
} from '@/lib/actions/vercel-integration-actions';
import { logger } from '@/utils/logger';
import type { VercelDomain } from '@/types/vercel-integration';

interface VercelDomainsProps {
  projectId: string;
  className?: string;
}

export function VercelDomains({ projectId, className }: VercelDomainsProps) {
  const [domains, setDomains] = useState<VercelDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  
  // Add domain form state
  const [newDomain, setNewDomain] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Load domains on mount
  useEffect(() => {
    loadDomains();
  }, [projectId]);

  const loadDomains = async () => {
    try {
      setLoading(true);
      setError(undefined);
      
      const result = await listVercelDomains(projectId);
      setDomains(result.domains);
    } catch (err) {
      logger.error('Failed to load Vercel domains:', err);
      setError(err instanceof Error ? err.message : 'Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;

    setAdding(true);
    setError(undefined);

    try {
      const result = await addVercelDomain(projectId, newDomain.trim(), {
        httpsRedirect: true,
        autoConfigureDNS: false
      });

      // Add new domain to list
      setDomains(prev => [...prev, result.domain]);
      
      // Reset form
      setNewDomain('');
      setShowAddForm(false);
      
      logger.info('Domain added successfully', { domain: newDomain });
    } catch (err) {
      logger.error('Failed to add domain:', err);
      setError(err instanceof Error ? err.message : 'Failed to add domain');
    } finally {
      setAdding(false);
    }
  };

  const handleVerifyDomain = async (domain: string) => {
    setVerifying(domain);
    setError(undefined);

    try {
      const result = await verifyVercelDomain(projectId, domain);
      
      // Update domain status in list
      setDomains(prev => 
        prev.map(d => 
          d.domain === domain 
            ? { ...d, verification_status: result.verified ? 'VERIFIED' : 'FAILED' }
            : d
        )
      );
      
      logger.info('Domain verification completed', { domain, verified: result.verified });
    } catch (err) {
      logger.error('Failed to verify domain:', err);
      setError(err instanceof Error ? err.message : 'Failed to verify domain');
    } finally {
      setVerifying(null);
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    if (!confirm(`Are you sure you want to remove ${domain}?`)) return;

    try {
      await removeVercelDomain(projectId, domain);
      
      // Remove domain from list
      setDomains(prev => prev.filter(d => d.domain !== domain));
      
      logger.info('Domain removed successfully', { domain });
    } catch (err) {
      logger.error('Failed to remove domain:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove domain');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VERIFIED': return 'text-green-600 bg-green-100';
      case 'PENDING': return 'text-yellow-600 bg-yellow-100';
      case 'FAILED': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSSLColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icon name="globe" className="w-5 h-5" />
              Custom Domains
            </CardTitle>
            <CardDescription>
              Connect your custom domain to your Vercel deployment
            </CardDescription>
          </div>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            size="sm"
            variant={showAddForm ? "outline" : "default"}
          >
            <Icon name={showAddForm ? "x" : "plus"} className="w-4 h-4 mr-2" />
            {showAddForm ? 'Cancel' : 'Add Domain'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <Icon name="alert-circle" className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Add Domain Form */}
        {showAddForm && (
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="new-domain">Domain Name</Label>
              <Input
                id="new-domain"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="example.com"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Enter your domain without protocol (e.g., example.com or blog.example.com)
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={handleAddDomain}
                disabled={!newDomain.trim() || adding}
                className="flex-1"
              >
                {adding ? (
                  <>
                    <LoadingSpinner className="mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Icon name="plus" className="w-4 h-4 mr-2" />
                    Add Domain
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Domains List */}
        <div>
          <h4 className="font-medium mb-3">Configured Domains</h4>
          {domains.length > 0 ? (
            <div className="space-y-3">
              {domains.map((domain) => (
                <div
                  key={domain.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{domain.domain}</span>
                      {domain.https_redirect && (
                        <Badge variant="outline" className="text-xs">
                          HTTPS Redirect
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">DNS:</span>
                        <Badge className={getStatusColor(domain.verification_status)}>
                          {domain.verification_status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">SSL:</span>
                        <Badge className={getSSLColor(domain.ssl_status)}>
                          {domain.ssl_status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {domain.verification_status === 'PENDING' && (
                      <Button
                        onClick={() => handleVerifyDomain(domain.domain)}
                        disabled={verifying === domain.domain}
                        size="sm"
                        variant="outline"
                      >
                        {verifying === domain.domain ? (
                          <LoadingSpinner className="w-4 h-4" />
                        ) : (
                          <Icon name="refresh-cw" className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    
                    <Button
                      onClick={() => handleRemoveDomain(domain.domain)}
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-800"
                    >
                      <Icon name="trash-2" className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Icon name="globe" className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No custom domains configured</p>
              <p className="text-sm">Add a domain to get started</p>
            </div>
          )}
        </div>

        {/* DNS Instructions */}
        {domains.some(d => d.verification_status === 'PENDING') && (
          <Alert>
            <Icon name="info" className="h-4 w-4" />
            <AlertDescription>
              <strong>DNS Configuration Required:</strong> Add the DNS records provided by Vercel 
              to your domain's DNS settings, then click verify to complete the setup.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}