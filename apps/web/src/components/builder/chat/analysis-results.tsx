/**
 * Analysis Results Display Component
 * Renders code analysis responses with findings, metrics, and recommendations
 */

'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UsageFooter } from './usage-footer'
import { 
  Search, 
  TrendingUp, 
  Shield, 
  Zap, 
  Target, 
  Bug, 
  CheckCircle2,
  AlertTriangle,
  Info,
  FileText,
  BarChart3,
  Lightbulb,
  ChevronRight,
  ChevronDown
} from 'lucide-react'
import { type AnalysisResponse } from '@/types/chat-plan'

interface AnalysisResultsProps {
  analysis: AnalysisResponse
  className?: string
  translations?: {
    title?: string
    summary?: string
    findings?: string
    metrics?: string
    recommendations?: string
    category?: string
    severity?: string
    file?: string
    line?: string
    recommendation?: string
    showAll?: string
    showLess?: string
    linesOfCode?: string
    complexityScore?: string
    testCoverage?: string
    dependencies?: string
  }
}

const defaultTranslations = {
  title: 'Analysis Results',
  summary: 'Summary',
  findings: 'Findings',
  metrics: 'Metrics',
  recommendations: 'Recommendations',
  category: 'Category',
  severity: 'Severity',
  file: 'File',
  line: 'Line',
  recommendation: 'Recommendation',
  showAll: 'Show All',
  showLess: 'Show Less',
  linesOfCode: 'Lines of Code',
  complexityScore: 'Complexity Score',
  testCoverage: 'Test Coverage',
  dependencies: 'Dependencies'
}

const severityConfig = {
  info: {
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: Info,
    priority: 1
  },
  warning: {
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    icon: AlertTriangle,
    priority: 2
  },
  error: {
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    icon: AlertTriangle,
    priority: 3
  }
}

const categoryConfig = {
  security: {
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    icon: Shield
  },
  performance: {
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    icon: Zap
  },
  maintainability: {
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: Target
  },
  bugs: {
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    icon: Bug
  },
  best_practices: {
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    icon: CheckCircle2
  }
}

