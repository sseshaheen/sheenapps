// Ideal AI Responses for Salon Business Type

import { AIComponentResponse, AIContentResponse, AILayoutResponse, ComponentDefinition } from './types'

// Helper function to create complete ComponentDefinition with all required properties
function createComponentDefinition(base: {
  id: string
  type: string
  name: string
  html: string
  css: string
  props: Record<string, any>
}): ComponentDefinition {
  return {
    ...base,
    responsive: {
      mobile: { css: `/* Mobile optimized CSS for ${base.type} */` },
      tablet: { css: `/* Tablet optimized CSS for ${base.type} */` }
    },
    accessibility: {
      ariaLabels: { main: `${base.name} section` },
      keyboardNavigation: true,
      screenReaderOptimized: true
    },
    seo: {
      structuredData: { '@type': 'WebPageElement', name: base.name },
      metaTags: { description: `${base.name} section` }
    },
    performance: {
      lazyLoad: true,
      criticalCSS: `/* Critical CSS for ${base.type} */`,
      optimizedImages: true
    }
  }
}

// ===== COMPONENT RESPONSES =====

export const salonLuxuryHeroResponse: AIComponentResponse = {
  success: true,
  component: {
    id: 'luxury-salon-hero-v1',
    type: 'hero',
    name: 'Luxury Salon Experience Hero',
    html: `
      <section class="hero-luxury-salon">
        <div class="hero-container">
          <div class="hero-content">
            <div class="hero-badge">
              <span class="badge-icon">✨</span>
              <span class="badge-text">LUXURY EXPERIENCE</span>
            </div>
            <h1 class="hero-title">
              Where <span class="highlight">Elegance</span><br/>
              Meets <span class="highlight">Excellence</span>
            </h1>
            <p class="hero-subtitle">
              Experience the pinnacle of beauty and wellness in our serene sanctuary.
              Every visit is a journey to your most confident self.
            </p>
            <div class="hero-actions">
              <button class="btn-primary">Book Your Experience</button>
              <button class="btn-secondary">Explore Services</button>
            </div>
            <div class="hero-trust-indicators">
              <div class="trust-item">
                <span class="trust-number">500+</span>
                <span class="trust-label">Happy Clients</span>
              </div>
              <div class="trust-item">
                <span class="trust-number">15+</span>
                <span class="trust-label">Awards Won</span>
              </div>
              <div class="trust-item">
                <span class="trust-number">5★</span>
                <span class="trust-label">Google Rating</span>
              </div>
            </div>
          </div>
          <div class="hero-visual">
            <div class="hero-image-container">
              <img src="/api/placeholder/600/700" alt="Luxury salon interior" class="hero-image"/>
              <div class="floating-card service-card">
                <div class="service-icon">💇‍♀️</div>
                <span class="service-name">Premium Cut & Style</span>
                <span class="service-price">from $120</span>
              </div>
              <div class="floating-card testimonial-card">
                <div class="testimonial-avatar">👩‍🦰</div>
                <p class="testimonial-text">"Best salon experience ever!"</p>
                <span class="testimonial-author">- Sarah M.</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    `,
    css: `
      .hero-luxury-salon {
        min-height: 90vh;
        background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%);
        display: flex;
        align-items: center;
        position: relative;
        overflow: hidden;
      }

      .hero-container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 0 2rem;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4rem;
        align-items: center;
      }

      .hero-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(212, 175, 55, 0.15);
        color: #8B4513;
        padding: 0.5rem 1rem;
        border-radius: 2rem;
        font-size: 0.875rem;
        font-weight: 600;
        letter-spacing: 0.5px;
        margin-bottom: 1.5rem;
      }

      .hero-title {
        font-size: 3.5rem;
        font-weight: 700;
        line-height: 1.1;
        color: #2c1810;
        margin-bottom: 1.5rem;
        font-family: 'Playfair Display', serif;
      }

      .highlight {
        background: linear-gradient(120deg, #d4af37 0%, #f4e4bc 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .hero-subtitle {
        font-size: 1.25rem;
        color: #6b5b4f;
        line-height: 1.6;
        margin-bottom: 2rem;
        max-width: 500px;
      }

      .hero-actions {
        display: flex;
        gap: 1rem;
        margin-bottom: 3rem;
      }

      .btn-primary {
        background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
        color: white;
        border: none;
        padding: 1rem 2rem;
        border-radius: 0.5rem;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);
      }

      .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4);
      }

      .btn-secondary {
        background: transparent;
        color: #8B4513;
        border: 2px solid #d4af37;
        padding: 1rem 2rem;
        border-radius: 0.5rem;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.3s ease;
      }

      .btn-secondary:hover {
        background: #d4af37;
        color: white;
      }

      .hero-trust-indicators {
        display: flex;
        gap: 2rem;
      }

      .trust-item {
        text-align: center;
      }

      .trust-number {
        display: block;
        font-size: 1.5rem;
        font-weight: 700;
        color: #d4af37;
      }

      .trust-label {
        font-size: 0.875rem;
        color: #6b5b4f;
      }

      .hero-visual {
        position: relative;
      }

      .hero-image-container {
        position: relative;
        border-radius: 1rem;
        overflow: hidden;
      }

      .hero-image {
        width: 100%;
        height: auto;
        border-radius: 1rem;
      }

      .floating-card {
        position: absolute;
        background: white;
        padding: 1rem;
        border-radius: 0.75rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        backdrop-filter: blur(10px);
      }

      .service-card {
        top: 20%;
        right: -20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        min-width: 140px;
      }

      .testimonial-card {
        bottom: 20%;
        left: -20px;
        max-width: 200px;
      }

      @media (max-width: 768px) {
        .hero-container {
          grid-template-columns: 1fr;
          gap: 2rem;
          text-align: center;
        }

        .hero-title {
          font-size: 2.5rem;
        }

        .hero-actions {
          flex-direction: column;
          align-items: center;
        }

        .floating-card {
          display: none;
        }
      }
    `,
    props: {
      badge: 'LUXURY EXPERIENCE',
      title: 'Where Elegance Meets Excellence',
      subtitle: 'Experience the pinnacle of beauty and wellness in our serene sanctuary. Every visit is a journey to your most confident self.',
      primaryCTA: 'Book Your Experience',
      secondaryCTA: 'Explore Services',
      trustIndicators: [
        { number: '500+', label: 'Happy Clients' },
        { number: '15+', label: 'Awards Won' },
        { number: '5★', label: 'Google Rating' }
      ]
    },
    responsive: {
      mobile: {
        css: `
          .hero-title { font-size: 2.5rem; }
          .hero-container { grid-template-columns: 1fr; }
          .floating-card { display: none; }
        `
      }
    },
    accessibility: {
      ariaLabels: {
        'hero-title': 'Main heading - Where Elegance Meets Excellence',
        'btn-primary': 'Book your salon experience',
        'btn-secondary': 'Explore our services'
      },
      keyboardNavigation: true,
      screenReaderOptimized: true
    },
    seo: {
      structuredData: {
        '@type': 'LocalBusiness',
        '@context': 'https://schema.org',
        'name': 'Luxury Salon',
        'description': 'Premium beauty and wellness salon experience'
      }
    },
    performance: {
      lazyLoad: true,
      criticalCSS: `.hero-luxury-salon { min-height: 90vh; background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%); }`,
      optimizedImages: true
    }
  },
  metadata: {
    model: 'claude-3-sonnet',
    prompt: 'Create a luxury salon hero section that conveys elegance, premium service, and trustworthiness. Include social proof, clear CTAs, and sophisticated visual design.',
    reasoning: 'Used luxury color palette (gold, cream, warm browns), sophisticated typography (Playfair Display), trust indicators for credibility, floating cards for modern touch, and clear value proposition focused on experience rather than just services.',
    confidence: 95,
    processingTime: 2500,
    alternatives: [
      createComponentDefinition({
        id: 'luxury-salon-hero-alt1',
        type: 'hero',
        name: 'Minimalist Luxury Hero',
        html: '<!-- Alternative minimalist version -->',
        css: '/* Minimalist styling */',
        props: {}
      })
    ],
    tags: ['luxury', 'elegant', 'professional', 'trustworthy', 'premium']
  },
  feedback: {
    requestFeedback: true,
    improvementSuggestions: [
      'Add video background for more engagement',
      'Include seasonal promotions',
      'Add online booking widget'
    ]
  }
}

