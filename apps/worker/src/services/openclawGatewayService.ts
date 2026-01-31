/**
 * OpenClaw Gateway Service
 *
 * Client for communicating with OpenClaw gateway instances.
 *
 * Features:
 * - Health checks and status monitoring
 * - Channel status queries
 * - Gateway provisioning (K8s integration)
 * - Dev mode with simulated responses
 *
 * Part of SHEENAPPS_OPENCLAW_ANALYSIS.md Phase: Processing Pipeline
 */

import { getPool } from './databaseWrapper';
import { ServerLoggingService } from './serverLoggingService';

// =============================================================================
// Types
// =============================================================================

export type GatewayStatus = 'healthy' | 'degraded' | 'down' | 'not_provisioned' | 'dev_mode';

export type ChannelStatus = 'connected' | 'disconnected' | 'error' | 'pending';

export interface GatewayHealthResponse {
  projectId: string;
  gatewayId: string;
  status: GatewayStatus;
  uptime: number; // seconds
  lastHealthCheck: string;
  version?: string;
  channels: ChannelStatusInfo[];
  metrics?: {
    activeSessions: number;
    messagesProcessed24h: number;
    avgResponseTimeMs: number;
  };
}

export interface ChannelStatusInfo {
  channel: string;
  status: ChannelStatus;
  connectedAt?: string;
  disconnectedAt?: string;
  lastMessageAt?: string;
  errorMessage?: string;
}

export interface SendMessageRequest {
  projectId: string;
  channel: string;
  targetId: string; // Phone number, chat ID, etc.
  message: string;
  options?: {
    parseMode?: 'text' | 'markdown' | 'html';
    replyToMessageId?: string;
  };
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface GatewayConfig {
  gatewayUrl: string;
  gatewayId: string;
  apiKey: string;
}

// =============================================================================
// Configuration
// =============================================================================

const DEV_MODE = process.env.OPENCLAW_DEV_MODE === 'true';
const GATEWAY_TIMEOUT_MS = parseInt(process.env.OPENCLAW_GATEWAY_TIMEOUT_MS || '10000');
const DEFAULT_GATEWAY_PORT = 18789;

// =============================================================================
// Gateway Service
// =============================================================================

export class OpenClawGatewayService {
  private logger: ServerLoggingService;

  constructor() {
    this.logger = ServerLoggingService.getInstance();
    if (DEV_MODE) {
      this.logger.logServerEvent('capacity', 'info', 'OpenClawGatewayService running in DEV MODE', {})
        .catch(() => { /* non-critical */ });
    }
  }

