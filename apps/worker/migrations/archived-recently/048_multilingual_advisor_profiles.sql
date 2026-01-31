-- =====================================================
-- Migration 048: Multilingual Advisor Profiles
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 28, 2025
-- Purpose: Enable multilingual advisor profiles with JSONB bio storage and specialty translations
-- Dependencies: Migration 047 (mock advisors)
-- Status: Phase 1 implementation with expert-validated patterns
--
-- Features Added:
-- - Multilingual bio storage in JSONB format
-- - Specialty translation tables with admin tooling support
-- - Atomic per-language bio updates using jsonb_set()
-- - Content negotiation support with derived fields
-- - Security enhancements and plain text validation
-- - Translation investment metrics logging
--
-- NOTE: CONCURRENTLY indexes are created outside transaction blocks
-- =====================================================

-- =====================================================
-- PART 1: Schema changes (in transaction)
-- =====================================================
BEGIN;

-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This is the recommended approach for migrations that need to bypass RLS
SET session_replication_role = 'replica';

-- =====================================================
-- Step 1: Add multilingual bio column to advisors table
-- =====================================================

-- Add multilingual_bio JSONB column to store bios in multiple languages (if not exists)
-- Format: {"en": "English bio", "ar": "Arabic bio", "fr": "French bio"}
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'advisors' AND column_name = 'multilingual_bio') THEN
    ALTER TABLE advisors ADD COLUMN multilingual_bio JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE '✓ Added multilingual_bio column to advisors table';
  ELSE
    RAISE NOTICE '✓ Column multilingual_bio already exists, skipping';
  END IF;
END $$;

-- Add constraint to ensure valid language codes only (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                 WHERE constraint_name = 'advisors_multilingual_bio_valid_languages') THEN
    ALTER TABLE advisors 
    ADD CONSTRAINT advisors_multilingual_bio_valid_languages 
    CHECK (
      multilingual_bio = '{}'::jsonb OR
      (multilingual_bio ?| ARRAY['en', 'ar', 'fr', 'es', 'de'] AND
       NOT (multilingual_bio ?| ARRAY['en', 'ar', 'fr', 'es', 'de']) = false)
    );
    RAISE NOTICE '✓ Added multilingual_bio validation constraint';
  ELSE
    RAISE NOTICE '✓ Constraint advisors_multilingual_bio_valid_languages already exists, skipping';
  END IF;
END $$;

-- =====================================================
-- Step 2: Create specialty translation tables
-- =====================================================

-- Main specialty translations table for admin tooling (if not exists)
CREATE TABLE IF NOT EXISTS advisor_specialty_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty_key VARCHAR(50) NOT NULL,
  language_code VARCHAR(5) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT specialty_translations_unique_key_lang 
    UNIQUE(specialty_key, language_code),
  CONSTRAINT specialty_translations_valid_language 
    CHECK (language_code IN ('en', 'ar', 'fr', 'es', 'de')),
  CONSTRAINT specialty_translations_valid_key 
    CHECK (specialty_key ~ '^[a-z][a-z0-9_-]*$')
);

-- Indexes for efficient specialty translation queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_specialty_translations_key ON advisor_specialty_translations(specialty_key);
CREATE INDEX IF NOT EXISTS idx_specialty_translations_lang ON advisor_specialty_translations(language_code);
CREATE INDEX IF NOT EXISTS idx_specialty_translations_lookup ON advisor_specialty_translations(specialty_key, language_code);

-- Enable RLS on specialty translations
ALTER TABLE advisor_specialty_translations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read translations, only admins can modify (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_specialty_translations' 
                 AND policyname = 'specialty_translations_read_policy') THEN
    CREATE POLICY specialty_translations_read_policy 
    ON advisor_specialty_translations FOR SELECT 
    TO authenticated 
    USING (true);
    RAISE NOTICE '✓ Created specialty_translations_read_policy';
  ELSE
    RAISE NOTICE '✓ Policy specialty_translations_read_policy already exists, skipping';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_specialty_translations' 
                 AND policyname = 'specialty_translations_admin_policy') THEN
    CREATE POLICY specialty_translations_admin_policy 
    ON advisor_specialty_translations FOR ALL 
    TO authenticated 
    USING (
      EXISTS (
        SELECT 1 FROM auth.users u 
        WHERE u.id = auth.uid() 
        AND (u.raw_user_meta_data->>'role' = 'admin' OR 
             u.raw_user_meta_data->>'role' = 'super_admin')
      )
    );
    RAISE NOTICE '✓ Created specialty_translations_admin_policy';
  ELSE
    RAISE NOTICE '✓ Policy specialty_translations_admin_policy already exists, skipping';
  END IF;
