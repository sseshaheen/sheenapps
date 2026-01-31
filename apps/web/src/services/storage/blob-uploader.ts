import { createClient } from '@/lib/supabase-client'
import { logger } from '@/utils/logger';

export class BlobUploader {
  private static readonly MAX_COMMIT_SIZE = 250 * 1024 // 250KB
  
  static async uploadContent(content: any): Promise<string> {
    const supabase = createClient()
    
    // 1. Serialize and validate size
    const serialized = JSON.stringify(content)
    const size = new Blob([serialized]).size
    
    if (size > this.MAX_COMMIT_SIZE) {
      throw new Error(`Commit payload too large: ${size} bytes (max: ${this.MAX_COMMIT_SIZE})`)
    }
    
    // 2. Generate content hash
    const hash = await this.generateHash(serialized)
    
    // 3. Check if already exists
    const { data: existing } = await supabase.storage
      .from('objects')
      .list('', { search: hash })
    
    if (existing && existing.length > 0) {
      logger.info(`📦 Content already exists: ${hash}`);
      return hash
    }
    
    // 4. Upload new blob
    const { error } = await supabase.storage
      .from('objects')
      .upload(`objects/${hash}`, serialized, {
        contentType: 'application/json',
        cacheControl: '3600'
      })
    
    if (error) {
      throw new Error(`Upload failed: ${error.message}`)
    }
    
    logger.info(`📤 Uploaded content: ${hash} (${size} bytes);`)
    return hash
  }
  
  static async downloadContent(hash: string): Promise<any> {
    const supabase = createClient()
    
    const { data, error } = await supabase.storage
      .from('objects')
      .download(`objects/${hash}`)
    
    if (error || !data) {
      throw new Error(`Download failed: ${error?.message || 'No data'}`)
    }
    
    const text = await data.text()
    return JSON.parse(text)
  }
  
  // Future: replace with CRDT diff blocks
  static async uploadDiff(baseHash: string, diff: any): Promise<string> {
    const diffContent = { type: 'diff', base: baseHash, changes: diff }
    return this.uploadContent(diffContent)
  }
  
  private static async generateHash(content: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
}