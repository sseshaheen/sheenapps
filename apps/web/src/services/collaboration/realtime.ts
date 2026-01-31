import { createClient } from '@/lib/supabase-client'
import type { RealtimeChannel } from '@supabase/realtime-js'
import { logger } from '@/utils/logger';

export class RealtimeService {
  private static channels = new Map<string, RealtimeChannel>()
  private static sectionVersions = new Map<string, number>()
  
  static async joinProject(projectId: string, userId: string) {
    const channelName = `project:${projectId}:${userId}`
    
    if (this.channels.has(channelName)) {
      logger.info(`📡 Already connected to ${channelName}`);
      return
    }
    
    const supabase = createClient()
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'branches',
        filter: `project_id=eq.${projectId}`
      }, (payload) => {
        this.handleBranchUpdate(payload)
      })
      .on('broadcast', { event: 'section_edit' }, (payload) => {
        this.handleSectionEdit(payload)
      })
      .on('broadcast', { event: 'cursor_move' }, (payload) => {
        this.handleCursorMove(payload)
      })
      .subscribe((status) => {
        logger.info(`📡 Realtime status: ${status}`);
      })
    
    this.channels.set(channelName, channel)
    
    // Load persisted version counters
    this.loadPersistedVersions(projectId)
    
    logger.info(`📡 Joined realtime channel: ${channelName}`);
  }
  
  static async broadcastSectionEdit(
    projectId: string,
    sectionId: string,
    content: any,
    userId: string
  ) {
    const channelName = `project:${projectId}:${userId}`
    const channel = this.channels.get(channelName)
    if (!channel) return
    
    // Increment version counter
    const versionKey = `${projectId}:${sectionId}`
    const currentVersion = this.sectionVersions.get(versionKey) || 0
    const newVersion = currentVersion + 1
    this.sectionVersions.set(versionKey, newVersion)
    
    // Persist version to sessionStorage
    this.persistVersions(projectId)
    
    await channel.send({
      type: 'broadcast',
      event: 'section_edit',
      payload: {
        sectionId,
        content,
        version: newVersion,
        userId,
        timestamp: Date.now()
      }
    })
  }
  
  private static handleBranchUpdate(payload: any) {
    logger.info('🔄 Branch updated:', payload);
    // Handle branch updates (e.g., new commits)
  }
  
  private static handleSectionEdit(payload: any) {
    const { sectionId, content, version, userId } = payload.payload
    const versionKey = `${payload.projectId}:${sectionId}`
    const localVersion = this.sectionVersions.get(versionKey) || 0
    
    if (version <= localVersion) {
      logger.info(`⚠️ Stale edit ignored: v${version} <= v${localVersion}`);
      return
    }
    
    // Warn about potential overwrite
    if (version > localVersion + 1) {
      logger.warn(`⚠️ Version gap detected: v${localVersion} → v${version}`);
      // Show UI warning about potential conflict
    }
    
    // Apply remote edit
    this.sectionVersions.set(versionKey, version)
    this.persistVersions(payload.projectId)
  }
  
  private static handleCursorMove(payload: any) {
    logger.info('👆 Cursor moved:', payload);
    // Handle cursor position updates
  }
  
  // Persist section versions to sessionStorage
  private static persistVersions(projectId: string) {
    const projectVersions: Record<string, number> = {}
    
    for (const [key, version] of this.sectionVersions.entries()) {
      if (key.startsWith(`${projectId}:`)) {
        projectVersions[key] = version
      }
    }
    
    sessionStorage.setItem(`versions:${projectId}`, JSON.stringify(projectVersions))
  }
  
  // Load persisted versions on reconnect
  private static loadPersistedVersions(projectId: string) {
    const stored = sessionStorage.getItem(`versions:${projectId}`)
    if (stored) {
      const versions = JSON.parse(stored)
      for (const [key, version] of Object.entries(versions)) {
        this.sectionVersions.set(key, version as number)
      }
    }
  }
  
  static async leaveProject(projectId: string, userId: string) {
    const channelName = `project:${projectId}:${userId}`
    const channel = this.channels.get(channelName)
    
    if (channel) {
      await channel.unsubscribe()
      this.channels.delete(channelName)
      logger.info(`📡 Left realtime channel: ${channelName}`);
    }
  }
  
  // Monitor connection count for usage alerts
  static getActiveConnections(): number {
    return this.channels.size
  }
  
  // Get actual socket count from Supabase telemetry (more accurate than channel estimation)
  static async getActualSocketCount(): Promise<number> {
    try {
      const supabase = createClient()
      const { data } = await supabase.functions.invoke('get-telemetry', {
        body: { type: 'connections' }
      })
      return data?.connections || this.channels.size
    } catch (error) {
      logger.warn('Failed to get actual socket count, using channel estimate');
      return this.channels.size
    }
  }
}