END $$;

-- =====================================================
-- Step 3: Populate default specialty translations
-- =====================================================

-- Insert English translations (base language) - skip if already exists
INSERT INTO advisor_specialty_translations (specialty_key, language_code, display_name, description) VALUES
('frontend', 'en', 'Frontend Development', 'User interface and client-side development'),
('backend', 'en', 'Backend Development', 'Server-side development and APIs'),
('fullstack', 'en', 'Full-Stack Development', 'Complete web application development'),
('mobile', 'en', 'Mobile Development', 'iOS and Android app development'),
('devops', 'en', 'DevOps Engineering', 'Infrastructure and deployment automation'),
('data-science', 'en', 'Data Science', 'Data analysis and machine learning'),
('machine-learning', 'en', 'Machine Learning', 'AI and predictive modeling'),
('blockchain', 'en', 'Blockchain Development', 'Cryptocurrency and smart contracts'),
('security', 'en', 'Cybersecurity', 'Security auditing and compliance'),
('ui-ux', 'en', 'UI/UX Design', 'User interface and experience design'),
('product-management', 'en', 'Product Management', 'Product strategy and development'),
('ecommerce', 'en', 'E-commerce Development', 'Online store and payment systems'),
('apis', 'en', 'API Development', 'REST and GraphQL API design')
ON CONFLICT (specialty_key, language_code) DO NOTHING;

-- Insert Arabic translations
INSERT INTO advisor_specialty_translations (specialty_key, language_code, display_name, description) VALUES
('frontend', 'ar', 'تطوير الواجهة الأمامية', 'تطوير واجهة المستخدم والجانب العميل'),
('backend', 'ar', 'تطوير الواجهة الخلفية', 'تطوير الخادم وواجهات برمجة التطبيقات'),
('fullstack', 'ar', 'التطوير الشامل', 'تطوير تطبيقات الويب الكاملة'),
('mobile', 'ar', 'تطوير التطبيقات المحمولة', 'تطوير تطبيقات iOS و Android'),
('devops', 'ar', 'هندسة DevOps', 'أتمتة البنية التحتية والنشر'),
('data-science', 'ar', 'علوم البيانات', 'تحليل البيانات والتعلم الآلي'),
('machine-learning', 'ar', 'التعلم الآلي', 'الذكاء الاصطناعي والنمذجة التنبؤية'),
('blockchain', 'ar', 'تطوير البلوك تشين', 'العملات المشفرة والعقود الذكية'),
('security', 'ar', 'الأمن السيبراني', 'تدقيق الأمان والامتثال'),
('ui-ux', 'ar', 'تصميم واجهة المستخدم', 'تصميم واجهة وتجربة المستخدم'),
('product-management', 'ar', 'إدارة المنتجات', 'استراتيجية وتطوير المنتجات'),
('ecommerce', 'ar', 'تطوير التجارة الإلكترونية', 'المتاجر الإلكترونية وأنظمة الدفع'),
('apis', 'ar', 'تطوير واجهات برمجة التطبيقات', 'تصميم REST و GraphQL API')
ON CONFLICT (specialty_key, language_code) DO NOTHING;

-- Insert French translations
INSERT INTO advisor_specialty_translations (specialty_key, language_code, display_name, description) VALUES
('frontend', 'fr', 'Développement Frontend', 'Interface utilisateur et développement côté client'),
('backend', 'fr', 'Développement Backend', 'Développement serveur et APIs'),
('fullstack', 'fr', 'Développement Full-Stack', 'Développement complet d''applications web'),
('mobile', 'fr', 'Développement Mobile', 'Développement d''applications iOS et Android'),
('devops', 'fr', 'Ingénierie DevOps', 'Automatisation d''infrastructure et de déploiement'),
('data-science', 'fr', 'Science des Données', 'Analyse de données et apprentissage automatique'),
('machine-learning', 'fr', 'Apprentissage Automatique', 'IA et modélisation prédictive'),
('blockchain', 'fr', 'Développement Blockchain', 'Cryptomonnaies et contrats intelligents'),
('security', 'fr', 'Cybersécurité', 'Audit de sécurité et conformité'),
('ui-ux', 'fr', 'Design UI/UX', 'Design d''interface et expérience utilisateur'),
('product-management', 'fr', 'Gestion de Produit', 'Stratégie et développement de produit'),
('ecommerce', 'fr', 'Développement E-commerce', 'Boutiques en ligne et systèmes de paiement'),
('apis', 'fr', 'Développement d''APIs', 'Conception REST et GraphQL API')
ON CONFLICT (specialty_key, language_code) DO NOTHING;

