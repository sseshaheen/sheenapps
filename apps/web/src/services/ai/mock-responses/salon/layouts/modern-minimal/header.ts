// Modern Minimal Header Responses
// Clean, contemporary headers with minimalist design and subtle animations

import type { AIComponentResponse } from '../../../types'

const createModernHeader = (
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
    name: 'Modern Minimal Header',
    html,
    css,
    props,
    responsive: {
      mobile: { 
        css: `
          /* REQUIRED BREAKPOINT PATTERN - Progressive Collapse Strategy */
          
          /* Full mobile layout (768px and below) */
          @media (max-width: 768px) {
            .header-modern-professional {
              padding: 0.5rem 0;
              border-bottom: 1px solid #e0e0e0;
            }
            
            .header-container {
              padding: 0.5rem 1rem;
              position: relative;
            }
            
            /* Mobile logo - centered, prominent */
            .header-logo {
              flex: 1;
              justify-content: center;
            }
            
            .logo-text {
              font-size: 1.125rem;
              letter-spacing: 2px;
            }
            
            .logo-subtitle {
              display: none;
            }
            
            /* Hide desktop navigation */
            .header-nav {
              display: none;
            }
            
            /* Hide desktop phone */
            .phone-minimal {
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
              width: 44px;
              height: 44px;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              gap: 4px;
              cursor: pointer;
              padding: 0;
              z-index: 1001;
              min-height: 44px;
              min-width: 44px;
            }
            
            .menu-line {
              width: 24px;
              height: 1.5px;
              background: #000000;
              transition: all 0.3s ease;
            }
            
            /* Mobile navigation overlay - full screen */
            .mobile-nav-overlay {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(255, 255, 255, 0.98);
              z-index: 1000;
              display: none;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 2.5rem;
            }
            
            .mobile-nav-overlay.active {
              display: flex;
            }
            
            .mobile-nav-link {
              color: #000000;
              text-decoration: none;
              font-size: 1.25rem;
              font-weight: 300;
              letter-spacing: 2px;
              padding: 0.75rem 2rem;
              position: relative;
              transition: all 0.3s ease;
              min-height: 44px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            
            .mobile-nav-link::after {
              content: '';
              position: absolute;
              bottom: 0;
              left: 50%;
              width: 0;
              height: 1px;
              background: #000000;
              transition: all 0.3s ease;
              transform: translateX(-50%);
            }
            
            .mobile-nav-link:hover::after {
              width: 80%;
            }
            
            /* Mobile CTA button - touch-optimized */
            .btn-book-minimal {
              width: 100%;
              max-width: 280px;
              margin: 0.75rem auto 0;
              order: 3;
              font-size: 0.75rem;
              padding: 0.75rem 1.5rem;
              border: 1px solid #000000;
              background: transparent;
              color: #000000;
              min-height: 44px;
            }
            
            /* Essential Contact (click-to-call enabled) */
            .mobile-phone-display {
              width: 100%;
              text-align: center;
              margin-top: 0.75rem;
              order: 4;
            }
            
            .mobile-phone-number {
              color: #666666;
              font-size: 0.75rem;
              font-weight: 300;
              letter-spacing: 1px;
              text-decoration: none;
            }
            
            /* Close button for mobile overlay - touch-optimized */
            .mobile-nav-close {
              position: absolute;
              top: 1rem;
              right: 1rem;
              background: none;
              border: none;
              width: 44px;
              height: 44px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 44px;
              min-width: 44px;
            }
            
            .close-x {
              font-size: 1.5rem;
              font-weight: 300;
              color: #000000;
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
              width: 44px;
              height: 44px;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              gap: 4px;
              cursor: pointer;
              padding: 0;
              z-index: 1001;
              min-height: 44px;
              min-width: 44px;
            }
          }

          /* Reduce spacing, condense secondary content at 1200px */
          @media (max-width: 1200px) {
            .header-container {
              padding: 0.75rem 1.5rem;
            }
            
            .header-nav {
              gap: 2rem;
            }
            
            .nav-link {
              font-size: 0.8rem;
              padding: 0.5rem 0;
            }
            
            .btn-book-minimal {
              padding: 0.625rem 1.5rem;
              font-size: 0.75rem;
            }
            
            .phone-minimal {
              font-size: 0.8rem;
            }
          }
        ` 
      },
      tablet: { 
        css: `
          /* Tablet modern minimal optimizations */
          @media (min-width: 769px) and (max-width: 1024px) {
            .header-container {
              padding: 0.75rem 1.5rem;
            }
            
            .header-nav {
              gap: 2rem;
            }
            
            .nav-link {
              font-size: 0.8rem;
              padding: 0.5rem 0;
              min-height: 44px;
              display: flex;
              align-items: center;
            }
            
            .btn-book-minimal {
              padding: 0.625rem 1.5rem;
              font-size: 0.75rem;
              min-height: 44px;
            }
            
            .phone-minimal {
              font-size: 0.8rem;
            }
          }
        ` 
      }
    },
    accessibility: {
      ariaLabels: { 'header-nav': 'Main navigation', 'logo': 'Studio Pure logo' },
      keyboardNavigation: true,
      screenReaderOptimized: true
    },
    seo: {
      structuredData: { '@type': 'Organization', 'name': 'Studio Pure' },
      metaTags: { description: 'Modern minimal salon header' }
    },
    performance: {
      lazyLoad: false,
      criticalCSS: '.header-modern { background: #ffffff; }',
      optimizedImages: true
    }
  },
  metadata: {
    model: 'claude-3-sonnet',
    prompt: `Modify modern minimal salon header: ${suggestion}`,
    reasoning,
    confidence: 95,
    processingTime: 1200,
    alternatives: [],
    tags: ['modern', 'minimal', 'clean', 'contemporary', 'simple']
  },
  feedback: {
    requestFeedback: true,
    improvementSuggestions: ['Consider adding subtle animations', 'Test with monochrome imagery']
  }
})

