import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * Generate a signed URL for downloading from R2
 * @param artifactUrl - Full R2 URL to the artifact
 * @param expiresIn - Expiration time ('24h' or seconds as string)
 * @returns Signed URL for downloading
 */
export async function generateR2SignedUrl(
  artifactUrl: string, 
  expiresIn: string = '24h'
): Promise<string> {
  // Extract key from full URL
  // Format: https://pub-[id].r2.dev/[user_id]/[project_id]/snapshots/[version_id].zip
  const url = new URL(artifactUrl);
  const key = url.pathname.slice(1); // Remove leading slash
  
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ResponseContentDisposition: 'attachment', // Force download
  });
  
  const expiresInSeconds = expiresIn === '24h' ? 24 * 60 * 60 : parseInt(expiresIn);
  
  return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Extract metadata from artifact URL for response formatting
 * @param artifactUrl - Full R2 URL to the artifact
 * @returns Parsed metadata
 */
export function parseArtifactUrl(artifactUrl: string): {
  userId: string;
  projectId: string;
  versionId: string;
} {
  // Extract from URL path: /[user_id]/[project_id]/snapshots/[version_id].zip
  const url = new URL(artifactUrl);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  const userId = pathParts[0];
  const projectId = pathParts[1];
  const versionPart = pathParts[3];

  if (!userId || !projectId || !versionPart) {
    throw new Error('Invalid artifact URL format');
  }

  return {
    userId,
    projectId,
    versionId: versionPart.replace('.zip', '')
  };
}