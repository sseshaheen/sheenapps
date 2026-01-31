-- Migration: Rename referral program tables to follow referral_ naming convention
-- Purpose: Ensure all referral-related tables start with "referral_" prefix
-- Date: 2025-01-28

BEGIN;

-- =====================================================
-- RENAME TABLES TO FOLLOW REFERRAL_ CONVENTION
-- =====================================================

-- Rename commissions -> referral_commissions
DO $$
BEGIN
    -- Check if old table exists and new table doesn't
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'commissions') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_commissions') THEN
        
        RAISE NOTICE 'Renaming commissions table to referral_commissions';
        ALTER TABLE commissions RENAME TO referral_commissions;
        
        -- Update constraint names to match new table name
        ALTER TABLE referral_commissions RENAME CONSTRAINT commissions_unique_payment_partner 
            TO referral_commissions_unique_payment_partner;
            
        -- Rename constraint checks if they exist
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_commission_currency_len') THEN
            ALTER TABLE referral_commissions RENAME CONSTRAINT chk_commission_currency_len 
                TO chk_referral_commission_currency_len;
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_commission_amounts_positive') THEN
            ALTER TABLE referral_commissions RENAME CONSTRAINT chk_commission_amounts_positive 
                TO chk_referral_commission_amounts_positive;
        END IF;
        
        RAISE NOTICE 'Successfully renamed commissions -> referral_commissions';
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_commissions') THEN
        RAISE NOTICE 'referral_commissions table already exists - skipping rename';
    ELSE
        RAISE NOTICE 'commissions table not found - skipping rename';
    END IF;
END $$;

-- Rename payout_batches -> referral_payout_batches  
DO $$
BEGIN
    -- Check if old table exists and new table doesn't
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payout_batches') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_payout_batches') THEN
        
        RAISE NOTICE 'Renaming payout_batches table to referral_payout_batches';
        ALTER TABLE payout_batches RENAME TO referral_payout_batches;
        RAISE NOTICE 'Successfully renamed payout_batches -> referral_payout_batches';
        
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_payout_batches') THEN
        RAISE NOTICE 'referral_payout_batches table already exists - skipping rename';
    ELSE
        RAISE NOTICE 'payout_batches table not found - skipping rename';
    END IF;
END $$;

-- =====================================================
-- UPDATE FOREIGN KEY REFERENCES
-- =====================================================

-- Update any foreign key references in referral_commissions that point to the payout table
DO $$
BEGIN
    -- Update column reference if it exists (payout_batch_id should now point to referral_payout_batches)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_commissions') THEN
        -- Note: The payout_batch_id is a VARCHAR field, not a foreign key constraint
        -- So no constraint updates needed, just table rename is sufficient
        RAISE NOTICE 'Foreign key references updated (payout_batch_id remains VARCHAR - no constraint changes needed)';
    END IF;
END $$;

-- =====================================================
-- UPDATE INDEX NAMES FOR CONSISTENCY
-- =====================================================

-- Rename indexes to match new table names
DO $$
DECLARE
    old_index_name TEXT;
    new_index_name TEXT;
BEGIN
    -- Update any indexes that reference the old table names
    FOR old_index_name IN 
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'referral_commissions' 
        AND indexname LIKE '%commissions%'
        AND indexname NOT LIKE '%referral_commissions%'
    LOOP
        new_index_name := REPLACE(old_index_name, 'commissions', 'referral_commissions');
        EXECUTE format('ALTER INDEX %I RENAME TO %I', old_index_name, new_index_name);
        RAISE NOTICE 'Renamed index: % -> %', old_index_name, new_index_name;
    END LOOP;
    
    FOR old_index_name IN 
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'referral_payout_batches' 
        AND indexname LIKE '%payout_batches%'
        AND indexname NOT LIKE '%referral_payout_batches%'
    LOOP
        new_index_name := REPLACE(old_index_name, 'payout_batches', 'referral_payout_batches');
        EXECUTE format('ALTER INDEX %I RENAME TO %I', old_index_name, new_index_name);
        RAISE NOTICE 'Renamed index: % -> %', old_index_name, new_index_name;
    END LOOP;
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=== VERIFICATION ===';
    
    -- List all referral-related tables
    FOR rec IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_name LIKE '%referral%' OR table_name LIKE '%commission%' OR table_name LIKE '%payout%'
        ORDER BY table_name
    LOOP
        RAISE NOTICE 'Found table: %', rec.table_name;
    END LOOP;
    
    -- Verify old tables are gone
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'commissions') THEN
        RAISE NOTICE '✅ Old commissions table successfully renamed';
    ELSE
        RAISE NOTICE '⚠️  Old commissions table still exists';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payout_batches') THEN
        RAISE NOTICE '✅ Old payout_batches table successfully renamed';  
    ELSE
        RAISE NOTICE '⚠️  Old payout_batches table still exists';
    END IF;
END $$;

COMMIT;