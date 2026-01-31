import * as crypto from 'crypto';
import { ServerLoggingService } from './serverLoggingService';
import { pool, getPool } from './databaseWrapper';
import { SanityService } from './sanityService';

/**
 * Sanity Webhook Service
 * Handles webhook signature validation, deduplication, and event processing
 * Implements timing-safe validation and efficient event storage
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface SanityWebhookEvent {
  id: string;
  connection_id: string;
  event_id?: string;
  event_type: string;
  webhook_id?: string;
  document_id?: string;
  document_type?: string;
  previous_revision?: string;
  current_revision?: string;
  groq_query?: string;
  projection?: Record<string, any>;
  payload: Record<string, any>;
  raw_payload_url?: string;
  processed: boolean;
  processed_at?: Date;
  error_message?: string;
  retry_count: number;
  created_at: Date;
}

export interface SanityWebhookPayload {
  _type: string;
  _id: string;
  _rev?: string;
  _createdAt?: string;
  _updatedAt?: string;
  // Dynamic fields based on document type
  [key: string]: any;
}

export interface ProcessWebhookResult {
  success: boolean;
  event_id?: string;
  message: string;
  duplicate?: boolean;
  error?: string;
}

// =============================================================================
// WEBHOOK SERVICE CLASS
// =============================================================================

export class SanityWebhookService {
  private static instance: SanityWebhookService;
  private readonly loggingService: ServerLoggingService;
  private readonly database = pool;
  private readonly sanityService: SanityService;

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
    this.sanityService = SanityService.getInstance();
  }

  static getInstance(): SanityWebhookService {
    if (!SanityWebhookService.instance) {
      SanityWebhookService.instance = new SanityWebhookService();
    }
    return SanityWebhookService.instance;
  }

  // =============================================================================
  // WEBHOOK SIGNATURE VALIDATION
  // =============================================================================

  /**
   * Verify Sanity webhook signature using timing-safe comparison
   * Follows security best practices to prevent timing attacks
   */
  verifySanitySignature(rawBody: Buffer, secret: string, header?: string): boolean {
    if (!header) {
      return false;
    }

    try {
      // Extract signature from header (format: "sha256=<signature>")
      const signature = header.replace(/^sha256=/, '');
      
      // Compute expected signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      // Use timing-safe comparison
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const actualBuffer = Buffer.from(signature, 'hex');

      return expectedBuffer.length === actualBuffer.length && 
             crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch (error) {
      this.loggingService.logServerEvent(
        'error',
        'error',
        'Sanity webhook signature verification failed',
        { error: (error as Error).message }
      );
      return false;
    }
  }

  // =============================================================================
  // WEBHOOK PROCESSING
  // =============================================================================

  /**
   * Process incoming Sanity webhook
   */
  async processWebhook(params: {
    connection_id: string;
    payload: any;
    headers: Record<string, string>;
    rawBody: Buffer;
  }): Promise<ProcessWebhookResult> {
    const { connection_id, payload, headers, rawBody } = params;

    try {
      // Get connection to validate webhook secret
      const connection = await this.sanityService.getConnection(connection_id);
      if (!connection) {
        return {
          success: false,
          message: 'Connection not found',
          error: 'INVALID_CONNECTION'
        };
      }

      // Verify webhook signature
      const signature = headers['x-sanity-signature'] || headers['X-Sanity-Signature'];
      if (!this.verifySanitySignature(rawBody, connection.webhook_secret!, signature)) {
        await this.loggingService.logServerEvent(
          'error',
          'error',
          'Sanity webhook signature verification failed',
          { connection_id, has_signature: !!signature }
        );

        return {
          success: false,
          message: 'Invalid webhook signature',
          error: 'INVALID_SIGNATURE'
        };
      }

      // Extract event details
      const eventId = this.extractEventId(payload, headers);
      const eventType = this.extractEventType(payload);
      const documentId = payload._id;
      const documentType = payload._type;

      // Check for duplicate events
      if (eventId && await this.isDuplicateEvent(connection_id, eventId)) {
        return {
          success: true,
          message: 'Event already processed',
          duplicate: true,
          event_id: eventId
        };
      }

      // Store webhook event
      const webhookEvent = await this.storeWebhookEvent({
        connection_id,
        event_id: eventId,
        event_type: eventType,
        webhook_id: headers['x-sanity-webhook-id'],
        document_id: documentId,
        document_type: documentType,
        previous_revision: this.extractPreviousRevision(payload),
        current_revision: payload._rev,
        groq_query: headers['x-sanity-groq-query'],
        projection: this.extractProjection(headers),
        payload,
        raw_payload_url: await this.storeRawPayload(rawBody, connection_id, eventId)
      });

      // Process event asynchronously
      this.processEventAsync(webhookEvent.id).catch(error => {
        this.loggingService.logServerEvent(
          'error',
          'error',
          'Async webhook event processing failed',
          { webhook_event_id: webhookEvent.id, error: error.message }
        );
      });

      // Update connection's last webhook event ID for replay cursor
      await this.updateConnectionWebhookCursor(connection_id, eventId);

      await this.loggingService.logServerEvent(
        'error',
        'info',
        'Sanity webhook processed successfully',
        {
          connection_id,
          event_id: eventId,
          event_type: eventType,
          document_id: documentId,
          document_type: documentType
        }
      );

      return {
        success: true,
        message: 'Webhook processed successfully',
        event_id: webhookEvent.id
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'sanity_webhook_processing_failed',
        error as Error,
        { connection_id }
      );

      return {
        success: false,
        message: 'Webhook processing failed',
        error: (error as Error).message
      };
    }
  }

  // =============================================================================
  // EVENT STORAGE & DEDUPLICATION
  // =============================================================================

  /**
   * Store webhook event in database
   */
  private async storeWebhookEvent(params: {
    connection_id: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    event_id?: string | undefined;
    event_type: string;
    webhook_id?: string | undefined;
    document_id?: string | undefined;
    document_type?: string | undefined;
    previous_revision?: string | undefined;
    current_revision?: string | undefined;
    groq_query?: string | undefined;
    projection?: Record<string, any> | undefined;
    payload: any;
    raw_payload_url?: string | undefined;
  }): Promise<SanityWebhookEvent> {
    const query = `
      INSERT INTO sanity_webhook_events (
        connection_id, event_id, event_type, webhook_id,
        document_id, document_type, previous_revision, current_revision,
        groq_query, projection, payload, raw_payload_url,
        processed, retry_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, 0
      ) RETURNING *
    `;

    const values = [
      params.connection_id,
      params.event_id,
      params.event_type,
      params.webhook_id,
      params.document_id,
      params.document_type,
      params.previous_revision,
      params.current_revision,
      params.groq_query,
      params.projection ? JSON.stringify(params.projection) : null,
      JSON.stringify(params.payload),
      params.raw_payload_url
    ];

    const result = await getPool()!.query(query, values);
    return this.mapWebhookEventFromDb(result.rows[0]);
  }

  /**
   * Check if event is duplicate using separate deduplication table
   */
  private async isDuplicateEvent(connection_id: string, event_id: string): Promise<boolean> {
    try {
      const result = await getPool()!.query(
        'SELECT 1 FROM sanity_webhook_dedup WHERE connection_id = $1 AND event_id = $2',
        [connection_id, event_id]
      );

      return result.rows.length > 0;
    } catch (error) {
      // Log error but don't fail webhook processing
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to check for duplicate webhook event',
        { connection_id, event_id, error: (error as Error).message }
      );
      return false;
    }
  }

  /**
   * Store event ID in deduplication table
   */
  private async recordEventForDeduplication(connection_id: string, event_id: string): Promise<void> {
    try {
      await getPool()!.query(
        'INSERT INTO sanity_webhook_dedup (connection_id, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [connection_id, event_id]
      );
    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to record event for deduplication',
        { connection_id, event_id, error: (error as Error).message }
      );
    }
  }

  // =============================================================================
  // EVENT PROCESSING
  // =============================================================================

  /**
   * Process webhook event asynchronously
   */
  private async processEventAsync(webhook_event_id: string): Promise<void> {
    try {
      const event = await this.getWebhookEvent(webhook_event_id);
      if (!event) {
        throw new Error('Webhook event not found');
      }

      // Record event for deduplication if we have an event ID
      if (event.event_id) {
        await this.recordEventForDeduplication(event.connection_id, event.event_id);
      }

      // Sync the document from the webhook payload
      await this.syncDocumentFromWebhook(event);

      // Invalidate related query caches
      await this.invalidateQueryCaches(event);

      // Mark event as processed
      await this.markEventProcessed(webhook_event_id);

      await this.loggingService.logServerEvent(
        'error',
        'info',
        'Webhook event processed successfully',
        { webhook_event_id, document_id: event.document_id }
      );

    } catch (error) {
      await this.markEventFailed(webhook_event_id, (error as Error).message);
      throw error;
    }
  }

  /**
   * Sync document from webhook payload
   */
  private async syncDocumentFromWebhook(event: SanityWebhookEvent): Promise<void> {
    if (!event.document_id || !event.document_type) {
      return; // Skip non-document events
    }

    const payload = event.payload as SanityWebhookPayload;

    // Determine if this is a draft or published document
    const isDraft = event.document_id.startsWith('drafts.');
    const canonicalId = event.document_id.replace(/^drafts\./, '');
    const versionType = isDraft ? 'draft' : 'published';

    // Compute content hash for change detection
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    // Upsert document record
    const query = `
      INSERT INTO sanity_documents (
        connection_id, document_id, document_type, revision_id,
        version_type, canonical_document_id, title, slug,
        language, content_hash, last_modified, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      ON CONFLICT (connection_id, document_id, version_type)
      DO UPDATE SET
        revision_id = EXCLUDED.revision_id,
        title = EXCLUDED.title,
        slug = EXCLUDED.slug,
        language = EXCLUDED.language,
        content_hash = EXCLUDED.content_hash,
        last_modified = EXCLUDED.last_modified,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    `;

    const values = [
      event.connection_id,
      event.document_id,
      event.document_type,
      event.current_revision,
      versionType,
      canonicalId,
      payload.title || payload._id,
      payload.slug?.current || null,
      payload.language || 'en',
      contentHash,
      payload._updatedAt ? new Date(payload._updatedAt) : new Date(),
      JSON.stringify({
        webhook_event_id: event.id,
        processed_at: new Date().toISOString(),
        ...payload
      })
    ];

    await getPool()!.query(query, values);
  }

  /**
   * Invalidate query caches related to the document
   */
  private async invalidateQueryCaches(event: SanityWebhookEvent): Promise<void> {
    if (!event.document_id) {
      return;
    }

    // Invalidate caches that depend on this document
    await getPool()!.query(`
      UPDATE sanity_query_cache 
      SET invalidated_at = NOW()
      WHERE connection_id = $1 
      AND (
        depends_on_documents @> ARRAY[$2] OR
        id IN (
          SELECT query_cache_id 
          FROM sanity_query_dependencies 
          WHERE document_id = $2
        )
      )
    `, [event.connection_id, event.document_id]);
  }

  // =============================================================================
  // EVENT STATUS MANAGEMENT
  // =============================================================================

  /**
   * Mark webhook event as processed
   */
  private async markEventProcessed(webhook_event_id: string): Promise<void> {
    await getPool()!.query(
      'UPDATE sanity_webhook_events SET processed = true, processed_at = NOW() WHERE id = $1',
      [webhook_event_id]
    );
  }

  /**
   * Mark webhook event as failed
   */
  private async markEventFailed(webhook_event_id: string, error_message: string): Promise<void> {
    await getPool()!.query(`
      UPDATE sanity_webhook_events 
      SET error_message = $2, retry_count = retry_count + 1, updated_at = NOW()
      WHERE id = $1
    `, [webhook_event_id, error_message]);
  }

  /**
   * Get webhook event by ID
   */
  private async getWebhookEvent(webhook_event_id: string): Promise<SanityWebhookEvent | null> {
    const result = await getPool()!.query(
      'SELECT * FROM sanity_webhook_events WHERE id = $1',
      [webhook_event_id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapWebhookEventFromDb(result.rows[0]);
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Update connection's webhook cursor for replay
   */
  private async updateConnectionWebhookCursor(connection_id: string, event_id?: string): Promise<void> {
    if (!event_id) {
      return;
    }

    await getPool()!.query(
      'UPDATE sanity_connections SET last_webhook_event_id = $1 WHERE id = $2',
      [event_id, connection_id]
    );
  }

  /**
   * Store raw webhook payload in R2/S3 with TTL
   */
  private async storeRawPayload(rawBody: Buffer, connection_id: string, event_id?: string): Promise<string | undefined> {
    try {
      // For now, we'll just return undefined
      // In production, this would upload to R2/S3 with a TTL
      // const key = `sanity-webhooks/${connection_id}/${event_id || Date.now()}.json`;
      // const url = await r2.upload(key, rawBody, { ttl: 90 * 24 * 60 * 60 }); // 90 days
      // return url;
      return undefined;
    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to store raw webhook payload',
        { connection_id, event_id, error: (error as Error).message }
      );
      return undefined;
    }
  }

  /**
   * Extract event ID from payload or headers
   */
  private extractEventId(payload: any, headers: Record<string, string>): string | undefined {
    return headers['x-sanity-webhook-event-id'] || 
           payload._eventId || 
           payload.eventId ||
           `${payload._id}-${payload._rev}`;
  }

  /**
   * Extract event type from payload
   */
  private extractEventType(payload: any): string {
    if (payload._deleted) {
      return 'document.delete';
    }
    
    if (payload._createdAt === payload._updatedAt) {
      return 'document.create';
    }

    return 'document.update';
  }

  /**
   * Extract previous revision from payload
   */
  private extractPreviousRevision(payload: any): string | undefined {
    return payload._previousRev || payload.previousRev;
  }

  /**
   * Extract projection from headers
   */
  private extractProjection(headers: Record<string, string>): Record<string, any> | undefined {
    const projectionHeader = headers['x-sanity-projection'];
    if (!projectionHeader) {
      return undefined;
    }

    try {
      return JSON.parse(projectionHeader);
    } catch {
      return undefined;
    }
  }

  /**
   * Map database row to webhook event object
   */
  private mapWebhookEventFromDb(row: any): SanityWebhookEvent {
    return {
      id: row.id,
      connection_id: row.connection_id,
      event_id: row.event_id,
      event_type: row.event_type,
      webhook_id: row.webhook_id,
      document_id: row.document_id,
      document_type: row.document_type,
      previous_revision: row.previous_revision,
      current_revision: row.current_revision,
      groq_query: row.groq_query,
      projection: row.projection,
      payload: row.payload,
      raw_payload_url: row.raw_payload_url,
      processed: row.processed,
      processed_at: row.processed_at,
      error_message: row.error_message,
      retry_count: row.retry_count,
      created_at: row.created_at
    };
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  /**
   * Get webhook events for a connection
   */
  async getWebhookEvents(connection_id: string, options?: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    limit?: number | undefined;
    offset?: number | undefined;
    processed?: boolean | undefined;
    document_type?: string | undefined;
  }): Promise<{ events: SanityWebhookEvent[]; total: number }> {
    const { limit = 50, offset = 0, processed, document_type } = options || {};

    let whereClause = 'WHERE connection_id = $1';
    const values: any[] = [connection_id];
    let paramCount = 2;

    if (processed !== undefined) {
      whereClause += ` AND processed = $${paramCount}`;
      values.push(processed);
      paramCount++;
    }

    if (document_type) {
      whereClause += ` AND document_type = $${paramCount}`;
      values.push(document_type);
      paramCount++;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM sanity_webhook_events ${whereClause}`;
    const countResult = await getPool()!.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get events
    const eventsQuery = `
      SELECT * FROM sanity_webhook_events 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    const eventsResult = await getPool()!.query(eventsQuery, [...values, limit, offset]);
    const events = eventsResult.rows.map(row => this.mapWebhookEventFromDb(row));

    return { events, total };
  }

  /**
   * Retry failed webhook event
   */
  async retryWebhookEvent(webhook_event_id: string): Promise<ProcessWebhookResult> {
    try {
      const event = await this.getWebhookEvent(webhook_event_id);
      if (!event) {
        return {
          success: false,
          message: 'Webhook event not found',
          error: 'EVENT_NOT_FOUND'
        };
      }

      // Process the event
      await this.processEventAsync(webhook_event_id);

      return {
        success: true,
        message: 'Event retry successful',
        event_id: webhook_event_id
      };

    } catch (error) {
      return {
        success: false,
        message: 'Event retry failed',
        error: (error as Error).message
      };
    }
  }
}