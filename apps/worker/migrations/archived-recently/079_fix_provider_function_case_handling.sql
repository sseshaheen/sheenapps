-- =====================================================
-- Migration 079: Fix Provider Function Case Handling
-- =====================================================
-- Purpose: Update function to handle both uppercase and lowercase region codes
-- Author: Claude
-- Date: September 2, 2025
-- =====================================================

BEGIN;

-- Update the function to handle both uppercase and lowercase region codes
CREATE OR REPLACE FUNCTION get_preferred_provider_for_region(
  p_promotion_id UUID,
  p_region_code TEXT
) RETURNS payment_provider_key[] AS $$
DECLARE
  v_providers payment_provider_key[];
  v_supported payment_provider_key[];
BEGIN
  -- Get the promotion's supported providers
  SELECT supported_providers INTO v_supported
  FROM promotions
  WHERE id = p_promotion_id;
  
  -- Get regional preferences
  SELECT preferred_providers INTO v_providers
  FROM promotion_regional_config
  WHERE promotion_id = p_promotion_id 
    AND region_code = p_region_code;
  
  IF v_providers IS NULL THEN
    -- Return Stripe PLUS regional providers (Stripe first for familiarity)
    -- Handle both uppercase and lowercase for compatibility
    CASE UPPER(p_region_code)
      WHEN 'EG' THEN 
        v_providers := ARRAY['stripe', 'paymob', 'fawry']::payment_provider_key[];
      WHEN 'SA' THEN 
        v_providers := ARRAY['stripe', 'paytabs', 'stcpay']::payment_provider_key[];
      ELSE 
        v_providers := ARRAY['stripe']::payment_provider_key[];
    END CASE;
  END IF;
  
  -- Intersect with supported providers to ensure we only return valid options
  IF v_supported IS NOT NULL THEN
    RETURN (
      SELECT ARRAY(
        SELECT unnest(v_providers) 
        INTERSECT 
        SELECT unnest(v_supported)
      )
    );
  ELSE
    RETURN v_providers;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;