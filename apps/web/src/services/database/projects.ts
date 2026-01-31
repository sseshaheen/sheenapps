import { createClient } from '@/lib/supabase-client'
import type { Database } from '@/types/supabase'
import { logger } from '@/utils/logger';

type Project = Database['public']['Tables']['projects']['Row']
type ProjectInsert = Database['public']['Tables']['projects']['Insert']
type ProjectUpdate = Database['public']['Tables']['projects']['Update']

export class ProjectService {
  static async create(name: string, config: any = {}, customId?: string): Promise<Project> {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('User must be authenticated to create projects')
    }
    
    // Prepare insert data
    const insertData: ProjectInsert = {
      name, 
      config,
      owner_id: user.id,
      subdomain: this.generateSubdomain(name)
    }
    
    // Use custom ID if provided (for backwards compatibility with URL-based IDs)
    if (customId) {
      insertData.id = customId
    }
    
    const { data, error } = await supabase
      .from('projects')
      .insert(insertData)
      .select()
      .single()
    
    if (error) throw error
    
    // Create default main branch
    await supabase
      .from('branches')
      .insert({ 
        project_id: data.id, 
        name: 'main',
        head_id: null
      })
    
    logger.info(`✅ Created project: ${data.name} (${data.id}); - Saved to Supabase database`)
    return data
  }
  
  static async update(id: string, updates: ProjectUpdate): Promise<Project> {
    const supabase = createClient()
    
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    logger.info(`✅ Updated project: ${id}`);
    return data
  }
  
  static async get(id: string): Promise<Project | null> {
    const supabase = createClient()
    
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        branches!inner(
          id,
          name,
          head_id,
          is_published
        )
      `)
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null // Row not found
      throw error
    }
    
    return data
  }
  
  static async list(): Promise<Project[]> {
    const supabase = createClient()
    
    // RLS automatically filters to user's accessible projects via collaborators table
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        branches!inner(
          id,
          name,
          head_id,
          is_published
        ),
        project_collaborators!inner(
          role,
          accepted_at
        )
      `)
      .order('updated_at', { ascending: false })
    
    if (error) throw error
    
    return data || []
  }
  
  static async publish(projectId: string): Promise<void> {
    const supabase = createClient()
    
    const { error } = await supabase
      .from('branches')
      .update({ is_published: true })
      .eq('project_id', projectId)
      .eq('name', 'main')
    
    if (error) throw error
    
    logger.info(`🚀 Published project: ${projectId}`);
  }
  
  static async unpublish(projectId: string): Promise<void> {
    const supabase = createClient()
    
    const { error } = await supabase
      .from('branches')
      .update({ is_published: false })
      .eq('project_id', projectId)
      .eq('name', 'main')
    
    if (error) throw error
    
    logger.info(`📴 Unpublished project: ${projectId}`);
  }
  
  // Collaborator management methods
  static async getCollaborators(projectId: string): Promise<any[]> {
    const supabase = createClient()
    
    // Note: This would query a collaborators table if it existed
    // For now, return empty array since the schema doesn't include collaborators
    logger.warn('Collaborator functionality not implemented - missing database schema');
    return []
  }
  
  static async inviteCollaborator(
    projectId: string, 
    email: string, 
    role: 'admin' | 'editor' | 'viewer' = 'viewer'
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()
    
    // Note: This would use a collaborators table/RPC function if it existed
    // For now, return success since the schema doesn't include collaborators
    logger.warn('Collaborator invite not implemented - missing database schema');
    return { success: true }
  }
  
  static async removeCollaborator(projectId: string, userId: string): Promise<void> {
    // Note: This would use a collaborators table if it existed
    // For now, just log since the schema doesn't include collaborators
    logger.warn('Collaborator removal not implemented - missing database schema');
  }
  
  static async updateCollaboratorRole(
    projectId: string, 
    userId: string, 
    role: 'admin' | 'editor' | 'viewer'
  ): Promise<void> {
    // Note: This would use a collaborators table if it existed
    // For now, just log since the schema doesn't include collaborators
    logger.warn('Collaborator role update not implemented - missing database schema');
  }
  
  static async acceptInvitation(projectId: string): Promise<void> {
    // Note: This would use a collaborators table if it existed
    // For now, just log since the schema doesn't include collaborators
    logger.warn('Invitation acceptance not implemented - missing database schema');
    
    logger.info(`✅ Accepted invitation to project ${projectId}`);
  }

  // Generate a URL-safe subdomain from project name
  private static generateSubdomain(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30) + '-' + Math.random().toString(36).substring(2, 8)
  }
}