export function AnalysisResults({
  analysis,
  className = '',
  translations = defaultTranslations
}: AnalysisResultsProps) {
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set())
  const [showAllFindings, setShowAllFindings] = useState(false)

  const t = { ...defaultTranslations, ...translations }

  // Sort findings by severity and category
  const sortedFindings = analysis.findings.sort((a, b) => {
    const severityA = severityConfig[a.severity].priority
    const severityB = severityConfig[b.severity].priority
    if (severityA !== severityB) return severityB - severityA
    return a.category.localeCompare(b.category)
  })

  const displayFindings = showAllFindings ? sortedFindings : sortedFindings.slice(0, 5)

  const toggleFinding = (index: number) => {
    setExpandedFindings(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  // Calculate summary stats
  const stats = {
    total: analysis.findings.length,
    errors: analysis.findings.filter(f => f.severity === 'error').length,
    warnings: analysis.findings.filter(f => f.severity === 'warning').length,
    info: analysis.findings.filter(f => f.severity === 'info').length
  }

  return (
    <Card className={`p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Search className="w-6 h-6 text-green-600" />
            {t.title}
          </h3>
          
          {/* Quick stats */}
          <div className="flex items-center gap-2">
            {stats.errors > 0 && (
              <Badge className={severityConfig.error.color}>
                {stats.errors} errors
              </Badge>
            )}
            {stats.warnings > 0 && (
              <Badge className={severityConfig.warning.color}>
                {stats.warnings} warnings
              </Badge>
            )}
            {stats.info > 0 && (
              <Badge className={severityConfig.info.color}>
                {stats.info} info
              </Badge>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            {t.summary}
          </h4>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            {analysis.summary}
          </p>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="findings" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="findings" className="flex items-center gap-2">
            <Bug className="w-4 h-4" />
            {t.findings}
          </TabsTrigger>
          <TabsTrigger value="metrics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            {t.metrics}
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            {t.recommendations}
          </TabsTrigger>
        </TabsList>

        {/* Findings Tab */}
        <TabsContent value="findings" className="space-y-4">
          <div className="space-y-3">
            {displayFindings.map((finding, index) => {
              const SeverityIcon = severityConfig[finding.severity].icon
              const CategoryIcon = categoryConfig[finding.category].icon
              const isExpanded = expandedFindings.has(index)

              return (
                <div 
                  key={index}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <button
                    onClick={() => toggleFinding(index)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <SeverityIcon className={`w-5 h-5 mt-0.5 ${
                        finding.severity === 'error' ? 'text-red-600' :
                        finding.severity === 'warning' ? 'text-yellow-600' :
                        'text-blue-600'
                      }`} />
                      
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <h5 className="font-medium text-gray-900 dark:text-gray-100">
                            {finding.title}
                          </h5>
                          <Badge className={categoryConfig[finding.category].color}>
                            <CategoryIcon className="w-3 h-3 mr-1" />
                            {finding.category.replace('_', ' ')}
                          </Badge>
                        </div>
                        
                        <p className="text-gray-700 dark:text-gray-300 text-sm">
                          {finding.description}
                        </p>
                        
                        {/* File and line info */}
                        {(finding.file || finding.line) && (
                          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                            {finding.file && (
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {finding.file}
                              </span>
                            )}
                            {finding.line && (
                              <span>Line {finding.line}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>

                  {/* Expanded recommendation */}
                  {isExpanded && finding.recommendation && (
                    <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mt-3">
                        <h6 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                          <Lightbulb className="w-4 h-4" />
                          {t.recommendation}
                        </h6>
                        <p className="text-blue-800 dark:text-blue-300 text-sm">
                          {finding.recommendation}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Show more/less button */}
          {sortedFindings.length > 5 && (
            <div className="text-center">
              <Button
                variant="ghost"
                onClick={() => setShowAllFindings(!showAllFindings)}
              >
                {showAllFindings ? (
                  <>
                    <ChevronDown className="w-4 h-4 mr-1" />
                    {t.showLess}
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-4 h-4 mr-1" />
                    {t.showAll} ({sortedFindings.length - 5} more)
                  </>
                )}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-4">
          {analysis.metrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.metrics.lines_of_code && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t.linesOfCode}
                    </span>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {analysis.metrics.lines_of_code.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {analysis.metrics.complexity_score && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t.complexityScore}
                    </span>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {analysis.metrics.complexity_score}
                    </span>
                  </div>
                  <Progress value={Math.min(analysis.metrics.complexity_score * 10, 100)} className="h-2" />
                </div>
              )}

              {analysis.metrics.test_coverage && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t.testCoverage}
                    </span>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {analysis.metrics.test_coverage}%
                    </span>
                  </div>
                  <Progress value={analysis.metrics.test_coverage} className="h-2" />
                </div>
              )}

              {analysis.metrics.dependencies && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t.dependencies}
                    </span>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {analysis.metrics.dependencies}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          <div className="space-y-3">
            {analysis.recommendations.map((recommendation, index) => (
              <div 
                key={index}
                className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 flex items-start gap-3"
              >
                <Lightbulb className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-green-800 dark:text-green-300 text-sm leading-relaxed">
                  {recommendation}
                </p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Usage Footer */}
      <UsageFooter metadata={analysis.metadata} />
    </Card>
  )
}

/**
 * Compact analysis results for timeline view
 */
export function CompactAnalysisResults({ 
  analysis, 
  onExpand 
}: { 
  analysis: AnalysisResponse
  onExpand?: () => void 
}) {
  const errorCount = analysis.findings.filter(f => f.severity === 'error').length
  const warningCount = analysis.findings.filter(f => f.severity === 'warning').length

  return (
    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <h4 className="font-medium text-green-900 dark:text-green-100 flex items-center gap-2">
          <Search className="w-4 h-4" />
          Code Analysis
        </h4>
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <Badge className={severityConfig.error.color}>
              {errorCount}
            </Badge>
          )}
          {warningCount > 0 && (
            <Badge className={severityConfig.warning.color}>
              {warningCount}
            </Badge>
          )}
        </div>
      </div>

      <p className="text-green-800 dark:text-green-300 text-sm line-clamp-2">
        {analysis.summary}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-green-700 dark:text-green-400">
          <span>{analysis.findings.length} findings</span>
          <span>{analysis.recommendations.length} recommendations</span>
        </div>

        {onExpand && (
          <Button variant="ghost" size="sm" onClick={onExpand}>
            View Analysis
          </Button>
        )}
      </div>
    </div>
  )
}