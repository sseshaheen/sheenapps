export interface TemplateFile {
  path: string
  content: string
  type?: string
}

export interface TemplateSection {
  type: string
  props?: Record<string, any>
  content?: {
    html?: string
    props?: Record<string, any>
  }
  styles?: {
    variables?: Record<string, any>
  }
}

export interface TemplateData {
  id?: string
  name?: string
  businessName?: string
  businessType?: string
  businessDescription?: string
  templateFiles?: TemplateFile[]
  sections?: Record<string, TemplateSection>
  dependencies?: Record<string, string>
  metadata?: Record<string, any>
}