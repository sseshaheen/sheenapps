//src/services/ai/mock-responses/salon/layouts/luxury-premium/header.ts
// Luxury Premium Header Responses
// Sophisticated, elegant headers with gold accents and premium positioning

import type { AIComponentResponse } from '../../../types'

const createLuxuryHeader = (
  id: string,
  suggestion: string,
  reasoning: string,
  html: string,
  css: string,
  props: Record<string, any>
): AIComponentResponse => ({
  success: true,
  component: {
    id,
    type: 'header',
    name: 'Luxury Premium Header',
    html,
    css,
    props,
    responsive: {
      mobile: {
        css: `
          /* REQUIRED BREAKPOINT PATTERN - Progressive Collapse Strategy */
          
          /* Full mobile layout (768px and below) */
          @media (max-width: 768px) {
            .header-luxury-professional {
              padding: 0.75rem 0;
              border-bottom: 2px solid #d4af37;
            }

            .header-container {
              padding: 0.75rem 1rem;
              flex-wrap: wrap;
              position: relative;
            }

            /* Mobile logo - centered, prominent */
            .header-logo {
              flex: 1;
              justify-content: center;
              gap: 0.5rem;
            }

            .logo-crown {
              font-size: 1.75rem;
            }

            .logo-name {
              font-size: 1.25rem;
              letter-spacing: 1px;
            }

            .logo-credentials {
              font-size: 0.625rem;
              text-align: center;
            }

            /* Hide desktop navigation */
            .header-nav {
              display: none;
            }

            /* Hide desktop contact info */
            .contact-info {
              display: none;
            }

            /* Mobile hamburger menu - touch-optimized */
            .mobile-menu-toggle {
              position: absolute;
              right: 1rem;
              top: 50%;
              transform: translateY(-50%);
              background: none;
              border: none;
              color: #d4af37;
              font-size: 1.5rem;
              cursor: pointer;
              padding: 0.5rem;
              z-index: 1001;
              min-height: 44px;
              min-width: 44px;
              display: flex;
              align-items: center;
              justify-content: center;
            }

            /* Mobile navigation overlay */
            .mobile-nav-overlay {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(0, 0, 0, 0.9);
              backdrop-filter: blur(10px);
              z-index: 1000;
              display: none;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 2rem;
            }

            .mobile-nav-overlay.active {
              display: flex;
            }

            .mobile-nav-link {
              color: #ffffff;
              text-decoration: none;
              font-size: 1.5rem;
              font-weight: 600;
              letter-spacing: 2px;
              padding: 1rem 2rem;
              border: 2px solid transparent;
              border-radius: 0.5rem;
              transition: all 0.3s ease;
              min-height: 44px;
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .mobile-nav-link:hover {
              color: #d4af37;
              border-color: #d4af37;
              background: rgba(212, 175, 55, 0.1);
            }

            /* Mobile CTA button - full width, touch-optimized */
            .btn-reserve-executive {
              width: 100%;
              max-width: 280px;
              margin: 1rem auto 0;
              order: 3;
              font-size: 0.75rem;
              padding: 0.875rem 1.5rem;
              min-height: 44px;
            }

            .btn-text {
              display: inline !important;
            }

            /* Essential Contact (click-to-call enabled) */
            .mobile-contact-bar {
              width: 100%;
              background: rgba(212, 175, 55, 0.1);
              padding: 0.5rem;
              margin-top: 0.75rem;
              border-radius: 0.25rem;
              text-align: center;
              order: 4;
            }

            .mobile-executive-line {
              color: #d4af37;
              font-size: 0.75rem;
              font-weight: 600;
              letter-spacing: 0.5px;
            }

            .mobile-contact-bar a {
              color: #d4af37;
              text-decoration: none;
            }

            /* Close button for mobile overlay - touch-optimized */
            .mobile-nav-close {
              position: absolute;
              top: 1rem;
              right: 1rem;
              background: none;
              border: none;
              color: #d4af37;
              font-size: 2rem;
              cursor: pointer;
              padding: 0.5rem;
              min-height: 44px;
              min-width: 44px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
          }

          /* Hide navigation, show hamburger at 900px */
          @media (max-width: 900px) {
            .header-nav {
              display: none;
            }

            .mobile-menu-toggle {
              display: flex;
              position: absolute;
              right: 1rem;
              top: 50%;
              transform: translateY(-50%);
              background: none;
              border: none;
              color: #d4af37;
              font-size: 1.5rem;
              cursor: pointer;
              padding: 0.5rem;
              z-index: 1001;
              min-height: 44px;
              min-width: 44px;
              align-items: center;
              justify-content: center;
            }
          }

          /* Reduce spacing, condense secondary content at 1200px */
          @media (max-width: 1200px) {
            .header-container {
              padding: 1rem 1.5rem;
            }

            .header-nav {
              gap: 1.5rem;
            }

            .nav-link {
              font-size: 0.8rem;
              padding: 0.625rem 0.75rem;
            }

            .btn-reserve-executive {
              padding: 0.875rem 1.5rem;
              font-size: 0.8rem;
            }

            .executive-line {
              font-size: 0.8rem;
            }
          }
        `
      },
      tablet: {
        css: `
          /* Tablet luxury header optimizations */
          @media (min-width: 769px) and (max-width: 1024px) {
            .header-container {
              padding: 1rem 1.5rem;
            }

            .header-nav {
              gap: 1.5rem;
            }

            .nav-link {
              font-size: 0.8rem;
              padding: 0.625rem 0.75rem;
              min-height: 44px;
              display: flex;
              align-items: center;
            }

            .btn-reserve-executive {
              padding: 0.875rem 1.5rem;
              font-size: 0.8rem;
              min-height: 44px;
            }

            .contact-info {
              display: flex;
            }

            .executive-line {
              font-size: 0.8rem;
            }
          }
        `
      }
    },
    accessibility: {
      ariaLabels: { 'header-nav': 'Main navigation', 'logo': 'ÉLITE SALON logo' },
      keyboardNavigation: true,
      screenReaderOptimized: true
    },
    seo: {
      structuredData: { '@type': 'Organization', 'name': 'ÉLITE SALON' },
      metaTags: { description: 'Luxury salon header' }
    },
    performance: {
      lazyLoad: false,
      criticalCSS: '.header-luxury { background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); }',
      optimizedImages: true
    }
  },
  metadata: {
    model: 'claude-3-sonnet',
    prompt: `Modify luxury premium salon header: ${suggestion}`,
    reasoning,
    confidence: 95,
    processingTime: 1200,
    alternatives: [],
    tags: ['luxury', 'premium', 'elegant', 'sophisticated', 'gold-accents']
  },
  feedback: {
    requestFeedback: true,
    improvementSuggestions: ['Consider adding VIP member portal', 'Include exclusive hotline number']
  }
})

