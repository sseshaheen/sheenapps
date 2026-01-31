# Voice Transcription Storage Plan

**Status**: Planning
**Created**: 2026-01-18
**Priority**: HIGH (Critical gap in current implementation)

## Problem Statement

Current implementation has NO persistence:
- ❌ Audio files not stored
- ❌ Transcriptions not stored
- ❌ No audit trail or quality monitoring
- ❌ WebM fragment uploads failing (400 errors)

## Proposed Solution

### 1. Database Schema

```sql
-- Voice transcriptions table
CREATE TABLE voice_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL, -- Optional: if tied to project creation

  -- Audio metadata
  audio_storage_path TEXT NOT NULL, -- Supabase storage path
  audio_url TEXT, -- Signed URL (generated on demand)
  audio_size_bytes BIGINT NOT NULL,
  audio_duration_seconds DECIMAL(8,2),
  audio_mime_type TEXT NOT NULL,

  -- Transcription
  transcription_text TEXT NOT NULL,
  language TEXT NOT NULL, -- ISO 639-1 (ar, en, fr, etc.)
  provider TEXT NOT NULL, -- 'openai-whisper', 'web-speech'
  model TEXT, -- 'gpt-4o-mini-transcribe', etc.

  -- Quality metrics
  confidence_score DECIMAL(5,4), -- 0.0000 to 1.0000
  word_count INTEGER,

  -- Usage tracking
  api_cost_usd DECIMAL(10,6), -- Track actual costs
  processing_time_ms INTEGER,

  -- Metadata
  user_agent TEXT,
  ip_address INET,
  locale TEXT, -- User's interface locale

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Indexes
  CONSTRAINT valid_duration CHECK (audio_duration_seconds >= 0),
  CONSTRAINT valid_size CHECK (audio_size_bytes > 0),
  CONSTRAINT valid_cost CHECK (api_cost_usd >= 0)
);

-- Indexes for common queries
CREATE INDEX idx_voice_transcriptions_user_id ON voice_transcriptions(user_id);
CREATE INDEX idx_voice_transcriptions_created_at ON voice_transcriptions(created_at DESC);
CREATE INDEX idx_voice_transcriptions_project_id ON voice_transcriptions(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_voice_transcriptions_language ON voice_transcriptions(language);

-- RLS Policies
ALTER TABLE voice_transcriptions ENABLE ROW LEVEL SECURITY;

-- Users can view own transcriptions
CREATE POLICY "Users can view own transcriptions"
  ON voice_transcriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert own transcriptions
CREATE POLICY "Users can insert own transcriptions"
  ON voice_transcriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own transcriptions (e.g., corrections)
CREATE POLICY "Users can update own transcriptions"
  ON voice_transcriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete own transcriptions
CREATE POLICY "Users can delete own transcriptions"
  ON voice_transcriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access all (for admin/analytics)
CREATE POLICY "Service role full access"
  ON voice_transcriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Updated at trigger
CREATE TRIGGER update_voice_transcriptions_updated_at
  BEFORE UPDATE ON voice_transcriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 2. Supabase Storage Bucket

**Bucket Configuration:**
```typescript
// Bucket: voice-recordings
{
  name: 'voice-recordings',
  public: false, // Private - use signed URLs
  fileSizeLimit: 10485760, // 10MB max
  allowedMimeTypes: [
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg'
  ]
}
```

**Path Structure:**
```
voice-recordings/
  {userId}/
    {year}/
      {month}/
        {recordingId}.{ext}

Example:
  b8864549-341a-4e6e-b01f-15a76efbf5cf/
    2026/
      01/
        550e8400-e29b-41d4-a716-446655440000.webm
```

**RLS Policies:**
```sql
-- Users can upload to own folder
CREATE POLICY "Users can upload own recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'voice-recordings' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read own recordings
CREATE POLICY "Users can read own recordings"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'voice-recordings' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete own recordings
CREATE POLICY "Users can delete own recordings"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'voice-recordings' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

### 3. Updated Flow

#### **New Recording Flow:**

