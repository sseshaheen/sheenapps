# Voice Input Feature - Deployment Guide

**Status**: Ready for deployment after all P0/P1 fixes applied
**Date**: January 17, 2026
**Green Light**: Expert approved after P0 fixes completed

---

## Pre-Deployment Checklist

### 1. Database Migration
Apply the voice recordings migration to create the table and storage bucket:

```bash
cd /Users/sh/Sites/sheenapps/sheenappsai

# Apply migration
supabase db push

# Verify table creation
psql $DATABASE_URL -c "\d voice_recordings"

# Verify RLS policies
psql $DATABASE_URL -c "SELECT * FROM pg_policies WHERE tablename = 'voice_recordings';"

# Verify storage bucket (check Supabase Dashboard > Storage)
```

**Expected table structure**:
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `project_id` (uuid, references projects)
- `audio_url` (text, storage path)
- `transcription_text` (text)
- `detected_language` (varchar(10))
- `duration_seconds` (numeric)
- `file_size_bytes` (integer)
- `mime_type` (varchar(50))
- `provider` (varchar(50))
- `created_at` (timestamptz)

### 2. Worker Service Dependencies

**CRITICAL:** Install required npm packages in the worker service:

```bash
cd /Users/sh/Sites/sheenapps/sheenapps-claude-worker

# Install OpenAI SDK
pnpm add openai

# Install Fastify multipart support for file uploads (REQUIRED for P1 Fix #5)
pnpm add @fastify/multipart

# Verify installation
pnpm list openai @fastify/multipart
```

