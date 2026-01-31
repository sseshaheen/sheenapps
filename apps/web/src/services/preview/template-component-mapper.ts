/**
 * Template-to-Component Mapper
 * 
 * Maps template structure to individual React components and handles
 * transformation of section props to component props.
 */

import { SectionState } from '@/store/builder-store';
import { ComponentDefinition } from './template-component-compiler';

export interface ComponentMapping {
  sectionType: string;
  componentName: string;
  propsMapping: Record<string, string>;
  propsTransformer?: (sectionProps: any) => any;
  defaultProps?: any;
  requiresWrapper?: boolean;
}

export interface MappingResult {
  componentName: string;
  transformedProps: any;
  containerId: string;
  sectionId: string;
  sectionType: string;
}

export interface TemplateComponentMap {
  templateName: string;
  mappings: ComponentMapping[];
  globalProps?: any;
  componentOrder?: string[];
}

export class TemplateComponentMapper {
  private templateMaps: Map<string, TemplateComponentMap> = new Map();

  constructor() {
    this.initializeDefaultMappings();
  }

  /**
   * Initialize default template mappings
   */
  private initializeDefaultMappings(): void {
    // Salon template mappings
    const salonMappings: ComponentMapping[] = [
      {
        sectionType: 'hero',
        componentName: 'Hero',
        propsMapping: {
          title: 'title',
          subtitle: 'subtitle',
          ctaText: 'ctaText'
        },
        defaultProps: {
          title: 'Serenity Salon',
          subtitle: 'Where beauty meets tranquility',
          ctaText: 'Book Your Appointment'
        }
      },
      {
        sectionType: 'features',
        componentName: 'ServicesMenu',
        propsMapping: {
          title: 'title',
          subtitle: 'subtitle',
          features: 'services'
        },
        propsTransformer: (sectionProps) => {
          // Transform features to services format expected by ServicesMenu
          const services = (sectionProps.features || []).map((feature: any, index: number) => ({
            id: index + 1,
            title: feature.title || 'Service',
            description: feature.description || 'Service description',
            icon: feature.icon || '✨',
            duration: feature.duration || '60 min',
            price: feature.price || 'From $50'
          }));

          return {
            ...sectionProps,
            services
          };
        }
      },
      {
        sectionType: 'pricing',
        componentName: 'PricingSection',
        propsMapping: {
          title: 'title',
          subtitle: 'subtitle',
          plans: 'pricingCategories'
        },
        propsTransformer: (sectionProps) => {
          // Transform plans to pricing categories format
          const pricingCategories = (sectionProps.plans || []).map((plan: any) => ({
            category: plan.name || 'Services',
            services: (plan.features || []).map((feature: string, index: number) => ({
              name: feature,
              price: plan.price || 'From $50'
            }))
          }));

          return {
            ...sectionProps,
            pricingCategories
          };
        }
      },
      {
        sectionType: 'testimonials',
        componentName: 'Testimonials',
        propsMapping: {
          title: 'title',
          subtitle: 'subtitle',
          testimonials: 'testimonials'
        },
        propsTransformer: (sectionProps) => {
          // Ensure testimonials have proper structure
          const testimonials = (sectionProps.testimonials || []).map((testimonial: any) => ({
            id: testimonial.id || Math.random().toString(36).substr(2, 9),
            content: testimonial.content || testimonial.text || 'Great service!',
            author: testimonial.author || 'Anonymous',
            role: testimonial.role || 'Customer',
            rating: testimonial.rating || 5
          }));

          return {
            ...sectionProps,
            testimonials
          };
        }
      },
      {
        sectionType: 'cta',
        componentName: 'ContactSection',
        propsMapping: {
          title: 'title',
          subtitle: 'subtitle',
          ctaText: 'ctaText'
        },
        defaultProps: {
          title: 'Ready to Get Started?',
          subtitle: 'Contact us today to schedule your appointment',
          ctaText: 'Contact Us'
        }
      }
    ];

    this.templateMaps.set('salon', {
      templateName: 'salon',
      mappings: salonMappings,
      componentOrder: ['Hero', 'ServicesMenu', 'PricingSection', 'Testimonials', 'ContactSection']
    });

    // SaaS template mappings (example)
    const saasMappings: ComponentMapping[] = [
      {
        sectionType: 'hero',
        componentName: 'Hero',
        propsMapping: {
          title: 'title',
          subtitle: 'subtitle',
          ctaText: 'ctaText'
        }
      },
      {
        sectionType: 'features',
        componentName: 'Features',
        propsMapping: {
          title: 'title',
          subtitle: 'subtitle',
          features: 'features'
        }
      },
      {
        sectionType: 'pricing',
        componentName: 'Pricing',
        propsMapping: {
          title: 'title',
          subtitle: 'subtitle',
          plans: 'plans'
        }
      }
    ];

    this.templateMaps.set('saas', {
      templateName: 'saas',
      mappings: saasMappings,
      componentOrder: ['Hero', 'Features', 'Pricing']
    });

    console.log('✅ Template mappings initialized', {
      templates: Array.from(this.templateMaps.keys()),
      salonMappings: salonMappings.length,
      saasMappings: saasMappings.length
    });
  }