  /**
   * Get gateway configuration for a project
   */
  async getGatewayConfig(projectId: string): Promise<GatewayConfig | null> {
    const pool = getPool();
    if (!pool) return null;

    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          metadata->>'openclaw_gateway_url' as gateway_url,
          metadata->>'openclaw_gateway_id' as gateway_id,
          metadata->>'openclaw_api_key' as api_key
        FROM projects
        WHERE id = $1
          AND COALESCE((metadata->>'openclaw_enabled')::boolean, false) = true
        LIMIT 1
      `, [projectId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      if (!row.gateway_url && !DEV_MODE) {
        return null;
      }

      return {
        gatewayUrl: row.gateway_url || `http://localhost:${DEFAULT_GATEWAY_PORT}`,
        gatewayId: row.gateway_id || `dev-gateway-${projectId}`,
        apiKey: row.api_key || 'dev-api-key'
      };
    } finally {
      client.release();
    }
  }

  /**
   * Check gateway health
   */
  async checkHealth(projectId: string): Promise<GatewayHealthResponse> {
    // Dev mode returns simulated response
    if (DEV_MODE) {
      return this.getDevModeHealth(projectId);
    }

    const config = await this.getGatewayConfig(projectId);
    if (!config) {
      return {
        projectId,
        gatewayId: 'not_configured',
        status: 'not_provisioned',
        uptime: 0,
        lastHealthCheck: new Date().toISOString(),
        channels: []
      };
    }

    try {
      const response = await this.fetchWithTimeout(
        `${config.gatewayUrl}/health`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        return {
          projectId,
          gatewayId: config.gatewayId,
          status: 'degraded',
          uptime: 0,
          lastHealthCheck: new Date().toISOString(),
          channels: []
        };
      }

      const data = await response.json();

      return {
        projectId,
        gatewayId: config.gatewayId,
        status: data.status === 'ok' ? 'healthy' : 'degraded',
        uptime: data.uptime || 0,
        lastHealthCheck: new Date().toISOString(),
        version: data.version,
        channels: data.channels || [],
        metrics: data.metrics
      };
    } catch (error) {
      this.logger.logServerEvent('error', 'error', 'OpenClaw gateway health check failed', {
        projectId,
        gatewayId: config.gatewayId,
        error: (error as Error).message
      }).catch(() => { /* non-critical */ });

      return {
        projectId,
        gatewayId: config.gatewayId,
        status: 'down',
        uptime: 0,
        lastHealthCheck: new Date().toISOString(),
        channels: []
      };
    }
  }

  /**
   * Get channel statuses from database (cached from webhooks)
   */
  async getChannelStatuses(projectId: string): Promise<ChannelStatusInfo[]> {
    const pool = getPool();
    if (!pool) return [];

    // Dev mode returns simulated statuses
    if (DEV_MODE) {
      return this.getDevModeChannels();
    }

    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          channel,
          status,
          connected_at,
          disconnected_at,
          last_activity_at,
          metadata->>'errorMessage' as error_message
        FROM openclaw_channel_status
        WHERE project_id = $1
        ORDER BY channel
      `, [projectId]);

      return result.rows.map(row => ({
        channel: row.channel,
        status: row.status as ChannelStatus,
        connectedAt: row.connected_at?.toISOString(),
        disconnectedAt: row.disconnected_at?.toISOString(),
        lastMessageAt: row.last_activity_at?.toISOString(),
        errorMessage: row.error_message
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Send a message through the gateway (for testing/admin use)
   */
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    // Dev mode returns simulated response
    if (DEV_MODE) {
      return this.getDevModeSendResponse(request);
    }

    const config = await this.getGatewayConfig(request.projectId);
    if (!config) {
      return {
        success: false,
        error: 'Gateway not configured for this project'
      };
    }

    try {
      const response = await this.fetchWithTimeout(
        `${config.gatewayUrl}/rpc`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            method: 'channels.send',
            params: {
              channel: request.channel,
              target: request.targetId,
              message: request.message,
              ...request.options
            }
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`
        };
      }

      const data = await response.json();

      return {
        success: true,
        messageId: data.messageId
      };
    } catch (error) {
      this.logger.logServerEvent('error', 'error', 'OpenClaw send message failed', {
        projectId: request.projectId,
        channel: request.channel,
        error: (error as Error).message
      }).catch(() => { /* non-critical */ });

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Provision a new gateway for a project (K8s)
   *
   * Note: This is a placeholder for K8s integration.
   * In production, this would call the K8s API to create a StatefulSet.
   */
  async provisionGateway(projectId: string, options: {
    channels: string[];
    locale?: string;
  }): Promise<{ success: boolean; gatewayId?: string; error?: string }> {
    // Dev mode simulates provisioning
    if (DEV_MODE) {
      const gatewayId = `dev-gateway-${projectId}-${Date.now()}`;

      // Store dev gateway config in project metadata
      const pool = getPool();
      if (pool) {
        await pool.query(`
          UPDATE projects
          SET metadata = metadata ||
            jsonb_build_object(
              'openclaw_enabled', true,
              'openclaw_gateway_id', $2,
              'openclaw_gateway_url', $3,
              'openclaw_api_key', 'dev-api-key',
              'openclaw_channels', $4::jsonb
            )
          WHERE id = $1
        `, [
          projectId,
          gatewayId,
          `http://localhost:${DEFAULT_GATEWAY_PORT}`,
          JSON.stringify(options.channels)
        ]);
      }

      this.logger.logServerEvent('capacity', 'info', 'OpenClaw DEV MODE gateway provisioned', {
        projectId,
        gatewayId,
        channels: options.channels
      }).catch(() => { /* non-critical */ });

      return {
        success: true,
        gatewayId
      };
    }

    // Production: Would call K8s API here
    // For now, return a helpful message
    return {
      success: false,
      error: 'K8s gateway provisioning not yet implemented. Set OPENCLAW_DEV_MODE=true for local testing.'
    };
  }

  /**
   * Deprovision a gateway (K8s)
   */
  async deprovisionGateway(projectId: string): Promise<{ success: boolean; error?: string }> {
    // Dev mode clears config
    if (DEV_MODE) {
      const pool = getPool();
      if (pool) {
        await pool.query(`
          UPDATE projects
          SET metadata = metadata - 'openclaw_enabled'
                                  - 'openclaw_gateway_id'
                                  - 'openclaw_gateway_url'
                                  - 'openclaw_api_key'
                                  - 'openclaw_channels'
          WHERE id = $1
        `, [projectId]);
      }

      this.logger.logServerEvent('capacity', 'info', 'OpenClaw DEV MODE gateway deprovisioned', {
        projectId
      }).catch(() => { /* non-critical */ });

      return { success: true };
    }

    // Production: Would call K8s API here
    return {
      success: false,
      error: 'K8s gateway deprovisioning not yet implemented.'
    };
  }

  /**
   * Connect a channel (e.g., Telegram bot token)
   */
  async connectChannel(
    projectId: string,
    channel: string,
    credentials: Record<string, string>
  ): Promise<{ success: boolean; error?: string }> {
    // Dev mode simulates connection
    if (DEV_MODE) {
      const pool = getPool();
      if (pool) {
        // Store channel credentials in metadata (in production, use secrets manager)
        await pool.query(`
          UPDATE projects
          SET metadata = metadata ||
            jsonb_build_object(
              'openclaw_channel_' || $2, $3::jsonb
            )
          WHERE id = $1
        `, [projectId, channel, JSON.stringify({ configured: true, ...credentials })]);

        // Insert channel status
        await pool.query(`
          INSERT INTO openclaw_channel_status (
            project_id,
            channel,
            status,
            gateway_id,
            connected_at
          ) VALUES ($1, $2, 'connected', 'dev-gateway', NOW())
          ON CONFLICT (project_id, channel)
          DO UPDATE SET
            status = 'connected',
            connected_at = NOW(),
            updated_at = NOW()
        `, [projectId, channel]);
      }

      this.logger.logServerEvent('capacity', 'info', 'OpenClaw DEV MODE channel connected', {
        projectId,
        channel
      }).catch(() => { /* non-critical */ });

      return { success: true };
    }

    // Production: Would call gateway API to connect channel
    const config = await this.getGatewayConfig(projectId);
    if (!config) {
      return {
        success: false,
        error: 'Gateway not configured for this project'
      };
    }

    try {
      const response = await this.fetchWithTimeout(
        `${config.gatewayUrl}/rpc`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            method: 'channels.connect',
            params: {
              channel,
              credentials
            }
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Disconnect a channel
   */
  async disconnectChannel(
    projectId: string,
    channel: string
  ): Promise<{ success: boolean; error?: string }> {
    // Dev mode simulates disconnection
    if (DEV_MODE) {
      const pool = getPool();
      if (pool) {
        await pool.query(`
          UPDATE openclaw_channel_status
          SET status = 'disconnected',
              disconnected_at = NOW(),
              updated_at = NOW()
          WHERE project_id = $1 AND channel = $2
        `, [projectId, channel]);
      }

      this.logger.logServerEvent('capacity', 'info', 'OpenClaw DEV MODE channel disconnected', {
        projectId,
        channel
      }).catch(() => { /* non-critical */ });

      return { success: true };
    }

    // Production: Would call gateway API
    const config = await this.getGatewayConfig(projectId);
    if (!config) {
      return {
        success: false,
        error: 'Gateway not configured for this project'
      };
    }

    try {
      const response = await this.fetchWithTimeout(
        `${config.gatewayUrl}/rpc`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            method: 'channels.disconnect',
            params: { channel }
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  // ===========================================================================
  // Dev Mode Helpers
  // ===========================================================================

  private getDevModeHealth(projectId: string): GatewayHealthResponse {
    return {
      projectId,
      gatewayId: `dev-gateway-${projectId}`,
      status: 'dev_mode',
      uptime: 86400, // 1 day
      lastHealthCheck: new Date().toISOString(),
      version: 'dev-1.0.0',
      channels: this.getDevModeChannels(),
      metrics: {
        activeSessions: 5,
        messagesProcessed24h: 150,
        avgResponseTimeMs: 250
      }
    };
  }

  private getDevModeChannels(): ChannelStatusInfo[] {
    return [
      {
        channel: 'telegram',
        status: 'connected',
        connectedAt: new Date(Date.now() - 86400000).toISOString(),
        lastMessageAt: new Date(Date.now() - 60000).toISOString()
      },
      {
        channel: 'webchat',
        status: 'connected',
        connectedAt: new Date(Date.now() - 86400000).toISOString(),
        lastMessageAt: new Date(Date.now() - 300000).toISOString()
      },
      {
        channel: 'whatsapp',
        status: 'disconnected',
        disconnectedAt: new Date(Date.now() - 3600000).toISOString(),
        errorMessage: 'Session expired - QR code scan required'
      }
    ];
  }

  private getDevModeSendResponse(request: SendMessageRequest): SendMessageResponse {
    // DEV MODE: simulate message send (don't log every message to avoid noise)
    return {
      success: true,
      messageId: `dev-msg-${Date.now()}`
    };
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let serviceInstance: OpenClawGatewayService | null = null;

/**
 * Get the OpenClaw Gateway Service instance
 */
export function getOpenClawGatewayService(): OpenClawGatewayService {
  if (!serviceInstance) {
    serviceInstance = new OpenClawGatewayService();
  }
  return serviceInstance;
}
