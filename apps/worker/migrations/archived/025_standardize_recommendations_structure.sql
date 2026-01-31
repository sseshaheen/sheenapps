-- Migration: Standardize recommendations JSON structure
-- Date: 2025-01-30
-- Purpose: Convert all existing recommendations to a unified structure

-- Function to standardize recommendations structure
CREATE OR REPLACE FUNCTION standardize_recommendation_structure()
RETURNS void AS $$
DECLARE
    rec RECORD;
    new_recommendations JSONB;
    recommendation JSONB;
    standardized_item JSONB;
    counter INTEGER;
BEGIN
    -- Loop through all recommendations
    FOR rec IN SELECT id, recommendations FROM project_recommendations LOOP
        new_recommendations := '[]'::jsonb;
        counter := 1;
        
        -- Loop through each recommendation in the array
        FOR recommendation IN SELECT * FROM jsonb_array_elements(rec.recommendations) LOOP
            -- Create standardized structure
            standardized_item := jsonb_build_object(
                'id', counter,
                'title', COALESCE(recommendation->>'title', 'Untitled Recommendation'),
                'description', COALESCE(recommendation->>'description', ''),
                'category', LOWER(COALESCE(recommendation->>'category', 'general')),
                'priority', LOWER(COALESCE(recommendation->>'priority', 'medium')),
                'complexity', CASE 
                    WHEN LOWER(COALESCE(recommendation->>'effort', recommendation->>'priority', 'medium')) IN ('low', 'easy') THEN 'low'
                    WHEN LOWER(COALESCE(recommendation->>'effort', recommendation->>'priority', 'medium')) IN ('high', 'hard') THEN 'high'
                    ELSE 'medium'
                END,
                'impact', CASE 
                    WHEN LOWER(COALESCE(recommendation->>'priority', 'medium')) = 'high' THEN 'high'
                    WHEN LOWER(COALESCE(recommendation->>'priority', 'medium')) = 'low' THEN 'low'
                    ELSE 'medium'
                END,
                'versionHint', CASE 
                    WHEN LOWER(COALESCE(recommendation->>'category', '')) IN ('deployment', 'seo', 'styling', 'ui/ux') THEN 'patch'
                    WHEN LOWER(COALESCE(recommendation->>'category', '')) IN ('functionality', 'content', 'navigation') THEN 'minor'
                    ELSE 'patch'
                END,
                'prompt', CONCAT(
                    'Add ', 
                    COALESCE(recommendation->>'title', 'feature'),
                    ': ',
                    COALESCE(recommendation->>'description', '')
                ),
                -- Preserve additional fields for compatibility
                'legacy_id', recommendation->>'id',
                'files', recommendation->'files',
                'steps', recommendation->'steps'
            );
            
            new_recommendations := new_recommendations || jsonb_build_array(standardized_item);
            counter := counter + 1;
        END LOOP;
        
        -- Update the record with standardized recommendations
        UPDATE project_recommendations 
        SET recommendations = new_recommendations 
        WHERE id = rec.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the standardization
SELECT standardize_recommendation_structure();

-- Drop the function after use
DROP FUNCTION standardize_recommendation_structure();

-- Add comment explaining the standard structure
COMMENT ON COLUMN project_recommendations.recommendations IS 'Standardized array of recommendation objects with: id, title, description, category, priority, complexity, impact, versionHint, prompt, and optional legacy fields (files, steps, legacy_id)';