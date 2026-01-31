-- Migration: Add "Lite" Subscription Tier 
-- Description: Adds the new "lite" subscription tier between free and starter plans
-- Specifications: 110 minutes monthly, $9 USD, 15 minutes daily bonus, 220 minutes rollover cap

BEGIN;

-- First, get the current active catalog version ID
DO $$
DECLARE
    active_catalog_id UUID;
    lite_item_id UUID;
BEGIN
    -- Get the active catalog version
    SELECT id INTO active_catalog_id 
    FROM pricing_catalog_versions 
    WHERE is_active = true 
    LIMIT 1;
    
    IF active_catalog_id IS NULL THEN
        RAISE EXCEPTION 'No active pricing catalog found. Create a catalog version first.';
    END IF;
    
    -- Check if lite plan already exists
    IF EXISTS (
        SELECT 1 FROM pricing_items 
        WHERE catalog_version_id = active_catalog_id 
        AND item_key = 'lite'
        AND is_active = true
    ) THEN
        RAISE NOTICE 'Lite subscription tier already exists in active catalog';
        RETURN;
    END IF;
    
    -- Insert the lite subscription tier
    INSERT INTO pricing_items (
        id,
        catalog_version_id,
        item_key,
        item_type,
        seconds,                        -- 110 minutes = 6600 seconds
        unit_amount_cents,              -- $9 USD = 900 cents
        currency,
        tax_inclusive,
        bonus_daily_seconds,            -- 15 minutes = 900 seconds  
        bonus_monthly_cap_seconds,      -- Not applicable for paid plans (set to NULL)
        rollover_cap_seconds,           -- 220 minutes = 13200 seconds
        advisor_eligible,
        advisor_payout_cents,           -- To be determined later
        expires_days,
        display_name,
        display_order,
        is_active
    ) VALUES (
        gen_random_uuid(),
        active_catalog_id,
        'lite',                         -- Plan slug
        'subscription',
        6600,                           -- 110 minutes * 60 seconds
        900,                            -- $9 USD in cents
        'USD',
        false,                          -- Tax not inclusive (standard)
        900,                            -- 15 minutes daily bonus
        NULL,                           -- No monthly cap for paid plans
        13200,                          -- 220 minutes rollover cap
        true,                           -- Eligible for advisor features
        NULL,                           -- Advisor payout TBD
        NULL,                           -- No expiration
        'Lite Plan',
        15,                             -- Order between free (10) and starter (20)
        true
    ) RETURNING id INTO lite_item_id;
    
    RAISE NOTICE 'Successfully added lite subscription tier with ID: %', lite_item_id;
    
    -- Verify the insertion
    IF EXISTS (
        SELECT 1 FROM pricing_items 
        WHERE id = lite_item_id 
        AND item_key = 'lite' 
        AND seconds = 6600 
        AND unit_amount_cents = 900
    ) THEN
        RAISE NOTICE 'Lite tier validation: ✅ Correctly configured';
    ELSE
        RAISE EXCEPTION 'Lite tier validation: ❌ Configuration mismatch';
    END IF;
    
END $$;

-- Add corresponding pricing_item_prices entry for Stripe integration
DO $$
DECLARE
    lite_pricing_item_id UUID;
    stripe_price_placeholder TEXT := 'price_1LITE_PLACEHOLDER_USD';
BEGIN
    -- Get the lite pricing item ID
    SELECT pi.id INTO lite_pricing_item_id
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true 
    AND pi.item_key = 'lite' 
    AND pi.is_active = true
    LIMIT 1;
    
    IF lite_pricing_item_id IS NULL THEN
        RAISE EXCEPTION 'Lite pricing item not found. Run the first part of migration first.';
    END IF;
    
    -- Check if price mapping already exists
    IF EXISTS (
        SELECT 1 FROM pricing_item_prices 
        WHERE pricing_item_id = lite_pricing_item_id 
        AND payment_provider = 'stripe'
        AND currency = 'USD'
        AND is_active = true
    ) THEN
        RAISE NOTICE 'Stripe price mapping for lite tier already exists';
        RETURN;
    END IF;
    
    -- Insert Stripe price mapping
    INSERT INTO pricing_item_prices (
        id,
        pricing_item_id,
        payment_provider,
        provider_price_external_id,
        currency,
        unit_amount_cents,
        is_active,
        created_at
    ) VALUES (
        gen_random_uuid(),
        lite_pricing_item_id,
        'stripe',
        stripe_price_placeholder,       -- Will be updated when actual Stripe price is created
        'USD',
        900,                            -- $9 USD in cents
        true,
        NOW()
    );
    
    RAISE NOTICE 'Added Stripe price mapping for lite tier (placeholder: %)', stripe_price_placeholder;
    RAISE NOTICE '⚠️  ACTION REQUIRED: Update STRIPE_PRICE_LITE_USD environment variable with actual Stripe price ID';
    
END $$;

COMMIT;

-- Verification queries (for manual review)
-- Uncomment to run verification after migration

-- -- Check lite tier configuration
-- SELECT 
--     pi.item_key,
--     pi.display_name,
--     pi.seconds / 60 as minutes,
--     pi.unit_amount_cents / 100.0 as price_usd,
--     pi.bonus_daily_seconds / 60 as daily_bonus_minutes,
--     pi.rollover_cap_seconds / 60 as rollover_cap_minutes,
--     pi.display_order,
--     pi.is_active
-- FROM pricing_items pi
-- JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
-- WHERE pcv.is_active = true AND pi.item_key = 'lite';

-- -- Check pricing order
-- SELECT 
--     pi.item_key,
--     pi.display_name,
--     pi.display_order,
--     pi.unit_amount_cents / 100.0 as price_usd
-- FROM pricing_items pi
-- JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
-- WHERE pcv.is_active = true AND pi.item_type = 'subscription'
-- ORDER BY pi.display_order;