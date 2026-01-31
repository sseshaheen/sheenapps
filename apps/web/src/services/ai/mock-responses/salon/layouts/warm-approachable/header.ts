// Warm Approachable Header Responses
// Friendly, welcoming headers with soft colors and inviting aesthetics

import type { AIComponentResponse } from '../../../types'

const createWarmHeader = (
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
    name: 'Warm Approachable Header',
    html,
    css,
    props,
    responsive: {
      mobile: { css: `/* Mobile styles consolidated into main CSS */` },
      tablet: { css: `/* Tablet styles consolidated into main CSS */` }
    },
    accessibility: {
      ariaLabels: { 'header-nav': 'Main navigation', 'logo': 'Beauty Bliss logo' },
      keyboardNavigation: true,
      screenReaderOptimized: true
    },
    seo: {
      structuredData: { '@type': 'Organization', 'name': 'Beauty Bliss' },
      metaTags: { description: 'Warm and welcoming salon header' }
    },
    performance: {
      lazyLoad: false,
      criticalCSS: '.header-warm { background: #ffffff; }',
      optimizedImages: true
    }
  },
  metadata: {
    model: 'claude-3-sonnet',
    prompt: `Modify warm approachable salon header: ${suggestion}`,
    reasoning,
    confidence: 95,
    processingTime: 1200,
    alternatives: [],
    tags: ['warm', 'approachable', 'friendly', 'welcoming', 'soft-colors']
  },
  feedback: {
    requestFeedback: true,
    improvementSuggestions: ['Consider adding customer reviews', 'Include loyalty program info']
  }
})