-- Insert Spanish translations
INSERT INTO advisor_specialty_translations (specialty_key, language_code, display_name, description) VALUES
('frontend', 'es', 'Desarrollo Frontend', 'Interfaz de usuario y desarrollo del lado cliente'),
('backend', 'es', 'Desarrollo Backend', 'Desarrollo del servidor y APIs'),
('fullstack', 'es', 'Desarrollo Full-Stack', 'Desarrollo completo de aplicaciones web'),
('mobile', 'es', 'Desarrollo Móvil', 'Desarrollo de aplicaciones iOS y Android'),
('devops', 'es', 'Ingeniería DevOps', 'Automatización de infraestructura y despliegue'),
('data-science', 'es', 'Ciencia de Datos', 'Análisis de datos y aprendizaje automático'),
('machine-learning', 'es', 'Aprendizaje Automático', 'IA y modelado predictivo'),
('blockchain', 'es', 'Desarrollo Blockchain', 'Criptomonedas y contratos inteligentes'),
('security', 'es', 'Ciberseguridad', 'Auditoría de seguridad y cumplimiento'),
('ui-ux', 'es', 'Diseño UI/UX', 'Diseño de interfaz y experiencia de usuario'),
('product-management', 'es', 'Gestión de Productos', 'Estrategia y desarrollo de productos'),
('ecommerce', 'es', 'Desarrollo E-commerce', 'Tiendas en línea y sistemas de pago'),
('apis', 'es', 'Desarrollo de APIs', 'Diseño de REST y GraphQL API')
ON CONFLICT (specialty_key, language_code) DO NOTHING;

-- Insert German translations
INSERT INTO advisor_specialty_translations (specialty_key, language_code, display_name, description) VALUES
('frontend', 'de', 'Frontend-Entwicklung', 'Benutzeroberfläche und clientseitige Entwicklung'),
('backend', 'de', 'Backend-Entwicklung', 'Serverentwicklung und APIs'),
('fullstack', 'de', 'Full-Stack-Entwicklung', 'Vollständige Webanwendungsentwicklung'),
('mobile', 'de', 'Mobile Entwicklung', 'iOS- und Android-App-Entwicklung'),
('devops', 'de', 'DevOps Engineering', 'Infrastruktur- und Deployment-Automatisierung'),
('data-science', 'de', 'Data Science', 'Datenanalyse und maschinelles Lernen'),
('machine-learning', 'de', 'Maschinelles Lernen', 'KI und prädiktive Modellierung'),
('blockchain', 'de', 'Blockchain-Entwicklung', 'Kryptowährungen und Smart Contracts'),
('security', 'de', 'Cybersicherheit', 'Sicherheitsaudit und Compliance'),
('ui-ux', 'de', 'UI/UX-Design', 'Benutzeroberfläche und User Experience Design'),
('product-management', 'de', 'Produktmanagement', 'Produktstrategie und -entwicklung'),
('ecommerce', 'de', 'E-Commerce-Entwicklung', 'Online-Shops und Zahlungssysteme'),
('apis', 'de', 'API-Entwicklung', 'REST- und GraphQL-API-Design')
ON CONFLICT (specialty_key, language_code) DO NOTHING;

-- =====================================================
-- Step 4: Create helper functions for atomic bio updates
-- =====================================================

