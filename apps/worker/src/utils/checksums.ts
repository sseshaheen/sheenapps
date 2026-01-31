import crypto from 'crypto';
import fs from 'fs';

/**
 * Calculate SHA256 checksum for a file
 * @param filePath - Path to the file to checksum
 * @returns Promise that resolves to hex-encoded SHA256 hash
 */
export async function calculateSHA256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Verify a file's SHA256 checksum
 * @param filePath - Path to the file to verify
 * @param expectedChecksum - Expected SHA256 hash (hex-encoded)
 * @returns Promise that resolves to true if checksums match
 */
export async function verifySHA256(filePath: string, expectedChecksum: string): Promise<boolean> {
  try {
    const actualChecksum = await calculateSHA256(filePath);
    return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
  } catch (error) {
    console.error('Error verifying checksum:', error);
    return false;
  }
}

/**
 * Get file size in bytes
 * @param filePath - Path to the file
 * @returns Promise that resolves to file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.promises.stat(filePath);
    return stats.size;
  } catch (error) {
    console.error('Error getting file size:', error);
    throw error;
  }
}

/**
 * Format file size for human-readable display
 * @param bytes - Size in bytes
 * @returns Formatted size string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}