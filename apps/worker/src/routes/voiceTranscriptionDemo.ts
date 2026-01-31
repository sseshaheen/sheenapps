/**
 * Demo Voice Transcription Route (Unauthenticated)
 *
 * POST /v1/demo/transcribe
 *
 * Public endpoint for homepage voice input demo.
 * Transcribes audio WITHOUT saving to database or storage.
 * Uses same validation and transcription logic as authenticated endpoint.
 *
 * Security:
 * - HMAC authentication (prevents abuse)
 * - File size limits (25MB max)
 * - File signature validation
 * - Rate limiting recommended (TODO)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { createSpeechProvider } from '../services/speech-to-text-factory';

function startsWith(buf: Uint8Array, sig: number[], offset = 0): boolean {
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

function validateFileSignature(buf: Buffer): boolean {
  const h = new Uint8Array(buf.slice(0, 32));

  // WebM: 0x1A 0x45 0xDF 0xA3
  if (startsWith(h, [0x1A, 0x45, 0xDF, 0xA3])) return true;

  // MP4/M4A: 'ftyp' at offset 4
  if (h.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') return true;

  // MP3: 0xFF 0xE0-0xEF or 'ID3'
  if (h.length >= 2 && h[0] === 0xFF && (h[1]! & 0xE0) === 0xE0) return true;
  if (buf.toString('ascii', 0, 3) === 'ID3') return true;

  // WAV: 'RIFF....WAVE'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return true;

  // OGG: 'OggS'
  if (buf.toString('ascii', 0, 4) === 'OggS') return true;

  // FLAC: 'fLaC'
  if (buf.toString('ascii', 0, 4) === 'fLaC') return true;

  return false;
}

function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseSignedMeta(raw: string): Record<string, string> {
  const lines = raw.trim().split('\n');
  const meta: Record<string, string> = {};
  for (const line of lines) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      meta[key.trim()] = decodeURIComponent(valueParts.join('=').trim());
    }
  }
  return meta;
}

function mustEqual(field: string, a: string, b: string): void {
  if (a !== b) {
    throw new Error(`${field} mismatch: expected ${b}, got ${a}`);
  }
}

interface DemoTranscribeHeaders {
  'x-audio-sha256': string;
  'x-audio-mime': string;
  'x-audio-size': string;
  'x-sheen-user-id': string;
  'x-sheen-project-id': string;
  'x-sheen-provider': string;
  'x-sheen-signed-meta': string;
  'x-request-id'?: string;
}

export default async function voiceTranscriptionDemoRoutes(app: FastifyInstance) {
  app.post<{
    Headers: DemoTranscribeHeaders;
  }>('/v1/demo/transcribe', {
    preHandler: requireHmacSignature()
  }, async (request: FastifyRequest<{
    Headers: DemoTranscribeHeaders;
  }>, reply: FastifyReply) => {
    const requestId = request.headers['x-request-id'] || crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Extract metadata from headers
      const expectedHash = request.headers['x-audio-sha256'];
      const mimeType = request.headers['x-audio-mime'];
      const expectedSize = Number.parseInt(request.headers['x-audio-size'], 10);
      const userId = request.headers['x-sheen-user-id'];
      const provider = request.headers['x-sheen-provider'];
      const signedMetaRaw = request.headers['x-sheen-signed-meta'];

      if (!expectedHash || !mimeType || !userId || !provider) {
        return reply.code(400).send({
          error: 'Missing required headers',
          requestId
        });
      }

      // Validate expectedSize
      if (!Number.isFinite(expectedSize) || expectedSize <= 0) {
        return reply.code(400).send({
          error: 'Invalid x-audio-size header',
          requestId
        });
      }

      // Validate provider
      if (provider !== 'openai') {
        return reply.code(400).send({
          error: 'Unsupported provider',
          requestId
        });
      }

      // Validate signed metadata
      if (!signedMetaRaw) {
        return reply.code(400).send({
          error: 'Missing x-sheen-signed-meta',
          requestId
        });
      }

      let meta: Record<string, string>;
      try {
        // Decode base64 encoded metadata (Next.js encodes to allow newlines in HTTP header)
        const decodedMeta = Buffer.from(signedMetaRaw, 'base64').toString('utf-8');
        meta = parseSignedMeta(decodedMeta);
      } catch (err) {
        const status = (err as any)?.statusCode ?? 400;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : 'Invalid signed meta',
          requestId
        });
      }

      // Compare meta ↔ headers (demo endpoint doesn't use projectId)
      try {
        mustEqual('userId', meta.userId || '', userId);
        mustEqual('audioHash', meta.audioHash || '', expectedHash);
        mustEqual('size', meta.size || '', String(expectedSize));
        mustEqual('mime', meta.mime || '', mimeType);
        mustEqual('provider', meta.provider || '', provider);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Metadata mismatch',
          requestId
        });
      }

      // Parse multipart form data
      const data = await (request as any).file();

      if (!data) {
        return reply.code(400).send({
          error: 'No audio file provided',
          requestId
        });
      }

      // Read audio buffer
      const audioBuffer = await data.toBuffer();

      const uploadedMimeRaw = data.mimetype;
      const uploadedMime = (uploadedMimeRaw && uploadedMimeRaw === mimeType)
        ? uploadedMimeRaw
        : mimeType;

      // Enforce file size limit
      const MAX_FILE_SIZE = 25 * 1024 * 1024;
      if (audioBuffer.length > MAX_FILE_SIZE) {
        return reply.code(400).send({
          error: 'File exceeds 25MB limit',
          requestId
        });
      }

      // Verify SHA-256 hash
      const actualHash = sha256(audioBuffer);
      if (actualHash !== expectedHash) {
        console.error('[Demo Transcription] Hash mismatch', {
          requestId,
          expected: expectedHash,
          actual: actualHash
        });
        return reply.code(400).send({
          error: 'Audio integrity check failed',
          requestId
        });
      }

      // Verify file size
      if (audioBuffer.length !== expectedSize) {
        console.error('[Demo Transcription] Size mismatch', {
          requestId,
          expected: expectedSize,
          actual: audioBuffer.length
        });
        return reply.code(400).send({
          error: 'Audio size mismatch',
          requestId
        });
      }

      // Validate file signature
      if (!validateFileSignature(audioBuffer)) {
        console.error('[Demo Transcription] Invalid file signature', {
          requestId,
          mimeType
        });
        return reply.code(400).send({
          error: 'Invalid audio file format',
          requestId
        });
      }

      // Extract language from form data
      const language = data.fields.language?.value as string | undefined;

      // Create speech provider
      const speechProvider = createSpeechProvider(provider);

      console.log('[Demo Transcription] Starting transcription', {
        requestId,
        provider,
        language,
        size: audioBuffer.length,
        mimeType
      });

      // Transcribe audio
      const transcriptionStart = Date.now();

      const extMapQuick: Record<string, string> = {
        'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
        'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg',
        'audio/aac': 'aac', 'audio/flac': 'flac'
      };
      const quickExt = extMapQuick[uploadedMime] || extMapQuick[mimeType] || 'webm';

      const result = await speechProvider.transcribe(audioBuffer, {
        ...(language ? { language } : {}),
        mimeType: uploadedMime,
        filename: data.filename || `audio.${quickExt}`
      });
      const transcriptionDuration = Date.now() - transcriptionStart;

      console.log('[Demo Transcription] Complete', {
        requestId,
        duration: transcriptionDuration,
        textLength: result.text.length,
        detectedLanguage: result.language
      });

      // Return transcription without saving to database
      const totalDuration = Date.now() - startTime;

      return reply.send({
        transcription: result.text,
        language: result.language,
        duration: result.duration,
        processingTime: totalDuration,
        requestId
      });

    } catch (error) {
      console.error('[Demo Transcription] Error:', error);

      return reply.code(500).send({
        error: 'Transcription failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId
      });
    }
  });
}
