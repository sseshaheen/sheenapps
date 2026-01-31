-- Voice Recordings: Add input_tokens for cost transparency
--
-- Phase 2 Enhancement: Store token count from OpenAI API response
-- for better cost visibility and analytics.
--
-- Background:
-- - gpt-4o-mini-transcribe returns token usage in response
-- - Worker already extracts inputTokens (see transcribe.ts line 131)
-- - Worker already returns inputTokens (see transcribe.ts line 195)
-- - Next.js API receives it but wasn't saving it
--
-- Benefits:
-- - Transparent cost calculation: cost = (inputTokens / 1000) * 0.01
-- - Detect token inflation issues
-- - Compare efficiency across languages/durations
--
-- Created: 2026-01-21
-- Status: READY FOR REVIEW

-- ============================================================================
-- 1. Add input_tokens column
-- ============================================================================
-- Integer to store token count from OpenAI transcription API
-- Nullable because:
-- - Existing records don't have this data
-- - whisper-1 model doesn't return tokens (only gpt-4o-mini-transcribe does)

ALTER TABLE voice_recordings
  ADD COLUMN IF NOT EXISTS input_tokens integer;

-- ============================================================================
-- 2. Add index for analytics queries (optional, for cost analysis)
-- ============================================================================
-- Useful for queries like:
--   SELECT AVG(input_tokens), AVG(cost_usd) GROUP BY detected_language
--   SELECT * WHERE input_tokens > 1000 ORDER BY input_tokens DESC

CREATE INDEX IF NOT EXISTS idx_voice_recordings_input_tokens
  ON voice_recordings(input_tokens)
  WHERE input_tokens IS NOT NULL;

-- ============================================================================
-- Notes:
-- ============================================================================
--
-- Token pricing (gpt-4o-mini-transcribe as of Jan 2026):
-- - $0.01 per 1,000 input tokens
-- - No output token charges for transcription
--
-- Token breakdown from API:
-- - input_tokens: Total tokens (text + audio)
-- - input_token_details.text_tokens: Text portion
-- - input_token_details.audio_tokens: Audio portion
-- We only store total input_tokens for simplicity.
--
-- Code changes after this migration:
-- 1. /api/v1/transcribe: Add input_tokens to insertData
-- 2. Admin APIs: Already use SELECT * so they'll include it
-- 3. Admin page: Display in recording detail modal
--