```
1. User starts recording
   ↓
2. MediaRecorder collects chunks in memory (NO uploads)
   ↓
3. User clicks "Done"
   ↓
4. Combine all chunks into single Blob
   ↓
5. Upload to Supabase Storage
   ↓
6. Send complete file to OpenAI for transcription
   ↓
7. Save transcription + metadata to database
   ↓
8. Return transcription to UI
```

#### **Code Changes Required:**

**File: `chunked-openai-transcription-provider.ts`**

```typescript
async stop() {
  // Stop recording
  if (this.mediaRecorder?.state === 'recording') {
    this.mediaRecorder.stop();
  }

  // Wait for final dataavailable event
  await new Promise(resolve => setTimeout(resolve, 200));

  // Create complete recording
  const mimeType = this.getSupportedMimeType();
  const fullRecording = new Blob(this.allChunks, { type: mimeType });

  try {
    // 1. Upload to Supabase Storage
    const storageResult = await this.uploadToStorage(fullRecording);

    // 2. Transcribe via OpenAI
    const transcription = await this.transcribeAudio(fullRecording);

    // 3. Save to database
    await this.saveTranscription({
      audioPath: storageResult.path,
      audioSize: fullRecording.size,
      audioDuration: this.calculateDuration(),
      mimeType,
      transcription,
      language: this.language,
      projectId: this.projectId
    });

    // 4. Return result to UI
    this.finalCallback?.(transcription);

  } catch (error) {
    console.error('Transcription failed:', error);
    this.errorCallback?.('Transcription failed. Please try again.');
  } finally {
    this.cleanup();
  }
}

private async uploadToStorage(blob: Blob): Promise<{ path: string }> {
  const recordingId = crypto.randomUUID();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ext = this.getFileExtension();

  const path = `${this.userId}/${year}/${month}/${recordingId}.${ext}`;

  const { data, error } = await supabase.storage
    .from('voice-recordings')
    .upload(path, blob, {
      contentType: blob.type,
      upsert: false
    });

  if (error) throw error;
  return { path: data.path };
}

private async transcribeAudio(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', blob);
  formData.append('language', this.language);
  if (this.projectId) formData.append('projectId', this.projectId);

  const response = await fetch('/api/v1/transcribe', {
    method: 'POST',
    body: formData,
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Transcription API failed');
  }

  const result = await response.json();
  return result.transcription;
}

private async saveTranscription(data: {
  audioPath: string;
  audioSize: number;
  audioDuration: number;
  mimeType: string;
  transcription: string;
  language: string;
  projectId?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('voice_transcriptions')
    .insert({
      user_id: this.userId,
      project_id: data.projectId,
      audio_storage_path: data.audioPath,
      audio_size_bytes: data.audioSize,
      audio_duration_seconds: data.audioDuration,
      audio_mime_type: data.mimeType,
      transcription_text: data.transcription,
      language: data.language,
      provider: 'openai-whisper',
      model: 'gpt-4o-mini-transcribe'
    });

  if (error) {
    console.error('Failed to save transcription to DB:', error);
    // Don't fail the whole flow - transcription still worked
  }
}
```

### 4. API Routes

**New Route: `/api/v1/transcribe` (replaces `/api/v1/realtime/transcribe`)**

```typescript
// src/app/api/v1/transcribe/route.ts

export async function POST(request: NextRequest) {
  try {
    // 1. Validate auth
    const session = await getSession();
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 2. Parse multipart form
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const language = formData.get('language') as string || 'en';
    const projectId = formData.get('projectId') as string | undefined;

    if (!audioFile) {
      return new Response('No audio file', { status: 400 });
    }

    // 3. Validate file size (10MB max)
    if (audioFile.size > 10 * 1024 * 1024) {
      return new Response('File too large (max 10MB)', { status: 413 });
    }

    // 4. Forward to worker for transcription
    const workerFormData = new FormData();
    workerFormData.append('audio', audioFile);
    workerFormData.append('language', language);
    workerFormData.append('userId', session.user.id);
    if (projectId) workerFormData.append('projectId', projectId);

    const workerResponse = await fetch(
      `${process.env.WORKER_BASE_URL}/v1/transcribe`,
      {
        method: 'POST',
        headers: createWorkerAuthHeaders('POST', '/v1/transcribe', null),
        body: workerFormData
      }
    );

    if (!workerResponse.ok) {
      const error = await workerResponse.text();
      return new Response(error, { status: workerResponse.status });
    }

    const result = await workerResponse.json();

    return NextResponse.json({
      transcription: result.text,
      language: result.language,
      duration: result.duration,
      cost: result.cost
    });

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response('Internal error', { status: 500 });
  }
}
```

