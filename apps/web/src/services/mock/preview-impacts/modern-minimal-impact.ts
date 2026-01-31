// Modern & Minimal Theme: Comprehensive Response Matrix (17 responses)
// 4 Headers + 5 Heroes + 4 Features + 4 Testimonials = 17 total
import { modernMinimalCSS } from '../../refinement/customCSS'

// Header Components (4 variations)
export const modernMinimalHeaders = {
  // H1: Clean efficiency header
  'clean-efficiency': {
    component: 'clean-efficiency',
    props: {
      businessName: 'MINIMAL SALON',
      tagline: 'Clean. Simple. Beautiful.',
      logoIcon: '◯',
      navItems: [
        { label: 'Services', url: '#services' },
        { label: 'Booking', url: '#booking' },
        { label: 'About', url: '#about' },
        { label: 'Contact', url: '#contact' }
      ],
      ctaText: 'Book Online',
      headerStyle: 'minimal-nav'
    }
  },

  // H2: Modern professional header
  'modern-professional': {
    component: 'modern-professional',
    props: {
      businessName: 'STUDIO M',
      tagline: 'Professional Hair Studio',
      logoIcon: '□',
      navItems: [
        { label: 'Portfolio', url: '#portfolio' },
        { label: 'Services', url: '#services' },
        { label: 'Team', url: '#team' },
        { label: 'Schedule', url: '#booking' }
      ],
      ctaText: 'Schedule',
      headerStyle: 'professional-clean'
    }
  },

  // H3: Streamlined service header
  'streamlined-service': {
    component: 'streamlined-service',
    props: {
      businessName: 'PURE CUTS',
      tagline: 'Streamlined Beauty',
      logoIcon: '△',
      navItems: [
        { label: 'Express Services', url: '#services' },
        { label: 'Pricing', url: '#pricing' },
        { label: 'Book Now', url: '#booking' }
      ],
      ctaText: 'Quick Book',
      headerStyle: 'streamlined-nav'
    }
  },

  // H4: Contemporary design header
  'contemporary-design': {
    component: 'contemporary-design',
    props: {
      businessName: 'CURRENT',
      tagline: 'Contemporary Hair Design',
      logoIcon: '◇',
      navItems: [
        { label: 'Design', url: '#design' },
        { label: 'Experience', url: '#experience' },
        { label: 'Connect', url: '#contact' },
        { label: 'Book', url: '#booking' }
      ],
      ctaText: 'Start Here',
      headerStyle: 'contemporary-nav'
    }
  }
}

// Hero Components (5 variations)
export const modernMinimalHeros = {
  // HE1: Efficiency-focused hero
  'efficiency-focused': {
    component: 'efficiency-focused',
    props: {
      badge: 'STREAMLINED PROCESS',
      title: 'Beautiful Hair, Zero Hassle',
      subtitle: 'Skip the wait. Skip the unnecessary. Get exceptional results with our streamlined approach to professional hair care.',
      primaryCTA: 'Book Instantly',
      secondaryCTA: 'View Process',
      heroStyle: 'efficiency-first',
      backgroundType: 'clean-minimal'
    }
  },

  // HE2: Design excellence hero
  'design-excellence': {
    component: 'design-excellence',
    props: {
      badge: 'PRECISION CUTTING',
      title: 'Where Form Meets Function',
      subtitle: 'Clean lines. Perfect execution. Modern techniques that deliver timeless results.',
      primaryCTA: 'See Portfolio',
      secondaryCTA: 'Book Consultation',
      heroStyle: 'design-focused',
      backgroundType: 'architectural-clean'
    }
  },

  // HE3: Time-conscious hero
  'time-conscious': {
    component: 'time-conscious',
    props: {
      badge: 'EXPRESS SERVICES',
      title: 'Professional Results in Less Time',
      subtitle: 'Busy schedule? Our express services deliver salon-quality results without compromising your time.',
      primaryCTA: 'Express Booking',
      secondaryCTA: 'Service Times',
      heroStyle: 'time-efficient',
      backgroundType: 'modern-speed'
    }
  },

  // HE4: Contemporary styling hero
  'contemporary-styling': {
    component: 'contemporary-styling',
    props: {
      badge: 'MODERN TECHNIQUES',
      title: 'Contemporary Hair for Today',
      subtitle: 'Current trends. Future-forward techniques. Hair that works with your modern lifestyle.',
      primaryCTA: 'Explore Styles',
      secondaryCTA: 'Trend Gallery',
      heroStyle: 'contemporary-style',
      backgroundType: 'trend-focused'
    }
  },

  // HE5: Quality-driven hero
  'quality-driven': {
    component: 'quality-driven',
    props: {
      badge: 'QUALITY GUARANTEED',
      title: 'No Compromises on Excellence',
      subtitle: 'Premium products. Expert techniques. Consistent results. Every single visit.',
      primaryCTA: 'Quality Promise',
      secondaryCTA: 'Our Standards',
      heroStyle: 'quality-focus',
      backgroundType: 'professional-grade'
    }
  }
}