export const salonWarmHeaderResponse: AIComponentResponse = {
  success: true,
  component: {
    id: 'warm-salon-header-v1',
    type: 'header',
    name: 'Warm & Welcoming Salon Header',
    html: `
      <header class="header-warm-salon">
        <div class="header-container">
          <div class="header-logo">
            <div class="logo-icon">☀️</div>
            <div class="logo-text">
              <span class="logo-name">Sunny Styles</span>
              <span class="logo-tagline">Your Beauty Haven</span>
            </div>
          </div>

          <nav class="header-nav">
            <a href="#services" class="nav-link">
              <span class="nav-icon">💇‍♀️</span>
              <span class="nav-text">Services</span>
            </a>
            <a href="#team" class="nav-link">
              <span class="nav-icon">👥</span>
              <span class="nav-text">Our Team</span>
            </a>
            <a href="#gallery" class="nav-link">
              <span class="nav-icon">📸</span>
              <span class="nav-text">Gallery</span>
            </a>
            <a href="#contact" class="nav-link">
              <span class="nav-icon">📍</span>
              <span class="nav-text">Visit Us</span>
            </a>
          </nav>

          <div class="header-actions">
            <button class="btn-book">
              <span class="btn-icon">💕</span>
              <span class="btn-text">Book Now</span>
            </button>
          </div>
        </div>
      </header>
    `,
    css: `
      .header-warm-salon {
        background: linear-gradient(135deg, #fff5f5 0%, #ffe8e8 100%);
        border-bottom: 3px solid #ff9999;
        position: sticky;
        top: 0;
        z-index: 1000;
        backdrop-filter: blur(10px);
        box-shadow: 0 2px 20px rgba(255, 153, 153, 0.1);
      }

      .header-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 1rem 2rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .header-logo {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .logo-icon {
        font-size: 2.5rem;
        animation: gentle-bounce 3s ease-in-out infinite;
      }

      .logo-text {
        display: flex;
        flex-direction: column;
      }

      .logo-name {
        font-size: 1.75rem;
        font-weight: 700;
        color: #d63384;
        font-family: 'Comic Neue', cursive;
      }

      .logo-tagline {
        font-size: 0.875rem;
        color: #6c757d;
        font-style: italic;
      }

      .header-nav {
        display: flex;
        gap: 2rem;
      }

      .nav-link {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        text-decoration: none;
        color: #495057;
        transition: all 0.3s ease;
        padding: 0.5rem;
        border-radius: 0.75rem;
      }

      .nav-link:hover {
        background: rgba(255, 153, 153, 0.1);
        transform: translateY(-2px);
      }

      .nav-icon {
        font-size: 1.25rem;
      }

      .nav-text {
        font-size: 0.875rem;
        font-weight: 500;
      }

      .btn-book {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: linear-gradient(135deg, #ff6b9d 0%, #d63384 100%);
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 2rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(214, 51, 132, 0.3);
      }

      .btn-book:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(214, 51, 132, 0.4);
      }

      .btn-icon {
        font-size: 1.125rem;
        animation: heart-pulse 2s ease-in-out infinite;
      }

      @keyframes gentle-bounce {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-5px); }
      }

      @keyframes heart-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }

      @media (max-width: 768px) {
        .header-nav {
          display: none;
        }

        .logo-name {
          font-size: 1.5rem;
        }

        .btn-book {
          padding: 0.5rem 1rem;
        }
      }
    `,
    props: {
      businessName: 'Sunny Styles',
      tagline: 'Your Beauty Haven',
      logoIcon: '☀️',
      navigation: [
        { label: 'Services', icon: '💇‍♀️', url: '#services' },
        { label: 'Our Team', icon: '👥', url: '#team' },
        { label: 'Gallery', icon: '📸', url: '#gallery' },
        { label: 'Visit Us', icon: '📍', url: '#contact' }
      ],
      ctaText: 'Book Now',
      ctaIcon: '💕'
    },
    responsive: {
      mobile: {
        css: `
          .header-nav { display: none; }
          .logo-name { font-size: 1.5rem; }
        `
      }
    },
    accessibility: {
      ariaLabels: {
        'header-nav': 'Main navigation',
        'btn-book': 'Book appointment now'
      },
      keyboardNavigation: true,
      screenReaderOptimized: true
    },
    seo: {
      structuredData: {
        '@type': 'Organization',
        'name': 'Sunny Styles Salon',
        'url': '/',
        'logo': '/logo.png'
      }
    },
    performance: {
      lazyLoad: false,
      criticalCSS: `.header-warm-salon { background: linear-gradient(135deg, #fff5f5 0%, #ffe8e8 100%); position: sticky; top: 0; z-index: 1000; }`,
      optimizedImages: false
    }
  },
  metadata: {
    model: 'claude-3-sonnet',
    prompt: 'Create a warm, friendly salon header that feels welcoming and approachable. Use playful elements, warm colors, and clear navigation.',
    reasoning: 'Used warm pink/coral color scheme, playful animations (bouncing sun, pulsing heart), friendly navigation with icons, and Comic Neue font for approachable feel. Emphasized community and warmth over luxury.',
    confidence: 92,
    processingTime: 1800,
    alternatives: [],
    tags: ['warm', 'friendly', 'playful', 'welcoming', 'community']
  }
}

