'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon, type IconName } from '@/components/ui/icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { UserQuotaStatus } from '@/services/quota/monitoring-queries'

interface OptimizationSuggestionsProps {
  usage: UserQuotaStatus
  historicalData: any[]
  onUpgradeClick?: () => void
}

interface Suggestion {
  id: string
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  impact: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function OptimizationSuggestions({ 
  usage, 
  historicalData,
  onUpgradeClick 
}: OptimizationSuggestionsProps) {
  const suggestions: Suggestion[] = []
  
  // Analyze usage patterns
  const avgDailyUsage = usage.currentUsage / new Date().getDate()
  const daysRemaining = Math.ceil((new Date(usage.nextReset).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const projectedTotal = usage.currentUsage + (avgDailyUsage * daysRemaining)
  const willExceed = usage.planLimit !== -1 && projectedTotal > usage.planLimit
  
  // High usage optimization
  if (usage.usagePercent > 80) {
    suggestions.push({
      id: 'high-usage',
      priority: 'high',
      title: 'Optimize High Usage',
      description: `You've used ${Math.round(usage.usagePercent)}% of your ${getMetricLabel(usage.metric)}. Consider these optimizations.`,
      impact: 'Save up to 30% usage',
    })
  }
  
  // Pattern-based suggestions
  if (usage.metric === 'ai_generations') {
    suggestions.push({
      id: 'batch-operations',
      priority: 'medium',
      title: 'Batch Your AI Requests',
      description: 'Combine multiple small requests into larger ones to reduce overall usage.',
      impact: 'Save 15-20% on usage',
    })
    
    suggestions.push({
      id: 'cache-results',
      priority: 'medium',
      title: 'Reuse Previous Generations',
      description: 'Save and reuse AI outputs when possible instead of generating new ones.',
      impact: 'Save 10-25% on usage',
    })
  }
  
  if (usage.metric === 'exports') {
    suggestions.push({
      id: 'selective-export',
      priority: 'medium',
      title: 'Export Only Final Versions',
      description: 'Avoid exporting work-in-progress versions. Preview in-app instead.',
      impact: 'Reduce exports by 40%',
    })
  }
  
  if (usage.metric === 'projects') {
    suggestions.push({
      id: 'archive-old',
      priority: 'low',
      title: 'Archive Completed Projects',
      description: 'Move completed projects to archive to free up active slots.',
      impact: 'Free up project slots',
    })
  }
  
  // Upgrade suggestion if needed
  if (willExceed || usage.usagePercent > 90) {
    suggestions.push({
      id: 'upgrade-plan',
      priority: 'high',
      title: 'Upgrade Your Plan',
      description: 'Your usage patterns suggest you need a higher plan for optimal productivity.',
      impact: 'Increase limits by 5-10x',
      action: {
        label: 'View Plans',
        onClick: () => onUpgradeClick?.()
      }
    })
  }
  
  // Time-based optimization
  const peakHours = findPeakUsageHours(historicalData, usage.metric)
  if (peakHours.length > 0) {
    suggestions.push({
      id: 'off-peak-usage',
      priority: 'low',
      title: 'Use During Off-Peak Hours',
      description: `Your peak usage is at ${peakHours.join(', ')}. Spread usage throughout the day.`,
      impact: 'Better performance',
    })
  }
  
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive'
      case 'medium': return 'secondary'
      case 'low': return 'outline'
      default: return 'outline'
    }
  }
  
  const getPriorityIcon = (priority: string): IconName => {
    switch (priority) {
      case 'high': return 'alert-circle'
      case 'medium': return 'info'
      case 'low': return 'lightbulb'
      default: return 'info'
    }
  }
  
  return (
    <div className="space-y-4">
      {/* Summary Alert */}
      {suggestions.filter(s => s.priority === 'high').length > 0 && (
        <Alert>
          <Icon name="zap" className="h-4 w-4" />
          <AlertDescription>
            You have {suggestions.filter(s => s.priority === 'high').length} high-priority 
            optimization opportunities that could significantly improve your usage efficiency.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Suggestions List */}
      <div className="space-y-3">
        {suggestions
          .sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 }
            return priorityOrder[a.priority] - priorityOrder[b.priority]
          })
          .map(suggestion => (
            <Card key={suggestion.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Icon 
                    name={getPriorityIcon(suggestion.priority)} 
                    className={`h-5 w-5 mt-0.5 ${
                      suggestion.priority === 'high' ? 'text-red-500' :
                      suggestion.priority === 'medium' ? 'text-yellow-500' :
                      'text-blue-500'
                    }`}
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-medium">{suggestion.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {suggestion.description}
                        </p>
                      </div>
                      <Badge variant={getPriorityColor(suggestion.priority)}>
                        {suggestion.priority}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        Impact: {suggestion.impact}
                      </Badge>
                      {suggestion.action && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={suggestion.action.onClick}
                        >
                          {suggestion.action.label}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
      
      {/* General Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General Optimization Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <TipItem icon="check-circle" text="Plan your usage at the start of each billing period" />
            <TipItem icon="check-circle" text="Set up usage alerts to avoid surprises" />
            <TipItem icon="check-circle" text="Review your usage weekly to identify patterns" />
            <TipItem icon="check-circle" text="Consider annual plans for better value" />
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function TipItem({ icon, text }: { icon: IconName; text: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon name={icon} className="h-4 w-4 text-green-500 flex-shrink-0" />
      <span>{text}</span>
    </li>
  )
}

function getMetricLabel(metric: string) {
  switch (metric) {
    case 'ai_generations': return 'AI generations'
    case 'exports': return 'exports'
    case 'projects': return 'projects'
    default: return metric
  }
}

function findPeakUsageHours(data: any[], metric: string): string[] {
  // This is a simplified implementation
  // In a real app, you'd analyze hourly data
  return ['2-4 PM', '7-9 PM']
}