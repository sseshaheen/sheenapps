import { BusinessIntelligence } from './idea-parser'

export interface GeneratedContent {
  hero: {
    headline: string
    subheadline: string
    cta: string
    backgroundConcept: string
  }
  navigation: {
    items: Array<{ label: string; href: string }>
    logo: string
  }
  features: Array<{
    title: string
    description: string
    icon: string
    benefit: string
  }>
  about: {
    title: string
    story: string
    mission: string
    values: string[]
  }
  pricing: {
    model: 'subscription' | 'one-time' | 'freemium' | 'custom'
    tiers: Array<{
      name: string
      price: string
      features: string[]
      popular?: boolean
    }>
  }
  testimonials: Array<{
    name: string
    role: string
    company: string
    quote: string
    rating: number
  }>
  footer: {
    tagline: string
    sections: Record<string, string[]>
  }
}

interface ContentTemplate {
  [key: string]: {
    headlines: string[]
    subheadlines: string[]
    ctas: string[]
    features: Array<{ title: string; description: string; icon: string }>
    values: string[]
    navigation: string[]
  }
}

// Industry-specific content templates for orchestrated generation
const contentTemplates: ContentTemplate = {
  'Food & Beverage': {
    headlines: [
      'Fresh flavors delivered to your door',
      'Taste the difference quality makes',
      'Where every meal tells a story',
      'Crafted with passion, served with love'
    ],
    subheadlines: [
      'Experience culinary excellence with every bite',
      'From our kitchen to your table, fresh daily',
      'Authentic flavors that bring people together',
      'Quality ingredients, unforgettable taste'
    ],
    ctas: ['Order Now', 'View Menu', 'Book Table', 'Start Your Order'],
    features: [
      { title: 'Fresh Daily', description: 'Ingredients sourced fresh every morning', icon: '🌱' },
      { title: 'Quick Delivery', description: 'Hot meals delivered in 30 minutes', icon: '🚚' },
      { title: 'Custom Orders', description: 'Dietary restrictions? We\'ve got you covered', icon: '⭐' }
    ],
    values: ['Quality', 'Freshness', 'Community', 'Sustainability'],
    navigation: ['Menu', 'About', 'Locations', 'Catering', 'Contact']
  },
  
  'Fashion & Accessories': {
    headlines: [
      'Handcrafted elegance for the modern soul',
      'Where artistry meets everyday beauty',
      'Timeless pieces, contemporary spirit',
      'Discover your unique style story'
    ],
    subheadlines: [
      'Each piece tells a story of craftsmanship and care',
      'Artisan-made jewelry that speaks to your soul',
      'Sustainable fashion for the conscious consumer',
      'From our studio to your collection'
    ],
    ctas: ['Shop Collection', 'Explore Designs', 'Custom Order', 'View Gallery'],
    features: [
      { title: 'Handcrafted', description: 'Each piece meticulously crafted by skilled artisans', icon: '✨' },
      { title: 'Sustainable', description: 'Ethically sourced materials and eco-friendly practices', icon: '🌿' },
      { title: 'Custom Design', description: 'Create something uniquely yours', icon: '💎' }
    ],
    values: ['Craftsmanship', 'Sustainability', 'Individuality', 'Quality'],
    navigation: ['Collection', 'Custom', 'About', 'Process', 'Contact']
  },
  
  'Technology': {
    headlines: [
      'Streamline your workflow with intelligent automation',
      'Where productivity meets simplicity',
      'Transform chaos into clarity',
      'Built for teams that move fast'
    ],
    subheadlines: [
      'Powerful tools that adapt to your way of working',
      'Everything you need to scale your business efficiently',
      'From startup to enterprise, we grow with you',
      'Turn complexity into competitive advantage'
    ],
    ctas: ['Start Free Trial', 'See Demo', 'Get Started', 'Try Now Free'],
    features: [
      { title: 'Smart Analytics', description: 'AI-powered insights that drive decisions', icon: '📊' },
      { title: 'Team Collaboration', description: 'Work together, achieve more', icon: '👥' },
      { title: 'API Integration', description: 'Connect with tools you already love', icon: '🔗' }
    ],
    values: ['Innovation', 'Efficiency', 'Scalability', 'Security'],
    navigation: ['Features', 'Pricing', 'Integrations', 'Docs', 'Support']
  },
  
  'Professional Services': {
    headlines: [
      'Expert guidance for your biggest challenges',
      'Strategic insights that drive results',
      'Your success is our expertise',
      'Transform potential into performance'
    ],
    subheadlines: [
      'Decades of experience working for your goals',
      'Tailored solutions for complex business challenges',
      'Partner with proven industry leaders',
      'Strategic consulting that delivers measurable results'
    ],
    ctas: ['Schedule Consultation', 'Get Started', 'Book Call', 'Learn More'],
    features: [
      { title: 'Expert Team', description: 'Industry veterans with proven track records', icon: '🎯' },
      { title: 'Custom Solutions', description: 'Strategies tailored to your unique needs', icon: '⚡' },
      { title: 'Proven Results', description: '95% client satisfaction rate', icon: '📈' }
    ],
    values: ['Expertise', 'Integrity', 'Results', 'Partnership'],
    navigation: ['Services', 'Team', 'Case Studies', 'Insights', 'Contact']
  },
  
  'Health & Beauty': {
    headlines: [
      'Where wellness meets luxury',
      'Rejuvenate your body and spirit',
      'Self-care elevated to an art form',
      'Your wellness journey starts here'
    ],
    subheadlines: [
      'Expert treatments in a serene, luxurious environment',
      'Personalized care that celebrates your natural beauty',
      'Holistic wellness for mind, body, and soul',
      'Premium services, authentic results'
    ],
    ctas: ['Book Appointment', 'View Services', 'Schedule Now', 'Get Started'],
    features: [
      { title: 'Expert Therapists', description: 'Licensed professionals with years of experience', icon: '💆‍♀️' },
      { title: 'Premium Products', description: 'Only the finest, natural ingredients', icon: '🌸' },
      { title: 'Relaxing Environment', description: 'Escape the everyday in our tranquil space', icon: '🕯️' }
    ],
    values: ['Wellness', 'Luxury', 'Expertise', 'Serenity'],
    navigation: ['Services', 'Packages', 'Team', 'Products', 'Book']
  }
}

