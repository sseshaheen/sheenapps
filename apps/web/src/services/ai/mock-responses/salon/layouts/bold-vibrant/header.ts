// Bold Vibrant Header Responses
// Dynamic, energetic headers with bold colors and eye-catching animations

import type { AIComponentResponse } from '../../../types'

const createBoldHeader = (
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
    name: 'Bold Vibrant Header',
    html,
    css,
    props,
    responsive: {
      mobile: { 
        css: `
          /* REQUIRED BREAKPOINT PATTERN - Progressive Collapse Strategy */
          
          /* Full mobile layout (768px and below) */
          @media (max-width: 768px) {
            .header-bold-professional {
              padding: 0.75rem 0;
              background: linear-gradient(135deg, #ff00cc 0%, #333399 100%);
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
            
            .logo-icon {
              font-size: 1.75rem;
              animation: pulse 2s infinite;
            }
            
            .logo-name {
              font-size: 1.25rem;
              letter-spacing: 1px;
            }
            
            .logo-tagline {
              font-size: 0.625rem;
              text-align: center;
            }
            
            /* Hide desktop navigation */
            .header-nav {
              display: none;
            }
            
            /* Hide desktop energy bar */
            .energy-bar {
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
              gap: 5px;
              cursor: pointer;
              padding: 0;
              z-index: 1001;
              min-height: 44px;
              min-width: 44px;
            }
            
            .menu-line {
              width: 30px;
              height: 3px;
              background: #ffffff;
              border-radius: 3px;
              transition: all 0.3s ease;
            }
            
            /* Mobile navigation overlay - full screen */
            .mobile-nav-overlay {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: linear-gradient(135deg, #ff00cc 0%, #333399 100%);
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
              font-size: 1.75rem;
              font-weight: 700;
              letter-spacing: 1px;
              padding: 1rem 2rem;
              border: 3px solid transparent;
              border-radius: 50px;
              transition: all 0.3s ease;
              text-transform: uppercase;
              min-height: 44px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            
            .mobile-nav-link:hover {
              border-color: #ffff00;
              transform: scale(1.05);
              text-shadow: 0 0 20px rgba(255, 255, 0, 0.5);
            }
            
            /* Mobile CTA button - touch-optimized */
            .btn-book-bold {
              width: 100%;
              max-width: 280px;
              margin: 1rem auto 0;
              order: 3;
              font-size: 0.875rem;
              padding: 1rem 1.5rem;
              border: 3px solid #ffff00;
              animation: glow 2s ease-in-out infinite;
              min-height: 44px;
            }
            
            /* Essential Contact/Energy display */
            .mobile-energy-bar {
              width: 100%;
              background: rgba(255, 255, 255, 0.2);
              padding: 0.5rem;
              margin-top: 0.75rem;
              border-radius: 50px;
              text-align: center;
              order: 4;
            }
            
            .mobile-energy-text {
              color: #ffffff;
              font-size: 0.75rem;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            /* Close button for mobile overlay - touch-optimized */
            .mobile-nav-close {
              position: absolute;
              top: 1rem;
              right: 1rem;
              background: none;
              border: none;
              color: #ffffff;
              font-size: 2.5rem;
              cursor: pointer;
              padding: 0.5rem;
              font-weight: 700;
              min-height: 44px;
              min-width: 44px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            
            @keyframes pulse {
              0% { transform: scale(1); }
              50% { transform: scale(1.1); }
              100% { transform: scale(1); }
            }
            
            @keyframes glow {
              0% { box-shadow: 0 0 5px #ffff00; }
              50% { box-shadow: 0 0 20px #ffff00, 0 0 30px #ffff00; }
              100% { box-shadow: 0 0 5px #ffff00; }
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
              gap: 5px;
              cursor: pointer;
              padding: 0;
              z-index: 1001;
              min-height: 44px;
              min-width: 44px;
            }

            .menu-line {
              width: 30px;
              height: 3px;
              background: #ffffff;
              border-radius: 3px;
              transition: all 0.3s ease;
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
              font-size: 0.875rem;
              padding: 0.75rem 1.25rem;
            }
            
            .btn-book-bold {
              padding: 1rem 2rem;
              font-size: 0.875rem;
            }
            
            .energy-bar {
              font-size: 0.875rem;
            }
          }
        ` 
      },
      tablet: { 
        css: `
          /* Tablet bold vibrant optimizations */
          @media (min-width: 769px) and (max-width: 1024px) {
            .header-container {
              padding: 1rem 1.5rem;
            }
            
            .header-nav {
              gap: 1.5rem;
            }
            
            .nav-link {
              font-size: 0.875rem;
              padding: 0.75rem 1.25rem;
              min-height: 44px;
              display: flex;
              align-items: center;
            }
            
            .btn-book-bold {
              padding: 1rem 2rem;
              font-size: 0.875rem;
              min-height: 44px;
            }
            
            .energy-bar {
              font-size: 0.875rem;
            }
          }
        ` 
      }
    },
    accessibility: {
      ariaLabels: { 'header-nav': 'Main navigation', 'logo': 'Glow Studio logo' },
      keyboardNavigation: true,
      screenReaderOptimized: true
    },
    seo: {
      structuredData: { '@type': 'Organization', 'name': 'Glow Studio' },
      metaTags: { description: 'Bold vibrant salon header' }
    },
    performance: {
      lazyLoad: false,
      criticalCSS: '.header-bold { background: linear-gradient(135deg, #ff00cc 0%, #333399 100%); }',
      optimizedImages: true
    }
  },
  metadata: {
    model: 'claude-3-sonnet',
    prompt: `Modify bold vibrant salon header: ${suggestion}`,
    reasoning,
    confidence: 95,
    processingTime: 1200,
    alternatives: [],
    tags: ['bold', 'vibrant', 'energetic', 'dynamic', 'colorful']
  },
  feedback: {
    requestFeedback: true,
    improvementSuggestions: ['Consider adding more animations', 'Test color contrast for accessibility']
  }
})

