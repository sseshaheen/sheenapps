// Luxury Premium Layout Responses
// Sophisticated, high-end experience with gold accents, elegant typography, and premium positioning

import { headerResponses } from './header'
import { heroResponses } from './hero'
import { featuresResponses } from './features'
import { testimonialsResponses } from './testimonials'

export const luxuryPremiumResponses = {
  header: headerResponses,
  hero: heroResponses,
  features: featuresResponses,
  testimonials: testimonialsResponses
}

// Export individual sections for direct access
export {
  headerResponses as luxuryPremiumHeader,
  heroResponses as luxuryPremiumHero,
  featuresResponses as luxuryPremiumFeatures,
  testimonialsResponses as luxuryPremiumTestimonials
}