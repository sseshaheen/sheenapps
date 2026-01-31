/**
 * Advisor Availability API Client
 *
 * Following CLAUDE.md patterns:
 * - Comprehensive error handling with taxonomy
 * - Correlation tracking with UUIDs
 * - Timeout/retry logic via apiFetch
 * - Cache-busting timestamps
 */

import { apiFetch } from '@/lib/client/api-fetch'
import type {
  AvailabilityApiResponse,
  AvailabilityUpdateRequest,
  AvailabilityWindow,
  AvailabilityException,
  AdvisorCapacity,
  AvailabilityStatus
} from '@/types/advisor-availability'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

export class AvailabilityError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public correlationId?: string
  ) {
    super(message)
    this.name = 'AvailabilityError'
  }
}

class AdvisorAvailabilityApiClient {
  /**
   * Get advisor availability data
   */
  async getAdvisorAvailability(userId: string): Promise<AvailabilityApiResponse> {
    const correlationId = uuidv4()

    try {
      logger.debug('api', `Fetching advisor availability - userId: ${userId}, correlationId: ${correlationId}`)

      // Backend expects: GET /api/advisor-matching/availability?userId=string
      const response = await apiFetch<AvailabilityApiResponse>(
        `/api/advisor-matching/availability?userId=${userId}&t=${Date.now()}`,
        {
          method: 'GET',
          headers: {
            'X-Correlation-Id': correlationId,
            'Cache-Control': 'no-cache'
          },
          cache: 'no-store'
        }
      )

      logger.info(`Advisor availability fetched successfully - userId: ${userId}, correlationId: ${correlationId}, windows: ${response.windows?.length || 0}, exceptions: ${response.exceptions?.length || 0}`)

      return response

    } catch (error) {
      logger.error(`Failed to fetch advisor availability - userId: ${userId}, correlationId: ${correlationId}, error: ${error instanceof Error ? error.message : 'Unknown error'}`)

      if (error instanceof Error) {
        throw new AvailabilityError(
          `Failed to load availability: ${error.message}`,
          'FETCH_FAILED',
          500,
          correlationId
        )
      }

      throw new AvailabilityError(
        'Failed to load availability due to unknown error',
        'UNKNOWN_ERROR',
        500,
        correlationId
      )
    }
  }