export const headerResponses = {
  'make-it-more-professional': createModernHeader(
    'modern-minimal-header-professional',
    'Make it more professional',
    'Enhanced professionalism with ultra-clean design, refined typography, and sophisticated minimalist aesthetics. Removed decorative elements for maximum clarity and impact.',
    `
    <header class="header-modern-professional" data-section-type="header">
      <div class="header-container">
        <div class="header-logo">
          <span class="logo-text">STUDIO PURE</span>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">SERVICES</a>
          <a href="#about" class="nav-link">ABOUT</a>
          <a href="#team" class="nav-link">TEAM</a>
          <a href="#contact" class="nav-link">CONTACT</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          <span class="menu-line"></span>
          <span class="menu-line"></span>
        </button>

        <div class="header-actions">
          <span class="phone-minimal">T. +1 555 890 1234</span>
          <button class="btn-book-minimal">
            <span class="btn-text">BOOK APPOINTMENT</span>
          </button>
        </div>

        <!-- Mobile Phone Display -->
        <div class="mobile-phone-display">
          <a href="tel:+15558901234" class="mobile-phone-number">T. +1 555 890 1234</a>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">
          <span class="close-x">×</span>
        </button>
        <a href="#services" class="mobile-nav-link">SERVICES</a>
        <a href="#about" class="mobile-nav-link">ABOUT</a>
        <a href="#team" class="mobile-nav-link">TEAM</a>
        <a href="#contact" class="mobile-nav-link">CONTACT</a>
      </div>
    </header>
    `,
    `
    .header-modern-professional {
      background: #ffffff;
      border-bottom: 1px solid #e0e0e0;
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-logo {
      display: flex;
      align-items: center;
    }

    .logo-text {
      font-size: 1.25rem;
      font-weight: 300;
      color: #000000;
      letter-spacing: 3px;
      font-family: 'Inter', sans-serif;
    }

    .header-nav {
      display: flex;
      gap: 3rem;
    }

    .nav-link {
      text-decoration: none;
      color: #000000;
      font-weight: 300;
      font-size: 0.75rem;
      letter-spacing: 1.5px;
      padding: 0.5rem 0;
      position: relative;
      transition: all 0.3s ease;
    }

    .nav-link::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 0;
      height: 1px;
      background: #000000;
      transition: width 0.3s ease;
    }

    .nav-link:hover::after {
      width: 100%;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .phone-minimal {
      color: #666666;
      font-size: 0.875rem;
      font-weight: 300;
      letter-spacing: 1px;
    }

    .btn-book-minimal {
      background: transparent;
      color: #000000;
      border: 1px solid #000000;
      padding: 0.75rem 2rem;
      font-weight: 300;
      font-size: 0.75rem;
      letter-spacing: 1.5px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-book-minimal:hover {
      background: #000000;
      color: #ffffff;
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay,
    .mobile-phone-display {
      display: none;
    }

    /* REQUIRED BREAKPOINT PATTERN - Progressive Collapse Strategy */
    
    /* Reduce spacing, condense secondary content at 1200px */
    @media (max-width: 1200px) {
      .header-container {
        padding: 0.75rem 1.5rem;
      }
      
      .header-nav {
        gap: 2rem;
      }
      
      .nav-link {
        font-size: 0.8rem;
        padding: 0.5rem 0;
      }
      
      .btn-book-minimal {
        padding: 0.625rem 1.5rem;
        font-size: 0.75rem;
      }
      
      .phone-minimal {
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
        width: 44px;
        height: 44px;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        padding: 0;
        z-index: 1001;
        min-height: 44px;
        min-width: 44px;
      }

      .menu-line {
        width: 24px;
        height: 1.5px;
        background: #000000;
        transition: all 0.3s ease;
      }
    }

    /* Full mobile layout at 768px */
    @media (max-width: 768px) {
      .header-nav { 
        display: none; 
      }
      
      .phone-minimal { 
        display: none; 
      }
      
      .mobile-menu-toggle {
        display: flex;
      }
      
      .mobile-phone-display {
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
      businessName: 'STUDIO PURE',
      phone: 'T. +1 555 890 1234',
      navigation: [
        { label: 'SERVICES', url: '#services' },
        { label: 'ABOUT', url: '#about' },
        { label: 'TEAM', url: '#team' },
        { label: 'CONTACT', url: '#contact' }
      ],
      ctaText: 'BOOK APPOINTMENT'
    }
  ),

  'add-contact-information': createModernHeader(
    'modern-minimal-header-contact',
    'Add contact information',
    'Integrated contact information with minimal design approach. Added essential contact details with clean typography and subtle visual hierarchy.',
    `
    <header class="header-modern-contact" data-section-type="header">
      <div class="header-top-bar">
        <div class="contact-strip">
          <span class="contact-item">MON-FRI 9-7 • SAT 9-5</span>
          <span class="contact-separator">|</span>
          <span class="contact-item">DOWNTOWN LOCATION</span>
          <span class="contact-separator">|</span>
          <span class="contact-item">HELLO@STUDIOPURE.COM</span>
        </div>
      </div>

      <div class="header-container">
        <div class="header-logo">
          <span class="logo-text">STUDIO PURE</span>
          <span class="logo-subtitle">MODERN BEAUTY</span>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">SERVICES</a>
          <a href="#studio" class="nav-link">STUDIO</a>
          <a href="#artists" class="nav-link">ARTISTS</a>
          <a href="#book" class="nav-link">BOOK</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          <span class="menu-line"></span>
          <span class="menu-line"></span>
        </button>

        <div class="header-contact-actions">
          <div class="contact-block">
            <span class="contact-label">CALL</span>
            <span class="contact-number">555.890.1234</span>
          </div>
          <button class="btn-contact-minimal">
            <span class="btn-text">INQUIRE</span>
          </button>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">
          <span class="close-x">×</span>
        </button>
        <a href="#services" class="mobile-nav-link">SERVICES</a>
        <a href="#studio" class="mobile-nav-link">STUDIO</a>
        <a href="#artists" class="mobile-nav-link">ARTISTS</a>
        <a href="#book" class="mobile-nav-link">BOOK</a>
      </div>
    </header>
    `,
    `
    .header-modern-contact {
      background: #ffffff;
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    .header-top-bar {
      background: #f8f8f8;
      padding: 0.5rem 0;
      border-bottom: 1px solid #e0e0e0;
    }

    .contact-strip {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
    }

    .contact-item {
      color: #666666;
      font-size: 0.625rem;
      font-weight: 300;
      letter-spacing: 1px;
    }

    .contact-separator {
      color: #cccccc;
      font-weight: 100;
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #e0e0e0;
    }

    .header-logo {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .logo-text {
      font-size: 1.25rem;
      font-weight: 300;
      color: #000000;
      letter-spacing: 3px;
      font-family: 'Inter', sans-serif;
    }

    .logo-subtitle {
      font-size: 0.625rem;
      font-weight: 300;
      color: #999999;
      letter-spacing: 2px;
    }

    .header-nav {
      display: flex;
      gap: 3rem;
    }

    .nav-link {
      text-decoration: none;
      color: #000000;
      font-weight: 300;
      font-size: 0.75rem;
      letter-spacing: 1.5px;
      padding: 0.5rem 0;
      position: relative;
      transition: all 0.3s ease;
    }

    .nav-link::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 0;
      height: 1px;
      background: #000000;
      transition: width 0.3s ease;
    }

    .nav-link:hover::after {
      width: 100%;
    }

    .header-contact-actions {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .contact-block {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .contact-label {
      font-size: 0.625rem;
      color: #999999;
      letter-spacing: 1px;
      font-weight: 300;
    }

    .contact-number {
      font-size: 0.875rem;
      color: #000000;
      letter-spacing: 1px;
      font-weight: 400;
      margin-top: 2px;
    }

    .btn-contact-minimal {
      background: #000000;
      color: #ffffff;
      border: none;
      padding: 0.75rem 2rem;
      font-weight: 300;
      font-size: 0.75rem;
      letter-spacing: 1.5px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-contact-minimal:hover {
      background: #333333;
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay {
      display: none;
    }

    @media (max-width: 768px) {
      /* Mobile contact header */
      .header-top-bar {
        display: none;
      }
      
      .header-container {
        padding: 0.75rem 1rem;
        position: relative;
      }
      
      .header-logo {
        flex: 1;
        align-items: center;
      }
      
      .logo-text {
        font-size: 1.125rem;
        letter-spacing: 2px;
      }
      
      .logo-subtitle {
        display: none;
      }
      
      .header-nav { 
        display: none; 
      }
      
      .contact-block { 
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
        width: 24px;
        height: 24px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
        cursor: pointer;
        padding: 0;
        z-index: 1001;
      }
      
      .menu-line {
        width: 100%;
        height: 1.5px;
        background: #000000;
        transition: all 0.3s ease;
      }
      
      /* Mobile navigation overlay */
      .mobile-nav-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.98);
        z-index: 1000;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2.5rem;
      }
      
      .mobile-nav-overlay.active {
        display: flex;
      }
      
      .mobile-nav-link {
        color: #000000;
        text-decoration: none;
        font-size: 1.25rem;
        font-weight: 300;
        letter-spacing: 2px;
        padding: 0.75rem 2rem;
        position: relative;
        transition: all 0.3s ease;
      }
      
      .mobile-nav-link::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 50%;
        width: 0;
        height: 1px;
        background: #000000;
        transition: all 0.3s ease;
        transform: translateX(-50%);
      }
      
      .mobile-nav-link:hover::after {
        width: 80%;
      }
      
      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        width: 24px;
        height: 24px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .close-x {
        font-size: 1.5rem;
        font-weight: 300;
        color: #000000;
      }
      
      .btn-contact-minimal {
        width: 100%;
        max-width: 280px;
        margin: 0.75rem auto 0;
        font-size: 0.75rem;
        padding: 0.75rem 1.5rem;
      }
    }
    `,
    {
      businessName: 'STUDIO PURE',
      subtitle: 'MODERN BEAUTY',
      phone: '555.890.1234',
      email: 'HELLO@STUDIOPURE.COM',
      hours: 'MON-FRI 9-7 • SAT 9-5',
      location: 'DOWNTOWN LOCATION',
      navigation: [
        { label: 'SERVICES', url: '#services' },
        { label: 'STUDIO', url: '#studio' },
        { label: 'ARTISTS', url: '#artists' },
        { label: 'BOOK', url: '#book' }
      ]
    }
  ),

  'include-social-media-links': createModernHeader(
    'modern-minimal-header-social',
    'Include social media links',
    'Added minimal social media integration with clean icons and subtle hover effects. Maintained minimalist aesthetic while providing social connectivity.',
    `
    <header class="header-modern-social" data-section-type="header">
      <div class="header-container">
        <div class="header-logo">
          <span class="logo-text">STUDIO PURE</span>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">SERVICES</a>
          <a href="#portfolio" class="nav-link">PORTFOLIO</a>
          <a href="#studio" class="nav-link">STUDIO</a>
          <a href="#connect" class="nav-link">CONNECT</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          <span class="menu-line"></span>
          <span class="menu-line"></span>
        </button>

        <div class="header-social-section">
          <div class="social-links-minimal">
            <a href="#instagram" class="social-link-minimal">IG</a>
            <span class="social-separator">/</span>
            <a href="#pinterest" class="social-link-minimal">PIN</a>
            <span class="social-separator">/</span>
            <a href="#linkedin" class="social-link-minimal">IN</a>
          </div>
          <button class="btn-book-social-minimal">
            <span class="btn-text">BOOK</span>
          </button>
        </div>

        <!-- Mobile Social Links -->
        <div class="mobile-social-bar-minimal">
          <a href="#instagram" class="mobile-social-minimal">IG</a>
          <a href="#pinterest" class="mobile-social-minimal">PIN</a>
          <a href="#linkedin" class="mobile-social-minimal">IN</a>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">
          <span class="close-x">×</span>
        </button>
        <a href="#services" class="mobile-nav-link">SERVICES</a>
        <a href="#portfolio" class="mobile-nav-link">PORTFOLIO</a>
        <a href="#studio" class="mobile-nav-link">STUDIO</a>
        <a href="#connect" class="mobile-nav-link">CONNECT</a>
      </div>
    </header>
    `,
    `
    .header-modern-social {
      background: #ffffff;
      border-bottom: 1px solid #e0e0e0;
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-logo {
      display: flex;
      align-items: center;
    }

    .logo-text {
      font-size: 1.25rem;
      font-weight: 300;
      color: #000000;
      letter-spacing: 3px;
      font-family: 'Inter', sans-serif;
    }

    .header-nav {
      display: flex;
      gap: 3rem;
    }

    .nav-link {
      text-decoration: none;
      color: #000000;
      font-weight: 300;
      font-size: 0.75rem;
      letter-spacing: 1.5px;
      padding: 0.5rem 0;
      position: relative;
      transition: all 0.3s ease;
    }

    .nav-link::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 0;
      height: 1px;
      background: #000000;
      transition: width 0.3s ease;
    }

    .nav-link:hover::after {
      width: 100%;
    }

    .header-social-section {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .social-links-minimal {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .social-link-minimal {
      text-decoration: none;
      color: #666666;
      font-weight: 300;
      font-size: 0.75rem;
      letter-spacing: 1px;
      transition: color 0.3s ease;
      padding: 0.25rem 0.5rem;
    }

    .social-link-minimal:hover {
      color: #000000;
    }

    .social-separator {
      color: #cccccc;
      font-size: 0.75rem;
      font-weight: 100;
    }

    .btn-book-social-minimal {
      background: transparent;
      color: #000000;
      border: 1px solid #000000;
      padding: 0.75rem 2rem;
      font-weight: 300;
      font-size: 0.75rem;
      letter-spacing: 1.5px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-book-social-minimal:hover {
      background: #000000;
      color: #ffffff;
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay,
    .mobile-social-bar-minimal {
      display: none;
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
      }
      
      .logo-text {
        font-size: 1.125rem;
        letter-spacing: 2px;
      }
      
      .header-nav { 
        display: none; 
      }
      
      /* Hide desktop social section */
      .header-social-section {
        display: none;
      }
      
      /* Show mobile social bar */
      .mobile-social-bar-minimal {
        display: flex;
        width: 100%;
        justify-content: center;
        gap: 1.5rem;
        margin-top: 0.75rem;
        padding: 0.5rem;
        order: 3;
      }
      
      .mobile-social-minimal {
        color: #666666;
        text-decoration: none;
        font-size: 0.75rem;
        font-weight: 300;
        letter-spacing: 1px;
        padding: 0.5rem;
        transition: color 0.3s ease;
      }
      
      .mobile-social-minimal:hover {
        color: #000000;
      }
      
      /* Mobile hamburger menu */
      .mobile-menu-toggle {
        position: absolute;
        right: 1rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        width: 24px;
        height: 24px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
        cursor: pointer;
        padding: 0;
        z-index: 1001;
      }
      
      .menu-line {
        width: 100%;
        height: 1.5px;
        background: #000000;
        transition: all 0.3s ease;
      }
      
      /* Mobile navigation overlay */
      .mobile-nav-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.98);
        z-index: 1000;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2.5rem;
      }
      
      .mobile-nav-overlay.active {
        display: flex;
      }
      
      .mobile-nav-link {
        color: #000000;
        text-decoration: none;
        font-size: 1.25rem;
        font-weight: 300;
        letter-spacing: 2px;
        padding: 0.75rem 2rem;
        position: relative;
        transition: all 0.3s ease;
      }
      
      .mobile-nav-link::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 50%;
        width: 0;
        height: 1px;
        background: #000000;
        transition: all 0.3s ease;
        transform: translateX(-50%);
      }
      
      .mobile-nav-link:hover::after {
        width: 80%;
      }
      
      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        width: 24px;
        height: 24px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .close-x {
        font-size: 1.5rem;
        font-weight: 300;
        color: #000000;
      }
    }
    `,
    {
      businessName: 'STUDIO PURE',
      socialLinks: [
        { platform: 'instagram', handle: 'IG', url: '#instagram' },
        { platform: 'pinterest', handle: 'PIN', url: '#pinterest' },
        { platform: 'linkedin', handle: 'IN', url: '#linkedin' }
      ],
      navigation: [
        { label: 'SERVICES', url: '#services' },
        { label: 'PORTFOLIO', url: '#portfolio' },
        { label: 'STUDIO', url: '#studio' },
        { label: 'CONNECT', url: '#connect' }
      ]
    }
  ),

  'change-the-logo-style': createModernHeader(
    'modern-minimal-header-logo',
    'Change the logo style',
    'Redesigned logo with geometric minimal style, using clean lines and modern typography. Created sophisticated brand mark with architectural precision.',
    `
    <header class="header-modern-logo" data-section-type="header">
      <div class="header-container">
        <div class="header-logo-redesigned">
          <div class="logo-mark">
            <div class="mark-line mark-line-1"></div>
            <div class="mark-line mark-line-2"></div>
            <div class="mark-line mark-line-3"></div>
          </div>
          <div class="logo-text-minimal">
            <span class="logo-studio">STUDIO</span>
            <span class="logo-pure">PURE</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">SERVICES</a>
          <a href="#work" class="nav-link">WORK</a>
          <a href="#about" class="nav-link">ABOUT</a>
          <a href="#contact" class="nav-link">CONTACT</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          <span class="menu-line"></span>
          <span class="menu-line"></span>
        </button>

        <div class="header-actions">
          <div class="minimal-badge">
            <span class="badge-year">EST</span>
            <span class="badge-number">2020</span>
          </div>
          <button class="btn-minimal-logo">
            <span class="btn-dot">•</span>
            <span class="btn-text">BOOK</span>
          </button>
        </div>

        <!-- Mobile Badge -->
        <div class="mobile-minimal-badge">
          <span class="mobile-badge-text">EST 2020</span>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">
          <span class="close-x">×</span>
        </button>
        <a href="#services" class="mobile-nav-link">SERVICES</a>
        <a href="#work" class="mobile-nav-link">WORK</a>
        <a href="#about" class="mobile-nav-link">ABOUT</a>
        <a href="#contact" class="mobile-nav-link">CONTACT</a>
      </div>
    </header>
    `,
    `
    .header-modern-logo {
      background: #ffffff;
      border-bottom: 1px solid #e0e0e0;
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-logo-redesigned {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .logo-mark {
      width: 24px;
      height: 24px;
      position: relative;
    }

    .mark-line {
      position: absolute;
      background: #000000;
      height: 1px;
    }

    .mark-line-1 {
      width: 100%;
      top: 25%;
      left: 0;
    }

    .mark-line-2 {
      width: 75%;
      top: 50%;
      left: 0;
    }

    .mark-line-3 {
      width: 50%;
      top: 75%;
      left: 0;
    }

    .logo-text-minimal {
      display: flex;
      align-items: baseline;
      gap: 0.25rem;
    }

    .logo-studio {
      font-size: 1.125rem;
      font-weight: 300;
      color: #000000;
      letter-spacing: 2px;
      font-family: 'Inter', sans-serif;
    }

    .logo-pure {
      font-size: 1.125rem;
      font-weight: 500;
      color: #000000;
      letter-spacing: 2px;
      font-family: 'Inter', sans-serif;
    }

    .header-nav {
      display: flex;
      gap: 3rem;
    }

    .nav-link {
      text-decoration: none;
      color: #000000;
      font-weight: 300;
      font-size: 0.75rem;
      letter-spacing: 1.5px;
      padding: 0.5rem 0;
      position: relative;
      transition: all 0.3s ease;
    }

    .nav-link::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 0;
      height: 1px;
      background: #000000;
      transition: width 0.3s ease;
    }

    .nav-link:hover::after {
      width: 100%;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .minimal-badge {
      display: flex;
      align-items: baseline;
      gap: 0.25rem;
    }

    .badge-year {
      font-size: 0.625rem;
      color: #999999;
      letter-spacing: 1px;
      font-weight: 300;
    }

    .badge-number {
      font-size: 0.875rem;
      color: #000000;
      font-weight: 400;
    }

    .btn-minimal-logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: #000000;
      color: #ffffff;
      border: none;
      padding: 0.75rem 2rem;
      font-weight: 300;
      font-size: 0.75rem;
      letter-spacing: 1.5px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-dot {
      font-size: 1rem;
    }

    .btn-minimal-logo:hover {
      background: #333333;
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay,
    .mobile-minimal-badge {
      display: none;
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
      
      .logo-mark {
        width: 20px;
        height: 20px;
      }
      
      .logo-studio {
        font-size: 1rem;
        letter-spacing: 1.5px;
      }
      
      .logo-pure {
        font-size: 1rem;
        letter-spacing: 1.5px;
      }
      
      .header-nav { 
        display: none; 
      }
      
      /* Hide desktop badge */
      .minimal-badge { 
        display: none; 
      }
      
      /* Show mobile badge */
      .mobile-minimal-badge {
        display: flex;
        width: 100%;
        justify-content: center;
        margin-top: 0.5rem;
        order: 3;
      }
      
      .mobile-badge-text {
        color: #999999;
        font-size: 0.625rem;
        font-weight: 300;
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
        width: 24px;
        height: 24px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
        cursor: pointer;
        padding: 0;
        z-index: 1001;
      }
      
      .menu-line {
        width: 100%;
        height: 1.5px;
        background: #000000;
        transition: all 0.3s ease;
      }
      
      /* Mobile navigation overlay */
      .mobile-nav-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.98);
        z-index: 1000;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2.5rem;
      }
      
      .mobile-nav-overlay.active {
        display: flex;
      }
      
      .mobile-nav-link {
        color: #000000;
        text-decoration: none;
        font-size: 1.25rem;
        font-weight: 300;
        letter-spacing: 2px;
        padding: 0.75rem 2rem;
        position: relative;
        transition: all 0.3s ease;
      }
      
      .mobile-nav-link::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 50%;
        width: 0;
        height: 1px;
        background: #000000;
        transition: all 0.3s ease;
        transform: translateX(-50%);
      }
      
      .mobile-nav-link:hover::after {
        width: 80%;
      }
      
      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        width: 24px;
        height: 24px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .close-x {
        font-size: 1.5rem;
        font-weight: 300;
        color: #000000;
      }
      
      .btn-minimal-logo {
        width: 100%;
        max-width: 280px;
        margin: 0.75rem auto 0;
        font-size: 0.75rem;
        padding: 0.75rem 1.5rem;
        order: 4;
      }
    }
    `,
    {
      businessName: 'STUDIO PURE',
      established: 'EST 2020',
      navigation: [
        { label: 'SERVICES', url: '#services' },
        { label: 'WORK', url: '#work' },
        { label: 'ABOUT', url: '#about' },
        { label: 'CONTACT', url: '#contact' }
      ],
      ctaText: 'BOOK'
    }
  )
}