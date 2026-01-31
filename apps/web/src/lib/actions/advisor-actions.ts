/**
 * Server Actions for Advisor Network
 * Provides secure server-side operations for client components
 * Follows existing authentication patterns
 */

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAdvisorClient } from '@/services/advisor-api-client';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import type {
  AdvisorSearchRequest,
  AdvisorApplicationRequest,
  BookConsultationRequest,
  Advisor,
  Consultation,
  AdvisorEarnings,
  LocalizedPricing
} from '@/types/advisor-network';
import { logger } from '@/utils/logger';
import { ROUTES } from '@/i18n/routes';

/**
 * Get authenticated user ID from server session
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClientNew();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }
    
    return user.id;
  } catch (error) {
    logger.error('Failed to get current user ID:', error);
    return null;
  }
}

/**
 * Ensure user is authenticated, redirect to login if not
 */
async function requireAuth(): Promise<string> {
  const userId = await getCurrentUserId();
  
  if (!userId) {
    redirect('/auth/login?redirect=/advisors');
  }
  
  return userId;
}

// ==========================================
// Public Actions (No Authentication Required)
// ==========================================

/**
 * Get consultation pricing for a specific locale (optionally for specific advisor)
 */
export async function getConsultationPricingAction(
  locale = 'en',
  advisorUserId?: string
): Promise<{ success: boolean; data?: LocalizedPricing; error?: string }> {
  try {
    // EXPERT FIX: Return mock pricing data in test mode
    if (process.env.TEST_E2E === '1') {
      const mockPricing: LocalizedPricing = {
        locale: 'en',
        currency: 'USD',
        advisor_pricing_model: 'platform_fixed',
        platform_fee_percentage: 30,
        prices: {
          duration_15: {
            amount_cents: 900,
            display: '$9.00',
            is_free: false
          },
          duration_30: {
            amount_cents: 1900,
            display: '$19.00',
            is_free: false
          },
          duration_60: {
            amount_cents: 3500,
            display: '$35.00',
            is_free: false
          }
        }
      };
      
      logger.info('🧪 Using mock pricing data for test mode');
      return { success: true, data: mockPricing };
    }

    const advisorClient = getAdvisorClient();
    const pricing = await advisorClient.getConsultationPricing(locale, advisorUserId);
    
    return { success: true, data: pricing };
  } catch (error) {
    logger.error('Failed to get consultation pricing:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get pricing'
    };
  }
}

/**
 * Search for advisors with filters
 */
export async function searchAdvisorsAction(
  request: AdvisorSearchRequest
): Promise<{ success: boolean; data?: { advisors: Advisor[]; total: number; hasMore: boolean }; error?: string }> {
  try {
    const advisorClient = getAdvisorClient();
    const result = await advisorClient.searchAdvisors(request);
    
    return { 
      success: true, 
      data: {
        advisors: result.advisors,
        total: result.total,
        hasMore: result.has_more
      }
    };
  } catch (error) {
    logger.error('Failed to search advisors:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to search advisors'
    };
  }
}

/**
 * Get specific advisor profile (public)
 */
export async function getAdvisorProfileAction(
  advisorUserId: string,
  locale = 'en'
): Promise<{ success: boolean; data?: Advisor; error?: string }> {
  try {
    // EXPERT FIX: Return mock data in test mode
    if (process.env.TEST_E2E === '1') {
      const mockAdvisor: Advisor = {
        id: 'advisor-1',
        user_id: advisorUserId,
        display_name: 'Sarah Chen',
        specialties: [
          { key: 'web-development', label: 'Web Development' },
          { key: 'react', label: 'React Development' },
          { key: 'typescript', label: 'TypeScript Development' }
        ],
        languages: ['English'],
        approval_status: 'approved',
        country_code: 'US',
        skills: ['React', 'TypeScript', 'JavaScript', 'Node.js', 'Next.js'],
        rating: 4.9,
        review_count: 124,
        years_experience: 8,
        is_accepting_bookings: true,
        booking_status: 'available',
        hourly_rate: 150,
        avatar_url: null,
        bio: 'Senior React developer with expertise in TypeScript and modern web development. Passionate about helping teams build scalable applications.',
        pricing_mode: 'platform',
        created_at: '2024-01-01T00:00:00Z',
        timezone: 'America/New_York'
      };
      
      logger.info('🧪 Using mock advisor data for test mode');
      return { success: true, data: mockAdvisor };
    }

    const advisorClient = getAdvisorClient();
    const advisor = await advisorClient.getAdvisor(advisorUserId, locale);
    
    return { success: true, data: advisor };
  } catch (error) {
    logger.error('Failed to get advisor profile:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get advisor profile'
    };
  }
}

