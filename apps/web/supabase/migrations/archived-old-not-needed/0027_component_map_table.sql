-- Create component_map table for AI-to-builder component mappings
-- This enables data-driven mapping of AI-generated components to builder section types

-- Create the component_map table
CREATE TABLE IF NOT EXISTS public.component_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_component_name TEXT NOT NULL,
  builder_section_type TEXT NOT NULL CHECK (builder_section_type IN ('hero', 'features', 'pricing', 'testimonials', 'cta', 'footer')),
  industry TEXT,
  priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Ensure unique mappings per component/industry combination
  UNIQUE(ai_component_name, industry)
);

-- Create indexes for performance
CREATE INDEX idx_component_map_lookup ON public.component_map(ai_component_name, industry, is_active);
CREATE INDEX idx_component_map_priority ON public.component_map(priority DESC);
CREATE INDEX idx_component_map_industry ON public.component_map(industry);

-- Add RLS policies
ALTER TABLE public.component_map ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active mappings (needed for builder)
CREATE POLICY "component_map_read_policy" ON public.component_map
  FOR SELECT
  USING (is_active = true);

-- Policy: Only authenticated users can insert/update/delete mappings
-- TODO: Restrict to admins only once admin role system is implemented
CREATE POLICY "component_map_admin_write_policy" ON public.component_map
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_component_map_updated_at
  BEFORE UPDATE ON public.component_map
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial mappings for salon industry
INSERT INTO public.component_map (ai_component_name, builder_section_type, industry, priority) VALUES
  -- Universal mappings (all industries)
  ('Hero', 'hero', 'all', 100),
  ('HeroSection', 'hero', 'all', 100),
  ('ContactSection', 'footer', 'all', 100),
  ('ContactForm', 'footer', 'all', 100),
  ('Footer', 'footer', 'all', 100),
  
  -- Salon-specific mappings
  ('ServicesMenu', 'features', 'salon', 100),
  ('ServiceList', 'features', 'salon', 90),
  ('BookingCalendar', 'cta', 'salon', 100),
  ('AppointmentBooking', 'cta', 'salon', 100),
  ('StaffProfiles', 'testimonials', 'salon', 100),
  ('TeamSection', 'testimonials', 'salon', 90),
  ('PricingSection', 'pricing', 'salon', 100),
  ('PriceList', 'pricing', 'salon', 90),
  ('Gallery', 'features', 'salon', 80),
  ('Testimonials', 'testimonials', 'salon', 80),
  
  -- Restaurant-specific mappings (future)
  ('MenuSection', 'features', 'restaurant', 100),
  ('ReservationForm', 'cta', 'restaurant', 100),
  ('ChefProfiles', 'testimonials', 'restaurant', 100),
  ('DailySpecials', 'pricing', 'restaurant', 100),
  
  -- E-commerce mappings (future)
  ('ProductGrid', 'features', 'ecommerce', 100),
  ('ShoppingCart', 'cta', 'ecommerce', 100),
  ('CustomerReviews', 'testimonials', 'ecommerce', 100),
  ('PricingTiers', 'pricing', 'ecommerce', 100)
ON CONFLICT (ai_component_name, industry) DO NOTHING;

-- Grant permissions for API access
GRANT SELECT ON public.component_map TO anon, authenticated;
GRANT ALL ON public.component_map TO service_role;

-- Add helpful comments
COMMENT ON TABLE public.component_map IS 'Maps AI-generated component names to builder section types';
COMMENT ON COLUMN public.component_map.ai_component_name IS 'The component name from AI-generated templates';
COMMENT ON COLUMN public.component_map.builder_section_type IS 'The builder section type (hero, features, pricing, testimonials, cta, footer)';
COMMENT ON COLUMN public.component_map.industry IS 'Industry context for mapping (null = applies to all)';
COMMENT ON COLUMN public.component_map.priority IS 'Higher priority mappings are preferred when multiple matches exist';