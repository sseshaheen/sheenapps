// Spec Block Types - For converting user business ideas into structured project specifications

export interface SpecBlock {
  goal: string;            // One sentence describing the main objective
  section_list: string;    // Semicolon-separated sections (e.g., "Hero; Feature grid; Pricing; Testimonials")
  style_tags: string;      // Comma-separated, lowercase single words (e.g., "modern, minimal, professional")
  industry_tag: string;    // Single word (e.g., "saas", "ecommerce", "consulting")
  tech_stack: string;      // Comma-separated tech stack (e.g., "react, nextjs, tailwind, typescript")
  extra: string;          // Concise bullet-like sentence for additional requirements; empty string if none
}

export interface SpecBlockValidation {
  isValid: boolean;
  errors?: {
    field: keyof SpecBlock;
    message: string;
  }[];
  sanitized?: SpecBlock;
}

export interface SpecBlockGenerationResult {
  success: boolean;
  spec?: SpecBlock;
  error?: {
    code: string; // Allow any error code for AI-generated errors
//     code: 'INVALID_INPUT' | 'PROFANITY_DETECTED' | 'INJECTION_DETECTED' | 'GENERATION_FAILED' | 'UNINTELLIGIBLE';
    message: string;
  };
  metadata?: {
    processingTime: number;
    aiModel?: string;
    confidence?: number;
  };
}

// Common section types that can be generated
export const SECTION_TYPES = [
  'Hero',
  'Feature grid',
  'Features',
  'Pricing',
  'Testimonials',
  'About',
  'Services',
  'Portfolio',
  'Contact',
  'FAQ',
  'Team',
  'CTA',
  'Stats',
  'Benefits',
  'Process',
  'Gallery',
  'Blog',
  'Newsletter'
] as const;

// Common style tags
export const STYLE_TAGS = [
  'modern',
  'minimal',
  'professional',
  'playful',
  'bold',
  'elegant',
  'clean',
  'vibrant',
  'dark',
  'light',
  'corporate',
  'startup',
  'creative',
  'tech',
  'friendly',
  'serious',
  'luxurious',
  'simple',
  'sophisticated',
  'casual'
] as const;

// Common industry tags
export const INDUSTRY_TAGS = [
  'saas',
  'ecommerce',
  'consulting',
  'agency',
  'restaurant',
  'healthcare',
  'education',
  'finance',
  'realestate',
  'travel',
  'fitness',
  'technology',
  'retail',
  'nonprofit',
  'entertainment',
  'automotive',
  'legal',
  'construction',
  'beauty',
  'food'
] as const;

// Common tech stack options
export const TECH_STACK_OPTIONS = [
  'react',
  'nextjs',
  'vue',
  'angular',
  'svelte',
  'tailwind',
  'bootstrap',
  'materialui',
  'chakraui',
  'typescript',
  'javascript',
  'nodejs',
  'express',
  'fastify',
  'prisma',
  'mongodb',
  'postgresql',
  'mysql',
  'firebase',
  'supabase'
] as const;

export type SectionType = typeof SECTION_TYPES[number];
export type StyleTag = typeof STYLE_TAGS[number];
export type IndustryTag = typeof INDUSTRY_TAGS[number];
export type TechStackOption = typeof TECH_STACK_OPTIONS[number];
