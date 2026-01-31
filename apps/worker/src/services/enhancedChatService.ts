/**
 * Enhanced Chat Service with Persistent Chat MVP Features
 * 
 * Provides sequence-based pagination, idempotency, and real-time capabilities
 * for the persistent chat system with advisor network future-proofing.
 */

import { ulid } from 'ulid';
import { randomUUID } from 'crypto';
import { pool } from './database';
import { WebhookService } from './webhookService';
import { ChatBroadcastService, type ChatMessage as BroadcastChatMessage } from './chatBroadcastService';

// =====================================================================
// Type Definitions
// =====================================================================

export interface ChatHistoryRequest {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  limit?: number | undefined;        // Default 20, max 100
  before_seq?: number | undefined;   // Sequence number for pagination
  after_seq?: number | undefined;    // Sequence number for newer messages
  includeSystem?: boolean | undefined; // Include system messages
  actor_types?: string[] | undefined; // EXPERT FIX Round 17: Use snake_case to match DB/API convention
  mode?: 'all' | 'plan' | 'build' | undefined; // Filter by message mode
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  pagination: {
    start_seq: number;
    end_seq: number;
    has_more_older: boolean;
    has_more_newer: boolean;
  };
}

export interface ChatMessage {
  id: string;
  seq: number;           // Monotonic sequence number per project
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  client_msg_id?: string | undefined; // Client-generated ID for idempotency
  projectId: string;
  user: {
    id: string;
    name: string;
    type: 'client' | 'assistant' | 'advisor';
    avatar?: string | undefined;
  };
  message: {
    text: string;
    type: 'user' | 'assistant' | 'system';
    mode: 'plan' | 'build' | 'unified';
    timestamp: string;
  };
  build?: {
    id: string;
    status: 'queued' | 'building' | 'completed' | 'failed';
    versionId?: string | undefined;
  } | undefined;
  plan?: {
    sessionId: string;
    canBuild: boolean;
    buildPrompt?: string | undefined;
  } | undefined;
  thread?: {
    parentId?: string | undefined;
  } | undefined;
  readStatus?: {
    isRead: boolean;
    readBy: { userId: string; readAt: string; }[];
  } | undefined;
  metadata: {
    tokensUsed?: number | undefined;
    durationMs?: number | undefined;
  };
  isDeleted?: boolean | undefined;
  editedAt?: string | undefined;
  visibility: 'public' | 'internal';
}

export interface SendMessageRequest {
  text: string;
  client_msg_id: string;  // Required for idempotency
  mode: 'plan' | 'build' | 'unified';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  thread?: { parentId?: string | undefined; } | undefined;
  actor_type?: 'client' | 'assistant' | 'advisor' | undefined;
  locale?: string | undefined; // BCP-47 format (e.g., 'ar-EG', 'en-US')
}

export interface SystemMessageData {
  code: string; // Machine-readable system event code
  params: Record<string, any>; // Parameters for localization
  timestamp: string;
}

export interface SendMessageResponse {
  id: string;
  seq: number;           // Immediately available after persist
  client_msg_id: string;
  timestamp: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  duplicateOf?: string | undefined;  // If this was a duplicate request
}

export interface ReadReceiptRequest {
  up_to_seq: number;
}

export interface UnreadCountResponse {
  unread_count: number;
  last_message_seq: number;
  last_read_seq: number;
}

// =====================================================================
// Enhanced Chat Service
// =====================================================================

export class EnhancedChatService {
  private webhookService: WebhookService;

  constructor(webhookService?: WebhookService) {
    this.webhookService = webhookService || new WebhookService();
  }

  // =====================================================================
  // Chat History and Pagination
  // =====================================================================

  async getChatHistory(
    projectId: string, 
    userId: string,
    options: ChatHistoryRequest = {}
  ): Promise<ChatHistoryResponse> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    // Validate and set defaults
    const limit = Math.min(options.limit || 20, 100);
    const includeSystem = options.includeSystem || false;
    const mode = options.mode || 'all';