  /**
   * Update advisor availability
   */
  async updateAdvisorAvailability(
    userId: string,
    updates: AvailabilityUpdateRequest
  ): Promise<{ success: boolean; correlationId: string }> {
    const correlationId = uuidv4()
    const idempotencyKey = uuidv4()

    try {
      logger.debug('api', `Updating advisor availability - userId: ${userId}, correlationId: ${correlationId}, hasWindows: ${!!updates.windows}, hasExceptions: ${!!updates.exceptions}, hasCapacity: ${!!updates.capacity}`)

      // Backend expects: PUT /api/advisor-matching/availability?userId=string
      await apiFetch(
        `/api/advisor-matching/availability?userId=${userId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-Id': correlationId,
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify(updates)
        }
      )

      logger.info(`Advisor availability updated successfully - userId: ${userId}, correlationId: ${correlationId}, idempotencyKey: ${idempotencyKey}`)

      return { success: true, correlationId }

    } catch (error) {
      logger.error(`Failed to update advisor availability - userId: ${userId}, correlationId: ${correlationId}, error: ${error instanceof Error ? error.message : 'Unknown error'}`)

      if (error instanceof Error) {
        throw new AvailabilityError(
          `Failed to update availability: ${error.message}`,
          'UPDATE_FAILED',
          500,
          correlationId
        )
      }

      throw new AvailabilityError(
        'Failed to update availability due to unknown error',
        'UNKNOWN_ERROR',
        500,
        correlationId
      )
    }
  }

  /**
   * Add availability window (use updateAdvisorAvailability instead)
   * @deprecated Use updateAdvisorAvailability with windows array
   */
  async addAvailabilityWindow(
    userId: string,
    window: Omit<AvailabilityWindow, 'id' | 'advisor_id' | 'created_at' | 'updated_at'>
  ): Promise<{ success: boolean; windowId: string; correlationId: string }> {
    const correlationId = uuidv4()

    try {
      logger.debug('api', `Adding availability window via update endpoint - userId: ${userId}, correlationId: ${correlationId}, dayOfWeek: ${window.day_of_week}, startTime: ${window.start_time}, endTime: ${window.end_time}`)

      // Get current availability first
      const currentAvailability = await this.getAdvisorAvailability(userId)

      // Add new window to existing windows
      const updatedWindows = [...(currentAvailability.windows || []), window]

      // Update via main availability endpoint
      await this.updateAdvisorAvailability(userId, { windows: updatedWindows })

      // Generate a temporary window ID for compatibility
      const windowId = uuidv4()

      logger.info(`Availability window added successfully - userId: ${userId}, correlationId: ${correlationId}, windowId: ${windowId}`)

      return {
        success: true,
        windowId,
        correlationId
      }

    } catch (error) {
      logger.error(`Failed to add availability window - userId: ${userId}, correlationId: ${correlationId}, error: ${error instanceof Error ? error.message : 'Unknown error'}`)

      if (error instanceof Error) {
        throw new AvailabilityError(
          `Failed to add availability window: ${error.message}`,
          'ADD_WINDOW_FAILED',
          500,
          correlationId
        )
      }

      throw new AvailabilityError(
        'Failed to add availability window due to unknown error',
        'UNKNOWN_ERROR',
        500,
        correlationId
      )
    }
  }

  /**
   * Remove availability window via main availability endpoint
   */
  async removeAvailabilityWindow(
    advisorId: string,
    windowId: string
  ): Promise<{ success: boolean; correlationId: string }> {
    const correlationId = uuidv4()

    try {
      logger.debug('api', `Removing availability window via main endpoint - advisorId: ${advisorId}, windowId: ${windowId}, correlationId: ${correlationId}`)

      // Get current availability first
      const currentAvailability = await this.getAdvisorAvailability(advisorId)

      // Remove the specific window by filtering out the windowId
      const updatedWindows = (currentAvailability.windows || []).filter(
        window => window.id !== windowId
      )

      // Update via main availability endpoint
      await this.updateAdvisorAvailability(advisorId, {
        windows: updatedWindows
      })

      logger.info(`Availability window removed successfully via main endpoint - advisorId: ${advisorId}, windowId: ${windowId}, correlationId: ${correlationId}, remainingWindows: ${updatedWindows.length}`)

      return { success: true, correlationId }

    } catch (error) {
      logger.error(`Failed to remove availability window - advisorId: ${advisorId}, windowId: ${windowId}, correlationId: ${correlationId}, error: ${error instanceof Error ? error.message : 'Unknown error'}`)

      if (error instanceof Error) {
        throw new AvailabilityError(
          `Failed to remove availability window: ${error.message}`,
          'REMOVE_WINDOW_FAILED',
          500,
          correlationId
        )
      }

      throw new AvailabilityError(
        'Failed to remove availability window due to unknown error',
        'UNKNOWN_ERROR',
        500,
        correlationId
      )
    }
  }

  /**
   * Check current availability status via main availability endpoint
   */
  async getAvailabilityStatus(advisorId: string): Promise<AvailabilityStatus> {
    const correlationId = uuidv4()

    try {
      logger.debug('api', `Checking availability status via main endpoint - advisorId: ${advisorId}, correlationId: ${correlationId}`)

      // Get full availability data from main endpoint
      const availabilityData = await this.getAdvisorAvailability(advisorId)

      // Extract status information from the availability response
      const status: AvailabilityStatus = {
        is_available: availabilityData.is_available || false,
        status_reason: (availabilityData.status_reason as 'available' | 'at_capacity' | 'unavailable_schedule' | 'manual_pause') || 'unavailable_schedule',
        current_projects: availabilityData.current_projects || 0,
        max_concurrent_projects: availabilityData.capacity?.max_concurrent_projects || 0,
        next_available_at: availabilityData.next_available_at || null,
        last_updated: availabilityData.last_updated || new Date().toISOString()
      }

      logger.info(`Availability status derived from main endpoint - advisorId: ${advisorId}, correlationId: ${correlationId}, isAvailable: ${status.is_available}, statusReason: ${status.status_reason}, currentProjects: ${status.current_projects}, maxProjects: ${status.max_concurrent_projects}`)

      return status

    } catch (error) {
      logger.error(`Failed to check availability status - advisorId: ${advisorId}, correlationId: ${correlationId}, error: ${error instanceof Error ? error.message : 'Unknown error'}`)

      if (error instanceof Error) {
        throw new AvailabilityError(
          `Failed to check availability status: ${error.message}`,
          'STATUS_CHECK_FAILED',
          500,
          correlationId
        )
      }

      throw new AvailabilityError(
        'Failed to check availability status due to unknown error',
        'UNKNOWN_ERROR',
        500,
        correlationId
      )
    }
  }
}

// Export singleton instance
export const advisorAvailabilityApi = new AdvisorAvailabilityApiClient()

// Export error class
