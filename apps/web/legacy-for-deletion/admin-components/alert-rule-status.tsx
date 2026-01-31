'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Icon } from '@/components/ui/icon'
import { getAlertRulesEngine } from '@/services/quota/alert-rules'

interface RuleStatus {
  name: string
  enabled: boolean
  description: string
  severity: string
  checkInterval: number
}

export function AlertRuleStatus() {
  const [rules, setRules] = useState<RuleStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    loadRules()
  }, [])
  
  const loadRules = () => {
    try {
      const engine = getAlertRulesEngine()
      const ruleStatus = engine.getRuleStatus()
      setRules(ruleStatus)
    } catch (error) {
      console.error('Failed to load alert rules:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const toggleRule = (ruleName: string, enabled: boolean) => {
    const engine = getAlertRulesEngine()
    if (enabled) {
      engine.enableRule(ruleName)
    } else {
      engine.disableRule(ruleName)
    }
    loadRules()
  }
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800'
      case 'high': return 'bg-orange-100 text-orange-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }
  
  const formatInterval = (ms: number) => {
    if (ms < 60000) return `${ms / 1000}s`
    return `${ms / 60000}m`
  }
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Icon name="loader-2" className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }
  
  const enabledCount = rules.filter(r => r.enabled).length
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Alert Rules</span>
          <Badge variant="outline">
            {enabledCount}/{rules.length} active
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rules.map(rule => (
            <div 
              key={rule.name}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{rule.name}</span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getSeverityColor(rule.severity)}`}
                  >
                    {rule.severity}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Every {formatInterval(rule.checkInterval)}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500">{rule.description}</p>
              </div>
              <Switch
                checked={rule.enabled}
                onCheckedChange={(checked) => toggleRule(rule.name, checked)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}