// ===== CONTENT RESPONSES =====

export const salonLuxuryContentResponse: AIContentResponse = {
  success: true,
  content: {
    primary: "Transform your look with our signature luxury treatments, where every detail is crafted to perfection.",
    alternatives: [
      "Discover the art of beauty in our premium salon sanctuary.",
      "Elevate your style with our world-class beauty expertise.",
      "Experience the finest in luxury beauty and wellness services."
    ],
    seoOptimized: "Transform your look with our signature luxury hair treatments and premium beauty services, where every detail is crafted to perfection by our expert stylists.",
    variations: {
      short: "Luxury beauty treatments crafted to perfection.",
      medium: "Transform your look with our signature luxury treatments, where every detail is crafted to perfection.",
      long: "Transform your look with our signature luxury treatments, where every detail is meticulously crafted to perfection. Our expert stylists combine years of experience with the finest products to create a truly exceptional beauty experience that leaves you feeling confident and radiant."
    }
  },
  metadata: {
    readabilityScore: 85,
    seoScore: 78,
    emotionalTone: 'aspirational',
    keywords: ['luxury', 'treatments', 'transform', 'perfection', 'beauty'],
    readingTime: '10 seconds',
    targetAudience: ['luxury_seekers', 'quality_conscious', 'premium_clients']
  }
}