// Pricing generators for different business models
const pricingTemplates = {
  saas: {
    freemium: [
      { name: 'Starter', price: 'Free', features: ['Basic features', 'Up to 5 users', 'Email support'] },
      { name: 'Pro', price: '$29/mo', features: ['Advanced features', 'Up to 50 users', 'Priority support', 'Analytics'], popular: true },
      { name: 'Enterprise', price: 'Custom', features: ['Everything in Pro', 'Unlimited users', 'Custom integrations', 'Dedicated support'] }
    ],
    subscription: [
      { name: 'Basic', price: '$19/mo', features: ['Core features', 'Email support', '10GB storage'] },
      { name: 'Professional', price: '$49/mo', features: ['Advanced features', 'Priority support', '100GB storage', 'Analytics'], popular: true },
      { name: 'Enterprise', price: '$99/mo', features: ['All features', 'Dedicated support', 'Unlimited storage', 'Custom integrations'] }
    ]
  },
  ecommerce: {
    'one-time': [
      { name: 'Standard', price: '$25-50', features: ['Premium quality', 'Free shipping over $75', '30-day returns'] },
      { name: 'Premium', price: '$50-100', features: ['Luxury materials', 'Gift packaging', 'Lifetime warranty'], popular: true },
      { name: 'Custom', price: 'Quote', features: ['Bespoke design', 'Personal consultation', 'Exclusive materials'] }
    ]
  },
  service: {
    custom: [
      { name: 'Consultation', price: '$150/hr', features: ['Expert advice', 'Personalized strategy', 'Follow-up notes'] },
      { name: 'Package', price: '$1,500', features: ['Comprehensive audit', '3-month plan', 'Weekly check-ins'], popular: true },
      { name: 'Retainer', price: '$5,000/mo', features: ['Ongoing support', 'Priority access', 'Monthly strategy sessions'] }
    ]
  }
}

