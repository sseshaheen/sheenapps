import { S3Client, PutObjectCommand, CreateBucketCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';
import fs from 'fs';

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'dev-sheenapps-builder-artifacts';

// Use API token for management operations, S3 credentials for object operations
const CF_API_TOKEN_R2 = process.env.CF_API_TOKEN_R2!;

if (!CF_ACCOUNT_ID) {
  console.error('Missing CF_ACCOUNT_ID');
}

// Create S3 client for R2
const s3Client = R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY ? new S3Client({
  region: 'auto',
  endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // Required for R2
}) : null;

const R2_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets`;

export interface R2UploadResult {
  url: string;
  key: string;
  size: number;
}

export type RetentionPolicy = 'standard' | 'monthly' | 'yearly';

export interface R2UploadOptions {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  retention?: RetentionPolicy | undefined;
  contentType?: string | undefined;
}

// Get the prefix path for retention policy
function getRetentionPrefix(retention: RetentionPolicy): string {
  return `snapshots/${retention}/`;
}

// Create R2 bucket (run once during setup)
export async function createR2Bucket(): Promise<boolean> {
  try {
    const response = await fetch(`${R2_API_BASE}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN_R2}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: R2_BUCKET_NAME,
        location: 'ENAM', // Eastern North America
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      if (error.includes('already exists')) {
        console.log(`R2 bucket ${R2_BUCKET_NAME} already exists`);
        return true;
      }
      throw new Error(`Failed to create R2 bucket: ${response.statusText} - ${error}`);
    }

    console.log(`Created R2 bucket: ${R2_BUCKET_NAME}`);
    return true;
  } catch (error) {
    console.error('Error creating R2 bucket:', error);
    return false;
  }
}

// Upload file to R2 with lifecycle tagging
export async function uploadToR2(
  filePath: string,
  key: string,
  options: R2UploadOptions = {}
): Promise<R2UploadResult> {
  const stats = fs.statSync(filePath);
  
  // If S3 client is not configured, fall back to API token method
  if (!s3Client) {
    console.log('S3 client not configured, using API token method');
    const fileStream = fs.createReadStream(filePath);
    
    try {
      // Try the direct upload API (if available)
      const uploadUrl = `${R2_API_BASE}/${R2_BUCKET_NAME}/objects/${key}`;
      
      console.log('Uploading to R2 via API:', {
        url: uploadUrl,
        bucket: R2_BUCKET_NAME,
        key: key,
        size: stats.size,
      });
      
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN_R2}`,
          'Content-Length': stats.size.toString(),
          'Content-Type': options.contentType || 'application/gzip',
          // No tagging headers needed - using prefix-based lifecycle rules
        },
        body: fileStream as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('R2 upload error:', errorText);
        throw new Error(`R2 upload failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('R2 API upload failed:', error);
      throw error;
    }
  } else {
    // Use S3-compatible upload
    try {
      console.log('Uploading to R2 via S3 SDK:', {
        bucket: R2_BUCKET_NAME,
        key: key,
        size: stats.size,
      });
      
      const fileBuffer = fs.readFileSync(filePath);
      
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: options.contentType || 'application/gzip',
        ContentLength: stats.size,
        // No tagging needed - using prefix-based lifecycle rules
      });
      
      await s3Client.send(command);
      console.log('✅ R2 upload successful');
    } catch (error) {
      console.error('R2 S3 upload failed:', error);
      throw error;
    }
  }

  // Generate public URL (requires bucket to be public or use signed URLs)
  const publicUrl = `https://pub-${CF_ACCOUNT_ID}.r2.dev/${R2_BUCKET_NAME}/${key}`;

  return {
    url: publicUrl,
    key,
    size: stats.size,
  }
}

// Try to download artifact from R2, checking all possible retention prefixes
export async function downloadArtifactFromR2(
  userId: string,
  projectId: string, 
  versionId: string,
  outputPath: string
): Promise<string> {
  const possibleKeys = getAllPossibleArtifactKeys(userId, projectId, versionId);
  
  for (const key of possibleKeys) {
    try {
      await downloadFromR2(key, outputPath);
      console.log(`✅ Downloaded artifact from: ${key}`);
      return key; // Return the key that worked
    } catch (error) {
      console.log(`❌ Artifact not found at: ${key}`);
      // Continue trying next key
    }
  }
  
  throw new Error(`Artifact not found in any retention tier for ${userId}/${projectId}/${versionId}`);
}