**Worker Route: `/v1/transcribe`**

```typescript
// Simplified - no SSE, just JSON response
app.post('/v1/transcribe', {
  preHandler: requireHmacSignature()
}, async (request, reply) => {
  const data = await (request as any).file();
  const userId = data.fields.userId?.value;
  const language = data.fields.language?.value || 'en';

  // Convert to buffer
  const buffer = await data.toBuffer();

  // Call OpenAI
  const file = new File([buffer], 'audio.webm', { type: data.mimetype });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'gpt-4o-mini-transcribe',
    language,
    response_format: 'verbose_json'
  });

  // Calculate cost
  const durationMin = transcription.duration / 60;
  const cost = durationMin * 0.00167; // $0.10/hour

  return {
    text: transcription.text,
    language: transcription.language,
    duration: transcription.duration,
    cost
  };
});
```

### 5. Benefits

**Immediate:**
- ✅ No more WebM fragment errors
- ✅ Clean separation: record → store → transcribe
- ✅ Persistent storage for audit/quality

**Long-term:**
- ✅ Usage analytics (most common languages, avg duration)
- ✅ Cost tracking (actual spend per user)
- ✅ Quality monitoring (re-transcribe if low confidence)
- ✅ Compliance (GDPR data deletion)
- ✅ Replay capability (customer support)
- ✅ Training data (if users consent)

### 6. Cost Analysis

**Storage Costs (Supabase):**
- $0.021/GB/month
- 1000 recordings × 500KB avg = 500MB = **$0.01/month**

**Database Costs:**
- Metadata only (~1KB per row)
- 1000 rows = 1MB = negligible

**Transcription Costs (unchanged):**
- OpenAI: $0.10/hour audio = $0.00167/minute
- Average 2-min recording = $0.00334

**Total Added Cost: ~$0.01/month for storage**

### 7. Migration Steps

**Phase 1: Database Setup**
- [ ] Create `voice_transcriptions` table
- [ ] Add RLS policies
- [ ] Test with manual inserts

**Phase 2: Storage Setup**
- [ ] Create `voice-recordings` bucket in Supabase
- [ ] Configure MIME types and size limits
- [ ] Add RLS policies
- [ ] Test manual upload/download

**Phase 3: Code Changes**
- [ ] Update `chunked-openai-transcription-provider.ts`
- [ ] Remove chunk uploading logic
- [ ] Add storage upload on stop()
- [ ] Add database insert on stop()

**Phase 4: API Routes**
- [ ] Create new `/api/v1/transcribe` route
- [ ] Deprecate `/api/v1/realtime/transcribe`
- [ ] Update worker `/v1/transcribe` endpoint

**Phase 5: Testing**
- [ ] Test complete flow: record → store → transcribe → save
- [ ] Verify RLS policies work
- [ ] Test file size limits
- [ ] Test concurrent uploads

**Phase 6: Cleanup**
- [ ] Remove old realtime upload code
- [ ] Update documentation
- [ ] Add monitoring alerts

### 8. Data Retention Policy

**Recommended:**
- Keep transcriptions: **90 days** (user can delete anytime)
- Keep audio files: **30 days** (then delete, keep transcript only)
- Admin/compliance: **2 years** (metadata only)

**Auto-cleanup cron job:**
```sql
-- Delete audio files older than 30 days
DELETE FROM storage.objects
WHERE bucket_id = 'voice-recordings'
  AND created_at < NOW() - INTERVAL '30 days';

-- Delete transcriptions older than 90 days
DELETE FROM voice_transcriptions
WHERE created_at < NOW() - INTERVAL '90 days';
```

---

## Summary

**Current State:** No persistence, WebM fragment errors
**Proposed State:** Complete storage + database tracking
**Cost Impact:** +$0.01/month for storage
**Effort:** 2-3 days implementation
**Priority:** HIGH (fixes critical bugs + adds audit trail)