export class ContentOrchestra {
  private intelligence: BusinessIntelligence
  private template: any // eslint-disable-line @typescript-eslint/no-explicit-any

  constructor(intelligence: BusinessIntelligence) {
    this.intelligence = intelligence
    this.template = contentTemplates[intelligence.industry] || contentTemplates['Technology']
  }

  // Generate complete content suite with orchestrated timing
  generateComplete(): GeneratedContent {
    return {
      hero: this.generateHero(),
      navigation: this.generateNavigation(),
      features: this.generateFeatures(),
      about: this.generateAbout(),
      pricing: this.generatePricing(),
      testimonials: this.generateTestimonials(),
      footer: this.generateFooter()
    }
  }

  private generateHero() {
    const headlines = this.template.headlines || ['Transform your business today']
    const subheadlines = this.template.subheadlines || ['Professional solutions for modern challenges']
    const ctas = this.template.ctas || ['Get Started']

    // Intelligent selection based on business characteristics
    const headline = this.selectBest(headlines)
    const subheadline = this.selectBest(subheadlines)
    const cta = this.selectBest(ctas)

    return {
      headline: this.personalize(headline),
      subheadline: this.personalize(subheadline),
      cta,
      backgroundConcept: `${this.intelligence.industry} themed background`
    }
  }

  private generateNavigation() {
    const navItems = this.template.navigation || ['Home', 'About', 'Services', 'Contact']
    const businessName = this.intelligence.businessName || this.generateBusinessName()

    return {
      logo: businessName,
      items: navItems.map((item: string) => ({
        label: item,
        href: `#${item.toLowerCase()}`
      }))
    }
  }

  private generateFeatures() {
    const baseFeatures = this.template.features || []
    const businessFeatures = this.intelligence.features || []

    // Combine and prioritize features
    const allFeatures = [...baseFeatures]
    
    // Add business-specific features
    businessFeatures.forEach(feature => {
      if (!allFeatures.some(f => f.title.toLowerCase().includes(feature.toLowerCase()))) {
        allFeatures.push({
          title: this.titleCase(feature),
          description: this.generateFeatureDescription(feature),
          icon: this.getFeatureIcon(feature),
          benefit: this.generateFeatureBenefit(feature)
        })
      }
    })

    return allFeatures.slice(0, 6) // Top 6 features
  }

  private generateAbout() {
    const businessName = this.intelligence.businessName || 'Our Business'
    // const industry = this.intelligence.industry
    
    return {
      title: `About ${businessName}`,
      story: this.generateStory(),
      mission: this.generateMission(),
      values: this.template.values || ['Quality', 'Innovation', 'Service', 'Integrity']
    }
  }

  private generatePricing() {
    const businessType = this.intelligence.type
    const model = this.determinePricingModel()
    
    let tiers = []
    if (businessType === 'saas') {
      tiers = pricingTemplates.saas[model as keyof typeof pricingTemplates.saas] || pricingTemplates.saas.subscription
    } else if (businessType === 'ecommerce') {
      tiers = pricingTemplates.ecommerce['one-time']
    } else {
      tiers = pricingTemplates.service.custom
    }

    return {
      model,
      tiers: tiers.map(tier => ({
        ...tier,
        features: tier.features.map(f => this.personalize(f))
      }))
    }
  }

  private generateTestimonials() {
    // const industry = this.intelligence.industry
    const businessName = this.intelligence.businessName || 'this business'
    
    return [
      {
        name: 'Sarah Johnson',
        role: 'Business Owner',
        company: 'Local Enterprise',
        quote: `${businessName} exceeded all our expectations. Truly exceptional service.`,
        rating: 5
      },
      {
        name: 'Michael Chen',
        role: 'Customer',
        company: 'Satisfied Client',
        quote: `The quality and attention to detail is outstanding. Highly recommend!`,
        rating: 5
      }
    ]
  }