export const headerResponses = {
  'make-it-more-professional': createWarmHeader(
    'warm-approachable-header-professional',
    'Make it more professional',
    'Enhanced professionalism while maintaining warmth with refined typography, organized navigation, and trustworthy aesthetics. Added professional credentials without losing the friendly appeal.',
    `
    <header class="header-warm-professional" data-section-type="header">
      <div class="header-container">
        <div class="header-logo">
          <div class="logo-icon">🌸</div>
          <div class="logo-text">
            <span class="logo-name">Beauty Bliss</span>
            <span class="logo-tagline">Your Neighborhood Beauty Haven • Since 2010</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">
            <span class="nav-icon">💆‍♀️</span>
            <span class="nav-text">Our Services</span>
          </a>
          <a href="#team" class="nav-link">
            <span class="nav-icon">👥</span>
            <span class="nav-text">Meet Our Team</span>
          </a>
          <a href="#offers" class="nav-link">
            <span class="nav-icon">🎁</span>
            <span class="nav-text">Special Offers</span>
          </a>
          <a href="#testimonials" class="nav-link">
            <span class="nav-icon">⭐</span>
            <span class="nav-text">Reviews</span>
          </a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          ☰
        </button>

        <div class="header-actions">
          <div class="welcome-message">
            <span class="welcome-text">Welcome! Call us: (555) 234-5678</span>
          </div>
          <button class="btn-book-warm">
            <span class="btn-icon">📅</span>
            <span class="btn-text">Book Your Visit</span>
          </button>
        </div>

        <!-- Mobile Phone Bar -->
        <div class="mobile-phone-bar">
          <span class="mobile-phone-text">📞 Call: (555) 234-5678</span>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">💆‍♀️ Our Services</a>
        <a href="#team" class="mobile-nav-link">👥 Meet Our Team</a>
        <a href="#offers" class="mobile-nav-link">🎁 Special Offers</a>
        <a href="#testimonials" class="mobile-nav-link">⭐ Reviews</a>
      </div>
    </header>
    `,
    `
    .header-warm-professional {
      background: #ffffff;
      border-bottom: 3px solid #ff9999;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 2px 15px rgba(255, 107, 107, 0.1);
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
      filter: hue-rotate(0deg);
    }

    .logo-text {
      display: flex;
      flex-direction: column;
    }

    .logo-name {
      font-size: 1.75rem;
      font-weight: 600;
      color: #333333;
      font-family: 'Quicksand', sans-serif;
      letter-spacing: 0.5px;
    }

    .logo-tagline {
      font-size: 0.75rem;
      color: #666666;
      font-weight: 400;
      margin-top: 2px;
    }

    .header-nav {
      display: flex;
      gap: 2rem;
    }

    .nav-link {
      text-decoration: none;
      color: #555555;
      font-weight: 500;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.25rem;
      border-radius: 2rem;
      transition: all 0.3s ease;
    }

    .nav-link:hover {
      color: #ff6b6b;
      background: #ffe0e0;
      transform: translateY(-1px);
    }

    .nav-icon {
      font-size: 1.125rem;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .welcome-message {
      color: #666666;
      font-weight: 500;
    }

    .btn-book-warm {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: linear-gradient(135deg, #ff6b6b 0%, #ff9999 100%);
      color: #ffffff;
      border: none;
      padding: 1rem 2rem;
      border-radius: 2rem;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
    }

    .btn-book-warm:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4);
      background: linear-gradient(135deg, #ff7d7d 0%, #ffaaaa 100%);
    }

    .btn-icon {
      font-size: 1.125rem;
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay,
    .mobile-phone-bar {
      display: none;
    }

    /* Large Desktop Adjustments */
    @media (max-width: 1400px) {
      .header-container {
        padding: 1.25rem 1.75rem;
      }

      .header-nav {
        gap: 1.75rem;
      }

      .nav-link {
        padding: 0.75rem 1.125rem;
      }

      .welcome-message {
        font-size: 0.875rem;
      }
    }

    /* Medium Desktop - Early Content Optimization */
    @media (max-width: 1200px) {
      .header-container {
        padding: 1rem 1.5rem;
      }

      .header-nav {
        gap: 1.25rem;
      }

      .nav-link {
        font-size: 0.875rem;
        padding: 0.625rem 0.875rem;
      }

      .btn-book-warm {
        padding: 0.875rem 1.25rem;
        font-size: 0.875rem;
      }

      .welcome-message {
        display: none; /* Hide welcome message early to prevent overflow */
      }
    }

    /* Tablet Styles */
    @media (max-width: 1024px) {
      .header-nav {
        gap: 1rem;
      }

      .nav-link {
        padding: 0.625rem 0.75rem;
        font-size: 0.8rem;
      }

      .btn-book-warm {
        padding: 0.75rem 1rem;
        font-size: 0.8rem;
      }
    }

    /* Small Tablet - Progressive Collapse */
    @media (max-width: 900px) {
      .header-nav {
        display: none; /* Hide navigation earlier for complex headers */
      }

      .mobile-menu-toggle {
        display: flex;
        align-items: center;
        background: none;
        border: none;
        color: #ff6b6b;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.5rem;
        z-index: 1001;
        margin-left: auto;
      }

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
        gap: 2rem;
      }

      .mobile-nav-overlay.active {
        display: flex;
      }

      .mobile-nav-link {
        color: #333333;
        text-decoration: none;
        font-size: 1.5rem;
        font-weight: 500;
        letter-spacing: 0.5px;
        padding: 1rem 2rem;
        border: 2px solid transparent;
        border-radius: 2rem;
        transition: all 0.3s ease;
      }

      .mobile-nav-link:hover {
        color: #ff6b6b;
        background: #ffe0e0;
        border-color: #ff9999;
      }

      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #ff6b6b;
        font-size: 2rem;
        cursor: pointer;
        padding: 0.5rem;
      }
    }/* Mobile Styles */
    @media (max-width: 768px) {
      .header-warm-professional {
        padding: 0.75rem 0;
        border-bottom: 2px solid #ff9999;
      }

      .header-container {
        justify-content: space-between;
        flex-wrap: wrap;
      }

      .mobile-menu-toggle {
        display: flex;
        align-items: center;
        background: none;
        border: none;
        color: #ff6b6b;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.5rem;
        z-index: 1001;

        position: static;
        transform: none;
        margin-left: auto;
        margin-right: 0;
      }

      /* Mobile logo - friendly and centered */
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
        letter-spacing: 0.5px;
      }

      .logo-tagline {
        font-size: 0.625rem;
        text-align: center;
      }

      /* Hide desktop elements */
      .header-nav {
        display: none;
      }

      .welcome-message {
        display: none;
      }

      /* Show mobile elements */
      .mobile-phone-bar {
        display: block;
        width: 100%;
        background: #ffe0e0;
        padding: 0.5rem;
        margin-top: 0.75rem;
        border-radius: 0.5rem;
        text-align: center;
        order: 4;
      }

      .mobile-phone-text {
        color: #ff6b6b;
        font-size: 0.75rem;
        font-weight: 500;
      }

      /* Mobile CTA button - full width */
      .btn-book-warm {
        width: 100%;
        max-width: 280px;
        margin: 1rem auto 0;
        order: 3;
        font-size: 0.875rem;
        padding: 0.875rem 1.5rem;
      }

      .btn-text {
        display: inline !important;
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
        gap: 2rem;
      }

      .mobile-nav-overlay.active {
        display: flex;
      }

      .mobile-nav-link {
        color: #333333;
        text-decoration: none;
        font-size: 1.5rem;
        font-weight: 500;
        letter-spacing: 0.5px;
        padding: 1rem 2rem;
        border: 2px solid transparent;
        border-radius: 2rem;
        transition: all 0.3s ease;
      }

      .mobile-nav-link:hover {
        color: #ff6b6b;
        background: #ffe0e0;
        border-color: #ff9999;
      }

      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #ff6b6b;
        font-size: 2rem;
        cursor: pointer;
        padding: 0.5rem;
      }
    }
    `,
    {
      businessName: 'Beauty Bliss',
      tagline: 'Your Neighborhood Beauty Haven • Since 2010',
      logoIcon: '🌸',
      phone: '(555) 234-5678',
      navigation: [
        { label: 'Our Services', url: '#services', icon: '💆‍♀️' },
        { label: 'Meet Our Team', url: '#team', icon: '👥' },
        { label: 'Special Offers', url: '#offers', icon: '🎁' },
        { label: 'Reviews', url: '#testimonials', icon: '⭐' }
      ],
      ctaText: 'Book Your Visit'
    }
  ),

  'add-contact-information': createWarmHeader(
    'warm-approachable-header-contact',
    'Add contact information',
    'Integrated comprehensive contact information with friendly presentation. Added multiple contact methods, hours of operation, and location details with warm, inviting design.',
    `
    <header class="header-warm-contact" data-section-type="header">
      <div class="header-top-bar">
        <div class="contact-strip">
          <div class="contact-item">
            <span class="contact-icon">📍</span>
            <span class="contact-text">123 Maple Street, Hometown</span>
          </div>
          <div class="contact-item">
            <span class="contact-icon">🕐</span>
            <span class="contact-text">Mon-Sat: 9AM-7PM</span>
          </div>
          <div class="contact-item">
            <span class="contact-icon">📧</span>
            <span class="contact-text">hello@beautybliss.com</span>
          </div>
        </div>
      </div>

      <div class="header-container">
        <div class="header-logo">
          <div class="logo-icon">🌸</div>
          <div class="logo-text">
            <span class="logo-name">Beauty Bliss</span>
            <span class="logo-tagline">Where Beauty Meets Happiness</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">Services</a>
          <a href="#team" class="nav-link">Our Team</a>
          <a href="#gallery" class="nav-link">Gallery</a>
          <a href="#contact" class="nav-link">Find Us</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          ☰
        </button>

        <div class="header-contact-actions">
          <div class="quick-contact">
            <div class="phone-line">
              <span class="phone-label">Call Now</span>
              <span class="phone-number">(555) 234-5678</span>
            </div>
          </div>
          <button class="btn-contact-warm">
            <span class="btn-icon">💬</span>
            <span class="btn-text">Chat With Us</span>
          </button>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">Services</a>
        <a href="#team" class="mobile-nav-link">Our Team</a>
        <a href="#gallery" class="mobile-nav-link">Gallery</a>
        <a href="#contact" class="mobile-nav-link">Find Us</a>
      </div>
    </header>
    `,
    `
    .header-warm-contact {
      background: #ffffff;
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    .header-top-bar {
      background: #ffe0e0;
      padding: 0.5rem 0;
    }

    .contact-strip {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 2rem;
    }

    .contact-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #666666;
      font-weight: 500;
      font-size: 0.875rem;
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
      border-bottom: 3px solid #ff9999;
    }

    .header-logo {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .logo-icon {
      font-size: 2.5rem;
    }

    .logo-text {
      display: flex;
      flex-direction: column;
    }

    .logo-name {
      font-size: 1.75rem;
      font-weight: 600;
      color: #333333;
      font-family: 'Quicksand', sans-serif;
    }

    .logo-tagline {
      font-size: 0.75rem;
      color: #ff6b6b;
      font-weight: 500;
    }

    .header-nav {
      display: flex;
      gap: 2rem;
    }

    .nav-link {
      text-decoration: none;
      color: #555555;
      font-weight: 500;
      font-size: 0.875rem;
      padding: 0.75rem 1.25rem;
      border-radius: 2rem;
      transition: all 0.3s ease;
    }

    .nav-link:hover {
      color: #ff6b6b;
      background: #ffe0e0;
    }

    .header-contact-actions {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .quick-contact {
      text-align: right;
    }

    .phone-label {
      display: block;
      font-size: 0.75rem;
      color: #999999;
      font-weight: 500;
    }

    .phone-number {
      display: block;
      font-size: 1.125rem;
      color: #ff6b6b;
      font-weight: 600;
      margin-top: 2px;
    }

    .btn-contact-warm {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: linear-gradient(135deg, #ff6b6b 0%, #ff9999 100%);
      color: #ffffff;
      border: none;
      padding: 1rem 1.5rem;
      border-radius: 2rem;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
    }

    .btn-contact-warm:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4);
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay {
      display: none;
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
        color: #ff6b6b;
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
        background: rgba(255, 255, 255, 0.98);
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
        color: #333333;
        text-decoration: none;
        font-size: 1.5rem;
        font-weight: 500;
        padding: 1rem 2rem;
        border: 2px solid transparent;
        border-radius: 2rem;
        transition: all 0.3s ease;
      }

      .mobile-nav-link:hover {
        color: #ff6b6b;
        background: #ffe0e0;
        border-color: #ff9999;
      }

      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #ff6b6b;
        font-size: 2rem;
        cursor: pointer;
        padding: 0.5rem;
      }

      .btn-contact-warm {
        width: 100%;
        max-width: 280px;
        margin: 1rem auto 0;
        font-size: 0.75rem;
        padding: 0.875rem 1.5rem;
      }
    }
    `,
    {
      businessName: 'Beauty Bliss',
      tagline: 'Where Beauty Meets Happiness',
      logoIcon: '🌸',
      phone: '(555) 234-5678',
      email: 'hello@beautybliss.com',
      address: '123 Maple Street, Hometown',
      hours: 'Mon-Sat: 9AM-7PM',
      navigation: [
        { label: 'Services', url: '#services' },
        { label: 'Our Team', url: '#team' },
        { label: 'Gallery', url: '#gallery' },
        { label: 'Find Us', url: '#contact' }
      ]
    }
  ),

  'include-social-media-links': createWarmHeader(
    'warm-approachable-header-social',
    'Include social media links',
    'Added friendly social media presence with community focus. Featured Instagram gallery, Facebook community, and customer testimonials with warm, engaging social integration.',
    `
    <header class="header-warm-social" data-section-type="header">
      <div class="header-container">
        <div class="header-logo">
          <div class="logo-icon">🌸</div>
          <div class="logo-text">
            <span class="logo-name">Beauty Bliss</span>
            <span class="logo-tagline">Join Our Beauty Community!</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">Services</a>
          <a href="#team" class="nav-link">Team</a>
          <a href="#gallery" class="nav-link">Gallery</a>
          <a href="#reviews" class="nav-link">Reviews</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          ☰
        </button>

        <div class="header-social-section">
          <div class="social-showcase">
            <span class="social-label">Connect With Us</span>
            <div class="social-links">
              <a href="#instagram" class="social-link instagram">
                <span class="social-icon">📷</span>
                <span class="social-text">@beautybliss</span>
                <span class="social-count">5.2K</span>
              </a>
              <a href="#facebook" class="social-link facebook">
                <span class="social-icon">👍</span>
                <span class="social-text">Facebook</span>
                <span class="social-count">3.8K</span>
              </a>
              <a href="#tiktok" class="social-link tiktok">
                <span class="social-icon">🎵</span>
                <span class="social-text">TikTok</span>
                <span class="social-count">2.1K</span>
              </a>
            </div>
          </div>
          <button class="btn-book-social">
            <span class="btn-icon">💕</span>
            <span class="btn-text">Book & Share</span>
          </button>
        </div>

        <!-- Mobile Social Links -->
        <div class="mobile-social-bar">
          <a href="#instagram" class="mobile-social-link">📷</a>
          <a href="#facebook" class="mobile-social-link">👍</a>
          <a href="#tiktok" class="mobile-social-link">🎵</a>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">Services</a>
        <a href="#team" class="mobile-nav-link">Team</a>
        <a href="#gallery" class="mobile-nav-link">Gallery</a>
        <a href="#reviews" class="mobile-nav-link">Reviews</a>
      </div>
    </header>
    `,
    `
    .header-warm-social{
      background:#fff;
      border-bottom:3px solid #ff9999;
      position:sticky;
      top:0;
      z-index:1000;
      box-shadow:0 2px 15px rgba(255,107,107,.1);
    }

    .header-container{
      max-width:1400px;
      margin:0 auto;
      padding:1.25rem 2rem;
      display:flex;
      align-items:center;
      justify-content:space-between;
    }

    .header-logo{display:flex;align-items:center;gap:1rem;}
    .logo-icon{font-size:2.5rem;}
    .logo-text{display:flex;flex-direction:column;}
    .logo-name{
      font-size:1.75rem;font-weight:600;color:#333;
      font-family:'Quicksand',sans-serif;
    }
    .logo-tagline{font-size:.75rem;color:#ff6b6b;font-weight:500;}

    .header-nav{display:flex;gap:2rem;}
    .nav-link{
      text-decoration:none;color:#555;font-weight:500;
      font-size:.875rem;padding:.75rem 1.25rem;border-radius:2rem;
      transition:.3s;
      min-height:44px;min-width:44px;      /* ✅ touch target */
    }
    .nav-link:hover{color:#ff6b6b;background:#ffe0e0;}

    .header-social-section{display:flex;align-items:center;gap:2rem;}

    .social-showcase{display:flex;flex-direction:column;align-items:flex-end;gap:.5rem;}
    .social-label{font-size:.75rem;color:#999;font-weight:500;}

    .social-links{display:flex;gap:1rem;}
    .social-link{
      display:flex;flex-direction:column;align-items:center;gap:.25rem;
      text-decoration:none;color:#666;padding:.5rem;border-radius:1rem;
      transition:.3s;min-width:60px;min-height:44px;  /* ✅ touch target */
    }
    .social-link:hover{background:#ffe0e0;transform:translateY(-2px);}
    .social-icon{font-size:1.25rem;}
    .social-text{font-size:.625rem;font-weight:500;}
    .social-count{font-size:.75rem;font-weight:600;color:#ff6b6b;}
    .instagram:hover{background:#ffe0f0!important;}
    .facebook:hover{background:#e0e7ff!important;}
    .tiktok:hover{background:#ffe0ff!important;}

    .btn-book-social{
      display:flex;align-items:center;gap:.75rem;
      background:linear-gradient(135deg,#ff6b6b 0%,#ff9999 100%);
      color:#fff;border:none;padding:1rem 1.5rem;border-radius:2rem;
      font-weight:600;font-size:.875rem;cursor:pointer;transition:.3s;
      box-shadow:0 4px 15px rgba(255,107,107,.3);
      min-width:44px;min-height:44px;     /* ✅ touch target */
    }
    .btn-book-social:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(255,107,107,.4);}

    /* ───────────────────────────────
      MOBILE-ONLY ELEMENTS – hidden by default
      ───────────────────────────────*/
    .mobile-menu-toggle,
    .mobile-nav-overlay,
    .mobile-social-bar{display:none;}

    /* ───────────────────────────────
      ≤ 1200 px  – condense spacing
      ───────────────────────────────*/
    @media (max-width:1200px){
      .header-container{padding:1rem 1.5rem;}
      .header-nav{gap:1.5rem;}
      .nav-link{padding:.625rem 1rem;}
      .social-links{gap:.75rem;}
      .btn-book-social{padding:.875rem 1.25rem;}
    }

    /* ───────────────────────────────
      ≤ 900 px  – hide nav, show burger
      ───────────────────────────────*/
    @media (max-width:900px){
      /* 1️⃣  Navigation collapses */
      .header-nav{display:none;}

      /* 2️⃣  Hamburger appears (kept in normal flow, no absolute) */
      .mobile-menu-toggle{
        display:flex;align-items:center;
        margin-left:auto;
        background:none;border:none;color:#ff6b6b;
        font-size:1.5rem;cursor:pointer;padding:.5rem;
        z-index:1001;min-width:44px;min-height:44px; /* ✅ touch target */
      }
    }

    /* ───────────────────────────────
      ≤ 768 px  – full mobile layout
      ───────────────────────────────*/
    @media (max-width:768px){
      .header-warm-social{border-bottom:2px solid #ff9999;}

      .header-container{
        padding:.75rem 1rem;
        flex-wrap:wrap;
        justify-content:space-between; /* logo ⬅︎ ➡︎ burger */
      }

      /* — Logo — */
      .header-logo{
        flex:1;justify-content:center;gap:.5rem;
        order:1;
      }
      .logo-icon{font-size:1.75rem;}
      .logo-name{font-size:1.25rem;}
      .logo-tagline{font-size:.625rem;text-align:center;}

      /* — Burger (re-declared to override any earlier absolute) — */
      .mobile-menu-toggle{
        position:static;transform:none;order:2;
      }

      /* — Primary CTA full-width — */
      .btn-book-social{
        width:100%;max-width:280px;margin:1rem auto 0;order:3;
        font-size:.875rem;padding:.875rem 1.5rem;
      }

      /* — Mobile social bar — */
      .header-social-section{display:none;}   /* hide desktop showcase */
      .mobile-social-bar{
        display:flex;width:100%;justify-content:center;gap:1rem;
        margin-top:.75rem;padding:.5rem;background:#ffe0e0;border-radius:2rem;
        order:4;
      }
      .mobile-social-link{
        display:flex;align-items:center;justify-content:center;
        width:44px;height:44px;border-radius:50%;
        background:#fff;text-decoration:none;font-size:1.25rem;
        transition:.3s;box-shadow:0 2px 5px rgba(0,0,0,.1);
      }
      .mobile-social-link:hover{background:#ff6b6b;transform:scale(1.1);}

      /* — Mobile nav overlay — */
      .mobile-nav-overlay{
        position:fixed;inset:0;background:rgba(255,255,255,.98);
        z-index:1000;display:none;
        flex-direction:column;align-items:center;justify-content:center;gap:2rem;
      }
      .mobile-nav-overlay.active{display:flex;}

      .mobile-nav-link{
        color:#333;text-decoration:none;font-size:1.5rem;font-weight:500;
        padding:1rem 2rem;border:2px solid transparent;border-radius:2rem;
        transition:.3s;min-width:44px;min-height:44px;
      }
      .mobile-nav-link:hover{color:#ff6b6b;background:#ffe0e0;border-color:#ff9999;}

      .mobile-nav-close{
        position:absolute;top:1rem;right:1rem;background:none;border:none;
        color:#ff6b6b;font-size:2rem;cursor:pointer;padding:.5rem;
        min-width:44px;min-height:44px;
      }
    }

    `,
    {
      businessName: 'Beauty Bliss',
      tagline: 'Join Our Beauty Community!',
      logoIcon: '🌸',
      socialLinks: [
        { platform: 'instagram', handle: '@beautybliss', followers: '5.2K', icon: '📷' },
        { platform: 'facebook', handle: 'Facebook', followers: '3.8K', icon: '👍' },
        { platform: 'tiktok', handle: 'TikTok', followers: '2.1K', icon: '🎵' }
      ],
      navigation: [
        { label: 'Services', url: '#services' },
        { label: 'Team', url: '#team' },
        { label: 'Gallery', url: '#gallery' },
        { label: 'Reviews', url: '#reviews' }
      ]
    }
  ),

  'change-the-logo-style': createWarmHeader(
    'warm-approachable-header-logo',
    'Change the logo style',
    'Redesigned logo with playful, friendly style combining warm colors and approachable typography. Added welcoming visual elements and refined brand presentation for enhanced friendliness.',
    `
    <header class="header-warm-logo" data-section-type="header">
      <div class="header-container">
        <div class="header-logo-redesigned">
          <div class="logo-badge">
            <div class="badge-circle">
              <span class="badge-letter">B</span>
              <div class="badge-flower">🌺</div>
            </div>
          </div>
          <div class="logo-text-suite">
            <div class="logo-main">
              <span class="logo-beauty">Beauty</span>
              <span class="logo-bliss">Bliss</span>
            </div>
            <span class="logo-subtitle">Feel Beautiful, Be Happy</span>
          </div>
        </div>

        <!-- Desktop Navigation -->
        <nav class="header-nav">
          <a href="#services" class="nav-link">Services</a>
          <a href="#team" class="nav-link">Team</a>
          <a href="#prices" class="nav-link">Prices</a>
          <a href="#book" class="nav-link">Book</a>
        </nav>

        <!-- Mobile Hamburger Menu -->
        <button class="mobile-menu-toggle" aria-label="Open mobile menu">
          ☰
        </button>

        <div class="header-actions">
          <div class="happy-badge">
            <span class="badge-text">5★ Happy Place</span>
            <div class="badge-hearts">💕 💕 💕</div>
          </div>
          <button class="btn-reserve-warm">
            <div class="btn-heart">❤️</div>
            <span class="btn-text">Book Now</span>
          </button>
        </div>

        <!-- Mobile Badge -->
        <div class="mobile-happy-badge">
          <span class="mobile-badge-text">5★ Happy Place</span>
        </div>
      </div>

      <!-- Mobile Navigation Overlay -->
      <div class="mobile-nav-overlay">
        <button class="mobile-nav-close" aria-label="Close mobile menu">×</button>
        <a href="#services" class="mobile-nav-link">Services</a>
        <a href="#team" class="mobile-nav-link">Team</a>
        <a href="#prices" class="mobile-nav-link">Prices</a>
        <a href="#book" class="mobile-nav-link">Book</a>
      </div>
    </header>
    `,
    `
    /* ───────────────────────────────
      GLOBAL / DESKTOP FIRST
      ───────────────────────────────*/
    .header-warm-logo {
      background: #ffffff;
      border-bottom: 3px solid #ff9999;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 2px 15px rgba(255, 107, 107, 0.1);
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.5rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: nowrap;
    }

    .header-logo-redesigned {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .logo-badge {
      position: relative;
    }

    .badge-circle {
      width: 60px;
      height: 60px;
      border: 3px solid #ff9999;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffe0e0;
      position: relative;
      min-width: 44px;
      min-height: 44px;
    }

    .badge-letter {
      font-size: 1.75rem;
      font-weight: 700;
      color: #ff6b6b;
      font-family: 'Quicksand', sans-serif;
    }

    .badge-flower {
      position: absolute;
      top: -8px;
      right: -8px;
      font-size: 1.25rem;
      background: #ffffff;
      border-radius: 50%;
      padding: 2px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    }

    .logo-text-suite {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .logo-main {
      display: flex;
      align-items: baseline;
      gap: 0.25rem;
    }

    .logo-beauty {
      font-size: 1.875rem;
      font-weight: 700;
      color: #ff6b6b;
      font-family: 'Quicksand', sans-serif;
    }

    .logo-bliss {
      font-size: 1.875rem;
      font-weight: 300;
      color: #333333;
      font-family: 'Quicksand', sans-serif;
    }

    .logo-subtitle {
      font-size: 0.75rem;
      color: #666666;
      font-weight: 400;
      font-style: italic;
    }

    .header-nav {
      display: flex;
      gap: 2rem;
    }

    .nav-link {
      text-decoration: none;
      color: #555555;
      font-weight: 500;
      font-size: 0.875rem;
      padding: 0.75rem 1.25rem;
      border-radius: 2rem;
      transition: all 0.3s ease;
      min-width: 44px;
      min-height: 44px;
    }

    .nav-link:hover {
      color: #ff6b6b;
      background: #ffe0e0;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .happy-badge {
      text-align: center;
    }

    .badge-text {
      display: block;
      font-size: 0.75rem;
      color: #ff6b6b;
      font-weight: 600;
    }

    .badge-hearts {
      font-size: 0.875rem;
      margin-top: 2px;
    }

    .btn-reserve-warm {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: linear-gradient(135deg, #ff6b6b 0%, #ff9999 100%);
      color: #ffffff;
      border: none;
      padding: 1rem 2rem;
      border-radius: 2rem;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
      min-width: 44px;
      min-height: 44px;
    }

    .btn-reserve-warm:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4);
    }

    .btn-heart {
      font-size: 1.125rem;
    }

    /* Hide mobile elements by default */
    .mobile-menu-toggle,
    .mobile-nav-overlay,
    .mobile-happy-badge {
      display: none;
    }

    /* ───────────────────────────────
      ≤ 1200px – tighten spacing
      ───────────────────────────────*/
    @media (max-width: 1200px) {
      .header-container {
        padding: 1rem 1.5rem;
      }

      .header-nav {
        gap: 1.5rem;
      }

      .nav-link {
        padding: 0.625rem 1rem;
      }

      .btn-reserve-warm {
        padding: 0.875rem 1.5rem;
      }

      .badge-circle {
        width: 55px;
        height: 55px;
      }
    }

    /* ───────────────────────────────
      ≤ 900px – collapse nav, show burger
      ───────────────────────────────*/
    @media (max-width: 900px) {
      .header-nav {
        display: none;
      }

      .mobile-menu-toggle {
        display: flex;
        align-items: center;
        margin-left: auto;
        background: none;
        border: none;
        color: #ff6b6b;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.5rem;
        z-index: 1001;
        min-width: 44px;
        min-height: 44px;
      }
    }

    /* ───────────────────────────────
      ≤ 768px – mobile layout
      ───────────────────────────────*/
    @media (max-width: 768px) {
      .header-warm-logo {
        border-bottom: 2px solid #ff9999;
      }

      .header-container {
        padding: 0.75rem 1rem;
        flex-wrap: wrap;
        justify-content: space-between;
      }

      /* Center logo on mobile */
      .header-logo-redesigned {
        flex: 1;
        justify-content: center;
        gap: 0.75rem;
        order: 1;
      }

      .badge-circle {
        width: 45px;
        height: 45px;
        border: 2px solid #ff9999;
      }

      .badge-letter {
        font-size: 1.5rem;
      }

      .badge-flower {
        top: -6px;
        right: -6px;
        font-size: 1rem;
      }

      .logo-beauty,
      .logo-bliss {
        font-size: 1.375rem;
      }

      .logo-subtitle {
        font-size: 0.625rem;
        text-align: center;
      }

      /* Hide desktop-only elements */
      .header-nav {
        display: none;
      }

      .happy-badge {
        display: none;
      }

      /* Show mobile menu button properly positioned */
      .mobile-menu-toggle {
        position: static;
        transform: none;
        order: 2;
      }

      /* Mobile: separate row for CTA */
      .header-actions {
        width: 100%;
        justify-content: center;
        margin-top: 0.75rem;
        order: 3;
      }

      .btn-reserve-warm {
        width: 100%;
        max-width: 280px;
        font-size: 0.875rem;
        padding: 0.875rem 1.5rem;
      }

      .mobile-happy-badge {
        display: flex;
        width: 100%;
        justify-content: center;
        margin-top: 0.5rem;
        order: 4;
      }

      .mobile-badge-text {
        color: #ff6b6b;
        font-size: 0.75rem;
        font-weight: 600;
      }

      /* Mobile nav overlay */
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
        gap: 2rem;
      }

      .mobile-nav-overlay.active {
        display: flex;
      }

      .mobile-nav-link {
        color: #333333;
        text-decoration: none;
        font-size: 1.5rem;
        font-weight: 500;
        padding: 1rem 2rem;
        border: 2px solid transparent;
        border-radius: 2rem;
        transition: all 0.3s ease;
        min-width: 44px;
        min-height: 44px;
      }

      .mobile-nav-link:hover {
        color: #ff6b6b;
        background: #ffe0e0;
        border-color: #ff9999;
      }

      .mobile-nav-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #ff6b6b;
        font-size: 2rem;
        cursor: pointer;
        padding: 0.5rem;
        min-width: 44px;
        min-height: 44px;
      }
    }
    `,
    {
      businessName: 'Beauty Bliss',
      subtitle: 'Feel Beautiful, Be Happy',
      logoMonogram: 'B',
      rating: '5★ Happy Place',
      logoIcon: '🌺',
      navigation: [
        { label: 'Services', url: '#services' },
        { label: 'Team', url: '#team' },
        { label: 'Prices', url: '#prices' },
        { label: 'Book', url: '#book' }
      ],
      ctaText: 'Book Now'
    }
  )
}