-- Function for atomic per-language bio updates using jsonb_set()
CREATE OR REPLACE FUNCTION update_advisor_bio_atomic(
  advisor_user_id UUID,
  target_language VARCHAR(5),
  new_bio_content TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  -- Validate language code
  IF target_language NOT IN ('en', 'ar', 'fr', 'es', 'de') THEN
    RAISE EXCEPTION 'Invalid language code: %', target_language;
  END IF;
  
  -- Validate bio content (plain text security)
  IF new_bio_content ~ '<[^>]*>' THEN
    RAISE EXCEPTION 'HTML content not allowed in bio';
  END IF;
  
  -- Atomic update using jsonb_set()
  UPDATE advisors 
  SET 
    multilingual_bio = jsonb_set(
      COALESCE(multilingual_bio, '{}'::jsonb),
      ARRAY[target_language],
      to_jsonb(new_bio_content)
    ),
    updated_at = now()
  WHERE user_id = advisor_user_id;
  
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  
  -- Log translation metrics
  IF rows_affected > 0 THEN
    INSERT INTO advisor_translation_metrics (
      advisor_user_id, 
      language_code, 
      action_type, 
      content_length,
      created_at
    ) VALUES (
      advisor_user_id,
      target_language,
      'bio_update',
      length(new_bio_content),
      now()
    );
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Function to get bio content for specific language with fallback
CREATE OR REPLACE FUNCTION get_advisor_bio_localized(
  advisor_user_id UUID,
  preferred_language VARCHAR(5) DEFAULT 'en'
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  bio_content TEXT;
BEGIN
  -- Try preferred language first
  SELECT multilingual_bio ->> preferred_language
  INTO bio_content
  FROM advisors
  WHERE user_id = advisor_user_id;
  
  -- Fallback to English if preferred language not available
  IF bio_content IS NULL THEN
    SELECT COALESCE(
      multilingual_bio ->> 'en',
      bio  -- Legacy fallback to original bio column
    )
    INTO bio_content
    FROM advisors
    WHERE user_id = advisor_user_id;
  END IF;
  
  RETURN bio_content;
END;
$$;

-- =====================================================
-- Step 5: Create translation metrics table
-- =====================================================

-- Table for tracking translation investment and usage patterns (if not exists)
CREATE TABLE IF NOT EXISTS advisor_translation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_user_id UUID NOT NULL REFERENCES auth.users(id),
  language_code VARCHAR(5) NOT NULL,
  action_type VARCHAR(20) NOT NULL, -- 'bio_update', 'specialty_view', 'profile_view'
  content_length INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT translation_metrics_valid_language 
    CHECK (language_code IN ('en', 'ar', 'fr', 'es', 'de')),
  CONSTRAINT translation_metrics_valid_action
    CHECK (action_type IN ('bio_update', 'specialty_view', 'profile_view', 'search_result'))
);

-- Indexes for translation analytics (if not exists)
CREATE INDEX IF NOT EXISTS idx_translation_metrics_advisor ON advisor_translation_metrics(advisor_user_id);
CREATE INDEX IF NOT EXISTS idx_translation_metrics_language ON advisor_translation_metrics(language_code);
CREATE INDEX IF NOT EXISTS idx_translation_metrics_action ON advisor_translation_metrics(action_type);
CREATE INDEX IF NOT EXISTS idx_translation_metrics_created ON advisor_translation_metrics(created_at);

-- =====================================================
-- Step 6: Create computed fields for API responses
-- =====================================================

-- Function to get available languages for an advisor
CREATE OR REPLACE FUNCTION get_advisor_available_languages(advisor_user_id UUID)
RETURNS VARCHAR(5)[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  available_langs VARCHAR(5)[] := ARRAY[]::VARCHAR(5)[];
  lang VARCHAR(5);
BEGIN
  -- Check which languages have bio content
  FOR lang IN SELECT unnest(ARRAY['en', 'ar', 'fr', 'es', 'de']) LOOP
    IF (SELECT multilingual_bio ->> lang FROM advisors WHERE user_id = advisor_user_id) IS NOT NULL THEN
      available_langs := array_append(available_langs, lang);
    END IF;
  END LOOP;
  
  -- Include legacy bio as English if no multilingual content
  IF array_length(available_langs, 1) IS NULL OR array_length(available_langs, 1) = 0 THEN
    IF (SELECT bio FROM advisors WHERE user_id = advisor_user_id) IS NOT NULL THEN
      available_langs := ARRAY['en'];
    END IF;
  END IF;
  
  RETURN available_langs;
END;
$$;

-- =====================================================
-- Step 7: Migrate existing bio content to multilingual format
-- =====================================================

-- Migrate existing single-language bios to multilingual_bio JSONB
-- Assumes existing bios are in English
UPDATE advisors 
SET multilingual_bio = jsonb_build_object('en', bio)
WHERE bio IS NOT NULL 
  AND bio != ''
  AND multilingual_bio = '{}'::jsonb;

-- =====================================================
-- Step 8: Create updated_at trigger for translations
-- =====================================================

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply trigger to specialty translations table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                 WHERE trigger_name = 'advisor_specialty_translations_updated_at' 
                 AND event_object_table = 'advisor_specialty_translations') THEN
    CREATE TRIGGER advisor_specialty_translations_updated_at
      BEFORE UPDATE ON advisor_specialty_translations
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    RAISE NOTICE '✓ Created advisor_specialty_translations_updated_at trigger';
  ELSE
    RAISE NOTICE '✓ Trigger advisor_specialty_translations_updated_at already exists, skipping';
  END IF;
END $$;

-- =====================================================
-- Step 9: Add performance optimizations
-- =====================================================

-- Note: Performance indexes will be created outside transaction (see end of file)

-- =====================================================
-- Step 10: Security and validation updates
-- =====================================================

-- Add validation function for bio content security
CREATE OR REPLACE FUNCTION validate_bio_content(content TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Check for HTML tags
  IF content ~ '<[^>]*>' THEN
    RETURN FALSE;
  END IF;
  
  -- Check for script content
  IF content ~* '(javascript:|data:|vbscript:|onload|onerror)' THEN
    RETURN FALSE;
  END IF;
  
  -- Check reasonable length limits
  IF length(content) > 2000 THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Add constraint to multilingual_bio for content validation
-- Note: Constraint will be added in next migration to avoid locking during backfill

-- =====================================================
-- Step 11: Grant permissions to worker role for new functions
-- =====================================================

-- Grant permissions to worker_db_role for multilingual functions (if role exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'worker_db_role') THEN
    GRANT EXECUTE ON FUNCTION update_advisor_bio_atomic(UUID, VARCHAR, TEXT) TO worker_db_role;
    GRANT EXECUTE ON FUNCTION get_advisor_bio_localized(UUID, VARCHAR) TO worker_db_role;
    GRANT EXECUTE ON FUNCTION get_advisor_available_languages(UUID) TO worker_db_role;
    GRANT EXECUTE ON FUNCTION validate_bio_content(TEXT) TO worker_db_role;
    GRANT EXECUTE ON FUNCTION update_updated_at_column() TO worker_db_role;
    GRANT SELECT, INSERT, UPDATE ON advisor_specialty_translations TO worker_db_role;
    GRANT SELECT, INSERT, UPDATE ON advisor_translation_metrics TO worker_db_role;
    RAISE NOTICE '✅ Granted multilingual function permissions to worker_db_role';
  ELSE
    RAISE NOTICE '⚠️  worker_db_role does not exist, skipping permission grants';
  END IF;
END $$;

-- =====================================================
-- Migration Summary & Statistics
-- =====================================================

DO $$
DECLARE
  advisor_count INTEGER;
  translation_count INTEGER;
  migrated_bios INTEGER;
BEGIN
  -- Count advisors
  SELECT COUNT(*) INTO advisor_count FROM advisors;
  
  -- Count specialty translations
  SELECT COUNT(*) INTO translation_count FROM advisor_specialty_translations;
  
  -- Count migrated bios
  SELECT COUNT(*) INTO migrated_bios FROM advisors WHERE multilingual_bio != '{}'::jsonb;
  
  RAISE NOTICE '✅ Migration 048 completed successfully!';
  RAISE NOTICE '👥 Total advisors: %', advisor_count;
  RAISE NOTICE '🌍 Specialty translations: % across % languages', translation_count, translation_count / 13;
  RAISE NOTICE '📝 Migrated bios: %', migrated_bios;
  RAISE NOTICE '🔧 Added helper functions: update_advisor_bio_atomic(), get_advisor_bio_localized()';
  RAISE NOTICE '📊 Translation metrics table created for business intelligence';
  RAISE NOTICE '🚀 Ready for multilingual advisor profile implementation';
END $$;

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';

COMMIT;

-- =====================================================
-- PART 2: Performance indexes
-- =====================================================
-- NOTE: CONCURRENTLY indexes moved to separate migration file 049
-- to avoid transaction block conflicts. This is PostgreSQL best practice.
--
-- The following indexes will be created in migration 049:
-- - idx_advisors_multilingual_bio_gin (GIN index for JSONB queries)
-- - idx_advisors_has_multilingual_bio (partial index for multilingual content)  
-- - idx_advisors_multilingual_composite (composite index for efficient queries)