    // Build query conditions
    const conditions: string[] = ['pcl.project_id = $1'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    // Sequence-based pagination
    if (options.before_seq) {
      conditions.push(`pcl.seq < $${paramIndex}`);
      params.push(options.before_seq);
      paramIndex++;
    }

    if (options.after_seq) {
      conditions.push(`pcl.seq > $${paramIndex}`);
      params.push(options.after_seq);
      paramIndex++;
    }

    // Actor type filtering
    if (options.actor_types && options.actor_types.length > 0) {
      conditions.push(`pcl.actor_type = ANY($${paramIndex})`);
      params.push(options.actor_types);
      paramIndex++;
    }

    // Mode filtering
    if (mode !== 'all') {
      conditions.push(`pcl.mode = $${paramIndex}`);
      params.push(mode);
      paramIndex++;
    }

    // System message filtering
    if (!includeSystem) {
      conditions.push(`pcl.message_type != 'system'`);
    }

    // Visibility and deletion filtering
    conditions.push('pcl.is_deleted = FALSE');
    conditions.push('pcl.visibility = \'public\'');

    const query = `
      SELECT 
        pcl.id,
        pcl.seq,
        pcl.client_msg_id,
        pcl.project_id,
        pcl.user_id,
        pcl.message_text,
        pcl.message_type,
        pcl.actor_type,
        pcl.mode,
        pcl.created_at,
        pcl.edited_at,
        pcl.response_data,
        pcl.build_id,
        pcl.parent_message_id,
        pcl.tokens_used,
        pcl.duration_ms,
        pcl.session_id,
        -- Join user info (simplified - would normally join auth.users)
        pcl.user_id as user_name
      FROM project_chat_log_minimal pcl
      WHERE ${conditions.join(' AND ')}
        AND (
          -- User can see their own messages
          pcl.user_id = $${paramIndex}
          -- OR user has project access (would check project_memberships)
          OR EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = pcl.project_id 
              AND (p.owner_id = $${paramIndex} OR EXISTS (
                SELECT 1 FROM project_collaborators pc 
                WHERE pc.project_id = p.id 
                  AND pc.user_id = $${paramIndex}
                  AND pc.role IN ('owner', 'admin', 'editor')
              ))
          )
        )
      ORDER BY pcl.seq DESC
      LIMIT $${paramIndex + 1}
    `;

    params.push(userId, limit);

    try {
      const result = await pool.query(query, params);
      const messages = result.rows.map(row => this.mapRowToChatMessage(row));

      // Determine pagination metadata
      const firstMessage = messages[0];
      const lastMessage = messages.at(-1);
      const start_seq = firstMessage?.seq ?? 0;
      const end_seq = lastMessage?.seq ?? 0;

      // Check if there are more messages (older or newer)
      const has_more_older = messages.length === limit;
      
      let has_more_newer = false;
      if (options.before_seq && messages.length > 0) {
        const newerQuery = `
          SELECT COUNT(*) as count 
          FROM project_chat_log_minimal 
          WHERE project_id = $1 AND seq > $2 AND is_deleted = FALSE
        `;
        const newerResult = await pool.query(newerQuery, [projectId, start_seq]);
        has_more_newer = parseInt(newerResult.rows[0].count) > 0;
      }

      return {
        messages,
        pagination: {
          start_seq,
          end_seq,
          has_more_older,
          has_more_newer
        }
      };

    } catch (error) {
      console.error('[EnhancedChatService] Error fetching chat history:', error);
      throw new Error('Failed to fetch chat history');
    }
  }

  // =====================================================================
  // Send Message with Idempotency
  // =====================================================================

  async sendMessage(
    projectId: string,
    userId: string, 
    message: SendMessageRequest
  ): Promise<SendMessageResponse> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    // Validate client_msg_id is provided
    if (!message.client_msg_id) {
      throw new Error('client_msg_id is required for idempotency');
    }