export const headerResponses = {
  'make-it-more-professional': createLuxuryHeader(
    'luxury-premium-header-professional',
    'Make it more professional',
    'Enhanced professionalism with refined typography, executive-level navigation, and corporate luxury aesthetics. Added professional credentials and industry certifications to build trust.',
    `
    <header class="header-luxury-professional" data-section-type="header">
      <div class="header-container">
        <div class="header-logo">
          <div class="logo-crown">♛</div>
          <div class="logo-text">
            <span class="logo-name">ÉLITE SALON</span>
            <span class="logo-credentials">EST. 1985 • CERTIFIED MASTER STYLISTS</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">
            <span class="nav-text">SIGNATURE SERVICES</span>
          </a>
          <a href="#masters" class="nav-link">
            <span class="nav-text">MASTER STYLISTS</span>
          </a>
          <a href="#memberships" class="nav-link">
            <span class="nav-text">VIP MEMBERSHIPS</span>
          </a>
          <a href="#credentials" class="nav-link">
            <span class="nav-text">CERTIFICATIONS</span>
          </a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          ☰
        </button>

        <div class="header-actions">
          <div class="contact-info">
            <span class="executive-line">EXECUTIVE: +1 (555) 123-4567</span>
          </div>
          <button class="btn-reserve-executive">
            <span class="btn-icon">♛</span>
            <span class="btn-text">RESERVE EXECUTIVE SUITE</span>
          </button>
        </div>

        <!-- Mobile Contact Bar -->
        <div class="mobile-contact-bar">
          <a href="tel:+15551234567" class="mobile-executive-line">EXECUTIVE: +1 (555) 123-4567</a>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">SIGNATURE SERVICES</a>
        <a href="#masters" class="mobile-nav-link">MASTER STYLISTS</a>
        <a href="#memberships" class="mobile-nav-link">VIP MEMBERSHIPS</a>
        <a href="#credentials" class="mobile-nav-link">CERTIFICATIONS</a>
      </div>
    </header>
    `,
    `
    .header-luxury-professional {
      background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
      border-bottom: 3px solid #d4af37;
      position: sticky;
      top: 0;
      z-index: 1000;
      backdrop-filter: blur(20px);
      box-shadow: 0 4px 30px rgba(212, 175, 55, 0.15);
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.25rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-logo {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .logo-crown {
      font-size: 2.5rem;
      color: #d4af37;
      text-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
    }

    .logo-text {
      display: flex;
      flex-direction: column;
    }

    .logo-name {
      font-size: 1.75rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      letter-spacing: 2px;
    }

    .logo-credentials {
      font-size: 0.75rem;
      color: #d4af37;
      font-weight: 500;
      letter-spacing: 1px;
      margin-top: 2px;
    }

    .header-nav {
      display: flex;
      gap: 3rem;
    }

    .nav-link {
      text-decoration: none;
      color: #cccccc;
      font-weight: 600;
      font-size: 0.875rem;
      letter-spacing: 1px;
      transition: all 0.3s ease;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      position: relative;
    }

    .nav-link:hover {
      color: #d4af37;
      background: rgba(212, 175, 55, 0.1);
      transform: translateY(-1px);
    }

    .nav-link::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      width: 0;
      height: 2px;
      background: #d4af37;
      transition: all 0.3s ease;
      transform: translateX(-50%);
    }

    .nav-link:hover::after {
      width: 80%;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .contact-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .executive-line {
      font-size: 0.875rem;
      color: #d4af37;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .btn-reserve-executive {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border: none;
      padding: 1rem 2rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 0.875rem;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(212, 175, 55, 0.3);
    }

    .btn-reserve-executive:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(212, 175, 55, 0.4);
      background: linear-gradient(135deg, #e6c34a 0%, #d4af37 100%);
    }

    .btn-icon {
      font-size: 1.125rem;
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay,
    .mobile-contact-bar,
    .mobile-social-bar,
    .mobile-luxury-badge {
      display: none;
    }

    /* REQUIRED BREAKPOINT PATTERN - Progressive Collapse Strategy */
    
    /* Reduce spacing, condense secondary content at 1200px */
    @media (max-width: 1200px) {
      .header-container {
        padding: 1rem 1.5rem;
      }

      .header-nav {
        gap: 1.5rem;
      }

      .nav-link {
        font-size: 0.8rem;
        padding: 0.625rem 0.75rem;
      }

      .btn-reserve-executive {
        padding: 0.875rem 1.5rem;
        font-size: 0.8rem;
      }

      .executive-line {
        font-size: 0.8rem;
      }
    }

    /* Hide navigation, show hamburger at 900px */
    @media (max-width: 900px) {
      .header-nav {
        display: none;
      }

      .mobile-menu-toggle {
        display: flex;
        position: absolute;
        right: 1rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #d4af37;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.5rem;
        z-index: 1001;
        min-height: 44px;
        min-width: 44px;
        align-items: center;
        justify-content: center;
      }
    }

    /* Full mobile layout at 768px */
    @media (max-width: 768px) {
      .header-nav { 
        display: none; 
      }
      
      .contact-info { 
        display: none; 
      }
      
      .btn-text { 
        display: none; 
      }

      .mobile-menu-toggle {
        display: flex;
      }

      .mobile-contact-bar {
        display: block;
      }

      /* Logo centers on mobile */
      .header-logo {
        justify-content: center;
      }

      /* Touch-friendly spacing between elements */
      .header-container {
        gap: 1rem;
      }
    }
    `,
    {
      businessName: 'ÉLITE SALON',
      credentials: 'EST. 1985 • CERTIFIED MASTER STYLISTS',
      logoIcon: '♛',
      executiveLine: '+1 (555) 123-4567',
      navigation: [
        { label: 'SIGNATURE SERVICES', url: '#services' },
        { label: 'MASTER STYLISTS', url: '#masters' },
        { label: 'VIP MEMBERSHIPS', url: '#memberships' },
        { label: 'CERTIFICATIONS', url: '#credentials' }
      ],
      ctaText: 'RESERVE EXECUTIVE SUITE'
    }
  ),

  'add-contact-information': createLuxuryHeader(
    'luxury-premium-header-contact',
    'Add contact information',
    'Integrated comprehensive contact information with luxury presentation. Added executive hotline, VIP concierge contact, and location details with elegant typography and gold accents.',
    `
    <header class="header-luxury-contact" data-section-type="header">
      <div class="header-top-bar">
        <div class="contact-strip">
          <div class="contact-item">
            <span class="contact-icon">📞</span>
            <span class="contact-text">VIP CONCIERGE: +1 (555) 123-LUXE</span>
          </div>
          <div class="contact-item">
            <span class="contact-icon">📍</span>
            <span class="contact-text">BEVERLY HILLS • MANHATTAN • MIAMI</span>
          </div>
          <div class="contact-item">
            <span class="contact-icon">✉️</span>
            <span class="contact-text">RESERVATIONS@ELITESALON.COM</span>
          </div>
        </div>
      </div>

      <div class="header-container">
        <div class="header-logo">
          <div class="logo-crown">♛</div>
          <div class="logo-text">
            <span class="logo-name">ÉLITE SALON</span>
            <span class="logo-tagline">LUXURY REDEFINED</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">MASTERPIECES</a>
          <a href="#team" class="nav-link">ARTISANS</a>
          <a href="#suites" class="nav-link">PRIVATE SUITES</a>
          <a href="#contact" class="nav-link">LOCATIONS</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          ☰
        </button>

        <div class="header-contact-actions">
          <div class="quick-contact">
            <div class="emergency-line">
              <span class="emergency-label">24/7 VIP LINE</span>
              <span class="emergency-number">+1 (555) 999-ELITE</span>
            </div>
          </div>
          <button class="btn-contact-vip">
            <span class="btn-icon">💎</span>
            <span class="btn-text">CONTACT VIP DESK</span>
          </button>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">MASTERPIECES</a>
        <a href="#team" class="mobile-nav-link">ARTISANS</a>
        <a href="#suites" class="mobile-nav-link">PRIVATE SUITES</a>
        <a href="#contact" class="mobile-nav-link">LOCATIONS</a>
      </div>
    </header>
    `,
    `
    .header-luxury-contact {
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      position: sticky;
      top: 0;
      z-index: 1000;
      backdrop-filter: blur(20px);
    }

    .header-top-bar {
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      padding: 0.5rem 0;
    }

    .contact-strip {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 2rem;
    }

    .contact-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #000000;
      font-weight: 600;
      font-size: 0.875rem;
      letter-spacing: 0.5px;
    }

    .contact-icon {
      font-size: 1rem;
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.25rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-logo {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .logo-crown {
      font-size: 2.5rem;
      color: #d4af37;
      text-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
    }

    .logo-text {
      display: flex;
      flex-direction: column;
    }

    .logo-name {
      font-size: 1.75rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      letter-spacing: 2px;
    }

    .logo-tagline {
      font-size: 0.75rem;
      color: #d4af37;
      font-weight: 500;
      letter-spacing: 1px;
    }

    .header-nav {
      display: flex;
      gap: 2.5rem;
    }

    .nav-link {
      text-decoration: none;
      color: #cccccc;
      font-weight: 600;
      font-size: 0.875rem;
      letter-spacing: 1px;
      transition: all 0.3s ease;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
    }

    .nav-link:hover {
      color: #d4af37;
      background: rgba(212, 175, 55, 0.1);
    }

    .header-contact-actions {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .quick-contact {
      text-align: right;
    }

    .emergency-label {
      display: block;
      font-size: 0.75rem;
      color: #d4af37;
      font-weight: 600;
      letter-spacing: 1px;
    }

    .emergency-number {
      display: block;
      font-size: 1rem;
      color: #ffffff;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }

    .btn-contact-vip {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border: none;
      padding: 1rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 0.875rem;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(212, 175, 55, 0.3);
    }

    .btn-contact-vip:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(212, 175, 55, 0.4);
    }

    @media (max-width: 768px) {
      /* Mobile contact header */
      .header-top-bar {
        padding: 0.25rem 0;
      }

      .contact-strip {
        flex-direction: column;
        gap: 0.25rem;
        padding: 0 1rem;
      }

      .contact-item {
        font-size: 0.75rem;
        justify-content: center;
      }

      .contact-text {
        display: none;
      }

      .contact-icon {
        margin-right: 0.25rem;
      }

      /* Show only phone on mobile */
      .contact-item:first-child .contact-text {
        display: inline;
      }

      .header-container {
        padding: 0.75rem 1rem;
        flex-wrap: wrap;
        position: relative;
      }

      .header-logo {
        flex: 1;
        justify-content: center;
        gap: 0.5rem;
      }

      .logo-crown {
        font-size: 1.75rem;
      }

      .logo-name {
        font-size: 1.25rem;
        letter-spacing: 1px;
      }

      .logo-tagline {
        font-size: 0.625rem;
        text-align: center;
      }

      .header-nav {
        display: none;
      }

      .quick-contact {
        display: none;
      }

      /* Mobile hamburger menu */
      .mobile-menu-toggle {
        position: absolute;
        right: 1rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #d4af37;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.5rem;
        z-index: 1001;
      }

      /* Mobile navigation overlay */
      .mobile-nav-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        backdrop-filter: blur(10px);
        z-index: 1000;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2rem;
      }

      .mobile-nav-overlay.active {
        display: flex;
      }

      .mobile-nav-link {
        color: #ffffff;
        text-decoration: none;
        font-size: 1.5rem;
        font-weight: 600;
        letter-spacing: 2px;
        padding: 1rem 2rem;
        border: 2px solid transparent;
        border-radius: 0.5rem;
        transition: all 0.3s ease;
      }

      .mobile-nav-link:hover {
        color: #d4af37;
        border-color: #d4af37;
        background: rgba(212, 175, 55, 0.1);
      }

      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #d4af37;
        font-size: 2rem;
        cursor: pointer;
        padding: 0.5rem;
      }

      .btn-contact-vip {
        width: 100%;
        max-width: 280px;
        margin: 1rem auto 0;
        font-size: 0.75rem;
        padding: 0.875rem 1.5rem;
      }
    }
    `,
    {
      businessName: 'ÉLITE SALON',
      tagline: 'LUXURY REDEFINED',
      logoIcon: '♛',
      vipConcierge: '+1 (555) 123-LUXE',
      emergencyVip: '+1 (555) 999-ELITE',
      email: 'RESERVATIONS@ELITESALON.COM',
      locations: 'BEVERLY HILLS • MANHATTAN • MIAMI',
      navigation: [
        { label: 'MASTERPIECES', url: '#services' },
        { label: 'ARTISANS', url: '#team' },
        { label: 'PRIVATE SUITES', url: '#suites' },
        { label: 'LOCATIONS', url: '#contact' }
      ]
    }
  ),

  'include-social-media-links': createLuxuryHeader(
    'luxury-premium-header-social',
    'Include social media links',
    'Added exclusive social media presence with luxury platform focus. Featured Instagram showcase, exclusive Facebook community, and VIP client testimonials with sophisticated social integration.',
    `
    <header class="header-luxury-social" data-section-type="header">
      <div class="header-container">
        <div class="header-logo">
          <div class="logo-crown">♛</div>
          <div class="logo-text">
            <span class="logo-name">ÉLITE SALON</span>
            <span class="logo-tagline">FOLLOW OUR ARTISTRY</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">MASTERPIECES</a>
          <a href="#team" class="nav-link">ARTISANS</a>
          <a href="#gallery" class="nav-link">PORTFOLIO</a>
          <a href="#community" class="nav-link">COMMUNITY</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          ☰
        </button>

        <div class="header-social-section">
          <div class="social-showcase">
            <span class="social-label">FOLLOW OUR ARTISTRY</span>
            <div class="social-links">
              <a href="#instagram" class="social-link instagram">
                <span class="social-icon">📸</span>
                <span class="social-text">@ELITESALON</span>
                <span class="social-count">125K</span>
              </a>
              <a href="#facebook" class="social-link facebook">
                <span class="social-icon">👥</span>
                <span class="social-text">VIP MEMBERS</span>
                <span class="social-count">15K</span>
              </a>
              <a href="#youtube" class="social-link youtube">
                <span class="social-icon">📺</span>
                <span class="social-text">TUTORIALS</span>
                <span class="social-count">50K</span>
              </a>
            </div>
          </div>
          <button class="btn-book-social">
            <span class="btn-icon">✨</span>
            <span class="btn-text">BOOK & SHARE</span>
          </button>
        </div>

        <!-- Mobile Social Links -->
        <div class="mobile-social-bar">
          <a href="#instagram" class="mobile-social-link">📸</a>
          <a href="#facebook" class="mobile-social-link">👥</a>
          <a href="#youtube" class="mobile-social-link">📺</a>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">MASTERPIECES</a>
        <a href="#team" class="mobile-nav-link">ARTISANS</a>
        <a href="#gallery" class="mobile-nav-link">PORTFOLIO</a>
        <a href="#community" class="mobile-nav-link">COMMUNITY</a>
      </div>
    </header>
    `,
    `
    .header-luxury-social {
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      border-bottom: 3px solid #d4af37;
      position: sticky;
      top: 0;
      z-index: 1000;
      backdrop-filter: blur(20px);
      box-shadow: 0 4px 30px rgba(212, 175, 55, 0.15);
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.25rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-logo {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .logo-crown {
      font-size: 2.5rem;
      color: #d4af37;
      text-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
    }

    .logo-text {
      display: flex;
      flex-direction: column;
    }

    .logo-name {
      font-size: 1.75rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      letter-spacing: 2px;
    }

    .logo-tagline {
      font-size: 0.75rem;
      color: #d4af37;
      font-weight: 500;
      letter-spacing: 1px;
    }

    .header-nav {
      display: flex;
      gap: 2.5rem;
    }

    .nav-link {
      text-decoration: none;
      color: #cccccc;
      font-weight: 600;
      font-size: 0.875rem;
      letter-spacing: 1px;
      transition: all 0.3s ease;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
    }

    .nav-link:hover {
      color: #d4af37;
      background: rgba(212, 175, 55, 0.1);
    }

    .header-social-section {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .social-showcase {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.5rem;
    }

    .social-label {
      font-size: 0.75rem;
      color: #d4af37;
      font-weight: 600;
      letter-spacing: 1px;
    }

    .social-links {
      display: flex;
      gap: 1rem;
    }

    .social-link {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      text-decoration: none;
      color: #cccccc;
      padding: 0.5rem;
      border-radius: 0.5rem;
      transition: all 0.3s ease;
      min-width: 60px;
    }

    .social-link:hover {
      color: #d4af37;
      background: rgba(212, 175, 55, 0.1);
      transform: translateY(-2px);
    }

    .social-icon {
      font-size: 1.25rem;
    }

    .social-text {
      font-size: 0.625rem;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .social-count {
      font-size: 0.75rem;
      font-weight: 700;
      color: #d4af37;
    }

    .instagram:hover { background: rgba(225, 48, 108, 0.1) !important; color: #e1306c !important; }
    .facebook:hover { background: rgba(66, 103, 178, 0.1) !important; color: #4267B2 !important; }
    .youtube:hover { background: rgba(255, 0, 0, 0.1) !important; color: #FF0000 !important; }

    .btn-book-social {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border: none;
      padding: 1rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 0.875rem;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(212, 175, 55, 0.3);
    }

    .btn-book-social:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(212, 175, 55, 0.4);
    }

    @media (max-width: 768px) {
      /* Mobile social header */
      .header-container {
        padding: 0.75rem 1rem;
        flex-wrap: wrap;
        position: relative;
      }

      .header-logo {
        flex: 1;
        justify-content: center;
        gap: 0.5rem;
      }

      .logo-crown {
        font-size: 1.75rem;
      }

      .logo-name {
        font-size: 1.25rem;
        letter-spacing: 1px;
      }

      .logo-tagline {
        font-size: 0.625rem;
        text-align: center;
      }

      .header-nav {
        display: none;
      }

      /* Hide desktop social section */
      .header-social-section {
        display: none;
      }

      /* Show mobile social bar */
      .mobile-social-bar {
        display: flex;
        width: 100%;
        justify-content: center;
        gap: 1rem;
        margin-top: 0.75rem;
        padding: 0.5rem;
        background: rgba(212, 175, 55, 0.1);
        border-radius: 0.25rem;
        order: 3;
      }

      .mobile-social-link {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(212, 175, 55, 0.2);
        text-decoration: none;
        font-size: 1.25rem;
        transition: all 0.3s ease;
      }

      .mobile-social-link:hover {
        background: #d4af37;
        transform: scale(1.1);
      }

      /* Mobile hamburger menu */
      .mobile-menu-toggle {
        position: absolute;
        right: 1rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #d4af37;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.5rem;
        z-index: 1001;
      }

      /* Mobile navigation overlay */
      .mobile-nav-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        backdrop-filter: blur(10px);
        z-index: 1000;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2rem;
      }

      .mobile-nav-overlay.active {
        display: flex;
      }

      .mobile-nav-link {
        color: #ffffff;
        text-decoration: none;
        font-size: 1.5rem;
        font-weight: 600;
        letter-spacing: 2px;
        padding: 1rem 2rem;
        border: 2px solid transparent;
        border-radius: 0.5rem;
        transition: all 0.3s ease;
      }

      .mobile-nav-link:hover {
        color: #d4af37;
        border-color: #d4af37;
        background: rgba(212, 175, 55, 0.1);
      }

      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #d4af37;
        font-size: 2rem;
        cursor: pointer;
        padding: 0.5rem;
      }

      .btn-book-social {
        width: 100%;
        max-width: 280px;
        margin: 1rem auto 0;
        font-size: 0.75rem;
        padding: 0.875rem 1.5rem;
      }
    }
    `,
    {
      businessName: 'ÉLITE SALON',
      tagline: 'FOLLOW OUR ARTISTRY',
      logoIcon: '♛',
      socialLinks: [
        { platform: 'instagram', handle: '@ELITESALON', followers: '125K', icon: '📸' },
        { platform: 'facebook', handle: 'VIP MEMBERS', followers: '15K', icon: '👥' },
        { platform: 'youtube', handle: 'TUTORIALS', followers: '50K', icon: '📺' }
      ],
      navigation: [
        { label: 'MASTERPIECES', url: '#services' },
        { label: 'ARTISANS', url: '#team' },
        { label: 'PORTFOLIO', url: '#gallery' },
        { label: 'COMMUNITY', url: '#community' }
      ]
    }
  ),

  'change-the-logo-style': createLuxuryHeader(
    'luxury-premium-header-logo',
    'Change the logo style',
    'Redesigned logo with sophisticated monogram style, combining elegant typography with luxury emblems. Added premium visual hierarchy and refined brand presentation for enhanced prestige.',
    `
    <header class="header-luxury-logo" data-section-type="header">
      <div class="header-container">
        <div class="header-logo-redesigned">
          <div class="logo-monogram">
            <div class="monogram-circle">
              <span class="monogram-letter">E</span>
              <div class="monogram-crown">♛</div>
            </div>
          </div>
          <div class="logo-text-suite">
            <div class="logo-main">
              <span class="logo-elite">ÉLITE</span>
              <span class="logo-separator">•</span>
              <span class="logo-salon">SALON</span>
            </div>
            <span class="logo-luxury-text">MAISON DE BEAUTÉ</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">ATELIERS</a>
          <a href="#team" class="nav-link">MAÎTRES</a>
          <a href="#suites" class="nav-link">SALONS PRIVÉS</a>
          <a href="#heritage" class="nav-link">HÉRITAGE</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          ☰
        </button>

        <div class="header-actions">
          <div class="luxury-badge">
            <span class="badge-text">DEPUIS 1985</span>
            <div class="badge-stars">✦ ✦ ✦</div>
          </div>
          <button class="btn-reserve-atelier">
            <div class="btn-monogram">É</div>
            <span class="btn-text">RÉSERVER</span>
          </button>
        </div>

        <!-- Mobile Badge -->
        <div class="mobile-luxury-badge">
          <span class="mobile-badge-text">DEPUIS 1985</span>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">ATELIERS</a>
        <a href="#team" class="mobile-nav-link">MAÎTRES</a>
        <a href="#suites" class="mobile-nav-link">SALONS PRIVÉS</a>
        <a href="#heritage" class="mobile-nav-link">HÉRITAGE</a>
      </div>
    </header>
    `,
    `
    .header-luxury-logo {
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
      border-bottom: 4px solid #d4af37;
      position: sticky;
      top: 0;
      z-index: 1000;
      backdrop-filter: blur(20px);
      box-shadow: 0 4px 30px rgba(212, 175, 55, 0.2);
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.5rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-logo-redesigned {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .logo-monogram {
      position: relative;
    }

    .monogram-circle {
      width: 60px;
      height: 60px;
      border: 3px solid #d4af37;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      position: relative;
      box-shadow: 0 0 25px rgba(212, 175, 55, 0.3);
    }

    .monogram-letter {
      font-size: 1.75rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      text-shadow: 0 0 10px rgba(212, 175, 55, 0.5);
    }

    .monogram-crown {
      position: absolute;
      top: -8px;
      right: -8px;
      font-size: 1rem;
      color: #d4af37;
      background: #1a1a1a;
      border-radius: 50%;
      padding: 4px;
      border: 2px solid #d4af37;
    }

    .logo-text-suite {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .logo-main {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .logo-elite {
      font-size: 1.875rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      letter-spacing: 3px;
    }

    .logo-separator {
      font-size: 1.5rem;
      color: #d4af37;
      font-weight: 400;
    }

    .logo-salon {
      font-size: 1.875rem;
      font-weight: 300;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      letter-spacing: 2px;
    }

    .logo-luxury-text {
      font-size: 0.75rem;
      color: #888888;
      font-weight: 400;
      letter-spacing: 2px;
      font-style: italic;
      text-align: center;
    }

    .header-nav {
      display: flex;
      gap: 3rem;
    }

    .nav-link {
      text-decoration: none;
      color: #cccccc;
      font-weight: 600;
      font-size: 0.875rem;
      letter-spacing: 1px;
      transition: all 0.3s ease;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      font-style: italic;
    }

    .nav-link:hover {
      color: #d4af37;
      background: rgba(212, 175, 55, 0.1);
      transform: translateY(-1px);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .luxury-badge {
      text-align: center;
    }

    .badge-text {
      display: block;
      font-size: 0.75rem;
      color: #d4af37;
      font-weight: 600;
      letter-spacing: 1px;
    }

    .badge-stars {
      font-size: 0.875rem;
      color: #d4af37;
      margin-top: 2px;
      letter-spacing: 2px;
    }

    .btn-reserve-atelier {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border: none;
      padding: 1rem 2rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 0.875rem;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(212, 175, 55, 0.3);
    }

    .btn-monogram {
      width: 28px;
      height: 28px;
      border: 2px solid #000000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-family: 'Playfair Display', serif;
    }

    .btn-reserve-atelier:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(212, 175, 55, 0.4);
    }

    @media (max-width: 768px) {
      /* Mobile logo header */
      .header-container {
        padding: 0.75rem 1rem;
        flex-wrap: wrap;
        position: relative;
      }

      /* Mobile logo adjustments */
      .header-logo-redesigned {
        flex: 1;
        justify-content: center;
        gap: 0.75rem;
      }

      .monogram-circle {
        width: 45px;
        height: 45px;
        border: 2px solid #d4af37;
      }

      .monogram-letter {
        font-size: 1.5rem;
      }

      .monogram-crown {
        top: -6px;
        right: -6px;
        font-size: 0.875rem;
        padding: 2px;
      }

      .logo-main {
        flex-direction: column;
        gap: 0;
        align-items: center;
      }

      .logo-elite {
        font-size: 1.375rem;
        letter-spacing: 2px;
      }

      .logo-separator {
        display: none;
      }

      .logo-salon {
        font-size: 1.375rem;
        letter-spacing: 1px;
      }

      .logo-luxury-text {
        font-size: 0.625rem;
        letter-spacing: 1px;
      }

      .header-nav {
        display: none;
      }

      /* Hide desktop badge */
      .luxury-badge {
        display: none;
      }

      /* Show mobile badge */
      .mobile-luxury-badge {
        display: flex;
        width: 100%;
        justify-content: center;
        margin-top: 0.5rem;
        order: 3;
      }

      .mobile-badge-text {
        color: #d4af37;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 1px;
      }

      /* Mobile hamburger menu */
      .mobile-menu-toggle {
        position: absolute;
        right: 1rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #d4af37;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.5rem;
        z-index: 1001;
      }

      /* Mobile navigation overlay */
      .mobile-nav-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        backdrop-filter: blur(10px);
        z-index: 1000;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2rem;
      }

      .mobile-nav-overlay.active {
        display: flex;
      }

      .mobile-nav-link {
        color: #ffffff;
        text-decoration: none;
        font-size: 1.5rem;
        font-weight: 600;
        letter-spacing: 2px;
        padding: 1rem 2rem;
        border: 2px solid transparent;
        border-radius: 0.5rem;
        transition: all 0.3s ease;
        font-style: italic;
      }

      .mobile-nav-link:hover {
        color: #d4af37;
        border-color: #d4af37;
        background: rgba(212, 175, 55, 0.1);
      }

      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #d4af37;
        font-size: 2rem;
        cursor: pointer;
        padding: 0.5rem;
      }

      .btn-reserve-atelier {
        width: 100%;
        max-width: 280px;
        margin: 1rem auto 0;
        font-size: 0.75rem;
        padding: 0.875rem 1.5rem;
        order: 4;
      }

      .btn-monogram {
        width: 24px;
        height: 24px;
        border: 1px solid #000000;
      }
    }
    `,
    {
      businessName: 'ÉLITE SALON',
      frenchName: 'MAISON DE BEAUTÉ',
      logoMonogram: 'É',
      established: 'DEPUIS 1985',
      logoIcon: '♛',
      navigation: [
        { label: 'ATELIERS', url: '#services' },
        { label: 'MAÎTRES', url: '#team' },
        { label: 'SALONS PRIVÉS', url: '#suites' },
        { label: 'HÉRITAGE', url: '#heritage' }
      ],
      ctaText: 'RÉSERVER'
    }
  )
}