  /**
   * Map sections to components for a specific template
   */
  mapSectionsToComponents(
    sections: Record<string, SectionState>,
    templateName: string = 'salon'
  ): MappingResult[] {
    console.log('🗺️ Mapping sections to components', {
      sectionCount: Object.keys(sections).length,
      templateName,
      sections: Object.keys(sections)
    });

    const templateMap = this.templateMaps.get(templateName);
    if (!templateMap) {
      throw new Error(`Template mapping not found: ${templateName}`);
    }

    const results: MappingResult[] = [];

    Object.entries(sections).forEach(([sectionId, section]) => {
      const mapping = templateMap.mappings.find(m => m.sectionType === section.type);
      
      if (!mapping) {
        console.warn(`No mapping found for section type: ${section.type}`);
        return;
      }

      // Transform section props to component props
      const transformedProps = this.transformSectionPropsToComponentProps(
        section.content?.props || {},
        mapping
      );

      results.push({
        componentName: mapping.componentName,
        transformedProps,
        containerId: sectionId,
        sectionId,
        sectionType: section.type
      });

      console.log(`✅ Mapped ${section.type} → ${mapping.componentName}`, {
        sectionId,
        originalProps: section.content?.props,
        transformedProps
      });
    });

    // Sort by component order if specified
    if (templateMap.componentOrder) {
      results.sort((a, b) => {
        const orderA = templateMap.componentOrder!.indexOf(a.componentName);
        const orderB = templateMap.componentOrder!.indexOf(b.componentName);
        
        if (orderA === -1 && orderB === -1) return 0;
        if (orderA === -1) return 1;
        if (orderB === -1) return -1;
        
        return orderA - orderB;
      });
    }

    console.log('✅ Section mapping completed', {
      resultsCount: results.length,
      componentNames: results.map(r => r.componentName)
    });

    return results;
  }

  /**
   * Transform section props to component props using mapping
   */
  private transformSectionPropsToComponentProps(
    sectionProps: any,
    mapping: ComponentMapping
  ): any {
    const componentProps: any = {};

    // Apply default props first
    if (mapping.defaultProps) {
      Object.assign(componentProps, mapping.defaultProps);
    }

    // Apply prop mappings
    Object.entries(mapping.propsMapping).forEach(([sectionKey, componentKey]) => {
      if (sectionProps[sectionKey] !== undefined) {
        componentProps[componentKey] = sectionProps[sectionKey];
      }
    });

    // Apply custom transformer if provided
    if (mapping.propsTransformer) {
      const transformedProps = mapping.propsTransformer(sectionProps);
      Object.assign(componentProps, transformedProps);
    }

    return componentProps;
  }

  /**
   * Get mapping for a specific section type
   */
  getMappingForSection(sectionType: string, templateName: string = 'salon'): ComponentMapping | null {
    const templateMap = this.templateMaps.get(templateName);
    if (!templateMap) return null;

    return templateMap.mappings.find(m => m.sectionType === sectionType) || null;
  }

  /**
   * Get all available component names for a template
   */
  getComponentNamesForTemplate(templateName: string = 'salon'): string[] {
    const templateMap = this.templateMaps.get(templateName);
    if (!templateMap) return [];

    return templateMap.mappings.map(m => m.componentName);
  }

  /**
   * Add custom template mapping
   */
  addTemplateMapping(templateName: string, templateMap: TemplateComponentMap): void {
    this.templateMaps.set(templateName, templateMap);
    console.log(`✅ Added template mapping: ${templateName}`);
  }

  /**
   * Update existing template mapping
   */
  updateTemplateMapping(templateName: string, updates: Partial<TemplateComponentMap>): void {
    const existing = this.templateMaps.get(templateName);
    if (!existing) {
      throw new Error(`Template mapping not found: ${templateName}`);
    }

    this.templateMaps.set(templateName, {
      ...existing,
      ...updates
    });

    console.log(`✅ Updated template mapping: ${templateName}`);
  }

  /**
   * Get available template names
   */
  getAvailableTemplates(): string[] {
    return Array.from(this.templateMaps.keys());
  }

  /**
   * Validate sections against template mappings
   */
  validateSections(sections: Record<string, SectionState>, templateName: string = 'salon'): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const result = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[]
    };

    const templateMap = this.templateMaps.get(templateName);
    if (!templateMap) {
      result.valid = false;
      result.errors.push(`Template mapping not found: ${templateName}`);
      return result;
    }

    Object.entries(sections).forEach(([sectionId, section]) => {
      const mapping = templateMap.mappings.find(m => m.sectionType === section.type);
      
      if (!mapping) {
        result.warnings.push(`No mapping found for section type: ${section.type} (${sectionId})`);
        return;
      }

      // Validate required props
      Object.keys(mapping.propsMapping).forEach(requiredProp => {
        if (!section.content?.props?.[requiredProp] && !mapping.defaultProps?.[requiredProp]) {
          result.warnings.push(`Missing prop '${requiredProp}' for section ${sectionId}`);
        }
      });
    });

    return result;
  }

  /**
   * Get component order for template
   */
  getComponentOrder(templateName: string = 'salon'): string[] {
    const templateMap = this.templateMaps.get(templateName);
    return templateMap?.componentOrder || [];
  }

  /**
   * Map single section to component
   */
  mapSectionToComponent(
    section: SectionState,
    sectionId: string,
    templateName: string = 'salon'
  ): MappingResult | null {
    const mapping = this.getMappingForSection(section.type, templateName);
    if (!mapping) return null;

    const transformedProps = this.transformSectionPropsToComponentProps(
      section.content?.props || {},
      mapping
    );

    return {
      componentName: mapping.componentName,
      transformedProps,
      containerId: sectionId,
      sectionId,
      sectionType: section.type
    };
  }
}

// Export singleton instance
export const templateComponentMapper = new TemplateComponentMapper();