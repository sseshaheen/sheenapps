-- Display name and key consistency updates
-- 1. Rename "Booster Pack" to "Plus Pack" (both key and display name)
-- 2. Rename "Lite Plan" to "Lite" for consistency

BEGIN;

-- Update both key and display name for the booster package
UPDATE pricing_items 
SET item_key = 'plus',
    display_name = 'Plus Pack'
WHERE item_key = 'booster' 
  AND item_type = 'package' 
  AND display_name = 'Booster Pack';

-- Update the display name for the lite plan (remove "Plan" suffix)
UPDATE pricing_items 
SET display_name = 'Lite'
WHERE display_name = 'Lite Plan';

-- Verify the updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pricing_items 
    WHERE item_key = 'plus' 
      AND item_type = 'package' 
      AND display_name = 'Plus Pack'
  ) THEN
    RAISE EXCEPTION 'Failed to update booster to plus pack';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pricing_items 
    WHERE display_name = 'Lite'
  ) THEN
    RAISE EXCEPTION 'Failed to update Lite Plan to Lite';
  END IF;
  
  RAISE NOTICE 'Successfully renamed booster to plus pack and Lite Plan to Lite';
END $$;

COMMIT;