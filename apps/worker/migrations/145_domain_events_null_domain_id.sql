-- Migration: 145_domain_events_null_domain_id.sql
-- Description: Allow NULL domain_id in inhouse_domain_events for transfer lifecycle events
-- Part of easy-mode-email-enhancements-plan.md (Enhancement 4: Domain Transfer-In)
--
-- During domain transfer-in, events occur before the domain is registered in our system.
-- These events (transfer_initiated, transfer_processing, transfer_completed) need to be
-- recorded but have no domain_id until the transfer completes and we create the domain record.
--
-- This also makes the table more flexible for future event types that may not be tied
-- to a specific domain (e.g., bulk operations, system events).

BEGIN;

-- =============================================================================
-- Allow NULL domain_id for transfer events that occur before domain exists
-- =============================================================================
ALTER TABLE inhouse_domain_events
  ALTER COLUMN domain_id DROP NOT NULL;

-- Add comment documenting when NULL is valid
COMMENT ON COLUMN inhouse_domain_events.domain_id IS
  'References the domain this event relates to. NULL is allowed for transfer-in lifecycle events where the domain record does not yet exist.';

COMMIT;