// ===== LAYOUT RESPONSES =====

export const salonLuxuryLayoutResponse: AILayoutResponse = {
  success: true,
  layout: {
    id: 'luxury-salon-layout-v1',
    name: 'Luxury Salon Experience Layout',
    sections: [
      {
        id: 'hero',
        type: 'hero',
        position: 1,
        component: salonLuxuryHeroResponse.component,
        styling: {
          background: 'linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%)',
          padding: '0',
          margin: '0',
          fullWidth: true
        },
        animations: [
          {
            name: 'fadeInUp',
            trigger: 'onLoad',
            duration: 1000,
            delay: 200,
            easing: 'ease-out',
            properties: {
              opacity: [0, 1],
              transform: ['translateY(50px)', 'translateY(0)']
            }
          }
        ]
      },
      {
        id: 'services',
        type: 'features',
        position: 2,
        component: createComponentDefinition({
          id: 'luxury-services',
          type: 'features',
          name: 'Premium Services Showcase',
          html: '<!-- Services component -->',
          css: '/* Services styling */',
          props: {}
        }),
        styling: {
          background: 'white',
          padding: '5rem 0',
          margin: '0',
          fullWidth: true
        },
        animations: []
      }
    ],
    globalStyles: {
      colorScheme: 'luxury-gold',
      typography: 'elegant-serif',
      spacing: 'comfortable',
      borderRadius: 'subtle'
    },
    responsive: {
      mobile: {
        sections: [
          {
            id: 'hero',
            type: 'hero',
            position: 1,
            component: createComponentDefinition({
              id: 'mobile-hero',
              type: 'hero',
              name: 'Mobile Hero',
              html: '<!-- Mobile hero component -->',
              css: '/* Mobile hero styling */',
              props: {}
            }),
            styling: {
              background: 'transparent',
              padding: '2rem 0',
              margin: '0',
              fullWidth: true
            },
            animations: []
          }
        ]
      },
      tablet: {
        sections: [
          {
            id: 'hero',
            type: 'hero',
            position: 1,
            component: createComponentDefinition({
              id: 'tablet-hero',
              type: 'hero',
              name: 'Tablet Hero',
              html: '<!-- Tablet hero component -->',
              css: '/* Tablet hero styling */',
              props: {}
            }),
            styling: {
              background: 'transparent',
              padding: '1.5rem 0',
              margin: '0',
              fullWidth: true
            },
            animations: []
          }
        ]
      }
    }
  },
  recommendations: {
    sectionOrder: ['hero', 'services', 'testimonials', 'booking', 'contact'],
    reasoning: {
      'hero': 'Creates immediate luxury impression and trust',
      'services': 'Showcases premium offerings after initial engagement',
      'testimonials': 'Builds social proof and credibility',
      'booking': 'Converts interested visitors to appointments',
      'contact': 'Provides easy way to get in touch'
    },
    conversionOptimizations: [
      'Hero trust indicators increase confidence by 25%',
      'Clear booking CTA reduces friction',
      'Premium imagery conveys quality positioning'
    ],
    alternativeLayouts: []
  },
  metadata: {
    confidence: 94,
    conversionScore: 87,
    designScore: 92,
    userExperienceScore: 89
  }
}

// Export all salon responses
export const salonMockResponses = {
  components: {
    luxuryHero: salonLuxuryHeroResponse,
    warmHeader: salonWarmHeaderResponse
  },
  content: {
    luxuryContent: salonLuxuryContentResponse
  },
  layouts: {
    luxuryLayout: salonLuxuryLayoutResponse
  }
}