// Features Components (4 variations)
export const modernMinimalFeatures = {
  // F1: Streamlined services
  'streamlined-services': {
    component: 'streamlined-services',
    props: {
      sectionTitle: 'Simplified Excellence',
      subtitle: 'Essential services delivered with precision and efficiency',
      primaryServices: [
        {
          name: 'Precision Cut',
          description: 'Expert cutting with mathematical precision',
          icon: '✂️',
          price: 'From $65',
          duration: '45 min'
        },
        {
          name: 'Color Correction',
          description: 'Advanced color techniques for perfect results',
          icon: '🎨',
          price: 'From $120',
          duration: '90 min'
        },
        {
          name: 'Express Styling',
          description: 'Quick professional styling for busy schedules',
          icon: '⚡',
          price: 'From $35',
          duration: '20 min'
        },
        {
          name: 'Consultation',
          description: 'Detailed analysis and style planning',
          icon: '💭',
          price: 'Complimentary',
          duration: '15 min'
        }
      ]
    }
  },

  // F2: Technology integration
  'technology-integration': {
    component: 'technology-integration',
    props: {
      sectionTitle: 'Modern Tools, Better Results',
      subtitle: 'Advanced technology meets traditional craftsmanship',
      primaryServices: [
        {
          name: 'Digital Consultation',
          description: 'AI-powered style recommendations',
          icon: '📱',
          price: 'Included',
          technology: 'AI-Powered'
        },
        {
          name: 'Online Booking',
          description: '24/7 instant appointment scheduling',
          icon: '🗓️',
          price: 'Always Free',
          technology: 'Real-Time'
        },
        {
          name: 'Virtual Try-On',
          description: 'See styles before you commit',
          icon: '👁️',
          price: 'No Charge',
          technology: 'AR Technology'
        },
        {
          name: 'Progress Tracking',
          description: 'Digital hair health monitoring',
          icon: '📊',
          price: 'Complimentary',
          technology: 'Data-Driven'
        }
      ]
    }
  },

  // F3: Efficiency systems
  'efficiency-systems': {
    component: 'efficiency-systems',
    props: {
      sectionTitle: 'Designed for Your Schedule',
      subtitle: 'Smart systems that respect your time',
      primaryServices: [
        {
          name: 'No-Wait Guarantee',
          description: 'On-time service or your next visit is free',
          icon: '⏰',
          price: 'Service Promise',
          benefit: 'Time Respect'
        },
        {
          name: 'Express Lane',
          description: 'Quick services under 30 minutes',
          icon: '🚀',
          price: 'Premium Speed',
          benefit: 'Efficiency'
        },
        {
          name: 'Prep-Free Services',
          description: 'No washing required for most cuts',
          icon: '✨',
          price: 'Standard Rate',
          benefit: 'Convenience'
        },
        {
          name: 'Mobile Reminders',
          description: 'Automated appointment confirmations',
          icon: '📲',
          price: 'Included',
          benefit: 'Organization'
        }
      ]
    }
  },

  // F4: Quality standards
  'quality-standards': {
    component: 'quality-standards',
    props: {
      sectionTitle: 'Uncompromising Standards',
      subtitle: 'Professional-grade quality in every detail',
      primaryServices: [
        {
          name: 'Premium Products Only',
          description: 'Exclusively professional-grade brands',
          icon: '⭐',
          price: 'No Upcharge',
          standard: 'Professional Grade'
        },
        {
          name: 'Certified Stylists',
          description: 'Ongoing education and certification',
          icon: '🎓',
          price: 'Included Expertise',
          standard: 'Industry Certified'
        },
        {
          name: 'Satisfaction Guarantee',
          description: 'Love it or we fix it, no questions asked',
          icon: '✅',
          price: 'Peace of Mind',
          standard: 'Guaranteed'
        },
        {
          name: 'Hygiene Protocol',
          description: 'Hospital-grade sanitation standards',
          icon: '🧼',
          price: 'Standard Practice',
          standard: 'Medical Grade'
        }
      ]
    }
  }
}