export const headerResponses = {
  'make-it-more-professional': createBoldHeader(
    'bold-vibrant-header-professional',
    'Make it more professional',
    'Enhanced professionalism while maintaining bold energy with structured layout, refined animations, and dynamic corporate aesthetics. Added credibility without losing vibrancy.',
    `
    <header class="header-bold-professional" data-section-type="header">
      <div class="header-container">
        <div class="header-logo">
          <div class="logo-icon">⚡</div>
          <div class="logo-text">
            <span class="logo-name">GLOW STUDIO</span>
            <span class="logo-tagline">UNLEASH YOUR RADIANCE</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">
            <span class="nav-icon">💫</span>
            <span class="nav-text">SERVICES</span>
          </a>
          <a href="#artists" class="nav-link">
            <span class="nav-icon">🎨</span>
            <span class="nav-text">ARTISTS</span>
          </a>
          <a href="#gallery" class="nav-link">
            <span class="nav-icon">📸</span>
            <span class="nav-text">GALLERY</span>
          </a>
          <a href="#vibe" class="nav-link">
            <span class="nav-icon">✨</span>
            <span class="nav-text">VIBE</span>
          </a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          <span class="menu-line"></span>
          <span class="menu-line"></span>
          <span class="menu-line"></span>
        </button>

        <div class="header-actions">
          <div class="energy-bar">
            <span class="energy-text">HIGH ENERGY ZONE</span>
            <div class="energy-dots">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
          <button class="btn-book-bold">
            <span class="btn-icon">🔥</span>
            <span class="btn-text">BOOK NOW</span>
          </button>
        </div>

        <!-- Mobile Energy Bar -->
        <div class="mobile-energy-bar">
          <span class="mobile-energy-text">⚡ HIGH ENERGY ZONE ⚡</span>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">💫 SERVICES</a>
        <a href="#artists" class="mobile-nav-link">🎨 ARTISTS</a>
        <a href="#gallery" class="mobile-nav-link">📸 GALLERY</a>
        <a href="#vibe" class="mobile-nav-link">✨ VIBE</a>
      </div>
    </header>
    `,
    `
    .header-bold-professional {
      background: linear-gradient(135deg, #ff00cc 0%, #333399 100%);
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 4px 30px rgba(255, 0, 204, 0.4);
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

    .logo-icon {
      font-size: 2.5rem;
      animation: pulse 2s infinite;
    }

    .logo-text {
      display: flex;
      flex-direction: column;
    }

    .logo-name {
      font-size: 1.75rem;
      font-weight: 900;
      color: #ffffff;
      font-family: 'Montserrat', sans-serif;
      letter-spacing: 1px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    }

    .logo-tagline {
      font-size: 0.75rem;
      color: #ffff00;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-top: 2px;
    }

    .header-nav {
      display: flex;
      gap: 2rem;
    }

    .nav-link {
      text-decoration: none;
      color: #ffffff;
      font-weight: 700;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      border-radius: 50px;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .nav-link:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(255, 255, 255, 0.3);
    }

    .nav-icon {
      font-size: 1.125rem;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .energy-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .energy-text {
      color: #ffff00;
      font-weight: 800;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .energy-dots {
      display: flex;
      gap: 0.5rem;
    }

    .dot {
      width: 8px;
      height: 8px;
      background: #ffff00;
      border-radius: 50%;
      animation: bounce 1.5s infinite;
    }

    .dot:nth-child(2) {
      animation-delay: 0.3s;
    }

    .dot:nth-child(3) {
      animation-delay: 0.6s;
    }

    .btn-book-bold {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: #ffff00;
      color: #333399;
      border: 3px solid #ffff00;
      padding: 1rem 2rem;
      border-radius: 50px;
      font-weight: 900;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
      animation: glow 2s ease-in-out infinite;
    }

    .btn-book-bold:hover {
      background: transparent;
      color: #ffff00;
      transform: scale(1.05);
    }

    .btn-icon {
      font-size: 1.125rem;
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay,
    .mobile-energy-bar {
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
        font-size: 0.875rem;
        padding: 0.75rem 1.25rem;
      }
      
      .btn-book-bold {
        padding: 1rem 2rem;
        font-size: 0.875rem;
      }
      
      .energy-bar {
        font-size: 0.875rem;
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
        gap: 5px;
        cursor: pointer;
        padding: 0;
        z-index: 1001;
        min-height: 44px;
        min-width: 44px;
      }

      .menu-line {
        width: 30px;
        height: 3px;
        background: #ffffff;
        border-radius: 3px;
        transition: all 0.3s ease;
      }
    }

    /* Full mobile layout at 768px */
    @media (max-width: 768px) {
      .header-nav { 
        display: none; 
      }
      
      .energy-bar { 
        display: none; 
      }
      
      .mobile-menu-toggle {
        display: flex;
      }
      
      .mobile-energy-bar {
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

    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    @keyframes glow {
      0% { box-shadow: 0 0 5px #ffff00; }
      50% { box-shadow: 0 0 20px #ffff00, 0 0 30px #ffff00; }
      100% { box-shadow: 0 0 5px #ffff00; }
    }
    `,
    {
      businessName: 'GLOW STUDIO',
      tagline: 'UNLEASH YOUR RADIANCE',
      logoIcon: '⚡',
      energyLevel: 'HIGH ENERGY ZONE',
      navigation: [
        { label: 'SERVICES', url: '#services', icon: '💫' },
        { label: 'ARTISTS', url: '#artists', icon: '🎨' },
        { label: 'GALLERY', url: '#gallery', icon: '📸' },
        { label: 'VIBE', url: '#vibe', icon: '✨' }
      ],
      ctaText: 'BOOK NOW'
    }
  ),

  'add-contact-information': createBoldHeader(
    'bold-vibrant-header-contact',
    'Add contact information',
    'Integrated dynamic contact information with vibrant visual effects. Added multiple contact channels with energetic presentation and eye-catching design elements.',
    `
    <header class="header-bold-contact" data-section-type="header">
      <div class="header-top-bar">
        <div class="contact-strip">
          <div class="contact-marquee">
            <span class="marquee-item">📱 CALL: 555-GLOW-NOW</span>
            <span class="marquee-item">📍 DOWNTOWN CREATIVE DISTRICT</span>
            <span class="marquee-item">⏰ OPEN LATE FRIDAYS</span>
            <span class="marquee-item">📱 CALL: 555-GLOW-NOW</span>
          </div>
        </div>
      </div>

      <div class="header-container">
        <div class="header-logo">
          <div class="logo-icon">⚡</div>
          <div class="logo-text">
            <span class="logo-name">GLOW STUDIO</span>
            <span class="logo-tagline">ELECTRIC BEAUTY</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">SERVICES</a>
          <a href="#team" class="nav-link">TEAM</a>
          <a href="#vibes" class="nav-link">VIBES</a>
          <a href="#connect" class="nav-link">CONNECT</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          <span class="menu-line"></span>
          <span class="menu-line"></span>
          <span class="menu-line"></span>
        </button>

        <div class="header-contact-actions">
          <div class="quick-contact">
            <div class="contact-pulse">
              <span class="contact-label">HOTLINE</span>
              <span class="contact-number">555-GLOW</span>
            </div>
          </div>
          <button class="btn-contact-bold">
            <span class="btn-icon">💬</span>
            <span class="btn-text">LET'S TALK</span>
          </button>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">SERVICES</a>
        <a href="#team" class="mobile-nav-link">TEAM</a>
        <a href="#vibes" class="mobile-nav-link">VIBES</a>
        <a href="#connect" class="mobile-nav-link">CONNECT</a>
      </div>
    </header>
    `,
    `
    .header-bold-contact {
      background: linear-gradient(135deg, #ff00cc 0%, #333399 100%);
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    .header-top-bar {
      background: #ffff00;
      padding: 0.5rem 0;
      overflow: hidden;
    }

    .contact-marquee {
      display: flex;
      animation: marquee 20s linear infinite;
      white-space: nowrap;
    }

    .marquee-item {
      color: #333399;
      font-weight: 800;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 0 2rem;
    }

    @keyframes marquee {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
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

    .logo-icon {
      font-size: 2.5rem;
      animation: pulse 2s infinite;
    }

    .logo-text {
      display: flex;
      flex-direction: column;
    }

    .logo-name {
      font-size: 1.75rem;
      font-weight: 900;
      color: #ffffff;
      font-family: 'Montserrat', sans-serif;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    }

    .logo-tagline {
      font-size: 0.75rem;
      color: #ffff00;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .header-nav {
      display: flex;
      gap: 2rem;
    }

    .nav-link {
      text-decoration: none;
      color: #ffffff;
      font-weight: 700;
      font-size: 0.875rem;
      padding: 0.75rem 1.5rem;
      border-radius: 50px;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .nav-link:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }

    .header-contact-actions {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .contact-pulse {
      text-align: right;
      animation: pulse-glow 2s infinite;
    }

    .contact-label {
      display: block;
      font-size: 0.625rem;
      color: #ffff00;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .contact-number {
      display: block;
      font-size: 1.25rem;
      color: #ffffff;
      font-weight: 900;
      margin-top: 2px;
    }

    @keyframes pulse-glow {
      0% { text-shadow: 0 0 5px rgba(255, 255, 0, 0.5); }
      50% { text-shadow: 0 0 20px rgba(255, 255, 0, 0.8); }
      100% { text-shadow: 0 0 5px rgba(255, 255, 0, 0.5); }
    }

    .btn-contact-bold {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: transparent;
      color: #ffff00;
      border: 3px solid #ffff00;
      padding: 1rem 1.5rem;
      border-radius: 50px;
      font-weight: 900;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .btn-contact-bold:hover {
      background: #ffff00;
      color: #333399;
      transform: scale(1.05);
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay {
      display: none;
    }

    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }

    @media (max-width: 768px) {
      /* Mobile contact header */
      .contact-marquee {
        font-size: 0.75rem;
      }
      
      .marquee-item {
        padding: 0 1rem;
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
      
      .logo-icon {
        font-size: 1.75rem;
      }
      
      .logo-name {
        font-size: 1.25rem;
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
        width: 30px;
        height: 30px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 5px;
        cursor: pointer;
        padding: 0;
        z-index: 1001;
      }
      
      .menu-line {
        width: 100%;
        height: 3px;
        background: #ffffff;
        border-radius: 3px;
        transition: all 0.3s ease;
      }
      
      /* Mobile navigation overlay */
      .mobile-nav-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, #ff00cc 0%, #333399 100%);
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
        font-size: 1.75rem;
        font-weight: 700;
        letter-spacing: 1px;
        padding: 1rem 2rem;
        border: 3px solid transparent;
        border-radius: 50px;
        transition: all 0.3s ease;
        text-transform: uppercase;
      }
      
      .mobile-nav-link:hover {
        border-color: #ffff00;
        transform: scale(1.05);
        text-shadow: 0 0 20px rgba(255, 255, 0, 0.5);
      }
      
      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #ffffff;
        font-size: 2.5rem;
        cursor: pointer;
        padding: 0.5rem;
        font-weight: 700;
      }
      
      .btn-contact-bold {
        width: 100%;
        max-width: 280px;
        margin: 1rem auto 0;
        font-size: 0.75rem;
        padding: 0.875rem 1.5rem;
      }
    }
    `,
    {
      businessName: 'GLOW STUDIO',
      tagline: 'ELECTRIC BEAUTY',
      logoIcon: '⚡',
      phone: '555-GLOW',
      phoneFulll: '555-GLOW-NOW',
      location: 'DOWNTOWN CREATIVE DISTRICT',
      specialHours: 'OPEN LATE FRIDAYS',
      navigation: [
        { label: 'SERVICES', url: '#services' },
        { label: 'TEAM', url: '#team' },
        { label: 'VIBES', url: '#vibes' },
        { label: 'CONNECT', url: '#connect' }
      ]
    }
  ),

  'include-social-media-links': createBoldHeader(
    'bold-vibrant-header-social',
    'Include social media links',
    'Added explosive social media presence with animated icons and viral-ready design. Featured Instagram stories, TikTok highlights, and interactive social engagement with maximum visual impact.',
    `
    <header class="header-bold-social" data-section-type="header">
      <div class="header-container">
        <div class="header-logo">
          <div class="logo-icon">⚡</div>
          <div class="logo-text">
            <span class="logo-name">GLOW STUDIO</span>
            <span class="logo-tagline">#GLOWUP CENTRAL</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">GLOW</a>
          <a href="#crew" class="nav-link">CREW</a>
          <a href="#vibes" class="nav-link">VIBES</a>
          <a href="#hype" class="nav-link">HYPE</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          <span class="menu-line"></span>
          <span class="menu-line"></span>
          <span class="menu-line"></span>
        </button>

        <div class="header-social-section">
          <div class="social-showcase">
            <span class="social-label">GET LIT WITH US</span>
            <div class="social-links-bold">
              <a href="#instagram" class="social-link-bold instagram">
                <span class="social-icon">📸</span>
                <span class="social-text">IG</span>
                <span class="social-count">25K</span>
              </a>
              <a href="#tiktok" class="social-link-bold tiktok">
                <span class="social-icon">🎵</span>
                <span class="social-text">TIK</span>
                <span class="social-count">50K</span>
              </a>
              <a href="#youtube" class="social-link-bold youtube">
                <span class="social-icon">🎬</span>
                <span class="social-text">YT</span>
                <span class="social-count">10K</span>
              </a>
            </div>
          </div>
          <button class="btn-book-social-bold">
            <span class="btn-icon">🚀</span>
            <span class="btn-text">GO VIRAL</span>
          </button>
        </div>

        <!-- Mobile Social Links -->
        <div class="mobile-social-bar-bold">
          <a href="#instagram" class="mobile-social-bold">📸</a>
          <a href="#tiktok" class="mobile-social-bold">🎵</a>
          <a href="#youtube" class="mobile-social-bold">🎬</a>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">GLOW</a>
        <a href="#crew" class="mobile-nav-link">CREW</a>
        <a href="#vibes" class="mobile-nav-link">VIBES</a>
        <a href="#hype" class="mobile-nav-link">HYPE</a>
      </div>
    </header>
    `,
    `
    .header-bold-social {
      background: linear-gradient(135deg, #ff00cc 0%, #333399 100%);
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 4px 30px rgba(255, 0, 204, 0.4);
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

    .logo-icon {
      font-size: 2.5rem;
      animation: pulse 2s infinite;
    }

    .logo-text {
      display: flex;
      flex-direction: column;
    }

    .logo-name {
      font-size: 1.75rem;
      font-weight: 900;
      color: #ffffff;
      font-family: 'Montserrat', sans-serif;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    }

    .logo-tagline {
      font-size: 0.75rem;
      color: #ffff00;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .header-nav {
      display: flex;
      gap: 2rem;
    }

    .nav-link {
      text-decoration: none;
      color: #ffffff;
      font-weight: 700;
      font-size: 0.875rem;
      padding: 0.75rem 1.5rem;
      border-radius: 50px;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .nav-link:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
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
      font-size: 0.625rem;
      color: #ffff00;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      animation: flash 2s infinite;
    }

    @keyframes flash {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .social-links-bold {
      display: flex;
      gap: 0.75rem;
    }

    .social-link-bold {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      text-decoration: none;
      color: #ffffff;
      padding: 0.5rem;
      border-radius: 15px;
      transition: all 0.3s ease;
      min-width: 50px;
      background: rgba(255, 255, 255, 0.1);
    }

    .social-link-bold:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-3px) rotate(-5deg);
    }

    .social-icon {
      font-size: 1.5rem;
      filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.3));
    }

    .social-text {
      font-size: 0.625rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .social-count {
      font-size: 0.75rem;
      font-weight: 900;
      color: #ffff00;
    }

    .instagram:hover { background: linear-gradient(45deg, #f58529, #dd2a7b, #8134af) !important; }
    .tiktok:hover { background: #000000 !important; }
    .youtube:hover { background: #ff0000 !important; }

    .btn-book-social-bold {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: #ffff00;
      color: #333399;
      border: 3px solid #ffff00;
      padding: 1rem 1.5rem;
      border-radius: 50px;
      font-weight: 900;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
      animation: bounce 2s infinite;
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }

    .btn-book-social-bold:hover {
      background: transparent;
      color: #ffff00;
      transform: scale(1.1) rotate(5deg);
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay,
    .mobile-social-bar-bold {
      display: none;
    }

    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
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
      
      .logo-icon {
        font-size: 1.75rem;
      }
      
      .logo-name {
        font-size: 1.25rem;
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
      .mobile-social-bar-bold {
        display: flex;
        width: 100%;
        justify-content: center;
        gap: 1rem;
        margin-top: 0.75rem;
        padding: 0.5rem;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 50px;
        order: 3;
      }
      
      .mobile-social-bold {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 45px;
        height: 45px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        text-decoration: none;
        font-size: 1.5rem;
        transition: all 0.3s ease;
        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
      }
      
      .mobile-social-bold:hover {
        background: #ffff00;
        transform: scale(1.1) rotate(-10deg);
      }
      
      /* Mobile hamburger menu */
      .mobile-menu-toggle {
        position: absolute;
        right: 1rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        width: 30px;
        height: 30px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 5px;
        cursor: pointer;
        padding: 0;
        z-index: 1001;
      }
      
      .menu-line {
        width: 100%;
        height: 3px;
        background: #ffffff;
        border-radius: 3px;
        transition: all 0.3s ease;
      }
      
      /* Mobile navigation overlay */
      .mobile-nav-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, #ff00cc 0%, #333399 100%);
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
        font-size: 1.75rem;
        font-weight: 700;
        letter-spacing: 1px;
        padding: 1rem 2rem;
        border: 3px solid transparent;
        border-radius: 50px;
        transition: all 0.3s ease;
        text-transform: uppercase;
      }
      
      .mobile-nav-link:hover {
        border-color: #ffff00;
        transform: scale(1.05);
        text-shadow: 0 0 20px rgba(255, 255, 0, 0.5);
      }
      
      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #ffffff;
        font-size: 2.5rem;
        cursor: pointer;
        padding: 0.5rem;
        font-weight: 700;
      }
    }
    `,
    {
      businessName: 'GLOW STUDIO',
      tagline: '#GLOWUP CENTRAL',
      logoIcon: '⚡',
      socialTagline: 'GET LIT WITH US',
      socialLinks: [
        { platform: 'instagram', handle: 'IG', followers: '25K', icon: '📸' },
        { platform: 'tiktok', handle: 'TIK', followers: '50K', icon: '🎵' },
        { platform: 'youtube', handle: 'YT', followers: '10K', icon: '🎬' }
      ],
      navigation: [
        { label: 'GLOW', url: '#services' },
        { label: 'CREW', url: '#crew' },
        { label: 'VIBES', url: '#vibes' },
        { label: 'HYPE', url: '#hype' }
      ]
    }
  ),

  'change-the-logo-style': createBoldHeader(
    'bold-vibrant-header-logo',
    'Change the logo style',
    'Redesigned logo with explosive neon style, combining electric colors and dynamic shapes. Created high-energy brand mark with maximum visual impact and memorable presence.',
    `
    <header class="header-bold-logo" data-section-type="header">
      <div class="header-container">
        <div class="header-logo-redesigned">
          <div class="logo-burst">
            <div class="burst-outer">
              <div class="burst-inner">
                <span class="burst-letter">G</span>
              </div>
            </div>
            <div class="logo-sparks">
              <span class="spark spark-1">✦</span>
              <span class="spark spark-2">✦</span>
              <span class="spark spark-3">✦</span>
            </div>
          </div>
          <div class="logo-text-bold">
            <div class="logo-main">
              <span class="logo-glow">GLOW</span>
            </div>
            <span class="logo-studio-text">STUDIO</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#transform" class="nav-link">TRANSFORM</a>
          <a href="#create" class="nav-link">CREATE</a>
          <a href="#inspire" class="nav-link">INSPIRE</a>
          <a href="#shine" class="nav-link">SHINE</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          <span class="menu-line"></span>
          <span class="menu-line"></span>
          <span class="menu-line"></span>
        </button>

        <div class="header-actions">
          <div class="vibe-meter">
            <span class="vibe-text">VIBE</span>
            <div class="vibe-level">
              <div class="vibe-bar"></div>
            </div>
          </div>
          <button class="btn-reserve-bold">
            <div class="btn-burst">💥</div>
            <span class="btn-text">IGNITE</span>
          </button>
        </div>

        <!-- Mobile Vibe Display -->
        <div class="mobile-vibe-display">
          <span class="mobile-vibe-text">VIBE LEVEL: MAX 🔥</span>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#transform" class="mobile-nav-link">TRANSFORM</a>
        <a href="#create" class="mobile-nav-link">CREATE</a>
        <a href="#inspire" class="mobile-nav-link">INSPIRE</a>
        <a href="#shine" class="mobile-nav-link">SHINE</a>
      </div>
    </header>
    `,
    `
    .header-bold-logo {
      background: linear-gradient(135deg, #ff00cc 0%, #333399 100%);
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 4px 30px rgba(255, 0, 204, 0.4);
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

    .logo-burst {
      position: relative;
      width: 60px;
      height: 60px;
    }

    .burst-outer {
      width: 100%;
      height: 100%;
      background: #ffff00;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      animation: rotate 10s linear infinite;
      box-shadow: 0 0 30px #ffff00;
    }

    .burst-inner {
      width: 45px;
      height: 45px;
      background: #ff00cc;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .burst-letter {
      font-size: 1.75rem;
      font-weight: 900;
      color: #ffffff;
      font-family: 'Montserrat', sans-serif;
    }

    .logo-sparks {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100%;
      height: 100%;
    }

    .spark {
      position: absolute;
      color: #ffff00;
      font-size: 1rem;
      animation: sparkle 3s ease-in-out infinite;
    }

    .spark-1 {
      top: -10px;
      left: 50%;
      animation-delay: 0s;
    }

    .spark-2 {
      top: 50%;
      right: -10px;
      animation-delay: 1s;
    }

    .spark-3 {
      bottom: -10px;
      left: 50%;
      animation-delay: 2s;
    }

    @keyframes rotate {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @keyframes sparkle {
      0%, 100% { opacity: 0; transform: scale(0); }
      50% { opacity: 1; transform: scale(1); }
    }

    .logo-text-bold {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .logo-main {
      display: flex;
      align-items: baseline;
    }

    .logo-glow {
      font-size: 2rem;
      font-weight: 900;
      color: #ffffff;
      font-family: 'Montserrat', sans-serif;
      text-shadow: 0 0 20px #ffff00, 0 0 40px #ffff00;
      letter-spacing: 2px;
    }

    .logo-studio-text {
      font-size: 0.875rem;
      color: #ffff00;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-top: -5px;
    }

    .header-nav {
      display: flex;
      gap: 2rem;
    }

    .nav-link {
      text-decoration: none;
      color: #ffffff;
      font-weight: 700;
      font-size: 0.875rem;
      padding: 0.75rem 1.5rem;
      border-radius: 50px;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .nav-link:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .vibe-meter {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .vibe-text {
      font-size: 0.75rem;
      color: #ffff00;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .vibe-level {
      width: 60px;
      height: 8px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      overflow: hidden;
    }

    .vibe-bar {
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #ffff00 0%, #ff6600 100%);
      animation: vibe-pulse 1.5s ease-in-out infinite;
    }

    @keyframes vibe-pulse {
      0%, 100% { transform: scaleX(0.8); }
      50% { transform: scaleX(1); }
    }

    .btn-reserve-bold {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: transparent;
      color: #ffff00;
      border: 3px solid #ffff00;
      padding: 1rem 2rem;
      border-radius: 50px;
      font-weight: 900;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
      position: relative;
      overflow: hidden;
    }

    .btn-burst {
      font-size: 1.25rem;
    }

    .btn-reserve-bold:hover {
      background: #ffff00;
      color: #333399;
      transform: scale(1.05);
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay,
    .mobile-vibe-display {
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
      
      .logo-burst {
        width: 45px;
        height: 45px;
      }
      
      .burst-outer {
        box-shadow: 0 0 20px #ffff00;
      }
      
      .burst-inner {
        width: 35px;
        height: 35px;
      }
      
      .burst-letter {
        font-size: 1.25rem;
      }
      
      .spark {
        font-size: 0.75rem;
      }
      
      .logo-glow {
        font-size: 1.5rem;
        letter-spacing: 1px;
      }
      
      .logo-studio-text {
        font-size: 0.75rem;
        letter-spacing: 2px;
      }
      
      .header-nav { 
        display: none; 
      }
      
      /* Hide desktop vibe meter */
      .vibe-meter { 
        display: none; 
      }
      
      /* Show mobile vibe display */
      .mobile-vibe-display {
        display: flex;
        width: 100%;
        justify-content: center;
        margin-top: 0.5rem;
        order: 3;
      }
      
      .mobile-vibe-text {
        color: #ffff00;
        font-size: 0.75rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1px;
        animation: flash 2s infinite;
      }
      
      @keyframes flash {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      /* Mobile hamburger menu */
      .mobile-menu-toggle {
        position: absolute;
        right: 1rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        width: 30px;
        height: 30px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 5px;
        cursor: pointer;
        padding: 0;
        z-index: 1001;
      }
      
      .menu-line {
        width: 100%;
        height: 3px;
        background: #ffffff;
        border-radius: 3px;
        transition: all 0.3s ease;
      }
      
      /* Mobile navigation overlay */
      .mobile-nav-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, #ff00cc 0%, #333399 100%);
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
        font-size: 1.75rem;
        font-weight: 700;
        letter-spacing: 1px;
        padding: 1rem 2rem;
        border: 3px solid transparent;
        border-radius: 50px;
        transition: all 0.3s ease;
        text-transform: uppercase;
      }
      
      .mobile-nav-link:hover {
        border-color: #ffff00;
        transform: scale(1.05);
        text-shadow: 0 0 20px rgba(255, 255, 0, 0.5);
      }
      
      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #ffffff;
        font-size: 2.5rem;
        cursor: pointer;
        padding: 0.5rem;
        font-weight: 700;
      }
      
      .btn-reserve-bold {
        width: 100%;
        max-width: 280px;
        margin: 0.75rem auto 0;
        font-size: 0.75rem;
        padding: 0.875rem 1.5rem;
        order: 4;
      }
    }
    `,
    {
      businessName: 'GLOW',
      studioText: 'STUDIO',
      logoMonogram: 'G',
      vibeLevel: 'VIBE LEVEL: MAX 🔥',
      navigation: [
        { label: 'TRANSFORM', url: '#transform' },
        { label: 'CREATE', url: '#create' },
        { label: 'INSPIRE', url: '#inspire' },
        { label: 'SHINE', url: '#shine' }
      ],
      ctaText: 'IGNITE'
    }
  )
}