// ==========================================
// Authenticated User Actions
// ==========================================

/**
 * Submit advisor application
 */
export async function submitAdvisorApplicationAction(
  request: AdvisorApplicationRequest
): Promise<{ success: boolean; data?: { applicationId: string }; error?: string }> {
  try {
    const userId = await requireAuth();
    const advisorClient = getAdvisorClient();
    
    const result = await advisorClient.submitAdvisorApplication(request, userId);
    
    // Revalidate advisor pages
    revalidatePath('/advisor');
    revalidatePath('/advisor/join');
    revalidatePath('/admin/advisors');
    
    return { 
      success: true, 
      data: { applicationId: result.application_id }
    };
  } catch (error) {
    logger.error('Failed to submit advisor application:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to submit application'
    };
  }
}

/**
 * Get current user's advisor profile
 */
export async function getMyAdvisorProfileAction(): Promise<{ success: boolean; data?: Advisor; error?: string }> {
  try {
    const userId = await requireAuth();
    const advisorClient = getAdvisorClient();
    
    const advisor = await advisorClient.getAdvisorProfile(userId);
    
    return { success: true, data: advisor };
  } catch (error) {
    logger.error('Failed to get advisor profile:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get advisor profile'
    };
  }
}

/**
 * Update advisor profile
 */
export async function updateAdvisorProfileAction(
  updates: Partial<Advisor>
): Promise<{ success: boolean; data?: Advisor; error?: string }> {
  try {
    const userId = await requireAuth();
    const advisorClient = getAdvisorClient();
    
    const updatedAdvisor = await advisorClient.updateAdvisorProfile(updates, userId);
    
    // Revalidate advisor pages
    revalidatePath('/advisor');
    revalidatePath('/advisor/join');
    revalidatePath('/advisor/profile');
    revalidatePath('/advisors');
    
    return { success: true, data: updatedAdvisor };
  } catch (error) {
    logger.error('Failed to update advisor profile:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update profile'
    };
  }
}

/**
 * Update advisor booking availability
 */
export async function updateBookingStatusAction(
  isAcceptingBookings: boolean
): Promise<{ success: boolean; data?: { isAcceptingBookings: boolean }; error?: string }> {
  try {
    const userId = await requireAuth();
    const advisorClient = getAdvisorClient();
    
    const result = await advisorClient.updateBookingStatus(isAcceptingBookings, userId);
    
    // Revalidate advisor pages
    revalidatePath('/advisor');
    revalidatePath('/advisor/join');
    revalidatePath('/advisors');
    
    return { 
      success: true, 
      data: { isAcceptingBookings: result.is_accepting_bookings }
    };
  } catch (error) {
    logger.error('Failed to update booking status:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update booking status'
    };
  }
}

/**
 * Get advisor earnings summary
 */
export async function getAdvisorEarningsAction(): Promise<{ success: boolean; data?: AdvisorEarnings; error?: string }> {
  try {
    const userId = await requireAuth();
    const advisorClient = getAdvisorClient();
    
    const earnings = await advisorClient.getAdvisorEarnings(userId);
    
    return { success: true, data: earnings };
  } catch (error) {
    logger.error('Failed to get advisor earnings:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get earnings'
    };
  }
}

/**
 * Book a consultation
 */
export async function bookConsultationAction(
  request: BookConsultationRequest
): Promise<{ success: boolean; data?: { consultationId: string; clientSecret?: string; requiresPayment: boolean }; error?: string }> {
  try {
    const userId = await requireAuth();
    const advisorClient = getAdvisorClient();
    
    const result = await advisorClient.bookConsultation(request, userId);
    
    // Revalidate consultation pages
    revalidatePath('/consultations');
    revalidatePath('/advisor/consultations');
    
    return { 
      success: true, 
      data: {
        consultationId: result.consultation_id,
        clientSecret: result.client_secret,
        requiresPayment: result.requires_payment
      }
    };
  } catch (error) {
    logger.error('Failed to book consultation:', error);
    
    // Handle specific booking errors
    if (error instanceof Error && error.name === 'AdvisorBookingError') {
      const bookingError = error as any;
      if (bookingError.code === 'INSUFFICIENT_BALANCE') {
        return {
          success: false,
          error: 'Insufficient credits to book consultation. Please add more credits.',
          // Could add redirect to billing here
        };
      }
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to book consultation'
    };
  }
}

