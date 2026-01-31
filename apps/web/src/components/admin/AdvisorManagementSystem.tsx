/**
 * Advisor Management System Component
 * Comprehensive advisor application review and management
 */

'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  Award,
  Briefcase,
  CheckCircle,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  RefreshCw,
  Star,
  ThumbsUp,
  UserCheck,
  XCircle
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface AdvisorApplication {
  id: string
  display_name: string
  email: string
  bio: string
  skills: string[]
  specialties: string[]
  languages: string[]
  country_code: string
  years_experience: number
  linkedin_url?: string
  portfolio_url?: string
  hourly_rate: number
  availability: 'full_time' | 'part_time' | 'weekends'
  status: 'pending' | 'approved' | 'rejected'
  applied_at: string
  reviewed_at?: string
  reviewed_by?: string
  rejection_reason?: string
  approval_notes?: string
  verification_status?: 'verified' | 'unverified' | 'pending'
  profile_image?: string
  slug?: string
  notes?: string
  submitted_at?: string
}

interface AdvisorMetrics {
  total_applications: number
  pending_review: number
  approved_this_month: number
  rejected_this_month: number
  average_review_time: number
  approval_rate: number
  active_advisors: number
  top_performing: number
}

interface AdvisorPerformance {
  advisor_id: string
  advisor_name: string
  total_consultations: number
  average_rating: number
  completion_rate: number
  response_time: number
  revenue_generated: number
  client_satisfaction: number
  specialties: string[]
}

interface AdvisorManagementSystemProps {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
  canApproveAdvisors: boolean
}

