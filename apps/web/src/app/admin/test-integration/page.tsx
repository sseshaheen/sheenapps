'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, XCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react'

interface EndpointTest {
  name: string
  endpoint: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  status: 'pending' | 'testing' | 'success' | 'error' | 'mock'
  response?: any
  error?: string
  responseTime?: number
  mockReason?: string  // Why we're using mock data (e.g., "Worker 404", "Auth failed", etc.)
  workerStatus?: number  // HTTP status from worker API
}

export default function TestIntegrationPage() {
  const [tests, setTests] = useState<EndpointTest[]>([
    // Core endpoints we've integrated
    { name: 'Pending Approvals', endpoint: '/api/admin/approvals/pending', method: 'GET', status: 'pending' },
    { name: 'Dashboard', endpoint: '/api/admin/dashboard', method: 'GET', status: 'pending' },
    { name: 'Users List', endpoint: '/api/admin/users', method: 'GET', status: 'pending' },
    { name: 'Financial Overview', endpoint: '/api/admin/finance/overview', method: 'GET', status: 'pending' },
    { name: 'Support Tickets', endpoint: '/api/admin/support/tickets', method: 'GET', status: 'pending' },
    { name: 'Advisor Applications', endpoint: '/api/admin/advisors/applications', method: 'GET', status: 'pending' },
    { name: 'Revenue Metrics', endpoint: '/api/admin/metrics/dashboard', method: 'GET', status: 'pending' },
    { name: 'Promotions', endpoint: '/api/admin/promotions', method: 'GET', status: 'pending' },
    { name: 'Pricing Catalogs', endpoint: '/api/admin/pricing/catalogs', method: 'GET', status: 'pending' },
    { name: 'Audit Logs', endpoint: '/api/admin/audit/logs', method: 'GET', status: 'pending' },
    { name: 'Trust & Safety Risk', endpoint: '/api/admin/trust-safety/risk-scores', method: 'GET', status: 'pending' },
  ])
  
  const [isTestingAll, setIsTestingAll] = useState(false)

  const testEndpoint = async (index: number) => {
    const test = tests[index]
    
    // Update status to testing
    setTests(prev => prev.map((t, i) => 
      i === index ? { ...t, status: 'testing' } : t
    ))

    const startTime = Date.now()
    
    try {
      const response = await fetch(test.endpoint, {
        method: test.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin-token') || ''}`
        }
      })

      const responseTime = Date.now() - startTime
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      // Check if response is mock data
      const isMock = data._mock === true
      
      // Extract mock reason if available
      let mockReason = ''
      let workerStatus = undefined
      if (isMock && data._mockReason) {
        mockReason = data._mockReason
        workerStatus = data._workerStatus
      }

      setTests(prev => prev.map((t, i) => 
        i === index ? {
          ...t,
          status: isMock ? 'mock' : 'success',
          response: data,
          responseTime,
          error: undefined,
          mockReason,
          workerStatus
        } : t
      ))
    } catch (error) {
      const responseTime = Date.now() - startTime
      
      setTests(prev => prev.map((t, i) => 
        i === index ? {
          ...t,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime,
          response: undefined
        } : t
      ))
    }
  }

  const testAllEndpoints = async () => {
    setIsTestingAll(true)
    
    // Reset all tests
    setTests(prev => prev.map(t => ({ ...t, status: 'pending', error: undefined, response: undefined })))
    
    // Test each endpoint sequentially
    for (let i = 0; i < tests.length; i++) {
      await testEndpoint(i)
      // Small delay between tests to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    setIsTestingAll(false)
  }

  const getStatusIcon = (status: EndpointTest['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'mock':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'testing':
        return <Loader2 className="h-5 w-5 animate-spin" />
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
    }
  }

  const getStatusBadge = (status: EndpointTest['status']) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800">Live Data</Badge>
      case 'mock':
        return <Badge className="bg-yellow-100 text-yellow-800">Mock Data</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      case 'testing':
        return <Badge variant="secondary">Testing...</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }

  const stats = {
    total: tests.length,
    success: tests.filter(t => t.status === 'success').length,
    mock: tests.filter(t => t.status === 'mock').length,
    error: tests.filter(t => t.status === 'error').length,
    pending: tests.filter(t => t.status === 'pending').length,
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">API Integration Test</h1>
        <p className="text-muted-foreground mt-1">
          Test connectivity to the worker API and verify endpoint integration
        </p>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Live Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.success}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">Mock Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.mock}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.error}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.pending}</p>
          </CardContent>
        </Card>
      </div>

      {/* Test Controls */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Endpoint Tests</h2>
          <p className="text-sm text-muted-foreground">
            Click individual endpoints to test or run all tests
          </p>
        </div>
        <Button 
          onClick={testAllEndpoints} 
          disabled={isTestingAll}
        >
          {isTestingAll ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Test All Endpoints
            </>
          )}
        </Button>
      </div>

      {/* Worker API Status Alert */}
      {stats.error > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Worker API Connection Issues:</strong> Some endpoints are failing. 
            Make sure the worker API is running on <code>http://localhost:8081</code>
          </AlertDescription>
        </Alert>
      )}

      {stats.mock > 0 && stats.error === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Using Fallback Data:</strong> Worker API is not responding, so mock data is being used. 
            Start the worker API to see real data.
          </AlertDescription>
        </Alert>
      )}

      {stats.success === stats.total && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <strong>All Systems Operational:</strong> All endpoints are successfully connected to the worker API!
          </AlertDescription>
        </Alert>
      )}

      {/* Endpoint Test Results */}
      <Card>
        <CardHeader>
          <CardTitle>Endpoint Status</CardTitle>
          <CardDescription>
            Click on any endpoint to test it individually
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {tests.map((test, index) => (
              <div
                key={test.endpoint}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => test.status !== 'testing' && testEndpoint(index)}
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(test.status)}
                  <div>
                    <p className="font-medium">{test.name}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-mono">{test.method}</span> {test.endpoint}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {test.responseTime && (
                    <span className="text-sm text-muted-foreground">
                      {test.responseTime}ms
                    </span>
                  )}
                  {/* Show mock reason if using mock data */}
                  {test.status === 'mock' && test.mockReason && (
                    <span className="text-xs text-amber-600">
                      ({test.workerStatus ? `${test.workerStatus}: ` : ''}{test.mockReason})
                    </span>
                  )}
                  {getStatusBadge(test.status)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Response Details */}
      {tests.some(t => t.response || t.error) && (
        <Card>
          <CardHeader>
            <CardTitle>Response Details</CardTitle>
            <CardDescription>
              Click on a tested endpoint above to see its response
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tests.filter(t => t.response || t.error).map(test => (
                <div key={test.endpoint} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{test.name}</h3>
                    {getStatusBadge(test.status)}
                  </div>
                  
                  {test.error ? (
                    <Alert variant="destructive">
                      <AlertDescription>{test.error}</AlertDescription>
                    </Alert>
                  ) : (
                    <pre className="bg-gray-100 p-3 rounded-lg overflow-x-auto text-xs">
                      {JSON.stringify(test.response, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}