'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { AdvisorApplicationState, AdvisorStateInfo } from '@/utils/advisor-state'

interface TimelineItem {
  id: string
  title: string
  description: string
  status: 'completed' | 'current' | 'pending' | 'rejected'
  icon: string
  date?: string
  estimatedTime?: string
}

interface AdvisorStatusTimelineProps {
  advisorState: AdvisorStateInfo
  translations: {
    timeline: {
      title: string
      items: {
        applied: {
          title: string
          description: string
        }
        review: {
          title: string
          description: string
        }
        decision: {
          title: string
          description: string
        }
        onboarding: {
          title: string
          description: string
        }
        live: {
          title: string
          description: string
        }
      }
      status: {
        completed: string
        current: string
        pending: string
        rejected: string
      }
      estimatedTime: {
        review: string
        decision: string
        onboarding: string
      }
    }
  }
}

export function AdvisorStatusTimeline({ advisorState, translations }: AdvisorStatusTimelineProps) {
  const getTimelineItems = (): TimelineItem[] => {
    const baseItems: TimelineItem[] = [
      {
        id: 'applied',
        title: translations.timeline.items.applied.title,
        description: translations.timeline.items.applied.description,
        status: 'pending',
        icon: 'file-text',
        estimatedTime: ''
      },
      {
        id: 'review',
        title: translations.timeline.items.review.title,
        description: translations.timeline.items.review.description,
        status: 'pending',
        icon: 'search',
        estimatedTime: translations.timeline.estimatedTime.review
      },
      {
        id: 'decision',
        title: translations.timeline.items.decision.title,
        description: translations.timeline.items.decision.description,
        status: 'pending',
        icon: 'check-circle',
        estimatedTime: translations.timeline.estimatedTime.decision
      },
      {
        id: 'onboarding',
        title: translations.timeline.items.onboarding.title,
        description: translations.timeline.items.onboarding.description,
        status: 'pending',
        icon: 'settings',
        estimatedTime: translations.timeline.estimatedTime.onboarding
      },
      {
        id: 'live',
        title: translations.timeline.items.live.title,
        description: translations.timeline.items.live.description,
        status: 'pending',
        icon: 'star',
        estimatedTime: ''
      }
    ]

    // Update status based on advisor state
    switch (advisorState.state) {
      case 'DRAFT':
        // Application is in draft - nothing completed yet
        break
        
      case 'SUBMITTED':
        baseItems[0].status = 'completed'
        baseItems[0].date = advisorState.metadata?.applicationSubmittedAt
        baseItems[1].status = 'current'
        break
        
      case 'UNDER_REVIEW':
        baseItems[0].status = 'completed'
        baseItems[0].date = advisorState.metadata?.applicationSubmittedAt
        baseItems[1].status = 'completed'
        baseItems[2].status = 'current'
        break
        
      case 'APPROVED_PENDING_ONBOARDING':
        baseItems[0].status = 'completed'
        baseItems[0].date = advisorState.metadata?.applicationSubmittedAt
        baseItems[1].status = 'completed'
        baseItems[2].status = 'completed'
        baseItems[3].status = 'current'
        break
        
      case 'LIVE':
        baseItems.forEach(item => {
          item.status = 'completed'
        })
        baseItems[0].date = advisorState.metadata?.applicationSubmittedAt
        break
        
      case 'REJECTED_COOLDOWN':
        baseItems[0].status = 'completed'
        baseItems[0].date = advisorState.metadata?.applicationSubmittedAt
        baseItems[1].status = 'completed'
        baseItems[2].status = 'rejected'
        baseItems[2].description = advisorState.metadata?.rejectionReason || baseItems[2].description
        // Hide onboarding and live steps for rejected applications
        return baseItems.slice(0, 3)
        
      default:
        // NO_APPLICATION or ANON - show all as pending
        break
    }

    return baseItems
  }

  const timelineItems = getTimelineItems()

  const getStatusColor = (status: TimelineItem['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100 dark:bg-green-900/30'
      case 'current':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30'
      case 'rejected':
        return 'text-red-600 bg-red-100 dark:bg-red-900/30'
      default:
        return 'text-gray-400 bg-gray-100 dark:bg-gray-800'
    }
  }

  const getConnectorColor = (status: TimelineItem['status'], nextStatus?: TimelineItem['status']) => {
    if (status === 'completed') {
      return 'bg-green-600'
    } else if (status === 'current' && nextStatus === 'pending') {
      return 'bg-gradient-to-b from-blue-600 to-gray-300 dark:to-gray-700'
    } else if (status === 'rejected') {
      return 'bg-red-600'
    } else {
      return 'bg-gray-300 dark:bg-gray-700'
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-6">{translations.timeline.title}</h3>
        
        <div className="relative">
          {timelineItems.map((item, index) => (
            <div key={item.id} className="flex items-start gap-4 pb-8 last:pb-0 relative">
              {/* Connector Line */}
              {index < timelineItems.length - 1 && (
                <div 
                  className={cn(
                    "absolute left-6 top-12 w-0.5 h-16",
                    getConnectorColor(item.status, timelineItems[index + 1]?.status)
                  )}
                />
              )}
              
              {/* Timeline Icon */}
              <div 
                className={cn(
                  "flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center border-2",
                  getStatusColor(item.status),
                  item.status === 'completed' && 'border-green-200 dark:border-green-800',
                  item.status === 'current' && 'border-blue-200 dark:border-blue-800',
                  item.status === 'rejected' && 'border-red-200 dark:border-red-800',
                  item.status === 'pending' && 'border-gray-200 dark:border-gray-700'
                )}
              >
                {item.status === 'completed' ? (
                  <Icon name="check" className="w-5 h-5" />
                ) : item.status === 'rejected' ? (
                  <Icon name="x" className="w-5 h-5" />
                ) : item.status === 'current' ? (
                  <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
                ) : (
                  <Icon name={item.icon as any} className="w-5 h-5" />
                )}
              </div>
              
              {/* Timeline Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={cn(
                        "text-sm font-medium",
                        item.status === 'completed' && 'text-green-800 dark:text-green-200',
                        item.status === 'current' && 'text-blue-800 dark:text-blue-200',
                        item.status === 'rejected' && 'text-red-800 dark:text-red-200',
                        item.status === 'pending' && 'text-muted-foreground'
                      )}>
                        {item.title}
                      </h4>
                      
                      <Badge 
                        variant={
                          item.status === 'completed' ? 'default' :
                          item.status === 'current' ? 'default' :
                          item.status === 'rejected' ? 'destructive' :
                          'secondary'
                        }
                        className="text-xs"
                      >
                        {item.status === 'completed' && translations.timeline.status.completed}
                        {item.status === 'current' && translations.timeline.status.current}
                        {item.status === 'rejected' && translations.timeline.status.rejected}
                        {item.status === 'pending' && translations.timeline.status.pending}
                      </Badge>
                    </div>
                    
                    <p className={cn(
                      "text-sm",
                      item.status === 'completed' && 'text-green-700 dark:text-green-300',
                      item.status === 'current' && 'text-blue-700 dark:text-blue-300',
                      item.status === 'rejected' && 'text-red-700 dark:text-red-300',
                      item.status === 'pending' && 'text-gray-600 dark:text-gray-400'
                    )}>
                      {item.description}
                    </p>
                    
                    {/* Show estimated time for pending/current items */}
                    {(item.status === 'pending' || item.status === 'current') && item.estimatedTime && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <Icon name="clock" className="w-3 h-3 inline me-1" />
                        {item.estimatedTime}
                      </p>
                    )}
                  </div>
                  
                  {/* Show completion date */}
                  {item.date && (
                    <div className="text-xs text-muted-foreground ml-4">
                      {formatDate(item.date)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Show reapplication info for rejected applications */}
        {advisorState.state === 'REJECTED_COOLDOWN' && advisorState.metadata?.reapplicationAllowedAt && (
          <div className="mt-6 p-4 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg">
            <div className="flex items-start gap-3">
              <Icon name="info" className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">
                  Reapplication Available
                </h4>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  You can submit a new application after {formatDate(advisorState.metadata.reapplicationAllowedAt)}.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}