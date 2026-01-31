/**
 * Template payload types based on AI generator output
 */

export interface TemplateFile {
  path?: string;
  file?: string;
  filename?: string;
  name?: string;
  content?: string;
}

export interface TemplatePayload {
  name: string;
  slug?: string;
  templateFiles?: (string | TemplateFile)[];
  files?: (string | TemplateFile)[];
  metadata?: {
    core_pages?: { home?: string };
    design_tokens?: { 
      typography?: string;
      colors?: Record<string, string>;
      fonts?: Record<string, string>;
      spacing?: Record<string, string>;
    };
    industry_tag?: string;
    business_name?: string;
  };
}