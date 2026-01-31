'use client'

import { useState } from 'react'
import { DashboardLayout } from './dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import Icon from '@/components/ui/icon'
import { useAuthStore } from '@/store'

interface ReferralsDashboardProps {
  translations: any
  locale: string
}

export function ReferralsDashboard({ translations, locale }: ReferralsDashboardProps) {
  const { user, isAuthenticated, isLoading } = useAuthStore()
  const [referralCode, setReferralCode] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showCopyMessage, setShowCopyMessage] = useState(false)

  const generateReferralCode = async () => {
    setIsGenerating(true)
    // Simulate referral code generation
    await new Promise(resolve => setTimeout(resolve, 1000))
    const newCode = `REF${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    setReferralCode(newCode)
    setIsGenerating(false)
  }

  const copyReferralLink = async () => {
    const referralLink = `${window.location.origin}?ref=${referralCode}`
    await navigator.clipboard.writeText(referralLink)
    setShowCopyMessage(true)
    setTimeout(() => setShowCopyMessage(false), 3000)
  }

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <DashboardLayout translations={translations} locale={locale}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Icon name="loader-2" className="w-8 h-8 text-muted-foreground mx-auto mb-4 animate-spin" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Only show auth required after loading is complete
  if (!isAuthenticated || !user) {
    return (
      <DashboardLayout translations={translations} locale={locale}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Icon name="lock" className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Authentication Required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Please sign in to view your referrals.
            </p>
            {/* Debug info for tests */}
            <div className="text-xs text-gray-500 mt-4" data-testid="auth-debug">
              Auth: {isAuthenticated ? 'true' : 'false'}, User: {user ? 'present' : 'null'}, Loading: {isLoading ? 'true' : 'false'}
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout translations={translations} locale={locale}>
      <div className="space-y-6">
        {/* Copy Success Message */}
        {showCopyMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            Link copied
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {translations.referrals.title || 'Referrals Dashboard'}
          </h1>
          <p className="text-muted-foreground mt-2">
            Invite friends and earn commissions
          </p>
        </div>

        {/* Referral Code Generation */}
        <Card>
          <CardHeader>
            <CardTitle>Your Referral Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!referralCode ? (
              <Button 
                onClick={generateReferralCode}
                disabled={isGenerating}
                data-testid="generate-referral-button"
              >
                {isGenerating ? 'Generating...' : (translations.referrals.generateButton || 'Generate Referral Code')}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {translations.referrals.partnerCode || 'Your Referral Code'}
                  </label>
                  <div className="flex gap-2">
                    <Input 
                      value={referralCode}
                      readOnly
                      data-testid="referral-code"
                    />
                    <Button 
                      onClick={copyReferralLink}
                      variant="outline"
                      data-testid="copy-referral-link"
                    >
                      <Icon name="copy" className="w-4 h-4 mr-2" />
                      Copy Link
                    </Button>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={copyReferralLink}
                    data-testid="share-referral-button"
                  >
                    <Icon name="share-2" className="w-4 h-4 mr-2" />
                    Share Referral Link
                  </Button>
                  <Button 
                    onClick={copyReferralLink}
                    variant="outline"
                    data-testid="copy-referral-button"
                  >
                    <Icon name="copy" className="w-4 h-4 mr-2" />
                    {translations.referrals.copyLink || 'Copy Link'}
                  </Button>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  Share this link: {window.location.origin}?ref={referralCode}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="referral-stats">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {translations.referrals.stats?.clicks || 'Total Clicks'}
                  </p>
                  <p className="text-2xl font-bold" data-testid="total-clicks">0</p>
                </div>
                <Icon name="mouse-pointer" className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {translations.referrals.stats?.signups || 'Signups'}
                  </p>
                  <p className="text-2xl font-bold" data-testid="total-referrals">0</p>
                </div>
                <Icon name="user-plus" className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {translations.referrals.stats?.pending || 'Pending Earnings'}
                  </p>
                  <p className="text-2xl font-bold" data-testid="pending-earnings">$0.00</p>
                </div>
                <Icon name="dollar-sign" className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Referrals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Icon name="users" className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No referrals yet</p>
              <p className="text-sm">Start sharing your referral link to see activity here.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}