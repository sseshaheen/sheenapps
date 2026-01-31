import { createClient } from '@/lib/supabase-client'
import { BlobUploader } from '../storage/blob-uploader'
import { logger } from '@/utils/logger';

export class VersioningService {
  static async createCommit(
    projectId: string,
    content: any,
    message: string,
    authorId: string
  ): Promise<string> {
    const supabase = createClient()
    
    try {
      // 1. Upload content and get hash
      const treeHash = await BlobUploader.uploadContent(content)
      const payloadSize = new Blob([JSON.stringify(content)]).size
      
      // 2. Use atomic function for commit + branch update
      const { data, error } = await supabase
        .rpc('create_commit_and_update_branch', {
          p_project_id: projectId,
          p_author_id: authorId,
          p_tree_hash: treeHash,
          p_message: message,
          p_payload_size: payloadSize
        })
      
      if (error) throw error
      
      logger.info(`✅ Created commit ${data} for project ${projectId}`);
      return data
      
    } catch (error) {
      logger.error('❌ Commit creation failed:', error);
      throw error
    }
  }
  
  static async getCommitHistory(projectId: string, limit = 50) {
    const supabase = createClient()
    
    return supabase
      .from('commits')
      .select(`
        id,
        message,
        created_at,
        author_id,
        payload_size
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)
  }
  
  static async getCommitContent(commitId: string): Promise<any> {
    const supabase = createClient()
    
    // 1. Get commit record
    const { data: commit } = await supabase
      .from('commits')
      .select('tree_hash')
      .eq('id', commitId)
      .single()
    
    if (!commit) throw new Error('Commit not found')
    
    // 2. Download content
    return BlobUploader.downloadContent(commit.tree_hash)
  }
  
  static async revertToCommit(projectId: string, commitId: string, authorId: string) {
    // 1. Get commit content
    const content = await this.getCommitContent(commitId)
    
    // 2. Create new commit with reverted content
    return this.createCommit(
      projectId,
      content,
      `Revert to ${commitId}`,
      authorId
    )
  }

  // Danger Zone: Delete project endpoint
  static async deleteProject(projectId: string): Promise<void> {
    const supabase = createClient()
    
    // RLS will ensure only owner can delete
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
    
    if (error) {
      throw new Error(`Failed to delete project: ${error.message}`)
    }
    
    logger.info(`🗑️ Deleted project ${projectId}`);
  }
}