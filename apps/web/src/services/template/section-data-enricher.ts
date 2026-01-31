/**
 * Section Data Enricher Service
 * 
 * Ensures all sections have complete data for consistent rendering
 * across all preview modes.
 */

import { SectionState } from '@/store/builder-store'
import { templateDataExtractor, ExtractedData } from './template-data-extractor'

export interface EnrichmentResult {
  enrichedSection: SectionState
  dataQuality: 'complete' | 'partial' | 'minimal'
  missingFields: string[]
  enhancementsApplied: string[]
}

export interface SectionDataQuality {
  hasTitle: boolean
  hasSubtitle: boolean
  hasMainContent: boolean
  hasCompleteItems: boolean
  missingFields: string[]
  quality: 'complete' | 'partial' | 'minimal'
}

export class SectionDataEnricher {
  /**
   * Enrich a section with complete data
   */
  enrichSection(
    section: SectionState,
    templateData?: Map<string, ExtractedData>,
    layoutVariant: string = 'default'
  ): EnrichmentResult {
    const enhancementsApplied: string[] = []
    const enrichedSection = { ...section }
    
    console.log(`🔍 SectionDataEnricher: Enriching ${section.type} section`, {
      sectionId: section.id,
      layoutVariant,
      hasTemplateData: !!templateData,
      originalProps: section.content.props,
      hasFeatures: section.type === 'features' ? section.content.props?.features : undefined
    })
    
    // Get template extracted data if available
    const extractedData = templateData?.get(section.type)
    
    // Start with existing props
    let enrichedProps = { ...section.content.props }
    
    // Apply template data if available
    if (extractedData?.props) {
      enrichedProps = templateDataExtractor.mergeWithSectionProps(
        extractedData,
        enrichedProps
      )
      enhancementsApplied.push('template-data-merged')
    }
    
    // Apply layout-specific enhancements
    enrichedProps = this.applyLayoutEnhancements(
      section.type,
      enrichedProps,
      layoutVariant
    )
    if (layoutVariant !== 'default') {
      enhancementsApplied.push(`${layoutVariant}-theme-applied`)
    }
    
    // Ensure minimum required fields
    enrichedProps = this.ensureRequiredFields(section.type, enrichedProps)
    enhancementsApplied.push('required-fields-ensured')
    
    // Validate emojis and special characters
    enrichedProps = this.validateSpecialCharacters(enrichedProps)
    
    // Update section with enriched data
    enrichedSection.content = {
      ...enrichedSection.content,
      props: enrichedProps,
    }
    
    // Add metadata about data quality
    const quality = this.assessDataQuality(section.type, enrichedProps)
    enrichedSection.metadata = {
      ...enrichedSection.metadata,
      // Add data quality as a custom field (will need to extend metadata type)
      lastModified: Date.now(),
      userAction: `enriched-${quality.quality}`,
    }
    
    console.log(`✅ SectionDataEnricher: Enriched ${section.type} section`, {
      sectionId: section.id,
      enrichedProps,
      dataQuality: quality.quality,
      enhancementsApplied,
      hasFeatures: section.type === 'features' ? enrichedProps.features : undefined
    })
    
    return {
      enrichedSection,
      dataQuality: quality.quality,
      missingFields: quality.missingFields,
      enhancementsApplied,
    }
  }

  /**
   * Apply layout-specific enhancements
   */
  private applyLayoutEnhancements(
    sectionType: string,
    props: Record<string, any>,
    layoutVariant: string
  ): Record<string, any> {
    const enhanced = { ...props }
    
    // Salon-specific enhancements
    if (layoutVariant === 'salon') {
      if (sectionType === 'features' && (!props.features || props.features.length === 0)) {
        enhanced.features = [
          { icon: '✂️', title: 'Hair Styling', description: 'Professional cuts, colors, and treatments' },
          { icon: '🌸', title: 'Facial Treatments', description: 'Rejuvenating facials for all skin types' },
          { icon: '💅', title: 'Nail Services', description: 'Manicures, pedicures, and nail art' },
          { icon: '💆', title: 'Massage Therapy', description: 'Relaxing Swedish and deep tissue massage' },
          { icon: '💄', title: 'Makeup Services', description: 'Professional makeup for any occasion' },
          { icon: '🌿', title: 'Spa Packages', description: 'Complete wellness experiences' },
        ]
      }
      
      // Ensure existing features have icons
      if (sectionType === 'features' && props.features?.length > 0) {
        console.log(`🔍 Checking features for icons:`, {
          originalFeatures: props.features.map((f: any) => ({ title: f.title, hasIcon: !!f.icon, icon: f.icon }))
        })
        
        const salonIcons = ['✂️', '🌸', '💅', '💆', '💄', '🌿']
        enhanced.features = props.features.map((feature: any, index: number) => ({
          ...feature,
          icon: feature.icon || salonIcons[index % salonIcons.length],
        }))
        
        console.log(`✅ Enhanced features with icons:`, {
          enhancedFeatures: enhanced.features.map((f: any) => ({ title: f.title, icon: f.icon }))
        })
      }
    }
    
    // SaaS-specific enhancements
    if (layoutVariant === 'saas') {
      if (sectionType === 'features' && (!props.features || props.features.length === 0)) {
        enhanced.features = [
          { icon: '🚀', title: 'Lightning Fast', description: 'Optimized for speed and performance' },
          { icon: '🔒', title: 'Secure & Safe', description: 'Enterprise-grade security' },
          { icon: '📱', title: 'Mobile Ready', description: 'Works perfectly on all devices' },
          { icon: '⚡', title: 'Real-time Updates', description: 'Stay connected with instant notifications' },
          { icon: '📊', title: 'Analytics', description: 'Detailed insights and reporting' },
          { icon: '🎯', title: 'Easy to Use', description: 'Intuitive interface for everyone' },
        ]
      }
      
      // Ensure existing features have icons
      if (sectionType === 'features' && props.features?.length > 0) {
        const saasIcons = ['🚀', '🔒', '📱', '⚡', '📊', '🎯']
        enhanced.features = props.features.map((feature: any, index: number) => ({
          ...feature,
          icon: feature.icon || saasIcons[index % saasIcons.length],
        }))
      }
    }
    
    return enhanced
  }