  private generateFooter() {
    const businessName = this.intelligence.businessName || 'Your Business'
    
    return {
      tagline: `© 2024 ${businessName}. Crafted with passion.`,
      sections: {
        Company: ['About', 'Team', 'Careers', 'Contact'],
        Services: this.intelligence.features?.slice(0, 4) || ['Service 1', 'Service 2', 'Service 3'],
        Support: ['Help Center', 'Documentation', 'Contact Us', 'FAQ']
      }
    }
  }

  // Helper methods for intelligent content generation
  private selectBest(options: string[]): string {
    // Simple selection logic - can be enhanced with AI
    return options[Math.floor(Math.random() * options.length)]
  }

  private personalize(content: string): string {
    const businessName = this.intelligence.businessName
    const industry = this.intelligence.subCategory || this.intelligence.industry

    return content
      .replace(/\{businessName\}/g, businessName || 'Your Business')
      .replace(/\{industry\}/g, industry || 'business')
  }

  private generateBusinessName(): string {
    // const industry = this.intelligence.industry
    // const type = this.intelligence.type
    
    const prefixes = ['Smart', 'Pro', 'Elite', 'Prime', 'Pure', 'Fresh']
    const suffixes = ['Hub', 'Works', 'Studio', 'Co.', 'Solutions', 'Group']
    
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
    
    return `${prefix} ${suffix}`
  }

  private generateStory(): string {
    // const industry = this.intelligence.industry
    const tone = this.intelligence.tone
    
    if (tone === 'luxury') {
      return `Founded on the principle that excellence is not a destination, but a journey. Every detail matters, every client relationship is treasured, and every solution is crafted to perfection.`
    } else if (tone === 'friendly') {
      return `What started as a passion project has grown into something beautiful. We believe in doing things the right way, treating every customer like family, and never compromising on quality.`
    } else {
      return `Our mission is simple: deliver exceptional results through innovative solutions and dedicated service. We combine industry expertise with modern technology to help our clients succeed.`
    }
  }

  private generateMission(): string {
    const industry = this.intelligence.industry
    return `To provide exceptional ${industry.toLowerCase()} solutions that empower our clients to achieve their goals and exceed their expectations.`
  }

  private generateFeatureDescription(feature: string): string {
    const descriptions: Record<string, string> = {
      'user authentication': 'Secure login and user management system',
      'payment processing': 'Safe and reliable payment handling',
      'analytics': 'Comprehensive insights and reporting',
      'shopping cart': 'Seamless shopping experience',
      'booking': 'Easy appointment scheduling system',
      'gallery': 'Beautiful showcase of your work'
    }
    
    return descriptions[feature.toLowerCase()] || `Professional ${feature} implementation`
  }

  private getFeatureIcon(feature: string): string {
    const icons: Record<string, string> = {
      'authentication': '🔐',
      'payment': '💳',
      'analytics': '📊',
      'cart': '🛒',
      'booking': '📅',
      'gallery': '🖼️',
      'notification': '🔔',
      'integration': '🔗'
    }
    
    const key = Object.keys(icons).find(k => feature.toLowerCase().includes(k))
    return icons[key || 'default'] || '⚡'
  }

  private generateFeatureBenefit(feature: string): string {
    return `Streamline your ${feature.toLowerCase()} process and improve customer satisfaction`
  }

  private determinePricingModel(): 'subscription' | 'one-time' | 'freemium' | 'custom' {
    if (this.intelligence.type === 'saas') {
      return this.intelligence.complexity === 'complex' ? 'subscription' : 'freemium'
    } else if (this.intelligence.type === 'ecommerce') {
      return 'one-time'
    } else {
      return 'custom'
    }
  }

  private titleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    )
  }
}

// Export convenience function
export function generateContent(intelligence: BusinessIntelligence): GeneratedContent {
  const orchestra = new ContentOrchestra(intelligence)
  return orchestra.generateComplete()
}