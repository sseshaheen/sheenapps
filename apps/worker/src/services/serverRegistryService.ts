import Redis from 'ioredis';
import { ServerHealth, ServerHealthService } from './serverHealthService';
import { ServerLoggingService } from './serverLoggingService';

/**
 * Server Registry Service
 * Manages multi-server coordination and server selection
 * Fixed Redis TTL bug and improved server selection logic
 */
export interface ServerInfo {
  id: string;
  url: string;
  region: string;
  maxConcurrentBuilds: number;
  currentLoad: number;
  health: ServerHealth;
  priority: number; // Lower = higher priority (0 = highest)
  isMaintenanceMode: boolean;
  lastHeartbeat: number;
  capabilities: {
    aiProviders: string[];        // ['anthropic', 'openai']
    regions: string[];            // ['us-east', 'eu-west']
    features: string[];           // ['background-queue', 'premium-builds']
  };
  metadata: {
    version: string;              // Server version
    deployedAt: number;           // Deployment timestamp
    environment: string;          // 'production', 'staging', 'development'
    datacenter: string;           // Physical location identifier
  };
}

export class ServerRegistryService {
  private static instance: ServerRegistryService;
  private redis: Redis;
  private healthService: ServerHealthService;
  private loggingService: ServerLoggingService;
  private readonly serverId: string;
  private readonly HEARTBEAT_TTL = 60; // 60 seconds
  private heartbeatTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.healthService = ServerHealthService.getInstance();
    this.loggingService = ServerLoggingService.getInstance();
    this.serverId = process.env.SERVER_ID || 'default';
  }
  
  static getInstance(): ServerRegistryService {
    if (!ServerRegistryService.instance) {
      ServerRegistryService.instance = new ServerRegistryService();
    }
    return ServerRegistryService.instance;
  }

  /**
   * Register this server in the registry and start heartbeat
   */
  async registerServer(config: {
    url: string;
    region?: string;
    maxConcurrentBuilds?: number;
    priority?: number;
    capabilities?: Partial<ServerInfo['capabilities']>;
    metadata?: Partial<ServerInfo['metadata']>;
  }): Promise<void> {
    try {
      const health = await this.healthService.collectHealthMetrics();
      
      const serverInfo: ServerInfo = {
        id: this.serverId,
        url: config.url,
        region: config.region || 'us-east',
        maxConcurrentBuilds: config.maxConcurrentBuilds || 10,
        currentLoad: 0, // TODO: calculate from active builds
        health,
        priority: config.priority || 100, // Default: low priority
        isMaintenanceMode: process.env.MAINTENANCE_MODE === 'true',
        lastHeartbeat: Date.now(),
        capabilities: {
          aiProviders: ['anthropic'], // Default providers
          regions: [config.region || 'us-east'],
          features: ['standard-builds'],
          ...config.capabilities
        },
        metadata: {
          version: process.env.SERVER_VERSION || '1.0.0',
          deployedAt: parseInt(process.env.DEPLOYED_AT || Date.now().toString()),
          environment: process.env.NODE_ENV || 'development',
          datacenter: process.env.DATACENTER || 'unknown',
          ...config.metadata
        }
      };
      
      // Store server info with TTL (expert fix: per-server key instead of hash)
      await this.redis.setex(
        `servers:registry:${this.serverId}`,
        this.HEARTBEAT_TTL,
        JSON.stringify(serverInfo)
      );
      
      await this.loggingService.logServerEvent(
        'health',
        'info',
        `Server registered in cluster`,
        {
          serverId: this.serverId,
          region: serverInfo.region,
          priority: serverInfo.priority,
          capabilities: serverInfo.capabilities,
          url: serverInfo.url
        }
      );
      
      // Start automatic heartbeat
      this.startHeartbeat();
      
      console.log(`[ServerRegistry] Server ${this.serverId} registered successfully`);
    } catch (error) {
      console.error('[ServerRegistry] Failed to register server:', error);
      
      await this.loggingService.logCriticalError(
        'server_registration_failed',
        error as Error,
        { serverId: this.serverId }
      );
      
      throw error;
    }
  }

  /**
   * Update server information (called by heartbeat)
   */
  async updateServerInfo(): Promise<void> {
    try {
      const currentInfo = await this.getServerInfo(this.serverId);
      
      if (!currentInfo) {
        console.warn(`[ServerRegistry] Server ${this.serverId} not registered, skipping update`);
        return;
      }
      
      // Update with latest health and load information
      const updatedHealth = await this.healthService.collectHealthMetrics();
      const updatedInfo: ServerInfo = {
        ...currentInfo,
        health: updatedHealth,
        currentLoad: await this.calculateCurrentLoad(),
        lastHeartbeat: Date.now(),
        isMaintenanceMode: process.env.MAINTENANCE_MODE === 'true'
      };
      
      await this.redis.setex(
        `servers:registry:${this.serverId}`,
        this.HEARTBEAT_TTL,
        JSON.stringify(updatedInfo)
      );
      
    } catch (error) {
      console.error('[ServerRegistry] Failed to update server info:', error);
      
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to update server registry info',
        { serverId: this.serverId, error: (error as Error).message }
      );
    }
  }

  /**
   * Get available servers for request routing
   */
  async getAvailableServers(filters?: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    aiProvider?: string | undefined;
    region?: string | undefined;
    feature?: string | undefined;
    excludeMaintenanceMode?: boolean | undefined;
    minHealthStatus?: 'healthy' | 'degraded' | undefined;
  }): Promise<ServerInfo[]> {
    try {
      const keys = await this.redis.keys('servers:registry:*');
      const serverData = await Promise.all(
        keys.map(async (key) => {
          try {
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
          } catch (e) {
            console.error(`Failed to parse server data for ${key}:`, e);
            return null;
          }
        })
      );

      let servers = serverData.filter(Boolean) as ServerInfo[];
      
      // Apply filters
      if (filters) {
        if (filters.excludeMaintenanceMode) {
          servers = servers.filter(s => !s.isMaintenanceMode);
        }
        
        if (filters.minHealthStatus) {
          const healthOrder = { 'healthy': 2, 'degraded': 1, 'unhealthy': 0 };
          const minLevel = healthOrder[filters.minHealthStatus];
          servers = servers.filter(s => healthOrder[s.health.status] >= minLevel);
        }
        
        if (filters.aiProvider) {
          servers = servers.filter(s => s.capabilities.aiProviders.includes(filters.aiProvider!));
        }
        
        if (filters.region) {
          servers = servers.filter(s => s.capabilities.regions.includes(filters.region!));
        }
        
        if (filters.feature) {
          servers = servers.filter(s => s.capabilities.features.includes(filters.feature!));
        }
      }
      
      // Sort by priority first, then by current load, then by health status
      servers.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.currentLoad !== b.currentLoad) return a.currentLoad - b.currentLoad;
        
        // Prefer healthy servers
        const healthOrder = { 'healthy': 2, 'degraded': 1, 'unhealthy': 0 };
        return healthOrder[b.health.status] - healthOrder[a.health.status];
      });
      
      return servers;
    } catch (error) {
      console.error('[ServerRegistry] Failed to get available servers:', error);
      return [];
    }
  }

  /**
   * Select optimal server for a specific request type
   */
  async selectOptimalServer(criteria?: {
    aiProvider?: string;
    region?: string;
    requestType?: 'interactive' | 'background';
    preferLocal?: boolean;
  }): Promise<ServerInfo | null> {
    try {
      const filters = {
        excludeMaintenanceMode: true,
        minHealthStatus: 'degraded' as const, // Allow degraded servers if needed
        ...criteria
      };
      
      const availableServers = await this.getAvailableServers(filters);
      
      if (availableServers.length === 0) {
        await this.loggingService.logServerEvent(
          'capacity',
          'critical',
          'No available servers for request routing',
          {
            criteria,
            totalRegistered: (await this.redis.keys('servers:registry:*')).length,
            requestType: criteria?.requestType
          }
        );
        
        return null;
      }
      
      // If preferLocal is true, check if current server is available
      if (criteria?.preferLocal) {
        const localServer = availableServers.find(s => s.id === this.serverId);
        if (localServer && localServer.health.aiCapacity.available) {
          return localServer;
        }
      }
      
      // Find servers with available AI capacity
      const serversWithCapacity = availableServers.filter(s => s.health.aiCapacity.available);
      
      if (serversWithCapacity.length > 0) {
        return serversWithCapacity[0] ?? null; // Already sorted by priority and load
      }
      
      // No servers with AI capacity available
      await this.loggingService.logCapacityEvent(
        'no_ai_capacity_available',
        {
          totalServers: availableServers.length,
          serversWithLimits: availableServers.length - serversWithCapacity.length,
          criteria
        },
        'warn'
      );
      
      return null;
    } catch (error) {
      console.error('[ServerRegistry] Failed to select optimal server:', error);
      
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Server selection failed',
        { criteria, error: (error as Error).message }
      );
      
      return null;
    }
  }

  /**
   * Get server information by ID
   */
  async getServerInfo(serverId: string): Promise<ServerInfo | null> {
    try {
      const data = await this.redis.get(`servers:registry:${serverId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`[ServerRegistry] Failed to get server info for ${serverId}:`, error);
      return null;
    }
  }

  /**
   * Get all registered servers (including unhealthy ones)
   */
  async getAllRegisteredServers(): Promise<ServerInfo[]> {
    try {
      const keys = await this.redis.keys('servers:registry:*');
      const servers = await Promise.all(
        keys.map(async (key) => {
          try {
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
          } catch (e) {
            console.error(`Failed to parse server data for ${key}:`, e);
            return null;
          }
        })
      );

      return servers.filter(Boolean);
    } catch (error) {
      console.error('[ServerRegistry] Failed to get all servers:', error);
      return [];
    }
  }

  /**
   * Remove a server from the registry (graceful shutdown)
   */
  async deregisterServer(serverId?: string): Promise<void> {
    const targetServerId = serverId || this.serverId;
    
    try {
      await this.redis.del(`servers:registry:${targetServerId}`);
      
      await this.loggingService.logServerEvent(
        'health',
        'info',
        `Server deregistered from cluster`,
        { serverId: targetServerId, gracefulShutdown: true }
      );
      
      // Stop heartbeat if deregistering self
      if (targetServerId === this.serverId && this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      
      console.log(`[ServerRegistry] Server ${targetServerId} deregistered`);
    } catch (error) {
      console.error(`[ServerRegistry] Failed to deregister server ${targetServerId}:`, error);
    }
  }

  /**
   * Get cluster statistics for monitoring
   */
  async getClusterStats(): Promise<{
    totalServers: number;
    healthyServers: number;
    degradedServers: number;
    unhealthyServers: number;
    maintenanceServers: number;
    serversWithAICapacity: number;
    totalCapacity: number;
    totalLoad: number;
    regionDistribution: Record<string, number>;
    providerDistribution: Record<string, number>;
  }> {
    try {
      const allServers = await this.getAllRegisteredServers();
      
      const stats = {
        totalServers: allServers.length,
        healthyServers: allServers.filter(s => s.health.status === 'healthy').length,
        degradedServers: allServers.filter(s => s.health.status === 'degraded').length,
        unhealthyServers: allServers.filter(s => s.health.status === 'unhealthy').length,
        maintenanceServers: allServers.filter(s => s.isMaintenanceMode).length,
        serversWithAICapacity: allServers.filter(s => s.health.aiCapacity.available).length,
        totalCapacity: allServers.reduce((sum, s) => sum + s.maxConcurrentBuilds, 0),
        totalLoad: allServers.reduce((sum, s) => sum + s.currentLoad, 0),
        regionDistribution: {} as Record<string, number>,
        providerDistribution: {} as Record<string, number>
      };
      
      // Calculate distributions
      allServers.forEach(server => {
        stats.regionDistribution[server.region] = (stats.regionDistribution[server.region] || 0) + 1;
        
        server.capabilities.aiProviders.forEach(provider => {
          stats.providerDistribution[provider] = (stats.providerDistribution[provider] || 0) + 1;
        });
      });
      
      return stats;
    } catch (error) {
      console.error('[ServerRegistry] Failed to get cluster stats:', error);
      
      return {
        totalServers: 0,
        healthyServers: 0,
        degradedServers: 0,
        unhealthyServers: 0,
        maintenanceServers: 0,
        serversWithAICapacity: 0,
        totalCapacity: 0,
        totalLoad: 0,
        regionDistribution: {},
        providerDistribution: {}
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    // Update server info every 30 seconds (TTL is 60s for safety)
    this.heartbeatTimer = setInterval(async () => {
      await this.updateServerInfo();
    }, 30000);
    
    // Also update immediately
    this.updateServerInfo().catch(err => 
      console.error('[ServerRegistry] Initial heartbeat failed:', err)
    );
  }

  private async calculateCurrentLoad(): Promise<number> {
    // TODO: Integrate with actual build tracking system
    // For now, return placeholder based on health workload
    try {
      const health = await this.healthService.collectHealthMetrics();
      return health.workload.activeBuilds;
    } catch (error) {
      console.error('[ServerRegistry] Failed to calculate current load:', error);
      return 0;
    }
  }
}