/**
 * Get consultation details
 */
export async function getConsultationAction(
  consultationId: string
): Promise<{ success: boolean; data?: Consultation; error?: string }> {
  try {
    const userId = await requireAuth();
    const advisorClient = getAdvisorClient();
    
    const consultation = await advisorClient.getConsultation(consultationId, userId);
    
    return { success: true, data: consultation };
  } catch (error) {
    logger.error('Failed to get consultation:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get consultation details'
    };
  }
}

/**
 * Cancel a consultation
 */
export async function cancelConsultationAction(
  consultationId: string,
  reason: string
): Promise<{ success: boolean; data?: { refundIssued: boolean; refundAmount?: number; message: string }; error?: string }> {
  try {
    const userId = await requireAuth();
    const advisorClient = getAdvisorClient();
    
    const result = await advisorClient.cancelConsultation(consultationId, reason, userId);
    
    // Revalidate consultation pages
    revalidatePath('/consultations');
    revalidatePath('/advisor/consultations');
    
    return { 
      success: true, 
      data: {
        refundIssued: result.refund_issued,
        refundAmount: result.refund_amount_cents,
        message: result.message
      }
    };
  } catch (error) {
    logger.error('Failed to cancel consultation:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to cancel consultation'
    };
  }
}

/**
 * Submit consultation review
 */
export async function submitConsultationReviewAction(
  consultationId: string,
  review: {
    rating: number;
    reviewText?: string;
    expertiseRating?: number;
    communicationRating?: number;
    helpfulnessRating?: number;
  }
): Promise<{ success: boolean; data?: { reviewId: string }; error?: string }> {
  try {
    const userId = await requireAuth();
    const advisorClient = getAdvisorClient();
    
    const result = await advisorClient.submitConsultationReview(
      consultationId,
      {
        rating: review.rating,
        review_text: review.reviewText,
        expertise_rating: review.expertiseRating,
        communication_rating: review.communicationRating,
        helpfulness_rating: review.helpfulnessRating
      },
      userId
    );
    
    // Revalidate relevant pages
    revalidatePath('/consultations');
    revalidatePath('/advisors');
    
    return { 
      success: true, 
      data: { reviewId: result.review_id }
    };
  } catch (error) {
    logger.error('Failed to submit consultation review:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to submit review'
    };
  }
}

// ==========================================
// Admin Actions
// ==========================================

/**
 * Get advisor applications for admin review
 */
export async function getAdvisorApplicationsAction(
  status?: 'pending' | 'approved' | 'rejected'
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    // ✅ BACKEND CONFIRMED: Add admin role check using existing system
    const userId = await requireAuth();

    // Validate admin permissions
    const { isAdmin } = await import('@/lib/admin-auth');
    const adminStatus = await isAdmin(userId);

    if (!adminStatus) {
      return { success: false, error: 'Admin permissions required' };
    }

    const advisorClient = getAdvisorClient();
    
    const applications = await advisorClient.getAdvisorApplications(status, userId);
    
    return { success: true, data: applications };
  } catch (error) {
    logger.error('Failed to get advisor applications:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get applications'
    };
  }
}

/**
 * Approve or reject advisor application
 */
export async function reviewAdvisorApplicationAction(
  advisorTableId: string, // Admin endpoint - uses advisor table ID, not user_id
  action: 'approve' | 'reject',
  adminNotes?: string
): Promise<{ success: boolean; data?: { message: string }; error?: string }> {
  try {
    // ✅ BACKEND CONFIRMED: Add admin role check using existing system
    const userId = await requireAuth();

    // Validate admin permissions
    const { isAdmin } = await import('@/lib/admin-auth');
    const adminStatus = await isAdmin(userId);

    if (!adminStatus) {
      return { success: false, error: 'Admin permissions required' };
    }

    const advisorClient = getAdvisorClient();
    
    const result = await advisorClient.reviewAdvisorApplication(
      advisorTableId,
      action,
      adminNotes,
      userId
    );
    
    // Revalidate admin pages
    revalidatePath('/admin/advisors');
    revalidatePath('/advisors'); // Also update public advisor listing
    
    return { 
      success: true, 
      data: { message: result.message }
    };
  } catch (error) {
    logger.error('Failed to review advisor application:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to review application'
    };
  }
}

// Alias for dashboard component compatibility
export const updateAdvisorAvailabilityAction = updateBookingStatusAction;