  /**
   * Ensure minimum required fields for each section type
   */
  private ensureRequiredFields(
    sectionType: string,
    props: Record<string, any>
  ): Record<string, any> {
    const enhanced = { ...props }
    
    switch (sectionType) {
      case 'hero':
        if (!enhanced.title) enhanced.title = 'Welcome'
        if (!enhanced.ctaText) enhanced.ctaText = 'Get Started'
        break
        
      case 'features':
        if (!enhanced.title) enhanced.title = 'Features'
        if (!enhanced.features) enhanced.features = []
        break
        
      case 'pricing':
        if (!enhanced.title) enhanced.title = 'Pricing'
        if (!enhanced.subtitle) enhanced.subtitle = 'Choose your plan'
        if (!enhanced.plans) enhanced.plans = []
        break
        
      case 'testimonials':
        if (!enhanced.title) enhanced.title = 'What Our Customers Say'
        if (!enhanced.testimonials) enhanced.testimonials = []
        break
        
      case 'cta':
        if (!enhanced.title) enhanced.title = 'Ready to Get Started?'
        if (!enhanced.ctaText) enhanced.ctaText = 'Start Now'
        break
        
      case 'footer':
        if (!enhanced.copyright) {
          enhanced.copyright = `© ${new Date().getFullYear()} All rights reserved`
        }
        break
    }
    
    return enhanced
  }

  /**
   * Validate and preserve special characters (emojis, etc)
   */
  private validateSpecialCharacters(props: Record<string, any>): Record<string, any> {
    // This ensures emojis and special characters are preserved
    // No conversion or escaping needed - just validation
    
    const validated = { ...props }
    
    // Check for common emoji fields
    if (validated.features && Array.isArray(validated.features)) {
      validated.features = validated.features.map((feature: any) => {
        if (feature.icon && typeof feature.icon === 'string') {
          // Ensure icon is a valid string (no encoding issues)
          feature.icon = feature.icon.trim()
        }
        return feature
      })
    }
    
    return validated
  }

  /**
   * Assess the quality of section data
   */
  assessDataQuality(
    sectionType: string,
    props: Record<string, any>
  ): SectionDataQuality {
    const result: SectionDataQuality = {
      hasTitle: false,
      hasSubtitle: false,
      hasMainContent: false,
      hasCompleteItems: false,
      missingFields: [],
      quality: 'minimal',
    }
    
    // Check common fields
    result.hasTitle = !!props.title && props.title.trim() !== ''
    result.hasSubtitle = !!props.subtitle && props.subtitle.trim() !== ''
    
    // Check section-specific content
    switch (sectionType) {
      case 'hero':
        result.hasMainContent = result.hasTitle && !!props.ctaText
        if (!result.hasTitle) result.missingFields.push('title')
        if (!props.ctaText) result.missingFields.push('ctaText')
        break
        
      case 'features':
        const features = props.features || []
        result.hasMainContent = features.length > 0
        result.hasCompleteItems = features.every((f: any) => 
          f.title && f.description && f.icon
        )
        if (features.length === 0) result.missingFields.push('features')
        if (!result.hasCompleteItems && features.length > 0) {
          result.missingFields.push('incomplete feature items')
        }
        break
        
      case 'pricing':
        const plans = props.plans || []
        result.hasMainContent = plans.length > 0
        result.hasCompleteItems = plans.every((p: any) => 
          p.name && p.price && p.features && Array.isArray(p.features)
        )
        if (plans.length === 0) result.missingFields.push('plans')
        break
        
      case 'testimonials':
        const testimonials = props.testimonials || []
        result.hasMainContent = testimonials.length > 0
        result.hasCompleteItems = testimonials.every((t: any) => 
          t.content && t.author
        )
        if (testimonials.length === 0) result.missingFields.push('testimonials')
        break
        
      case 'cta':
        result.hasMainContent = result.hasTitle && !!props.ctaText
        if (!props.ctaText) result.missingFields.push('ctaText')
        break
        
      case 'footer':
        result.hasMainContent = !!props.copyright || !!props.title
        break
    }
    
    // Determine overall quality
    if (result.hasTitle && result.hasMainContent && result.hasCompleteItems) {
      result.quality = 'complete'
    } else if (result.hasMainContent || result.hasTitle) {
      result.quality = 'partial'
    } else {
      result.quality = 'minimal'
    }
    
    return result
  }

  /**
   * Batch enrich multiple sections
   */
  enrichSections(
    sections: Record<string, SectionState>,
    templateData?: Map<string, ExtractedData>,
    layoutVariant: string = 'default'
  ): Record<string, EnrichmentResult> {
    const results: Record<string, EnrichmentResult> = {}
    
    Object.entries(sections).forEach(([sectionId, section]) => {
      results[sectionId] = this.enrichSection(section, templateData, layoutVariant)
    })
    
    return results
  }
}

// Export singleton instance
export const sectionDataEnricher = new SectionDataEnricher()