-- Migration: 043_i18n_locale_support.sql
-- Description: Add locale support for internationalization
-- Date: 2025-08-24

-- Add preferred_locale to chat sessions for user locale preferences
ALTER TABLE unified_chat_sessions
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT;

-- Index for efficient locale-based queries
CREATE INDEX IF NOT EXISTS idx_sessions_locale
  ON unified_chat_sessions(preferred_locale)
  WHERE preferred_locale IS NOT NULL;

-- Update existing sessions to have a default locale (optional)
-- UPDATE unified_chat_sessions SET preferred_locale = 'en-US' WHERE preferred_locale IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN unified_chat_sessions.preferred_locale IS 'BCP-47 locale code (e.g., ar-EG, en-US, fr-FR) for user interface language preference';