// Testimonials Components (4 variations)
export const modernMinimalTestimonials = {
  // T1: Efficiency testimonials
  'efficiency-praise': {
    component: 'efficiency-praise',
    props: {
      sectionTitle: 'Time Well Spent',
      subtitle: 'What clients say about our streamlined approach',
      testimonials: [
        {
          text: 'I can actually fit a haircut into my lunch break now. The efficiency here is incredible - no waiting, no wasted time, just perfect results.',
          author: 'Rachel Kim',
          profession: 'Marketing Director',
          timeService: 'Express Cut',
          rating: 5
        },
        {
          text: 'As a busy surgeon, I need services that respect my schedule. They deliver professional results without the typical salon time waste.',
          author: 'Dr. James Chen',
          profession: 'Surgeon',
          timeService: 'Precision Service',
          rating: 5
        },
        {
          text: 'No more sitting around waiting. I book online, arrive exactly on time, and leave looking amazing. This is how salons should work.',
          author: 'Amanda Foster',
          profession: 'Consultant',
          timeService: 'Streamlined Process',
          rating: 5
        }
      ]
    }
  },

  // T2: Quality testimonials
  'quality-results': {
    component: 'quality-results',
    props: {
      sectionTitle: 'Consistent Excellence',
      subtitle: 'Professional results that speak for themselves',
      testimonials: [
        {
          text: 'The precision is remarkable. Every cut is mathematically perfect, and the color results are exactly what we planned. True craftsmanship.',
          author: 'Victoria Liu',
          service: 'Color & Cut',
          result: 'Precision Perfect',
          rating: 5
        },
        {
          text: 'I\'ve never had such consistent results. Whether it\'s a simple trim or complete transformation, the quality never varies.',
          author: 'Michael Torres',
          service: 'Regular Maintenance',
          result: 'Always Consistent',
          rating: 5
        },
        {
          text: 'The attention to detail is unmatched. They use the best products and techniques - you can see and feel the difference immediately.',
          author: 'Sarah Williams',
          service: 'Full Service',
          result: 'Premium Quality',
          rating: 5
        }
      ]
    }
  },

  // T3: Modern approach testimonials
  'modern-approach': {
    component: 'modern-approach',
    props: {
      sectionTitle: 'The Modern Difference',
      subtitle: 'Why contemporary clients choose us',
      testimonials: [
        {
          text: 'Finally, a salon that gets it. Modern techniques, current styles, and a booking system that actually works. This is 2024 done right.',
          author: 'Jordan Martinez',
          aspect: 'Modern Systems',
          appeal: 'Tech-Forward',
          rating: 5
        },
        {
          text: 'The virtual consultation saved me so much time. I knew exactly what to expect before I even walked in. Brilliant approach.',
          author: 'Lisa Chang',
          aspect: 'Digital Innovation',
          appeal: 'Convenience',
          rating: 5
        },
        {
          text: 'Clean, minimalist space with maximum expertise. No unnecessary frills, just exceptional hair services done right.',
          author: 'David Rodriguez',
          aspect: 'Minimal Design',
          appeal: 'Focus on Craft',
          rating: 5
        }
      ]
    }
  },

  // T4: Professional testimonials
  'professional-service': {
    component: 'professional-service',
    props: {
      sectionTitle: 'Professional Standards',
      subtitle: 'Why professionals trust us with their image',
      testimonials: [
        {
          text: 'When you\'re on camera regularly, consistency matters. They deliver the same perfect result every single time. My go-to for professional appearance.',
          author: 'Rebecca Thompson',
          role: 'News Anchor',
          need: 'Camera-Ready Hair',
          rating: 5
        },
        {
          text: 'Client meetings, conferences, presentations - my hair needs to look sharp. Their precision cutting ensures I always look professional.',
          author: 'Mark Johnson',
          role: 'Executive',
          need: 'Professional Image',
          rating: 5
        },
        {
          text: 'The quality matches what I\'d expect from top NYC salons, but with better efficiency. Perfect for my demanding schedule.',
          author: 'Catherine Lee',
          role: 'Investment Banker',
          need: 'High Standards',
          rating: 5
        }
      ]
    }
  }
}

// Main modern-minimal impact with response selection logic
export const modernMinimalImpact = {
  type: "modular-transformation" as const,
  modules: {
    colorScheme: "minimal",
    typography: "clean",
    
    // Default header (can be overridden by response selector)
    header: modernMinimalHeaders['clean-efficiency'],
    
    // Default hero (can be overridden by response selector)  
    hero: modernMinimalHeros['efficiency-focused'],
    
    // Default features (can be overridden by response selector)
    features: modernMinimalFeatures['streamlined-services'],
    
    // Default testimonials (can be overridden by response selector)
    testimonials: modernMinimalTestimonials['efficiency-praise'],
    
    animations: ["slideIn", "fadeUp", "scaleIn"],
    customCSS: modernMinimalCSS
  }
}

// Response matrices are exported individually above for potential future use