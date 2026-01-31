-- Migration: Add Payment ID Uniqueness Constraint
-- Date: 2025-07-27
-- Description: Adds simple uniqueness constraint to prevent duplicate payment processing

BEGIN;

-- Add uniqueness constraint for payment_id to prevent double-credit on duplicate webhooks
-- This follows the lean approach from Phase 2 plan - simple constraints first
ALTER TABLE user_ai_time_purchases
ADD CONSTRAINT uniq_payment_id UNIQUE (payment_id);

-- Add comment for documentation
COMMENT ON CONSTRAINT uniq_payment_id ON user_ai_time_purchases 
IS 'Prevents duplicate payment processing from webhook retries or race conditions';

-- Optional: Add simple uniqueness for idempotency key in consumption table
-- This prevents double-billing for the same operation
ALTER TABLE user_ai_time_consumption
ADD CONSTRAINT uniq_idempotency_key UNIQUE (idempotency_key);

-- Add comment for documentation  
COMMENT ON CONSTRAINT uniq_idempotency_key ON user_ai_time_consumption
IS 'Prevents duplicate billing for the same build operation';

COMMIT;