**Why Critical:**
- Without `openai`: Transcription will fail
- Without `@fastify/multipart`: File uploads will fail + no DoS protection (P1 Fix #5)

### 3. Worker Service Configuration

**CRITICAL:** Add multipart support to the Fastify server in `src/server.ts`:

```typescript
import multipart from '@fastify/multipart';

// After creating the Fastify app instance (before registering routes)
// P1 FIX #5: File size limits for DoS protection
app.register(multipart, {
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB (OpenAI limit)
    files: 1 // Only accept single file
  }
});
```

**Why Critical:**
- P1 Fix #5: Enforces file size limits at Fastify level (DoS protection)
- Route also checks manually after reading buffer (defense in depth)
- Without this: Worker accepts unlimited file sizes → memory exhaustion

### 4. Environment Variables

#### Next.js App (.env.local):
```bash
# Feature flag (set to 'true' to enable)
NEXT_PUBLIC_ENABLE_VOICE_INPUT=true

# Worker service URL
WORKER_BASE_URL=http://localhost:8081  # Development
# WORKER_BASE_URL=https://worker.sheenapps.com  # Production

# Worker authentication (must match worker)
WORKER_SHARED_SECRET=<your-shared-secret-32-chars-min>
```

#### Worker Service (.env):
```bash
# OpenAI API key for Whisper transcription
OPENAI_API_KEY=<your-openai-api-key>

# Supabase credentials (for storage upload)
SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Worker authentication (must match Next.js)
WORKER_SHARED_SECRET=<your-shared-secret-32-chars-min>
```

### 5. Generate TypeScript Types

After applying the database migration, regenerate TypeScript types:

```bash
cd /Users/sh/Sites/sheenapps/sheenappsai

# Generate types from database schema
supabase gen types typescript --project-id <your-project-id> > src/types/supabase.ts

# Verify voice_recordings type is present
grep "voice_recordings" src/types/supabase.ts
```

---

## Deployment Steps

### Development/Staging Deployment

1. **Apply Database Migration**
   ```bash
   cd /Users/sh/Sites/sheenapps/sheenappsai
   supabase db push
   ```

2. **Install Worker Dependencies**
   ```bash
   cd /Users/sh/Sites/sheenapps/sheenapps-claude-worker
   pnpm install
   ```

3. **Start Worker Service**
   ```bash
   cd /Users/sh/Sites/sheenapps/sheenapps-claude-worker
   pnpm dev  # or pm2 start ecosystem.config.js
   ```

4. **Start Next.js App**
   ```bash
   cd /Users/sh/Sites/sheenapps/sheenappsai
   npm run dev:safe
   ```

5. **Enable Feature Flag**
   - Set `NEXT_PUBLIC_ENABLE_VOICE_INPUT=true` in `.env.local`
   - Restart Next.js dev server

6. **Test Voice Input**
   - Open Builder chat interface
   - Click microphone button
   - Record audio
   - Verify transcription appears in chat input
   - Check Supabase Storage for uploaded audio file
   - Check `voice_recordings` table for metadata

### Production Deployment

1. **Apply Database Migration**
   ```bash
   # Use Supabase CLI or Dashboard Migration Runner
   supabase db push --project-ref <prod-project-ref>
   ```

2. **Deploy Worker Service**
   ```bash
   cd /Users/sh/Sites/sheenapps/sheenapps-claude-worker

   # Install dependencies
   pnpm install --prod

   # Build
   pnpm build

   # Deploy (example for PM2)
   pm2 start ecosystem.config.js --env production
   pm2 save
   ```

3. **Deploy Next.js App**
   ```bash
   cd /Users/sh/Sites/sheenapps/sheenappsai

   # Build
   npm run build

   # Deploy to Vercel
   vercel --prod
   ```

4. **Enable Feature Flag** (Gradual Rollout)
   - **Phase 1**: Enable for internal team only (beta testers)
   - **Phase 2**: Enable for 10% of users (canary)
   - **Phase 3**: Enable for all users (full rollout)

   ```bash
   # Set in Vercel environment variables
   NEXT_PUBLIC_ENABLE_VOICE_INPUT=true
   ```

---

## Verification & Testing

### Functional Tests

1. **Microphone Permission**
   - Browser prompts for microphone access
   - Permission denial shows friendly error message
   - Permission grant enables recording

2. **Recording Flow**
   - Click mic button → recording starts
   - Duration timer displays
   - Stop button appears
   - Click stop → transcription begins

3. **Transcription**
   - Loading spinner shows during transcription
   - Transcribed text appears in chat input
   - Language detection works correctly
   - Multi-line text handling

4. **Max Duration**
   - Recording auto-stops at 2 minutes
   - User sees clear indication
   - Partial recording transcribes successfully

5. **Error Handling**
   - No microphone → friendly error
   - Network failure → retry logic
   - File too large → clear error message
   - Invalid audio format → validation error

### Security Tests

1. **HMAC Signature Verification**
   ```bash
   # Test with invalid signature (should fail with 401)
   curl -X POST http://localhost:8081/v1/projects/test-id/transcribe \
     -H "x-signature: invalid" \
     -F "audio=@test.webm"
   ```

2. **Hash Verification**
   ```bash
   # Test with tampered audio (should fail with 400)
   # Upload audio with mismatched x-audio-sha256 header
   ```

3. **File Signature Validation**
   ```bash
   # Test with non-audio file (should fail with 400)
   curl -X POST ... -F "audio=@malicious.exe"
   ```

### Performance Tests

1. **Transcription Latency**
   - Target: <5 seconds for 30-second audio
   - Monitor OpenAI API response times
   - Check worker processing overhead

2. **Storage Upload**
   - Verify audio files upload to correct user folder
   - Check file permissions (only owner can read)
   - Validate storage bucket quotas

3. **Database Writes**
   - Verify metadata saved correctly
   - Check for race conditions
   - Monitor query performance

---

## Monitoring & Observability

### Key Metrics to Track

1. **Usage Metrics**
   - Voice recordings per day
   - Average transcription length
   - Language distribution
   - Error rates by type

2. **Performance Metrics**
   - Transcription latency (p50, p95, p99)
   - Storage upload time
   - Worker API response time
   - OpenAI API latency

3. **Cost Metrics**
   - OpenAI API costs ($0.003/min)
   - Storage costs (Supabase)
   - Bandwidth costs

### Logging

Monitor these log entries:

```typescript
// Success
[Voice Transcription] Starting transcription { requestId, projectId, userId }
[Voice Transcription] Transcription complete { duration, textLength }
[Voice Transcription] Audio uploaded to storage { path }
[Voice Transcription] Complete { recordingId, totalDuration }

// Errors
[Voice Transcription] Hash mismatch { expected, actual }
[Voice Transcription] Invalid file signature { mimeType }
[Voice Transcription] Storage upload failed { error }
[Voice Transcription] Error { error, stack }
```

### Alerts

Set up alerts for:
- Error rate >5% over 5 minutes
- Transcription latency >10 seconds (p95)
- OpenAI API failures
- Storage quota warnings

---

## Rollback Plan

If critical issues arise:

1. **Disable Feature Flag**
   ```bash
   # Set in Vercel environment variables
   NEXT_PUBLIC_ENABLE_VOICE_INPUT=false
   ```

2. **Monitor Impact**
   - Check if in-flight requests complete
   - Verify no data corruption
   - Monitor error logs

3. **Rollback Worker** (if needed)
   ```bash
   cd /Users/sh/Sites/sheenapps/sheenapps-claude-worker
   git revert <commit-hash>
   pm2 restart worker
   ```

4. **Database Rollback** (last resort)
   - Migration is additive (safe to keep)
   - Data in `voice_recordings` table is isolated
   - No need to rollback unless table causes issues

---

## Known Limitations (MVP)

1. **Browser Support**
   - Requires MediaRecorder API (modern browsers only)
   - No support for IE11, old Safari versions
   - Feature gracefully hidden if not supported

2. **Audio Formats**
   - WebM preferred (best browser support)
   - Fallback to MP4 on Safari
   - No support for legacy formats (WMA, etc.)

3. **File Size**
   - 25MB limit (OpenAI constraint)
   - ~2 minutes at 128kbps (sufficient for MVP)

4. **Language Support**
   - Auto-detection based on browser locale
   - Manual language selection not yet implemented

5. **Provider Lock-in**
   - Only OpenAI Whisper supported in MVP
   - Abstraction layer ready for future providers

---

## Future Enhancements

1. **P1 Features** (Post-MVP)
   - Language selector dropdown
   - Pause/resume recording
   - Audio preview before transcription
   - Retry failed transcriptions

2. **P2 Features** (Nice-to-have)
   - Multiple provider support (AssemblyAI, Google)
   - Real-time streaming transcription
   - Custom vocabulary/terminology
   - Speaker diarization
   - Timestamp display
   - Export transcriptions

3. **Analytics**
   - Usage dashboard
   - Cost tracking per user
   - Accuracy metrics
   - Language distribution

---

## Troubleshooting

### Issue: "Microphone access denied"
**Solution**: Guide user to browser settings to grant permission

### Issue: "Transcription failed"
**Check**:
- OpenAI API key valid
- Network connectivity
- Audio file format supported
- File size within limits

### Issue: "Storage upload failed"
**Check**:
- Supabase service role key valid
- Storage bucket exists
- RLS policies configured
- User has write permission

### Issue: "Hash mismatch error"
**Cause**: Network corruption or tampering attempt
**Solution**: Client should retry upload

### Issue: "Worker endpoint returns 401"
**Check**:
- WORKER_SHARED_SECRET matches on both sides
- HMAC signature generation correct
- Request headers include all required fields

---

## Support & Documentation

- **Implementation Plan**: `/Users/sh/Sites/sheenapps/voice-input-implementation-plan.md`
- **Expert Feedback**: See Appendices A, B, C in implementation plan
- **API Documentation**: See route comments in code
- **User Guide**: (TODO: Create user-facing documentation)

---

## Sign-Off

**Expert Reviews Completed:**
- [x] Round 1: Core expert fixes (7 fixes)
- [x] Round 2: Phase 2 corrections (3 fixes)
- [x] Round 3: Security & polish (8 fixes)
- [x] Round 4: Critical runtime & security audit (7 fixes - **3 P0 prevented runtime crash**)

**Pre-Deployment Checklist:**
- [ ] Database migration applied successfully
- [ ] Worker dependencies installed (`openai`, `@fastify/multipart`)
- [ ] Multipart plugin registered in `worker/src/server.ts` (CRITICAL - P1 Fix #5)
- [ ] Environment variables configured
- [ ] TypeScript types generated
- [ ] Development testing complete
- [ ] Security review passed (4 rounds complete)
- [ ] Performance benchmarks met
- [ ] Monitoring/alerts configured
- [ ] Rollback plan documented
- [ ] Team trained on new feature

**Critical P0 Fixes Verified:**
- [x] P0 #1: DB column mismatch fixed (prevented 100% crash)
- [x] P0 #2: Signed metadata validation added (security)
- [x] P0 #3: MIME header bug fixed (browser compatibility)

**Deployment Approved By**: _________________
**Date**: _________________
**Expert Verdict**: "✅ The overall flow is good. Production-ready after P0 fixes."