// Download file from R2
export async function downloadFromR2(
  key: string,
  outputPath: string
): Promise<void> {
  try {
    // Check if S3 client is configured
    if (!s3Client) {
      // Fallback to public URL if S3 client not configured
      const publicUrl = `https://pub-${CF_ACCOUNT_ID}.r2.dev/${R2_BUCKET_NAME}/${key}`;
      console.log('[R2 Download] S3 client not configured, trying public URL:', publicUrl);
      
      const response = await fetch(publicUrl);
      if (!response.ok) {
        throw new Error(`Public URL download failed: ${response.statusText}`);
      }
      
      const buffer = await response.buffer();
      fs.writeFileSync(outputPath, buffer);
      return;
    }
    
    console.log('[R2 Download] Using S3 client to download:', {
      bucket: R2_BUCKET_NAME,
      key: key
    });
    
    // Use S3 client's GetObjectCommand for proper authentication
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key
    });
    
    const response = await s3Client.send(command);
    
    console.log('[R2 Download] S3 Response metadata:', {
      statusCode: response.$metadata?.httpStatusCode,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      etag: response.ETag,
      metadata: response.Metadata
    });
    
    // Stream the response body to file
    if (response.Body) {
      const streamToBuffer = async (stream: any): Promise<Buffer> => {
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      };
      
      const buffer = await streamToBuffer(response.Body);
      fs.writeFileSync(outputPath, buffer);
      
      // Validate downloaded file
      const fileSize = buffer.length;
      const first100Bytes = buffer.slice(0, 100).toString('hex');
      const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B; // ZIP magic bytes "PK"
      
      console.log('[R2 Download] Downloaded file details:', {
        size: fileSize,
        first100BytesHex: first100Bytes.substring(0, 100),
        isValidZip: isZip,
        firstTwoBytes: buffer.slice(0, 2).toString('hex'),
        firstTextContent: buffer.slice(0, 200).toString('utf8').replace(/[^\x20-\x7E]/g, '?')
      });
      
      if (!isZip) {
        console.error('[R2 Download] WARNING: Downloaded file does not appear to be a ZIP (missing PK magic bytes)');
      }
      
      console.log('[R2 Download] Successfully downloaded via S3 client');
    } else {
      throw new Error('No response body from R2');
    }
  } catch (error) {
    console.error('Error downloading from R2:', error);
    throw error;
  }
}

// Delete file from R2
export async function deleteFromR2(key: string): Promise<boolean> {
  try {
    const deleteUrl = `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`;
    
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN_R2}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`R2 delete failed: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting from R2:', error);
    return false;
  }
}

// List files in R2 bucket with prefix
export async function listR2Files(prefix: string): Promise<string[]> {
  try {
    const listUrl = `${R2_API_BASE}/${R2_BUCKET_NAME}/objects?prefix=${encodeURIComponent(prefix)}`;
    
    const response = await fetch(listUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN_R2}`,
      },
    });

    if (!response.ok) {
      throw new Error(`R2 list failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return (data.result?.objects || []).map((obj: any) => obj.key);
  } catch (error) {
    console.error('Error listing R2 files:', error);
    return [];
  }
}

// Generate artifact key for version with retention prefix
export function getArtifactKey(userId: string, projectId: string, versionId: string, retention: RetentionPolicy = 'standard'): string {
  const prefix = getRetentionPrefix(retention);
  return `${prefix}${userId}/${projectId}/${versionId}.tar.gz`;
}

// Generate diff key for version (always standard retention)
export function getDiffKey(userId: string, projectId: string, fromVersion: string, toVersion: string): string {
  const prefix = getRetentionPrefix('standard');
  return `${prefix}${userId}/${projectId}/packs/git_${fromVersion}_to_${toVersion}.pack.zip`;
}

// Determine retention policy based on date and project context
export function getRetentionPolicy(userId: string, projectId: string, isManualSnapshot = false): RetentionPolicy {
  const now = new Date();
  
  // Yearly snapshot: January 1st or manual yearly backup
  if ((now.getMonth() === 0 && now.getDate() === 1) || isManualSnapshot) {
    return 'yearly';
  }
  
  // Monthly snapshot: First day of month
  if (now.getDate() === 1) {
    return 'monthly';
  }
  
  // Standard retention for all other artifacts
  return 'standard';
}

// Try to find artifact with any retention policy (for downloads)
export function getAllPossibleArtifactKeys(userId: string, projectId: string, versionId: string): string[] {
  const policies: RetentionPolicy[] = ['yearly', 'monthly', 'standard'];
  return policies.map(policy => getArtifactKey(userId, projectId, versionId, policy));
}