'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { abTestingService } from '@/services/analytics/ab-testing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

interface ABTestDashboardProps {
  testId?: string
}

export function ABTestingDashboard({ testId }: ABTestDashboardProps) {
  const [selectedTest, setSelectedTest] = useState<string | null>(testId || null)

  // Fetch active tests
  const { data: activeTests, isLoading: testsLoading } = useQuery({
    queryKey: ['ab-tests', 'active'],
    queryFn: () => abTestingService.getActiveTests(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch test results for selected test
  const { data: testResults, isLoading: resultsLoading } = useQuery({
    queryKey: ['ab-test-results', selectedTest],
    queryFn: () => selectedTest ? abTestingService.getTestResults(selectedTest) : null,
    enabled: !!selectedTest,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  // Auto-select first test if none selected
  useEffect(() => {
    if (!selectedTest && activeTests && activeTests.length > 0) {
      setSelectedTest(activeTests[0].id)
    }
  }, [activeTests, selectedTest])

  if (testsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Icon name="loader-2" className="w-6 h-6 animate-spin mr-2" />
        <span>Loading A/B tests...</span>
      </div>
    )
  }

  if (!activeTests || activeTests.length === 0) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg">
        <Icon name="bar-chart" className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active A/B Tests</h3>
        <p className="text-gray-600 mb-4">There are currently no active A/B tests running.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Test Selection */}
      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-xl font-semibold mb-4">A/B Testing Dashboard</h2>
        
        <div className="flex flex-wrap gap-2 mb-4">
          {activeTests.map(test => (
            <Button
              key={test.id}
              variant={selectedTest === test.id ? "default" : "outline"}
              onClick={() => setSelectedTest(test.id)}
              size="sm"
            >
              {test.name}
            </Button>
          ))}
        </div>

        {selectedTest && (
          <div className="text-sm text-gray-600">
            <p><strong>Test ID:</strong> {selectedTest}</p>
            <p><strong>Status:</strong> {activeTests.find(t => t.id === selectedTest)?.status}</p>
            <p><strong>Traffic:</strong> {activeTests.find(t => t.id === selectedTest)?.traffic_percentage}%</p>
          </div>
        )}
      </div>

      {/* Test Results */}
      {selectedTest && (
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">Test Results</h3>
          
          {resultsLoading ? (
            <div className="flex items-center justify-center p-4">
              <Icon name="loader-2" className="w-5 h-5 animate-spin mr-2" />
              <span>Loading results...</span>
            </div>
          ) : testResults ? (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {testResults.summary.total_assignments}
                  </div>
                  <div className="text-sm text-blue-600">Total Assignments</div>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {testResults.results.filter(r => r.event_type === 'conversion').length}
                  </div>
                  <div className="text-sm text-green-600">Total Conversions</div>
                </div>
                
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {testResults.results.filter(r => r.event_type === 'error').length}
                  </div>
                  <div className="text-sm text-red-600">Total Errors</div>
                </div>
              </div>

              {/* Variant Performance */}
              <div>
                <h4 className="font-semibold mb-3">Variant Performance</h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-200 p-3 text-left">Variant</th>
                        <th className="border border-gray-200 p-3 text-left">Type</th>
                        <th className="border border-gray-200 p-3 text-right">Traffic %</th>
                        <th className="border border-gray-200 p-3 text-right">Assignments</th>
                        <th className="border border-gray-200 p-3 text-right">Conversions</th>
                        <th className="border border-gray-200 p-3 text-right">Conversion Rate</th>
                        <th className="border border-gray-200 p-3 text-right">Error Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testResults.variants.map(variant => {
                        const assignments = testResults.results.filter(r => r.variant_id === variant.id).length
                        const conversions = testResults.results.filter(r => r.variant_id === variant.id && r.event_type === 'conversion').length
                        const errors = testResults.results.filter(r => r.variant_id === variant.id && r.event_type === 'error').length
                        
                        const conversionRate = assignments > 0 ? (conversions / assignments * 100).toFixed(1) : '0.0'
                        const errorRate = assignments > 0 ? (errors / assignments * 100).toFixed(1) : '0.0'
                        
                        return (
                          <tr key={variant.id} className={variant.is_control ? 'bg-blue-50' : ''}>
                            <td className="border border-gray-200 p-3 font-medium">
                              {variant.name}
                              {variant.is_control && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Control</span>}
                            </td>
                            <td className="border border-gray-200 p-3 text-gray-600">
                              {variant.is_control ? 'Control' : 'Test'}
                            </td>
                            <td className="border border-gray-200 p-3 text-right">{variant.traffic_percentage}%</td>
                            <td className="border border-gray-200 p-3 text-right">{assignments}</td>
                            <td className="border border-gray-200 p-3 text-right">{conversions}</td>
                            <td className="border border-gray-200 p-3 text-right font-medium">
                              <span className={conversions > 0 ? 'text-green-600' : 'text-gray-500'}>
                                {conversionRate}%
                              </span>
                            </td>
                            <td className="border border-gray-200 p-3 text-right font-medium">
                              <span className={errors > 0 ? 'text-red-600' : 'text-gray-500'}>
                                {errorRate}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Component Mappings */}
              <div>
                <h4 className="font-semibold mb-3">Component Mappings</h4>
                <div className="space-y-3">
                  {testResults.variants.map(variant => (
                    <div key={variant.id} className="border rounded-lg p-4">
                      <h5 className="font-medium mb-2">
                        {variant.name}
                        {variant.is_control && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Control</span>}
                      </h5>
                      <div className="text-sm text-gray-600">
                        {variant.component_mappings.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {variant.component_mappings.map((mapping, idx) => (
                              <div key={idx} className="flex items-center">
                                <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">
                                  {mapping.ai_component_name}
                                </span>
                                <Icon name="arrow-right" className="w-3 h-3 mx-2 text-gray-400" />
                                <span className="font-mono bg-blue-100 px-2 py-1 rounded text-xs">
                                  {mapping.builder_section_type}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-500">No custom mappings</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Events */}
              <div>
                <h4 className="font-semibold mb-3">Recent Events</h4>
                <div className="max-h-64 overflow-y-auto">
                  {testResults.results.slice(0, 20).map(result => (
                    <div key={result.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center">
                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                          result.event_type === 'conversion' ? 'bg-green-500' : 
                          result.event_type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                        }`} />
                        <span className="text-sm font-medium capitalize">{result.event_type}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {testResults.variants.find(v => v.id === result.variant_id)?.name}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(result.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center p-4 text-gray-500">
              No results available for this test
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Hook for easy dashboard integration
export function useABTestingDashboard() {
  const { data: activeTests } = useQuery({
    queryKey: ['ab-tests', 'active'],
    queryFn: () => abTestingService.getActiveTests(),
  })

  const hasActiveTests = activeTests && activeTests.length > 0

  return {
    hasActiveTests,
    activeTestCount: activeTests?.length || 0,
    dashboard: ABTestingDashboard
  }
}