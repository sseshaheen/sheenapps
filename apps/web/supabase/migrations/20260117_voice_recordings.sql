-- Voice Recordings Feature: Add support for voice input transcription
-- This migration creates the voice_recordings table with RLS policies and storage bucket

-- ============================================================================
-- 1. Create voice_recordings table
-- ============================================================================

CREATE TABLE voice_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Audio file details
  audio_url text NOT NULL,                    -- Supabase Storage URL
  audio_format text NOT NULL,                 -- 'webm', 'mp3', 'wav', etc.
  duration_seconds integer,                   -- Audio duration
  file_size_bytes integer,                    -- File size

  -- Transcription details
  transcription text NOT NULL,                -- Final transcribed text
  detected_language text,                     -- ISO 639-1 code (e.g., 'en', 'ar')
  confidence_score numeric(3,2),              -- 0.00-1.00 (if provider returns)
  provider text NOT NULL DEFAULT 'openai',    -- 'openai', 'assemblyai', etc.
  model_version text,                         -- 'gpt-4o-mini-transcribe', etc.

  -- Cost tracking
  processing_duration_ms integer,             -- Time taken to transcribe
  cost_usd numeric(10,6),                     -- Cost in USD

  -- Linking to messages (one direction only) - FK added conditionally below
  message_id uuid,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. Create indexes for performance
-- ============================================================================

CREATE INDEX idx_voice_recordings_project_id ON voice_recordings(project_id);
CREATE INDEX idx_voice_recordings_user_id ON voice_recordings(user_id);
CREATE INDEX idx_voice_recordings_created_at ON voice_recordings(created_at DESC);
CREATE INDEX idx_voice_recordings_message_id ON voice_recordings(message_id);

-- ============================================================================
-- 3. Enable Row Level Security
-- ============================================================================

ALTER TABLE voice_recordings ENABLE ROW LEVEL SECURITY;

-- Users can only read their own recordings
CREATE POLICY "Users can view own voice recordings"
  ON voice_recordings FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert recordings for projects they own
CREATE POLICY "Users can create voice recordings for own projects"
  ON voice_recordings FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE id = voice_recordings.project_id
      AND owner_id = auth.uid()
    )
  );

-- Users can delete their own recordings
CREATE POLICY "Users can delete own voice recordings"
  ON voice_recordings FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. Create Supabase Storage bucket for audio files
-- ============================================================================

-- Create storage bucket for audio files (not public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-recordings', 'voice-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. Storage policies: Users can upload to their own user folder
-- ============================================================================

-- Storage policy: Users can upload voice recordings to their own folder
CREATE POLICY "Users can upload voice recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'voice-recordings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policy: Users can read their own recordings
CREATE POLICY "Users can view own voice recordings in storage"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'voice-recordings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policy: Users can delete their own recordings
CREATE POLICY "Users can delete own voice recordings from storage"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'voice-recordings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- P1 FIX: Explicitly deny UPDATE operations on audio files
-- Voice recordings should be immutable once uploaded (append-only)
-- This prevents accidental or malicious modification of audio evidence
CREATE POLICY "Voice recordings are immutable"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'voice-recordings'
    AND false  -- Deny all UPDATEs
  );

-- ============================================================================
-- 6. Conditional foreign key for message_id (if chat_messages table exists)
-- ============================================================================

-- Only add FK constraint if chat_messages table exists (persistent chat feature deployed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
    -- Add foreign key constraint
    ALTER TABLE voice_recordings
      ADD CONSTRAINT fk_voice_recordings_message_id
      FOREIGN KEY (message_id)
      REFERENCES chat_messages(id)
      ON DELETE SET NULL;

    RAISE NOTICE 'Added foreign key constraint to chat_messages table';
  ELSE
    RAISE NOTICE 'Skipped foreign key constraint - chat_messages table does not exist yet';
  END IF;
END $$;

-- ============================================================================
-- Notes:
-- ============================================================================
--
-- Single-direction foreign key design:
--   - voice_recordings.message_id → chat_messages.id (added conditionally if table exists)
--   - NO reverse reference in chat_messages table
--   - Voice recording "belongs to" message, not vice versa
--   - Prevents bidirectional FK complexity and potential inconsistencies
--   - FK will be added automatically when persistent chat feature is deployed
--
-- Storage folder structure:
--   - {userId}/{recordingId}.webm
--   - RLS ensures users can only access their own folder
--   - Audio files stored securely and never public
--   - UPDATE operations explicitly denied (immutable/append-only)
--
-- Cost tracking:
--   - cost_usd field tracks per-transcription cost for analytics
--   - processing_duration_ms tracks latency for monitoring