    try {
      // First check for existing message with same client_msg_id (idempotency)
      const existingQuery = `
        SELECT id, seq, client_msg_id, created_at
        FROM project_chat_log_minimal
        WHERE project_id = $1 AND client_msg_id = $2
      `;
      
      const existingResult = await pool.query(existingQuery, [projectId, message.client_msg_id]);
      
      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        console.log('[EnhancedChatService] Returning existing message for client_msg_id:', message.client_msg_id);
        
        return {
          id: existing.id,
          seq: existing.seq,
          client_msg_id: existing.client_msg_id,
          timestamp: existing.created_at,
          duplicateOf: existing.id
        };
      }

      // Insert new message (seq will be auto-generated by trigger)
      const insertQuery = `
        INSERT INTO project_chat_log_minimal 
        (project_id, user_id, client_msg_id, message_text, message_type, 
         actor_type, mode, parent_message_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING id, seq, created_at
      `;

      const actor_type = message.actor_type || 'client';
      const message_type = actor_type === 'assistant' ? 'assistant' : 'user';

      const insertResult = await pool.query(insertQuery, [
        projectId,
        userId,
        message.client_msg_id,
        message.text,
        message_type,
        actor_type,
        message.mode,
        message.thread?.parentId || null
      ]);

      const newMessage = insertResult.rows[0];

      // Broadcast to real-time subscribers (Redis pub/sub)
      await this.broadcastMessage(projectId, newMessage);

