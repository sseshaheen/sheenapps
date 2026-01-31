import { defineConfig } from 'sanity'
import { deskTool } from 'sanity/desk'
import { visionTool } from '@sanity/vision'
import { documentInternationalization } from '@sanity/document-internationalization'
import { presentationTool } from 'sanity/presentation'
import { media } from 'sanity-plugin-media'

// Align with existing backend locale system - Full MENA market coverage
const SUPPORTED_LOCALES = [
  { id: 'en', title: 'English', isDefault: true },
  { id: 'ar', title: 'العربية (فصحى)' },        // Modern Standard Arabic
  { id: 'ar-eg', title: 'العربية المصرية' },    // Egyptian Arabic
  { id: 'ar-sa', title: 'العربية السعودية' },   // Saudi Arabic
  { id: 'ar-ae', title: 'العربية الإماراتية' }, // UAE Arabic
  { id: 'fr', title: 'Français' },
  { id: 'fr-ma', title: 'Français (Maroc)' },   // Moroccan French
  { id: 'es', title: 'Español' },
  { id: 'de', title: 'Deutsch' }
]

// Import schema types
import { schemaTypes } from './schemas'

export default defineConfig({
  name: 'sheenapps-blog',
  title: 'SheenApps AI Blog',
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'your-project-id',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',

  plugins: [
    deskTool(),
    visionTool(),
    documentInternationalization({
      supportedLanguages: SUPPORTED_LOCALES,
      schemaTypes: ['post', 'author', 'category'],
      languageField: 'language',
    }),
    presentationTool({
      previewUrl: {
        previewMode: {
          enable: '/api/draft-mode/enable',
          disable: '/api/draft-mode/disable'
        }
      }
    }),
    media()
  ],

  schema: { 
    types: schemaTypes 
  },

  // Studio configuration
  studio: {
    components: {
      // TODO: Add custom studio components if needed
    }
  }
})