export function AdvisorManagementSystem({
  adminId,
  adminEmail,
  adminRole,
  permissions,
  canApproveAdvisors
}: AdvisorManagementSystemProps) {
  const [applications, setApplications] = useState<AdvisorApplication[]>([])
  const [metrics, setMetrics] = useState<AdvisorMetrics | null>(null)
  const [topAdvisors, setTopAdvisors] = useState<AdvisorPerformance[]>([])
  const [selectedApplication, setSelectedApplication] = useState<AdvisorApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('pending')
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [processingReview, setProcessingReview] = useState(false)

  // Fetch advisor data from API
  useEffect(() => {
    const fetchAdvisorData = async () => {
      try {
        // For approved advisors, use the public search endpoint
        // For pending/rejected, use the admin applications endpoint
        const usePublicEndpoint = activeTab === 'approved'
        const endpoint = usePublicEndpoint
          ? '/api/v1/advisors/search?limit=100'
          : '/api/admin/advisors/applications?status=all'

        const response = await fetch(endpoint, {
          headers: usePublicEndpoint ? { 'x-sheen-locale': 'en' } : {}
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to fetch advisor data: ${response.status} - ${errorText}`)
        }

        const data = await response.json()

        if (usePublicEndpoint) {
          // Public search endpoint returns different structure
          if (data.success && data.advisors) {
            // Map public advisor data to application structure for approved tab
            const approvedApplications = data.advisors.map((advisor: any) => ({
              ...advisor,
              status: 'approved',
              // Map public advisor fields to expected application fields
              name: advisor.display_name,
              display_name: advisor.display_name,
              email: 'N/A', // Not provided in public endpoint
              specialties: advisor.specialties || [],
              years_experience: advisor.experience_years || 0,
              availability: advisor.is_accepting_bookings ? 'available' : 'unavailable',
              hourly_rate: advisor.hourly_rate || 0,
              verification_status: advisor.approval_status === 'approved' ? 'verified' : 'pending',
              // Profile image and slug mapping for modal display
              profile_image: advisor.avatar_url || advisor.profile_image_url || advisor.image_url,
              slug: advisor.slug || advisor.profile_slug,
              // Application-specific fields
              submitted_at: advisor.created_at,
              reviewed_at: advisor.created_at,
              reviewed_by: 'system',
              notes: `Active advisor with ${advisor.rating || 'N/A'} rating and ${advisor.review_count || 0} reviews`
            }))
            setApplications(approvedApplications)
          }
        } else {
          // Admin applications endpoint
          if (data.success && data.applications) {
            setApplications(data.applications)
          }
        }
      } catch (error) {
        console.error('Error fetching advisor data:', error)
        setError(error instanceof Error ? error.message : 'Failed to connect to service')
        setApplications([])
      } finally {
        setLoading(false)
      }
    }

    fetchAdvisorData()
  }, [activeTab]) // Re-fetch when tab changes

  // Calculate metrics whenever applications change
  useEffect(() => {
    if (applications.length > 0) {
      const pendingCount = applications.filter(app => app.status === 'pending').length
      const approvedCount = applications.filter(app => app.status === 'approved').length
      const rejectedCount = applications.filter(app => app.status === 'rejected').length

      const metrics: AdvisorMetrics = {
        total_applications: applications.length,
        pending_review: pendingCount,
        approved_this_month: approvedCount,
        rejected_this_month: rejectedCount,
        average_review_time: 0,
        approval_rate: applications.length > 0
          ? Math.round((approvedCount / applications.length) * 100)
          : 0,
        active_advisors: approvedCount,
        top_performing: Math.min(approvedCount, 15)
      }

      setMetrics(metrics)
      setTopAdvisors([]) // TODO: Fetch from API
    }
  }, [applications])

  const handleReviewApplication = (application: AdvisorApplication, action: 'approve' | 'reject') => {
    setSelectedApplication(application)
    setReviewAction(action)
    setReviewNotes('')
    setShowReviewDialog(true)
  }

  const handleConfirmReview = async () => {
    if (!selectedApplication || !reviewAction) return

    setProcessingReview(true)

    try {
      const response = await fetch(`/api/admin/advisors/${selectedApplication.id}/approval`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-reason': `[A01] ${reviewAction === 'approve' ? 'Advisor approved' : 'Application rejected'}: ${reviewNotes || 'No additional notes'}`
        },
        body: JSON.stringify({
          action: reviewAction,
          reason: reviewNotes || `${reviewAction === 'approve' ? 'Approved' : 'Rejected'} by admin`,
          notes: reviewNotes
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${reviewAction} advisor`)
      }

      // Update application status locally
      setApplications(prev => prev.map(app =>
        app.id === selectedApplication.id
          ? {
              ...app,
              status: reviewAction === 'approve' ? 'approved' : 'rejected',
              reviewed_at: new Date().toISOString(),
              reviewed_by: adminEmail,
              [reviewAction === 'approve' ? 'approval_notes' : 'rejection_reason']: reviewNotes
            }
          : app
      ))

      toast.success(
        reviewAction === 'approve' ? 'Advisor approved successfully' : 'Application rejected successfully',
        {
          description: reviewAction === 'approve'
            ? `${selectedApplication.display_name} has been approved as an advisor`
            : `Application from ${selectedApplication.display_name} has been rejected`
        }
      )

      setShowReviewDialog(false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process review'
      toast.error(`Failed to ${reviewAction} advisor`, {
        description: errorMessage
      })
    } finally {
      setProcessingReview(false)
    }
  }

  const getVerificationBadge = (status?: string) => {
    if (!status) return null

    const badges = {
      verified: <Badge variant="default" className="bg-green-500">Verified</Badge>,
      unverified: <Badge variant="destructive">Unverified</Badge>,
      pending: <Badge variant="secondary">Pending Verification</Badge>
    }

    return badges[status as keyof typeof badges]
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: <Badge variant="secondary">Pending Review</Badge>,
      approved: <Badge variant="default" className="bg-green-500">Approved</Badge>,
      rejected: <Badge variant="destructive">Rejected</Badge>
    }

    return badges[status as keyof typeof badges]
  }

  const filteredApplications = applications.filter(app => {
    if (activeTab === 'pending') return app.status === 'pending'
    if (activeTab === 'approved') return app.status === 'approved'
    if (activeTab === 'rejected') return app.status === 'rejected'
    return true
  })

  // Debug logging - reduced for cleaner console
  // if (process.env.NODE_ENV === 'development' && applications.length !== filteredApplications.length) {
  //   console.log(`Tab: ${activeTab} | Total: ${applications.length} | Filtered: ${filteredApplications.length}`)
  // }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading advisor data...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Unable to load advisor data</h3>
              <p className="text-muted-foreground mt-1">{error}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="mt-2"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Metrics Overview */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.total_applications}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.pending_review} pending review
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
              <ThumbsUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.approval_rate}%</div>
              <p className="text-xs text-muted-foreground">
                {metrics.approved_this_month} approved this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Advisors</CardTitle>
              <UserCheck className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.active_advisors}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.top_performing} top performers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Review Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.average_review_time > 0
                  ? `${metrics.average_review_time} days`
                  : 'N/A'
                }
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics.average_review_time > 0
                  ? 'Time to decision'
                  : 'Data not available'
                }
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending">
            Pending
            {applications.filter(a => a.status === 'pending').length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {applications.filter(a => a.status === 'pending').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Applications List */}
        {['pending', 'approved', 'rejected'].includes(activeTab) && (
          <TabsContent value={activeTab} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Advisor Applications</CardTitle>
                <CardDescription>
                  Review and manage advisor applications
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Advisor</TableHead>
                        <TableHead>Skills & Expertise</TableHead>
                        <TableHead>Experience</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredApplications.map((application) => (
                        <TableRow key={application.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{application.display_name}</div>
                              <div className="text-sm text-foreground">{application.email}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  <Globe className="h-3 w-3 mr-1" />
                                  {application.country_code}
                                </Badge>
                                {getVerificationBadge(application.verification_status)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {application.specialties.slice(0, 2).map((specialty) => (
                                  <Badge key={specialty} variant="secondary" className="text-xs">
                                    {specialty}
                                  </Badge>
                                ))}
                                {application.specialties.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{application.specialties.length - 2}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-foreground">
                                {application.languages.join(', ')}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Briefcase className="h-3 w-3" />
                              <span className="text-sm">{application.years_experience} years</span>
                            </div>
                            <div className="text-xs text-foreground mt-1">
                              {application.availability.replace('_', ' ')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">${application.hourly_rate}/hr</div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {getStatusBadge(application.status)}
                              {application.reviewed_at && (
                                <div className="text-xs text-foreground">
                                  {formatDistanceToNow(new Date(application.reviewed_at), { addSuffix: true })}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedApplication(application)
                                  setShowViewDialog(true)
                                }}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                View
                              </Button>
                              {canApproveAdvisors && application.status === 'pending' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleReviewApplication(application, 'approve')}
                                  >
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleReviewApplication(application, 'reject')}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Advisors</CardTitle>
              <CardDescription>
                Monitor advisor performance and client satisfaction
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topAdvisors.map((advisor) => (
                  <div key={advisor.advisor_id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-medium text-lg">{advisor.advisor_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {advisor.specialties.join(' • ')}
                        </div>
                      </div>
                      <Badge variant="default" className="bg-green-500">
                        <Award className="h-3 w-3 mr-1" />
                        Top Performer
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Rating</div>
                        <div className="flex items-center gap-1 mt-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{advisor.average_rating}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Consultations</div>
                        <div className="font-medium mt-1">{advisor.total_consultations}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Completion Rate</div>
                        <div className="font-medium mt-1">{advisor.completion_rate}%</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Revenue</div>
                        <div className="font-medium mt-1">${advisor.revenue_generated.toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Client Satisfaction</span>
                        <span className="font-medium">{advisor.client_satisfaction}%</span>
                      </div>
                      <Progress value={advisor.client_satisfaction} className="h-2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Dialog - Fixed background and added profile info */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>Advisor Details</DialogTitle>
            <DialogDescription>
              View detailed information for {selectedApplication?.display_name}
            </DialogDescription>
          </DialogHeader>
          {selectedApplication && (
            <div className="space-y-4">
              {/* Profile section with image and links */}
              <div className="flex items-start gap-6 pb-4 border-b">
                {/* Profile Image */}
                <div className="flex-shrink-0">
                  {selectedApplication.profile_image ? (
                    <img
                      src={selectedApplication.profile_image}
                      alt={selectedApplication.display_name}
                      className="w-24 h-24 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
                      <UserCheck className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                </div>
                
                {/* Profile Info and Links */}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{selectedApplication.display_name}</h3>
                  <p className="text-sm text-foreground mb-3">{selectedApplication.email}</p>
                  
                  <div className="flex flex-wrap gap-2">
                    {/* View Profile Button */}
                    {selectedApplication.status === 'approved' && selectedApplication.slug && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/advisors/${selectedApplication.slug}`, '_blank')}
                      >
                        <Globe className="h-4 w-4 mr-2" />
                        View Public Profile
                      </Button>
                    )}
                    
                    {/* LinkedIn */}
                    {selectedApplication.linkedin_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(selectedApplication.linkedin_url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        LinkedIn
                      </Button>
                    )}
                    
                    {/* Portfolio */}
                    {selectedApplication.portfolio_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(selectedApplication.portfolio_url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Portfolio
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Bio Section */}
              {selectedApplication.bio && (
                <div>
                  <Label className="text-sm font-medium">Bio</Label>
                  <p className="text-sm text-foreground mt-1">
                    {selectedApplication.bio}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Name</Label>
                  <p className="text-sm text-foreground">{selectedApplication.display_name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Email</Label>
                  <p className="text-sm text-foreground">{selectedApplication.email || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className="text-sm text-foreground">{getStatusBadge(selectedApplication.status)}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Experience</Label>
                  <p className="text-sm text-foreground">{selectedApplication.years_experience} years</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Country</Label>
                  <p className="text-sm text-foreground">{selectedApplication.country_code || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Availability</Label>
                  <p className="text-sm text-foreground">{selectedApplication.availability?.replace('_', ' ') || 'N/A'}</p>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Specialties</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedApplication.specialties?.map((specialty, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {specialty}
                    </Badge>
                  )) || <span className="text-sm text-foreground">None</span>}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Languages</Label>
                <p className="text-sm text-foreground">
                  {selectedApplication.languages?.join(', ') || 'N/A'}
                </p>
              </div>

              {selectedApplication.notes && (
                <div>
                  <Label className="text-sm font-medium">Notes</Label>
                  <p className="text-sm text-foreground">{selectedApplication.notes}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Submitted</Label>
                  <p className="text-sm text-foreground">
                    {selectedApplication.submitted_at ? new Date(selectedApplication.submitted_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                {selectedApplication.reviewed_at && (
                  <div>
                    <Label className="text-sm font-medium">Reviewed</Label>
                    <p className="text-sm text-foreground">
                      {new Date(selectedApplication.reviewed_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowViewDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approve' ? 'Approve Advisor' : 'Reject Application'}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === 'approve'
                ? `Approve ${selectedApplication?.display_name} as an advisor on the platform`
                : `Reject the application from ${selectedApplication?.display_name}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>
                {reviewAction === 'approve' ? 'Approval Notes' : 'Rejection Reason'}
              </Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  reviewAction === 'approve'
                    ? 'Optional notes about this approval...'
                    : 'Please provide a reason for rejection...'
                }
                className="mt-2"
                rows={4}
              />
            </div>

            {reviewAction === 'reject' && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  The applicant will receive an email with the rejection reason.
                  Please be professional and constructive in your feedback.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReviewDialog(false)}
              disabled={processingReview}
            >
              Cancel
            </Button>
            <Button
              variant={reviewAction === 'approve' ? 'default' : 'destructive'}
              onClick={handleConfirmReview}
              disabled={processingReview || (reviewAction === 'reject' && !reviewNotes.trim())}
            >
              {processingReview && <RefreshCw className="h-4 w-4 animate-spin mr-2" />}
              {reviewAction === 'approve' ? 'Approve Advisor' : 'Reject Application'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