      return {
        id: newMessage.id,
        seq: newMessage.seq,
        client_msg_id: message.client_msg_id,
        timestamp: newMessage.created_at
      };

    } catch (error) {
      console.error('[EnhancedChatService] Error sending message:', error);

      // 🚨 EXPERT FIX (Round 9): On any 23505, re-query by (project_id, client_msg_id)
      // Don't rely on constraint name string (fragile, drifts across migrations)
      if ((error as any).code === '23505') { // PostgreSQL unique_violation
        console.log('[EnhancedChatService] Unique constraint violation, re-querying:', {
          constraint: (error as any).constraint,
          client_msg_id: message.client_msg_id
        });

        // Race condition - another request with same client_msg_id succeeded
        const raceQuery = `
          SELECT id, seq, client_msg_id, created_at
          FROM project_chat_log_minimal
          WHERE project_id = $1 AND client_msg_id = $2
        `;

        const raceResult = await pool.query(raceQuery, [projectId, message.client_msg_id]);

        if (raceResult.rows.length > 0) {
          const existing = raceResult.rows[0];
          return {
            id: existing.id,
            seq: existing.seq,
            client_msg_id: existing.client_msg_id,
            timestamp: existing.created_at,
            duplicateOf: existing.id
          };
        }
      }

      throw new Error('Failed to send message');
    }
  }

  // =====================================================================
  // Read Receipts
  // =====================================================================

  async markAsRead(
    projectId: string,
    userId: string, 
    request: ReadReceiptRequest
  ): Promise<void> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    try {
      // Use the helper function from migration that ensures monotonic updates
      await pool.query('SELECT update_last_read_seq($1, $2, $3)', [
        projectId,
        userId,
        request.up_to_seq
      ]);

      console.log('[EnhancedChatService] Updated last read seq:', {
        projectId,
        userId,
        up_to_seq: request.up_to_seq
      });

    } catch (error) {
      console.error('[EnhancedChatService] Error updating read receipt:', error);
      throw new Error('Failed to update read receipt');
    }
  }

  async getUnreadCount(projectId: string, userId: string): Promise<UnreadCountResponse> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    try {
      // Use the helper function from migration
      const result = await pool.query('SELECT get_unread_count($1, $2) as unread_count', [
        projectId,
        userId
      ]);

      // Get additional metadata
      const metadataQuery = `
        SELECT 
          COALESCE(MAX(pcl.seq), 0) as last_message_seq,
          COALESCE(lr.last_seq, 0) as last_read_seq
        FROM project_chat_log_minimal pcl
        LEFT JOIN project_chat_last_read lr ON lr.project_id = pcl.project_id AND lr.user_id = $2
        WHERE pcl.project_id = $1
        GROUP BY lr.last_seq
      `;

      const metadataResult = await pool.query(metadataQuery, [projectId, userId]);
      const metadata = metadataResult.rows[0] || { last_message_seq: 0, last_read_seq: 0 };

      return {
        unread_count: parseInt(result.rows[0].unread_count) || 0,
        last_message_seq: parseInt(metadata.last_message_seq),
        last_read_seq: parseInt(metadata.last_read_seq)
      };

    } catch (error) {
      console.error('[EnhancedChatService] Error getting unread count:', error);
      throw new Error('Failed to get unread count');
    }
  }

  // =====================================================================
  // Search Functionality
  // =====================================================================

  async searchMessages(
    projectId: string,
    userId: string,
    query: string,
    options: {
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      from_seq?: number | undefined;
      to_seq?: number | undefined;
      actor_types?: string[] | undefined;
      mode?: string | undefined;
      limit?: number | undefined;
    } = {}
  ): Promise<ChatMessage[]> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const limit = Math.min(options.limit || 20, 100);
    const conditions: string[] = [
      'pcl.project_id = $1',
      'pcl.is_deleted = FALSE',
      'pcl.visibility = \'public\''
    ];
    const params: any[] = [projectId];
    let paramIndex = 2;

    // Add search condition using PostgreSQL FTS
    conditions.push(`to_tsvector('simple', unaccent(COALESCE(pcl.message_text, ''))) @@ plainto_tsquery('simple', unaccent($${paramIndex}))`);
    params.push(query);
    paramIndex++;

    // Add optional filters
    if (options.from_seq) {
      conditions.push(`pcl.seq >= $${paramIndex}`);
      params.push(options.from_seq);
      paramIndex++;
    }

    if (options.to_seq) {
      conditions.push(`pcl.seq <= $${paramIndex}`);
      params.push(options.to_seq);
      paramIndex++;
    }

    if (options.actor_types && options.actor_types.length > 0) {
      conditions.push(`pcl.actor_type = ANY($${paramIndex})`);
      params.push(options.actor_types);
      paramIndex++;
    }

    if (options.mode) {
      conditions.push(`pcl.mode = $${paramIndex}`);
      params.push(options.mode);
      paramIndex++;
    }

    // Add user access check
    conditions.push(`(
      pcl.user_id = $${paramIndex}
      OR EXISTS (
        SELECT 1 FROM projects p 
        WHERE p.id = pcl.project_id 
          AND (p.owner_id = $${paramIndex} OR EXISTS (
            SELECT 1 FROM project_collaborators pc 
            WHERE pc.project_id = p.id 
              AND pc.user_id = $${paramIndex}
              AND pc.role IN ('owner', 'admin', 'editor')
          ))
      )
    )`);
    params.push(userId);
    paramIndex++;

    const searchQuery = `
      SELECT 
        pcl.id,
        pcl.seq,
        pcl.client_msg_id,
        pcl.project_id,
        pcl.user_id,
        pcl.message_text,
        pcl.message_type,
        pcl.actor_type,
        pcl.mode,
        pcl.created_at,
        pcl.edited_at,
        pcl.response_data,
        pcl.build_id,
        pcl.parent_message_id,
        pcl.tokens_used,
        pcl.duration_ms,
        pcl.session_id,
        pcl.user_id as user_name,
        -- Highlight matches
        ts_headline('simple', pcl.message_text, plainto_tsquery('simple', unaccent($2))) as highlighted_text
      FROM project_chat_log_minimal pcl
      WHERE ${conditions.join(' AND ')}
      ORDER BY pcl.seq DESC
      LIMIT $${paramIndex}
    `;

    params.push(limit);

    try {
      const result = await pool.query(searchQuery, params);
      return result.rows.map(row => ({
        ...this.mapRowToChatMessage(row),
        highlightedText: row.highlighted_text
      }));

    } catch (error) {
      console.error('[EnhancedChatService] Error searching messages:', error);
      throw new Error('Failed to search messages');
    }
  }

  // =====================================================================
  // System Messages for I18n
  // =====================================================================

  /**
   * Create a system message with machine-readable code and parameters
   * Frontend can localize using the code + params
   */
  async createSystemMessage(
    projectId: string,
    systemData: SystemMessageData,
    userId?: string
  ): Promise<SendMessageResponse> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    try {
      // EXPERT FIX Round 18: Use proper UUID format for client_msg_id (schema requires UUID)
      const clientMsgId = randomUUID();

      // Insert system message with structured data
      const insertQuery = `
        INSERT INTO project_chat_log_minimal 
        (project_id, user_id, client_msg_id, message_text, message_type, 
         actor_type, mode, response_data, created_at)
        VALUES ($1, $2, $3, $4, 'system', 'assistant', 'unified', $5, NOW())
        RETURNING id, seq, created_at
      `;

      // Store system data in response_data for easy frontend access
      const responseData = {
        type: 'system_event',
        code: systemData.code,
        params: systemData.params,
        timestamp: systemData.timestamp
      };

      // Use a fallback text for backwards compatibility
      const fallbackText = this.generateFallbackText(systemData.code, systemData.params);

      const insertResult = await pool.query(insertQuery, [
        projectId,
        userId || null, // System messages might not have a specific user
        clientMsgId,
        fallbackText,
        responseData
      ]);

      const newMessage = insertResult.rows[0];

      // Broadcast system message to real-time subscribers
      await this.broadcastMessage(projectId, {
        ...newMessage,
        response_data: responseData
      });

      return {
        id: newMessage.id,
        seq: newMessage.seq,
        client_msg_id: clientMsgId,
        timestamp: newMessage.created_at
      };

    } catch (error) {
      console.error('[EnhancedChatService] Error creating system message:', error);
      throw new Error('Failed to create system message');
    }
  }

  /**
   * Generate fallback English text for system messages (backwards compatibility)
   */
  private generateFallbackText(code: string, params: Record<string, any>): string {
    const templates: Record<string, string> = {
      'presence.user_joined': `${params.userName} joined the chat`,
      'presence.user_left': `${params.userName} left the chat`,
      'presence.user_typing_start': `${params.userName} is typing...`,
      'presence.user_typing_stop': `${params.userName} stopped typing`,
      'build.status_changed': `Build ${params.buildId} status changed to ${params.status}`,
      'advisor.invited': `${params.advisorName} was invited as an advisor`,
      'advisor.activated': `${params.advisorName} joined as an advisor`,
      'advisor.removed': `${params.advisorName} is no longer an advisor`,
      'chat.read_receipt': `${params.userName} read messages up to #${params.messageSeq}`
    };

    return templates[code] || `System event: ${code}`;
  }

  // =====================================================================
  // Session Management with Locale Support
  // =====================================================================

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async getOrCreateSession(
    projectId: string,
    userId: string,
    preferredLocale?: string
  ): Promise<{
    sessionId: string;
    isActive: boolean;
    lastActive: string;
    preferredLocale?: string | undefined;
  }> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    try {
      // Check for existing active session
      const existingQuery = `
        SELECT session_id, last_active, preferred_locale
        FROM unified_chat_sessions
        WHERE project_id = $1 AND user_id = $2
          AND last_active > NOW() - INTERVAL '4 hours'
        ORDER BY last_active DESC
        LIMIT 1
      `;

      const existingResult = await pool.query(existingQuery, [projectId, userId]);

      if (existingResult.rows.length > 0) {
        const session = existingResult.rows[0];
        
        // Update last_active and preferred_locale if provided
        const updateQuery = preferredLocale 
          ? 'UPDATE unified_chat_sessions SET last_active = NOW(), preferred_locale = $2 WHERE session_id = $1'
          : 'UPDATE unified_chat_sessions SET last_active = NOW() WHERE session_id = $1';
        
        const updateParams = preferredLocale 
          ? [session.session_id, preferredLocale]
          : [session.session_id];
        
        await pool.query(updateQuery, updateParams);

        return {
          sessionId: session.session_id,
          isActive: true,
          lastActive: new Date().toISOString(),
          preferredLocale: preferredLocale || session.preferred_locale
        };
      }

      // Create new session
      const newSessionId = ulid();
      await pool.query(`
        INSERT INTO unified_chat_sessions 
        (id, project_id, user_id, session_id, preferred_locale, created_at, last_active)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
      `, [projectId, userId, newSessionId, preferredLocale || null]);

      return {
        sessionId: newSessionId,
        isActive: true,
        lastActive: new Date().toISOString(),
        preferredLocale: preferredLocale
      };

    } catch (error) {
      console.error('[EnhancedChatService] Error managing session:', error);
      throw new Error('Failed to manage session');
    }
  }

  /**
   * Update session locale preference
   */
  async updateSessionLocale(
    projectId: string, 
    userId: string, 
    locale: string
  ): Promise<void> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    try {
      await pool.query(`
        UPDATE unified_chat_sessions 
        SET preferred_locale = $3, last_active = NOW()
        WHERE project_id = $1 AND user_id = $2 
          AND last_active > NOW() - INTERVAL '4 hours'
      `, [projectId, userId, locale]);

    } catch (error) {
      console.error('[EnhancedChatService] Error updating session locale:', error);
      throw new Error('Failed to update session locale');
    }
  }

  // =====================================================================
  // Helper Methods
  // =====================================================================

  private mapRowToChatMessage(row: any): ChatMessage {
    return {
      id: row.id,
      seq: row.seq,
      client_msg_id: row.client_msg_id,
      projectId: row.project_id,
      user: {
        id: row.user_id,
        name: row.user_name || 'User', // Would normally fetch from auth.users
        type: row.actor_type || 'client',
        avatar: undefined // Would fetch from user profile
      },
      message: {
        text: row.message_text,
        type: row.message_type,
        mode: row.mode || 'unified',
        timestamp: row.created_at
      },
      build: row.build_id ? {
        id: row.build_id,
        status: 'completed', // Would fetch actual status
        versionId: undefined
      } : undefined,
      plan: row.session_id ? {
        sessionId: row.session_id,
        canBuild: true,
        buildPrompt: undefined // Would extract from response_data
      } : undefined,
      thread: {
        parentId: row.parent_message_id
      },
      metadata: {
        tokensUsed: row.tokens_used,
        durationMs: row.duration_ms
      },
      isDeleted: row.is_deleted || false,
      editedAt: row.edited_at,
      visibility: row.visibility || 'public'
    };
  }

  private async broadcastMessage(projectId: string, message: any): Promise<void> {
    try {
      const broadcastService = ChatBroadcastService.getInstance();

      // Convert database row to BroadcastChatMessage format for broadcasting
      // CRITICAL: Type conversions to match broadcast contract
      const chatMessage: BroadcastChatMessage = {
        id: message.id,
        seq: message.seq,
        client_msg_id: message.client_msg_id,
        user_id: message.user_id,
        message_text: message.message_text,
        message_type: message.message_type,
        mode: message.mode,
        actor_type: message.actor_type,
        // CRITICAL: Convert Date to ISO string to match broadcast contract
        created_at: message.created_at instanceof Date
          ? message.created_at.toISOString()
          : message.created_at,
        build_id: message.build_id,
        response_data: message.response_data
      };

      await broadcastService.broadcastMessage(projectId, chatMessage);
    } catch (error) {
      console.error('[EnhancedChatService] Broadcasting failed:', error);
      // Non-fatal: don't break message saving
    }
  }

  private async findByClientMsgId(projectId: string, clientMsgId: string): Promise<any> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const query = `
      SELECT id, seq, client_msg_id, created_at
      FROM project_chat_log_minimal
      WHERE project_id = $1 AND client_msg_id = $2
    `;

    const result = await pool.query(query, [projectId, clientMsgId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private async getNextSequence(projectId: string): Promise<number> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    // This is handled by the trigger, but including for completeness
    const result = await pool.query('SELECT next_project_chat_seq($1) as seq', [projectId]);
    return result.rows[0].seq;
  }
}