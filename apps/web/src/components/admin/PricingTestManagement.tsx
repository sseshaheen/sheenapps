'use client'

import { useState, useEffect } from 'react'
import { useTestMonitoring, useTestListMonitoring } from '@/hooks/use-test-monitoring'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { 
  Shield, 
  AlertCircle,
  CheckCircle,
  Clock,
  Play,
  Square,
  Pause,
  TrendingUp,
  Users,
  BarChart3,
  Settings,
  Plus,
  Activity,
  Target
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface Props {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
  canManagePricing: boolean
  selectedCatalog: any
}

interface PricingTest {
  id: string
  name: string
  description?: string
  test_type: 'ab_test' | 'gradual_rollout' | 'geographic' | 'segment'
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled'
  source_catalog_id: string
  test_catalog_id: string
  test_config: any
  success_criteria: any
  current_metrics?: any
  created_at: string
  actual_start_at?: string
  actual_end_at?: string
}

interface TestFormData {
  name: string
  description: string
  test_type: 'ab_test' | 'gradual_rollout' | 'geographic' | 'segment'
  source_catalog_id: string
  test_catalog_id: string
  control_percentage: number
  variant_percentage: number
  rollout_stages: Array<{
    name: string
    percentage: number
    duration_hours: number
  }>
  primary_metric: string
  minimum_improvement: number
  confidence_level: number
  minimum_sample_size: number
  auto_promote_on_success: boolean
}

export function PricingTestManagement({
  adminId,
  adminEmail,
  adminRole,
  permissions,
  canManagePricing,
  selectedCatalog
}: Props) {
  const [tests, setTests] = useState<PricingTest[]>([])
  const [selectedTest, setSelectedTest] = useState<PricingTest | null>(null)
  const [isCreatingTest, setIsCreatingTest] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('tests')

  const [testForm, setTestForm] = useState<TestFormData>({
    name: '',
    description: '',
    test_type: 'ab_test',
    source_catalog_id: '',
    test_catalog_id: '',
    control_percentage: 50,
    variant_percentage: 50,
    rollout_stages: [
      { name: 'Stage 1', percentage: 10, duration_hours: 24 },
      { name: 'Stage 2', percentage: 25, duration_hours: 48 },
      { name: 'Stage 3', percentage: 50, duration_hours: 72 },
      { name: 'Full Rollout', percentage: 100, duration_hours: 168 }
    ],
    primary_metric: 'conversion_rate',
    minimum_improvement: 0.05,
    confidence_level: 0.95,
    minimum_sample_size: 1000,
    auto_promote_on_success: false
  })

  // Fetch tests on mount
  useEffect(() => {
    fetchTests()
  }, [])

  // Fetch test results when test is selected
  useEffect(() => {
    if (selectedTest) {
      fetchTestResults(selectedTest.id)
    }
  }, [selectedTest])

  const fetchTests = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/admin/pricing/tests?limit=50', {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch tests: ${response.status}`)
      }

      const data = await response.json()
      if (data.success && data.tests) {
        setTests(data.tests)
      } else {
        throw new Error('Invalid response format')
      }

    } catch (apiError) {
      console.error('Failed to fetch pricing tests:', apiError)
      setError(apiError instanceof Error ? apiError.message : 'Failed to fetch tests')
    } finally {
      setLoading(false)
    }
  }

  const fetchTestResults = async (testId: string) => {
    try {
      const response = await fetch(`/api/admin/pricing/tests/${testId}/results?time_range=24h&include_progress=true`, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setTestResults(data.results)
        }
      }
    } catch (error) {
      console.error('Failed to fetch test results:', error)
    }
  }

  const handleCreateTest = async () => {
    try {
      if (!testForm.name || !testForm.source_catalog_id || !testForm.test_catalog_id) {
        toast.error('Please fill in all required fields')
        return
      }

      const testConfig = testForm.test_type === 'ab_test' 
        ? {
            ab_split: {
              control_percentage: testForm.control_percentage,
              variant_percentage: testForm.variant_percentage
            },
            traffic_allocation: 'random',
            duration_days: 14
          }
        : {
            rollout_stages: testForm.rollout_stages
          }

      const payload = {
        name: testForm.name,
        description: testForm.description,
        test_type: testForm.test_type,
        source_catalog_id: testForm.source_catalog_id,
        test_catalog_id: testForm.test_catalog_id,
        test_config: testConfig,
        success_criteria: {
          primary_metric: testForm.primary_metric,
          minimum_improvement: testForm.minimum_improvement,
          confidence_level: testForm.confidence_level,
          minimum_sample_size: testForm.minimum_sample_size
        },
        auto_promote_on_success: testForm.auto_promote_on_success
      }

      const response = await fetch('/api/admin/pricing/tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-reason': `[PR01] Creating pricing test: ${testForm.name}`
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create test')
      }

      toast.success('Test created successfully', {
        description: `Test "${testForm.name}" has been created`
      })

      setIsCreatingTest(false)
      fetchTests()

      // Reset form
      setTestForm({
        ...testForm,
        name: '',
        description: ''
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create test'
      toast.error('Failed to create test', {
        description: errorMessage
      })
    }
  }

  const handleStartTest = async (testId: string) => {
    try {
      const response = await fetch(`/api/admin/pricing/tests/${testId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-reason': '[PR02] Starting pricing test for safe activation'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start test')
      }

      toast.success('Test started successfully', {
        description: data.message
      })

      fetchTests()
      if (selectedTest?.id === testId) {
        setSelectedTest({ ...selectedTest, status: 'running', actual_start_at: new Date().toISOString() })
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start test'
      toast.error('Failed to start test', {
        description: errorMessage
      })
    }
  }

  const handleStopTest = async (testId: string) => {
    try {
      const response = await fetch(`/api/admin/pricing/tests/${testId}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-reason': '[PR03] Stopping pricing test - manual intervention'
        },
        body: JSON.stringify({
          reason: 'Manual stop requested by admin',
          save_results: true
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to stop test')
      }

      toast.success('Test stopped successfully', {
        description: data.message
      })

      fetchTests()
      if (selectedTest?.id === testId) {
        setSelectedTest({ ...selectedTest, status: 'completed', actual_end_at: new Date().toISOString() })
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop test'
      toast.error('Failed to stop test', {
        description: errorMessage
      })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500'
      case 'completed': return 'bg-blue-500'
      case 'paused': return 'bg-yellow-500'
      case 'cancelled': return 'bg-red-500'
      case 'scheduled': return 'bg-purple-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Activity className="h-4 w-4" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'paused': return <Pause className="h-4 w-4" />
      case 'cancelled': return <Square className="h-4 w-4" />
      case 'scheduled': return <Clock className="h-4 w-4" />
      default: return <Settings className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading pricing tests...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tests">
            <Shield className="h-4 w-4 mr-2" />
            Tests
          </TabsTrigger>
          <TabsTrigger value="results">
            <BarChart3 className="h-4 w-4 mr-2" />
            Results
          </TabsTrigger>
          <TabsTrigger value="create">
            <Plus className="h-4 w-4 mr-2" />
            Create Test
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tests" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Pricing Tests</h3>
              <p className="text-sm text-muted-foreground">
                Manage safe activation tests and controlled rollouts
              </p>
            </div>
            <Button onClick={() => setActiveTab('create')} disabled={!canManagePricing}>
              <Plus className="h-4 w-4 mr-2" />
              Create Test
            </Button>
          </div>

          {tests.length > 0 ? (
            <div className="grid gap-4">
              {tests.map((test) => (
                <Card 
                  key={test.id} 
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedTest?.id === test.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedTest(test)}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {getStatusIcon(test.status)}
                          {test.name}
                          <Badge 
                            variant="secondary" 
                            className={`text-white ${getStatusColor(test.status)}`}
                          >
                            {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          {test.test_type.replace('_', ' ').toUpperCase()} • Created {new Date(test.created_at).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {test.status === 'draft' && canManagePricing && (
                          <Button 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartTest(test.id)
                            }}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Start
                          </Button>
                        )}
                        {test.status === 'running' && canManagePricing && (
                          <Button 
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStopTest(test.id)
                            }}
                          >
                            <Square className="h-4 w-4 mr-1" />
                            Stop
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Test Type</p>
                        <p className="font-medium capitalize">
                          {test.test_type.replace('_', ' ')}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Duration</p>
                        <p className="font-medium">
                          {test.actual_start_at ? 
                            `${Math.round((new Date().getTime() - new Date(test.actual_start_at).getTime()) / (1000 * 60 * 60))}h` :
                            'Not started'
                          }
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Success Criteria</p>
                        <p className="font-medium">
                          {test.success_criteria?.primary_metric || 'N/A'}
                        </p>
                      </div>
                    </div>

                    {test.current_metrics && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                          {Object.entries(test.current_metrics).map(([key, value]: [string, any]) => (
                            <div key={key}>
                              <p className="text-muted-foreground capitalize">{key.replace('_', ' ')}</p>
                              <p className="font-medium">
                                {typeof value === 'number' ? value.toLocaleString() : String(value)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No pricing tests found</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first test to start safe activation testing
                </p>
                <Button onClick={() => setActiveTab('create')} disabled={!canManagePricing}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Test
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {selectedTest ? (
            <Card>
              <CardHeader>
                <CardTitle>Test Results - {selectedTest.name}</CardTitle>
                <CardDescription>
                  Real-time performance metrics and statistical analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                {testResults ? (
                  <div className="space-y-6">
                    {/* Results summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-primary">
                          {testResults.summary?.total_results || 0}
                        </div>
                        <p className="text-sm text-muted-foreground">Total Results</p>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {testResults.summary?.time_range?.duration_hours || 0}h
                        </div>
                        <p className="text-sm text-muted-foreground">Duration</p>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {testResults.summary?.test_groups?.length || 0}
                        </div>
                        <p className="text-sm text-muted-foreground">Test Groups</p>
                      </div>
                    </div>

                    {/* Statistical summary for A/B tests */}
                    {testResults.summary?.statistical_summary && (
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-semibold mb-3">Statistical Analysis</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(testResults.summary.statistical_summary.conversion_rates).map(([group, rate]: [string, any]) => (
                            <div key={group} className="flex justify-between">
                              <span className="font-medium capitalize">{group}:</span>
                              <span>{(rate * 100).toFixed(2)}%</span>
                            </div>
                          ))}
                        </div>
                        {testResults.summary.statistical_summary.improvement && (
                          <div className="mt-3 p-3 bg-green-50 rounded border">
                            <p className="text-sm">
                              <strong>Improvement:</strong> {testResults.summary.statistical_summary.improvement.percentage}%
                              {testResults.summary.statistical_summary.improvement.winner && (
                                <span className="ml-2">
                                  (Winner: {testResults.summary.statistical_summary.improvement.winner})
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">Loading test results...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Alert>
              <Target className="h-4 w-4" />
              <AlertDescription>
                Select a test from the Tests tab to view detailed results
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create New Pricing Test</CardTitle>
              <CardDescription>
                Set up a new safe activation test with controlled rollouts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Test Name *</Label>
                  <Input 
                    value={testForm.name}
                    onChange={(e) => setTestForm({ ...testForm, name: e.target.value })}
                    placeholder="e.g., Holiday 2024 Pricing Test" 
                  />
                </div>
                <div>
                  <Label>Test Type *</Label>
                  <Select 
                    value={testForm.test_type}
                    onValueChange={(value: any) => setTestForm({ ...testForm, test_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ab_test">A/B Test</SelectItem>
                      <SelectItem value="gradual_rollout">Gradual Rollout</SelectItem>
                      <SelectItem value="geographic">Geographic Test</SelectItem>
                      <SelectItem value="segment">Segment Test</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea 
                  value={testForm.description}
                  onChange={(e) => setTestForm({ ...testForm, description: e.target.value })}
                  placeholder="Describe the purpose and goals of this test..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Source Catalog (Control) *</Label>
                  <Input 
                    value={testForm.source_catalog_id}
                    onChange={(e) => setTestForm({ ...testForm, source_catalog_id: e.target.value })}
                    placeholder="Current pricing catalog ID" 
                  />
                </div>
                <div>
                  <Label>Test Catalog (Variant) *</Label>
                  <Input 
                    value={testForm.test_catalog_id}
                    onChange={(e) => setTestForm({ ...testForm, test_catalog_id: e.target.value })}
                    placeholder="New pricing catalog ID" 
                  />
                </div>
              </div>

              {testForm.test_type === 'ab_test' && (
                <div>
                  <h4 className="text-sm font-medium mb-3">A/B Split Configuration</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Control Group %</Label>
                      <Input 
                        type="number"
                        value={testForm.control_percentage}
                        onChange={(e) => {
                          const control = parseInt(e.target.value)
                          setTestForm({ 
                            ...testForm, 
                            control_percentage: control,
                            variant_percentage: 100 - control
                          })
                        }}
                        min="10" max="90" 
                      />
                    </div>
                    <div>
                      <Label>Variant Group %</Label>
                      <Input 
                        type="number"
                        value={testForm.variant_percentage}
                        onChange={(e) => {
                          const variant = parseInt(e.target.value)
                          setTestForm({ 
                            ...testForm, 
                            variant_percentage: variant,
                            control_percentage: 100 - variant
                          })
                        }}
                        min="10" max="90" 
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium mb-3">Success Criteria</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Primary Metric</Label>
                    <Select 
                      value={testForm.primary_metric}
                      onValueChange={(value) => setTestForm({ ...testForm, primary_metric: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conversion_rate">Conversion Rate</SelectItem>
                        <SelectItem value="revenue_per_visitor">Revenue per Visitor</SelectItem>
                        <SelectItem value="avg_order_value">Average Order Value</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Minimum Improvement (%)</Label>
                    <Input 
                      type="number"
                      value={testForm.minimum_improvement * 100}
                      onChange={(e) => setTestForm({ 
                        ...testForm, 
                        minimum_improvement: parseFloat(e.target.value) / 100 
                      })}
                      min="1" max="50" step="0.1"
                    />
                  </div>
                  <div>
                    <Label>Confidence Level (%)</Label>
                    <Input 
                      type="number"
                      value={testForm.confidence_level * 100}
                      onChange={(e) => setTestForm({ 
                        ...testForm, 
                        confidence_level: parseFloat(e.target.value) / 100 
                      })}
                      min="90" max="99" step="1"
                    />
                  </div>
                  <div>
                    <Label>Minimum Sample Size</Label>
                    <Input 
                      type="number"
                      value={testForm.minimum_sample_size}
                      onChange={(e) => setTestForm({ 
                        ...testForm, 
                        minimum_sample_size: parseInt(e.target.value) 
                      })}
                      min="100" max="10000" step="100"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch 
                  checked={testForm.auto_promote_on_success}
                  onCheckedChange={(checked) => setTestForm({ ...testForm, auto_promote_on_success: checked })}
                />
                <Label>Auto-promote winning variant when success criteria are met</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleCreateTest}
                  disabled={!canManagePricing || !testForm.name || !testForm.source_catalog_id || !testForm.test_catalog_id}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Test
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setActiveTab('tests')}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}