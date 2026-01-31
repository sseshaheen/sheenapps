'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store'
import { AdvisorAPIService, type AdvisorProfile } from '@/services/advisor-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
// import type { Advisor } from '@/types/advisor-network' // Using AdvisorProfile from service
import { logger } from '@/utils/logger'

interface AdvisorEssentialDashboardProps {
  translations: {
    advisor: {
      dashboard: {
        title: string
        welcome: string
        earnings: {
          title: string
          thisMonth: string
          nextPayout: string
          consultations: string
        }
        availability: {
          title: string
          accepting: string
          paused: string
          toggle: string
          description: string
        }
        consultations: {
          title: string
          empty: string
          viewAll: string
          upcoming: string
        }
        calcom: {
          title: string
          description: string
          action: string
        }
      }
    }
    common: {
      loading: string
      error: string
      retry: string
    }
  }
  locale: string
}

interface EarningsData {
  thisMonth: number
  pendingPayout: number
  nextPayoutDate: string
  consultationsThisMonth: number
}

interface Consultation {
  id: string
  client_name: string
  topic: string
  scheduled_for: string
  duration_minutes: number
  price: number
}

export function AdvisorEssentialDashboard({ translations, locale }: AdvisorEssentialDashboardProps) {
  const { user, isAuthenticated } = useAuthStore()
  
  const [advisor, setAdvisor] = useState<AdvisorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [availabilityToggling, setAvailabilityToggling] = useState(false)
  const [toggleSuccess, setToggleSuccess] = useState<string | null>(null)

  // Mock data for development - replace with actual API calls
  const [earnings] = useState<EarningsData>({
    thisMonth: 2850,
    pendingPayout: 1420,
    nextPayoutDate: '2025-09-01',
    consultationsThisMonth: 12
  })

  const [upcomingConsultations] = useState<Consultation[]>([
    {
      id: '1',
      client_name: 'Sarah Johnson',
      topic: 'React Architecture Review',
      scheduled_for: '2025-08-27T14:00:00Z',
      duration_minutes: 60,
      price: 35
    },
    {
      id: '2', 
      client_name: 'Mike Chen',
      topic: 'Database Optimization Help',
      scheduled_for: '2025-08-27T16:30:00Z',
      duration_minutes: 30,
      price: 19
    },
    {
      id: '3',
      client_name: 'Alex Kim',
      topic: 'Quick Code Review',
      scheduled_for: '2025-08-28T10:00:00Z',
      duration_minutes: 15,
      price: 9
    }
  ])

  // Load advisor profile
  useEffect(() => {
    async function loadAdvisorProfile() {
      if (!isAuthenticated || !user) {
        return
      }

      setLoading(true)
      setError(null)

      try {
        logger.info('📊 Loading advisor profile for essential dashboard', { userId: user.id.slice(0, 8) })
        
        const profile = await AdvisorAPIService.getProfile(user.id)
        
        setAdvisor(profile)
        logger.info('✅ Advisor profile loaded for essential dashboard', { 
          name: profile.display_name,
          status: profile.approval_status,
          accepting: profile.is_accepting_bookings
        })

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load advisor profile'
        setError(errorMessage)
        logger.error('❌ Failed to load advisor profile for essential dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    loadAdvisorProfile()
  }, [isAuthenticated, user])

  // Handle availability toggle with success feedback
  const handleAvailabilityToggle = async (accepting: boolean) => {
    if (!advisor) return

    setAvailabilityToggling(true)
    setToggleSuccess(null)
    
    try {
      logger.info('🔄 Toggling advisor availability (essential dashboard)', { accepting })
      
      if (!advisor || !user) {
        throw new Error('Missing advisor or user data')
      }
      
      const updatedProfile = await AdvisorAPIService.updateProfile(
        advisor.id,
        { is_accepting_bookings: accepting },
        user.id
      )

      // Update local state with the response
      setAdvisor(updatedProfile)
      
      // Show success feedback
      setToggleSuccess(accepting ? 'Now accepting bookings!' : 'Bookings paused')
      setTimeout(() => setToggleSuccess(null), 3000)
      
      logger.info('✅ Advisor availability updated (essential dashboard)', { accepting })

    } catch (error) {
      logger.error('❌ Failed to update advisor availability (essential dashboard):', error)
      alert('Failed to update availability. Please try again.')
    } finally {
      setAvailabilityToggling(false)
    }
  }

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="flex flex-col items-center gap-4">
            <Icon name="loader-2" className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{translations.common.loading}</p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error || !advisor) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon name="alert-circle" className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Unable to load dashboard</h2>
            <p className="text-muted-foreground mb-6 text-center">{error}</p>
            <Button onClick={() => window.location.reload()}>
              {translations.common.retry}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString()
  const formatDateTime = (dateString: string) => new Date(dateString).toLocaleString()

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{translations.advisor.dashboard.title}</h1>
        <p className="text-muted-foreground">
          {translations.advisor.dashboard.welcome}, {advisor.display_name}!
        </p>
      </div>

      {/* Success feedback for availability toggle */}
      {toggleSuccess && (
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50">
          <Icon name="check-circle" className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {toggleSuccess}
          </AlertDescription>
        </Alert>
      )}

      {/* Core Metrics Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Primary: This Month Earnings */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-semibold">
              {translations.advisor.dashboard.earnings.thisMonth}
            </CardTitle>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon name="dollar-sign" className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{formatCurrency(earnings.thisMonth)}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {earnings.consultationsThisMonth} {translations.advisor.dashboard.earnings.consultations}
            </p>
          </CardContent>
        </Card>

        {/* Availability Toggle - Large and Prominent */}
        <Card className={cn(
          "transition-colors border-2",
          advisor.is_accepting_bookings 
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50" 
            : "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/50"
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Icon 
                name={advisor.is_accepting_bookings ? "check-circle" : "pause-circle"} 
                className={cn(
                  "h-5 w-5",
                  advisor.is_accepting_bookings ? "text-green-600" : "text-orange-600"
                )}
              />
              {translations.advisor.dashboard.availability.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">
                  {advisor.is_accepting_bookings 
                    ? translations.advisor.dashboard.availability.accepting
                    : translations.advisor.dashboard.availability.paused
                  }
                </div>
                <div className="text-xs text-muted-foreground">
                  {translations.advisor.dashboard.availability.description}
                </div>
              </div>
              <Switch
                checked={advisor.is_accepting_bookings}
                onCheckedChange={handleAvailabilityToggle}
                disabled={availabilityToggling || advisor.approval_status !== 'approved'}
                className="scale-125"
              />
            </div>
            {advisor.approval_status !== 'approved' && (
              <p className="text-xs text-muted-foreground">
                Available after approval
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pending Payout */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-semibold">
              {translations.advisor.dashboard.earnings.nextPayout}
            </CardTitle>
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Icon name="calendar" className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(earnings.pendingPayout)}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Next payout: {formatDate(earnings.nextPayoutDate)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Consultations - Simple List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="calendar" className="h-5 w-5" />
              {translations.advisor.dashboard.consultations.upcoming}
            </CardTitle>
            <CardDescription>
              Your next scheduled consultations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingConsultations.length > 0 ? (
              <div className="space-y-4">
                {upcomingConsultations.slice(0, 3).map((consultation, index) => (
                  <div key={consultation.id}>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{consultation.client_name}</p>
                          <Badge variant="outline" className="text-xs">
                            {consultation.duration_minutes}min
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {consultation.topic}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Icon name="clock" className="h-3 w-3" />
                          {formatDateTime(consultation.scheduled_for)}
                        </div>
                      </div>
                      <div className="text-end ms-4">
                        <div className="font-semibold text-green-600">
                          {formatCurrency(consultation.price)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          You earn: {formatCurrency(consultation.price * 0.7)}
                        </div>
                      </div>
                    </div>
                    {index < Math.min(upcomingConsultations.length, 3) - 1 && (
                      <Separator className="mt-3" />
                    )}
                  </div>
                ))}
                
                {upcomingConsultations.length > 3 && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground text-center">
                      +{upcomingConsultations.length - 3} more consultations
                    </p>
                  </div>
                )}

                <div className="pt-3">
                  <Button variant="outline" className="w-full" size="sm">
                    {translations.advisor.dashboard.consultations.viewAll}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Icon name="calendar-off" className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  {translations.advisor.dashboard.consultations.empty}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Turn on availability to start receiving bookings
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cal.com Integration - Link to External Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="external-link" className="h-5 w-5" />
              {translations.advisor.dashboard.calcom.title}
            </CardTitle>
            <CardDescription>
              {translations.advisor.dashboard.calcom.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Icon name="calendar" className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-1">Manage Your Schedule</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Edit your available time slots, set buffer times, and manage recurring availability directly in Cal.com.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href="https://cal.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2"
                  >
                    <Icon name="external-link" className="w-4 h-4" />
                    {translations.advisor.dashboard.calcom.action}
                  </a>
                </Button>
              </div>
            </div>

            <Alert>
              <Icon name="info" className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Changes made in Cal.com will automatically sync to your SheenApps availability. No setup required.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions - Minimal */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Essential advisor management tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" asChild>
              <a href={`/${locale}/advisor/profile`}>
                <Icon name="user" className="h-4 w-4 me-2" />
                Edit Profile
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/${locale}/advisor/earnings`}>
                <Icon name="dollar-sign" className="h-4 w-4 me-2" />
                Earnings History
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/${locale}/advisor/settings`}>
                <Icon name="settings" className="h-4 w-4 me-2" />
                Settings
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}