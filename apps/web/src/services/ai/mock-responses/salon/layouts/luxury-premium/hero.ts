// Luxury Premium Hero Responses
// Sophisticated, high-end hero sections with premium positioning and elegant design

import type { AIComponentResponse } from '../../../types'

const createLuxuryHero = (
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
    type: 'hero',
    name: 'Luxury Premium Hero',
    html,
    css,
    props,
    responsive: {
      mobile: { css: `/* Mobile luxury hero optimizations */` },
      tablet: { css: `/* Tablet luxury hero optimizations */` }
    },
    accessibility: {
      ariaLabels: { 'hero-title': 'Main luxury salon heading', 'hero-cta': 'Book luxury experience' },
      keyboardNavigation: true,
      screenReaderOptimized: true
    },
    seo: {
      structuredData: { '@type': 'LocalBusiness', 'name': 'ÉLITE SALON', 'description': 'Luxury salon experience' },
      metaTags: { description: 'Luxury premium salon hero section' }
    },
    performance: {
      lazyLoad: true,
      criticalCSS: '.hero-luxury { min-height: 90vh; background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%); }',
      optimizedImages: true
    }
  },
  metadata: {
    model: 'claude-3-sonnet',
    prompt: `Modify luxury premium salon hero: ${suggestion}`,
    reasoning,
    confidence: 95,
    processingTime: 1800,
    alternatives: [],
    tags: ['luxury', 'premium', 'elegant', 'sophisticated', 'gold-accents']
  },
  feedback: {
    requestFeedback: true,
    improvementSuggestions: ['Consider adding video background', 'Include VIP membership tiers']
  }
})

export const heroResponses = {
  'make-it-more-modern': createLuxuryHero(
    'luxury-premium-hero-modern',
    'Make it more modern',
    'Modernized luxury with clean geometric layouts, contemporary typography mixing serif and sans-serif, subtle micro-animations, and minimalist gold accents. Maintained sophistication while embracing current design trends.',
    `
    <section class="hero-luxury-modern" data-section-type="hero">
      <div class="hero-container">
        <div class="hero-content">
          <div class="hero-badge-modern">
            <div class="badge-geometric">
              <span class="badge-icon">◆</span>
              <span class="badge-text">CONTEMPORARY LUXURY</span>
            </div>
          </div>

          <h1 class="hero-title-modern">
            <span class="title-line-1">REDEFINING</span>
            <span class="title-line-2">ELEGANCE</span>
            <span class="title-accent">IN THE MODERN AGE</span>
          </h1>

          <p class="hero-subtitle-modern">
            Where timeless sophistication meets contemporary innovation.
            Experience the future of luxury beauty in our architecturally stunning sanctuary.
          </p>

          <div class="hero-actions-modern">
            <button class="btn-primary-modern">
              <span class="btn-text">EXPERIENCE INNOVATION</span>
              <div class="btn-arrow">→</div>
            </button>
            <button class="btn-secondary-modern">
              <span class="btn-text">VIRTUAL TOUR</span>
              <div class="btn-icon">○</div>
            </button>
          </div>

          <div class="hero-metrics-modern">
            <div class="metric-item">
              <span class="metric-number">2024</span>
              <span class="metric-label">Innovation Award</span>
            </div>
            <div class="metric-divider"></div>
            <div class="metric-item">
              <span class="metric-number">98%</span>
              <span class="metric-label">Client Satisfaction</span>
            </div>
            <div class="metric-divider"></div>
            <div class="metric-item">
              <span class="metric-number">5★</span>
              <span class="metric-label">Elite Rating</span>
            </div>
          </div>
        </div>

        <div class="hero-visual-modern">
          <div class="visual-container">
            <div class="geometric-frame">
              <img src="/api/placeholder/600/700" alt="Modern luxury salon" class="hero-image-modern"/>
            </div>
            <div class="floating-elements">
              <div class="floating-card modern-service">
                <div class="service-geometric">◇</div>
                <span class="service-title">AI-POWERED STYLING</span>
                <span class="service-subtitle">Personalized Beauty Tech</span>
              </div>
              <div class="floating-card modern-award">
                <div class="award-year">2024</div>
                <span class="award-title">DESIGN EXCELLENCE</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .hero-luxury-modern {
      min-height: 95vh;
      background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
      display: flex;
      align-items: center;
      position: relative;
      overflow: hidden;
    }

    .hero-luxury-modern::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 40%;
      height: 100%;
      background: linear-gradient(135deg, rgba(212, 175, 55, 0.05) 0%, rgba(212, 175, 55, 0.02) 100%);
      clip-path: polygon(20% 0%, 100% 0%, 100% 100%, 0% 100%);
    }

    .hero-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6rem;
      align-items: center;
      position: relative;
      z-index: 2;
    }

    .hero-badge-modern {
      margin-bottom: 2rem;
    }

    .badge-geometric {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(212, 175, 55, 0.1);
      border: 1px solid rgba(212, 175, 55, 0.2);
      color: #8B4513;
      padding: 0.75rem 1.5rem;
      border-radius: 0;
      font-size: 0.875rem;
      font-weight: 600;
      letter-spacing: 1px;
    }

    .badge-icon {
      font-size: 0.875rem;
      color: #d4af37;
    }

    .hero-title-modern {
      font-family: 'Inter', sans-serif;
      margin-bottom: 2rem;
      line-height: 1;
    }

    .title-line-1 {
      display: block;
      font-size: 4rem;
      font-weight: 300;
      color: #1a1a1a;
      letter-spacing: -2px;
      margin-bottom: 0.5rem;
    }

    .title-line-2 {
      display: block;
      font-size: 4rem;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: -2px;
      margin-bottom: 1rem;
    }

    .title-accent {
      display: block;
      font-size: 1.25rem;
      font-weight: 400;
      color: #d4af37;
      letter-spacing: 2px;
      font-family: 'Playfair Display', serif;
      font-style: italic;
    }

    .hero-subtitle-modern {
      font-size: 1.125rem;
      color: #4a4a4a;
      line-height: 1.7;
      margin-bottom: 3rem;
      max-width: 480px;
      font-weight: 400;
    }

    .hero-actions-modern {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 4rem;
    }

    .btn-primary-modern {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: #1a1a1a;
      color: #ffffff;
      border: none;
      padding: 1.25rem 2.5rem;
      border-radius: 0;
      font-weight: 500;
      font-size: 0.875rem;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.4s ease;
      position: relative;
      overflow: hidden;
    }

    .btn-primary-modern::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.2), transparent);
      transition: left 0.8s ease;
    }

    .btn-primary-modern:hover::before {
      left: 100%;
    }

    .btn-primary-modern:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 25px rgba(26, 26, 26, 0.2);
    }

    .btn-arrow {
      font-size: 1rem;
      transition: transform 0.3s ease;
    }

    .btn-primary-modern:hover .btn-arrow {
      transform: translateX(4px);
    }

    .btn-secondary-modern {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: transparent;
      color: #1a1a1a;
      border: 1px solid #d4af37;
      padding: 1.25rem 2.5rem;
      border-radius: 0;
      font-weight: 500;
      font-size: 0.875rem;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-secondary-modern:hover {
      background: #d4af37;
      color: #ffffff;
    }

    .btn-icon {
      width: 16px;
      height: 16px;
      border: 1px solid currentColor;
      border-radius: 50%;
    }

    .hero-metrics-modern {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .metric-item {
      text-align: left;
    }

    .metric-number {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Inter', sans-serif;
    }

    .metric-label {
      font-size: 0.75rem;
      color: #6a6a6a;
      font-weight: 500;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .metric-divider {
      width: 1px;
      height: 40px;
      background: rgba(212, 175, 55, 0.3);
    }

    .hero-visual-modern {
      position: relative;
    }

    .visual-container {
      position: relative;
    }

    .geometric-frame {
      position: relative;
      background: #ffffff;
      padding: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.1);
    }

    .hero-image-modern {
      width: 100%;
      height: auto;
      display: block;
    }

    .floating-elements {
      position: absolute;
      inset: 0;
    }

    .floating-card {
      position: absolute;
      background: #ffffff;
      padding: 1.5rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      border-left: 3px solid #d4af37;
    }

    .modern-service {
      top: 15%;
      right: -40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      min-width: 160px;
    }

    .service-geometric {
      font-size: 1.5rem;
      color: #d4af37;
      margin-bottom: 0.5rem;
    }

    .service-title {
      font-size: 0.75rem;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: 1px;
      text-align: center;
    }

    .service-subtitle {
      font-size: 0.625rem;
      color: #6a6a6a;
      text-align: center;
    }

    .modern-award {
      bottom: 20%;
      left: -30px;
      text-align: center;
      min-width: 120px;
    }

    .award-year {
      font-size: 2rem;
      font-weight: 700;
      color: #d4af37;
      margin-bottom: 0.25rem;
    }

    .award-title {
      font-size: 0.625rem;
      font-weight: 600;
      color: #1a1a1a;
      letter-spacing: 1px;
    }

    @media (max-width: 768px) {
      .hero-container {
        grid-template-columns: 1fr;
        gap: 3rem;
        text-align: center;
      }

      .title-line-1, .title-line-2 {
        font-size: 2.5rem;
      }

      .hero-actions-modern {
        flex-direction: column;
        align-items: center;
      }

      .floating-card {
        display: none;
      }
    }
    `,
    {
      badge: 'CONTEMPORARY LUXURY',
      title: 'REDEFINING ELEGANCE IN THE MODERN AGE',
      subtitle: 'Where timeless sophistication meets contemporary innovation. Experience the future of luxury beauty in our architecturally stunning sanctuary.',
      primaryCTA: 'EXPERIENCE INNOVATION',
      secondaryCTA: 'VIRTUAL TOUR',
      metrics: [
        { number: '2024', label: 'Innovation Award' },
        { number: '98%', label: 'Client Satisfaction' },
        { number: '5★', label: 'Elite Rating' }
      ]
    }
  ),

  'add-a-booking-button': createLuxuryHero(
    'luxury-premium-hero-booking',
    'Add a booking button',
    'Enhanced booking experience with prominent VIP reservation system, multiple booking tiers, and exclusive appointment scheduling. Added urgency elements and personalized booking flow for luxury clientele.',
    `
    <section class="hero-luxury-booking" data-section-type="hero">
      <div class="hero-container">
        <div class="hero-content">
          <div class="hero-badge">
            <span class="badge-icon">♛</span>
            <span class="badge-text">EXCLUSIVE RESERVATIONS</span>
          </div>

          <h1 class="hero-title">
            YOUR <span class="highlight">LUXURY</span><br/>
            EXPERIENCE <span class="highlight">AWAITS</span>
          </h1>

          <p class="hero-subtitle">
            Reserve your private sanctuary where master artisans craft personalized beauty experiences.
            Limited appointments available for our most discerning clients.
          </p>

          <div class="booking-section">
            <div class="booking-priority">
              <h3 class="booking-title">IMMEDIATE AVAILABILITY</h3>
              <div class="booking-buttons">
                <button class="btn-vip-booking">
                  <div class="btn-content">
                    <span class="btn-label">VIP PRIORITY</span>
                    <span class="btn-text">BOOK PRIVATE SUITE</span>
                    <span class="btn-time">Next Available: Today 3PM</span>
                  </div>
                  <div class="btn-icon">◆</div>
                </button>

                <button class="btn-premium-booking">
                  <div class="btn-content">
                    <span class="btn-label">PREMIUM</span>
                    <span class="btn-text">RESERVE MASTER STYLIST</span>
                    <span class="btn-time">Next Available: Tomorrow 11AM</span>
                  </div>
                  <div class="btn-icon">✦</div>
                </button>

                <button class="btn-consultation">
                  <span class="btn-text">FREE LUXURY CONSULTATION</span>
                  <span class="btn-subtitle">15-minute personal assessment</span>
                </button>
              </div>
            </div>

            <div class="booking-urgency">
              <div class="urgency-indicator">
                <span class="urgency-dot"></span>
                <span class="urgency-text">3 VIP appointments remaining today</span>
              </div>
              <div class="booking-guarantee">
                <span class="guarantee-icon">🛡️</span>
                <span class="guarantee-text">100% Satisfaction Guaranteed or Full Refund</span>
              </div>
            </div>
          </div>

          <div class="hero-social-proof">
            <div class="proof-item">
              <span class="proof-number">500+</span>
              <span class="proof-label">VIP Members</span>
            </div>
            <div class="proof-item">
              <span class="proof-number">4.9/5</span>
              <span class="proof-label">Exclusive Rating</span>
            </div>
            <div class="proof-item">
              <span class="proof-number">24/7</span>
              <span class="proof-label">Concierge Service</span>
            </div>
          </div>
        </div>

        <div class="hero-visual">
          <div class="booking-preview">
            <div class="calendar-widget">
              <div class="calendar-header">
                <span class="calendar-title">DECEMBER 2024</span>
              </div>
              <div class="calendar-highlight">
                <span class="available-slot">TODAY</span>
                <span class="slot-time">3:00 PM</span>
                <span class="slot-service">VIP SUITE AVAILABLE</span>
              </div>
            </div>
            <img src="/api/placeholder/600/700" alt="Luxury booking experience" class="hero-image"/>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .hero-luxury-booking {
      min-height: 95vh;
      background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%);
      display: flex;
      align-items: center;
      position: relative;
    }

    .hero-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      display: grid;
      grid-template-columns: 1.2fr 1fr;
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
      font-size: 1.125rem;
      color: #6b5b4f;
      line-height: 1.6;
      margin-bottom: 2.5rem;
      max-width: 520px;
    }

    .booking-section {
      margin-bottom: 3rem;
    }

    .booking-title {
      font-size: 1rem;
      font-weight: 700;
      color: #d4af37;
      margin-bottom: 1.5rem;
      letter-spacing: 1px;
    }

    .booking-buttons {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .btn-vip-booking {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border: none;
      padding: 1.5rem 2rem;
      border-radius: 0.75rem;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 6px 20px rgba(212, 175, 55, 0.3);
      text-align: left;
    }

    .btn-vip-booking:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(212, 175, 55, 0.4);
    }

    .btn-premium-booking {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #2c1810;
      color: #d4af37;
      border: 2px solid #d4af37;
      padding: 1.25rem 2rem;
      border-radius: 0.75rem;
      cursor: pointer;
      transition: all 0.3s ease;
      text-align: left;
    }

    .btn-premium-booking:hover {
      background: rgba(212, 175, 55, 0.1);
      transform: translateY(-1px);
    }

    .btn-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .btn-label {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 1px;
      opacity: 0.8;
    }

    .btn-text {
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .btn-time {
      font-size: 0.875rem;
      font-weight: 400;
      opacity: 0.9;
    }

    .btn-icon {
      font-size: 1.5rem;
    }

    .btn-consultation {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: transparent;
      color: #8B4513;
      border: 2px dashed #d4af37;
      padding: 1rem 2rem;
      border-radius: 0.75rem;
      cursor: pointer;
      transition: all 0.3s ease;
      gap: 0.25rem;
    }

    .btn-consultation:hover {
      background: rgba(212, 175, 55, 0.05);
      border-style: solid;
    }

    .btn-subtitle {
      font-size: 0.75rem;
      opacity: 0.8;
    }

    .booking-urgency {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.25rem;
      background: rgba(212, 175, 55, 0.05);
      border-radius: 0.75rem;
      border-left: 4px solid #d4af37;
    }

    .urgency-indicator {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .urgency-dot {
      width: 8px;
      height: 8px;
      background: #ff4757;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .urgency-text {
      font-size: 0.875rem;
      font-weight: 600;
      color: #8B4513;
    }

    .booking-guarantee {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .guarantee-text {
      font-size: 0.75rem;
      color: #6b5b4f;
      font-weight: 500;
    }

    .hero-social-proof {
      display: flex;
      gap: 2rem;
    }

    .proof-item {
      text-align: center;
    }

    .proof-number {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      color: #d4af37;
    }

    .proof-label {
      font-size: 0.75rem;
      color: #6b5b4f;
      font-weight: 500;
    }

    .hero-visual {
      position: relative;
    }

    .booking-preview {
      position: relative;
    }

    .calendar-widget {
      position: absolute;
      top: 20px;
      right: 20px;
      background: #ffffff;
      padding: 1.5rem;
      border-radius: 0.75rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.15);
      min-width: 200px;
      z-index: 10;
    }

    .calendar-header {
      margin-bottom: 1rem;
      text-align: center;
    }

    .calendar-title {
      font-size: 0.875rem;
      font-weight: 700;
      color: #2c1810;
      letter-spacing: 1px;
    }

    .calendar-highlight {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      padding: 1rem;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      border-radius: 0.5rem;
      color: #000000;
    }

    .available-slot {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 1px;
    }

    .slot-time {
      font-size: 1.25rem;
      font-weight: 700;
    }

    .slot-service {
      font-size: 0.625rem;
      font-weight: 600;
      opacity: 0.9;
    }

    .hero-image {
      width: 100%;
      height: auto;
      border-radius: 1rem;
    }

    @media (max-width: 768px) {
      .hero-container {
        grid-template-columns: 1fr;
        gap: 2rem;
      }

      .hero-title {
        font-size: 2.5rem;
      }

      .booking-buttons {
        gap: 0.75rem;
      }

      .hero-social-proof {
        justify-content: center;
      }

      .calendar-widget {
        position: relative;
        top: 0;
        right: 0;
        margin-bottom: 1rem;
      }
    }
    `,
    {
      badge: 'EXCLUSIVE RESERVATIONS',
      title: 'YOUR LUXURY EXPERIENCE AWAITS',
      subtitle: 'Reserve your private sanctuary where master artisans craft personalized beauty experiences. Limited appointments available for our most discerning clients.',
      bookingTiers: [
        {
          type: 'VIP PRIORITY',
          service: 'BOOK PRIVATE SUITE',
          availability: 'Today 3PM',
          priority: 'highest'
        },
        {
          type: 'PREMIUM',
          service: 'RESERVE MASTER STYLIST',
          availability: 'Tomorrow 11AM',
          priority: 'high'
        }
      ],
      consultation: 'FREE LUXURY CONSULTATION',
      urgency: '3 VIP appointments remaining today',
      guarantee: '100% Satisfaction Guaranteed or Full Refund'
    }
  ),

  'include-customer-testimonials': createLuxuryHero(
    'luxury-premium-hero-testimonials',
    'Include customer testimonials',
    'Integrated prestigious client testimonials with sophisticated presentation, focusing on luxury clientele experiences, VIP service testimonials, and exclusive member feedback with elegant typography and refined layouts.',
    `
    <section class="hero-luxury-testimonials" data-section-type="hero">
      <div class="hero-container">
        <div class="hero-content">
          <div class="hero-badge">
            <span class="badge-icon">⭐</span>
            <span class="badge-text">CLIENT EXCELLENCE STORIES</span>
          </div>

          <h1 class="hero-title">
            WHERE <span class="highlight">DISTINGUISHED</span><br/>
            CLIENTS <span class="highlight">DISCOVER LUXURY</span>
          </h1>

          <p class="hero-subtitle">
            Join an exclusive community of discerning individuals who have discovered
            the pinnacle of beauty excellence in our luxury sanctuary.
          </p>

          <div class="testimonials-showcase">
            <div class="featured-testimonial">
              <div class="testimonial-content">
                <div class="quote-mark">"</div>
                <p class="testimonial-text">
                  "The most exceptional salon experience I've ever had. The private VIP suite,
                  champagne service, and master stylist attention to detail exceeded every expectation.
                  This is luxury redefined."
                </p>
                <div class="testimonial-author">
                  <div class="author-info">
                    <span class="author-name">ALEXANDRA PEMBERTON</span>
                    <span class="author-title">FASHION EXECUTIVE</span>
                    <span class="author-location">BEVERLY HILLS</span>
                  </div>
                  <div class="author-rating">
                    <div class="stars">★★★★★</div>
                    <span class="rating-text">EXCEPTIONAL</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="testimonials-grid">
              <div class="testimonial-card">
                <div class="card-quote">"Absolutely transformative. The attention to detail is unmatched."</div>
                <div class="card-author">
                  <span class="card-name">VICTORIA STERLING</span>
                  <span class="card-role">CEO</span>
                </div>
                <div class="card-rating">★★★★★</div>
              </div>

              <div class="testimonial-card">
                <div class="card-quote">"My personal sanctuary for beauty and wellness. Pure excellence."</div>
                <div class="card-author">
                  <span class="card-name">CAROLINE BLACKWELL</span>
                  <span class="card-role">ENTREPRENEUR</span>
                </div>
                <div class="card-rating">★★★★★</div>
              </div>

              <div class="testimonial-card highlighted">
                <div class="card-quote">"VIP treatment beyond imagination. Worth every moment."</div>
                <div class="card-author">
                  <span class="card-name">ISABELLA ROTHSCHILD</span>
                  <span class="card-role">PHILANTHROPIST</span>
                </div>
                <div class="card-rating">★★★★★</div>
              </div>
            </div>
          </div>

          <div class="hero-actions">
            <button class="btn-primary">
              <span class="btn-text">JOIN OUR VIP CLIENTELE</span>
            </button>
            <button class="btn-secondary">
              <span class="btn-text">READ ALL TESTIMONIALS</span>
            </button>
          </div>

          <div class="client-metrics">
            <div class="metric-item">
              <span class="metric-number">4.9/5</span>
              <span class="metric-label">Client Satisfaction</span>
            </div>
            <div class="metric-item">
              <span class="metric-number">500+</span>
              <span class="metric-label">VIP Members</span>
            </div>
            <div class="metric-item">
              <span class="metric-number">15+</span>
              <span class="metric-label">Industry Awards</span>
            </div>
          </div>
        </div>

        <div class="hero-visual">
          <div class="testimonial-showcase-visual">
            <img src="/api/placeholder/600/700" alt="Luxury client experience" class="hero-image"/>
            <div class="floating-testimonial">
              <div class="testimonial-bubble">
                <div class="bubble-stars">★★★★★</div>
                <p class="bubble-text">"The most luxurious salon experience in the city!"</p>
                <span class="bubble-author">- Margaret H.</span>
              </div>
            </div>
            <div class="trust-indicators">
              <div class="trust-badge">
                <span class="trust-icon">🏆</span>
                <span class="trust-text">LUXURY SALON OF THE YEAR</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .hero-luxury-testimonials {
      min-height: 100vh;
      background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%);
      display: flex;
      align-items: center;
      position: relative;
      padding: 4rem 0;
    }

    .hero-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 5rem;
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
      font-size: 3.2rem;
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
      font-size: 1.125rem;
      color: #6b5b4f;
      line-height: 1.6;
      margin-bottom: 2.5rem;
      max-width: 500px;
    }

    .testimonials-showcase {
      margin-bottom: 3rem;
    }

    .featured-testimonial {
      background: #ffffff;
      padding: 2.5rem;
      border-radius: 1rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      margin-bottom: 2rem;
      border-left: 4px solid #d4af37;
    }

    .quote-mark {
      font-size: 4rem;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      line-height: 1;
      margin-bottom: 1rem;
      opacity: 0.7;
    }

    .testimonial-text {
      font-size: 1.125rem;
      color: #2c1810;
      line-height: 1.6;
      margin-bottom: 2rem;
      font-style: italic;
    }

    .testimonial-author {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .author-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .author-name {
      font-size: 0.875rem;
      font-weight: 700;
      color: #2c1810;
      letter-spacing: 1px;
    }

    .author-title {
      font-size: 0.75rem;
      color: #d4af37;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .author-location {
      font-size: 0.75rem;
      color: #6b5b4f;
      font-weight: 500;
    }

    .author-rating {
      text-align: right;
    }

    .stars {
      color: #d4af37;
      font-size: 1rem;
      margin-bottom: 0.25rem;
    }

    .rating-text {
      font-size: 0.75rem;
      color: #d4af37;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .testimonials-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .testimonial-card {
      background: #ffffff;
      padding: 1.5rem;
      border-radius: 0.75rem;
      box-shadow: 0 4px 15px rgba(0,0,0,0.08);
      transition: transform 0.3s ease;
    }

    .testimonial-card:hover {
      transform: translateY(-2px);
    }

    .testimonial-card.highlighted {
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
    }

    .card-quote {
      font-size: 0.875rem;
      line-height: 1.5;
      margin-bottom: 1rem;
      font-style: italic;
    }

    .card-author {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-bottom: 0.75rem;
    }

    .card-name {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .card-role {
      font-size: 0.625rem;
      opacity: 0.8;
      font-weight: 500;
    }

    .card-rating {
      color: #d4af37;
      font-size: 0.875rem;
    }

    .testimonial-card.highlighted .card-rating {
      color: #000000;
    }

    .hero-actions {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .btn-primary {
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border: none;
      padding: 1rem 2rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
      letter-spacing: 0.5px;
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
      font-size: 0.875rem;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-secondary:hover {
      background: #d4af37;
      color: #000000;
    }

    .client-metrics {
      display: flex;
      gap: 2rem;
    }

    .metric-item {
      text-align: center;
    }

    .metric-number {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      color: #d4af37;
    }

    .metric-label {
      font-size: 0.75rem;
      color: #6b5b4f;
      font-weight: 500;
    }

    .hero-visual {
      position: relative;
    }

    .testimonial-showcase-visual {
      position: relative;
    }

    .hero-image {
      width: 100%;
      height: auto;
      border-radius: 1rem;
    }

    .floating-testimonial {
      position: absolute;
      bottom: 20px;
      left: 20px;
    }

    .testimonial-bubble {
      background: #ffffff;
      padding: 1.25rem;
      border-radius: 1rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.15);
      max-width: 220px;
    }

    .bubble-stars {
      color: #d4af37;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .bubble-text {
      font-size: 0.875rem;
      color: #2c1810;
      line-height: 1.4;
      margin-bottom: 0.75rem;
      font-style: italic;
    }

    .bubble-author {
      font-size: 0.75rem;
      color: #6b5b4f;
      font-weight: 600;
    }

    .trust-indicators {
      position: absolute;
      top: 20px;
      right: 20px;
    }

    .trust-badge {
      background: #d4af37;
      color: #000000;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);
    }

    @media (max-width: 768px) {
      .hero-container {
        grid-template-columns: 1fr;
        gap: 3rem;
      }

      .hero-title {
        font-size: 2.5rem;
      }

      .featured-testimonial {
        padding: 1.5rem;
      }

      .testimonials-grid {
        grid-template-columns: 1fr;
      }

      .hero-actions {
        flex-direction: column;
        align-items: center;
      }

      .client-metrics {
        justify-content: center;
      }
    }
    `,
    {
      badge: 'CLIENT EXCELLENCE STORIES',
      title: 'WHERE DISTINGUISHED CLIENTS DISCOVER LUXURY',
      subtitle: 'Join an exclusive community of discerning individuals who have discovered the pinnacle of beauty excellence in our luxury sanctuary.',
      featuredTestimonial: {
        text: 'The most exceptional salon experience I\'ve ever had. The private VIP suite, champagne service, and master stylist attention to detail exceeded every expectation. This is luxury redefined.',
        author: 'ALEXANDRA PEMBERTON',
        title: 'FASHION EXECUTIVE',
        location: 'BEVERLY HILLS',
        rating: 5
      },
      testimonials: [
        {
          text: 'Absolutely transformative. The attention to detail is unmatched.',
          author: 'VICTORIA STERLING',
          role: 'CEO',
          rating: 5
        },
        {
          text: 'My personal sanctuary for beauty and wellness. Pure excellence.',
          author: 'CAROLINE BLACKWELL',
          role: 'ENTREPRENEUR',
          rating: 5
        },
        {
          text: 'VIP treatment beyond imagination. Worth every moment.',
          author: 'ISABELLA ROTHSCHILD',
          role: 'PHILANTHROPIST',
          rating: 5
        }
      ]
    }
  ),

  'change-the-color-scheme': createLuxuryHero(
    'luxury-premium-hero-color-scheme',
    'Change the color scheme',
    'Enhanced color palette with deeper luxury tones, incorporating midnight blacks, platinum silvers, and rich burgundy accents. Maintained gold highlights while adding sophisticated depth and premium color psychology.',
    `
    <section class="hero-luxury-color-scheme" data-section-type="hero">
      <div class="hero-container">
        <div class="hero-content">
          <div class="hero-badge">
            <span class="badge-icon">◈</span>
            <span class="badge-text">PLATINUM EXCELLENCE</span>
          </div>

          <h1 class="hero-title">
            WHERE <span class="highlight">MIDNIGHT</span><br/>
            MEETS <span class="highlight">PLATINUM</span>
          </h1>

          <p class="hero-subtitle">
            Experience the depths of luxury in our redesigned sanctuary, where sophisticated
            midnight tones embrace platinum elegance and burgundy warmth creates an atmosphere
            of unparalleled exclusivity.
          </p>

          <div class="hero-actions">
            <button class="btn-primary">
              <span class="btn-text">DISCOVER PLATINUM EXPERIENCE</span>
              <div class="btn-accent"></div>
            </button>
            <button class="btn-secondary">
              <span class="btn-text">EXPLORE NEW AMBIANCE</span>
            </button>
          </div>

          <div class="color-showcase">
            <div class="color-palette">
              <div class="palette-item midnight">
                <span class="palette-label">MIDNIGHT</span>
              </div>
              <div class="palette-item platinum">
                <span class="palette-label">PLATINUM</span>
              </div>
              <div class="palette-item burgundy">
                <span class="palette-label">BURGUNDY</span>
              </div>
              <div class="palette-item gold">
                <span class="palette-label">GOLD</span>
              </div>
            </div>
            <span class="palette-description">Our signature luxury color story</span>
          </div>

          <div class="hero-trust-indicators">
            <div class="trust-item">
              <span class="trust-number">500+</span>
              <span class="trust-label">Platinum Members</span>
            </div>
            <div class="trust-item">
              <span class="trust-number">15+</span>
              <span class="trust-label">Design Awards</span>
            </div>
            <div class="trust-item">
              <span class="trust-number">5★</span>
              <span class="trust-label">Elite Rating</span>
            </div>
          </div>
        </div>

        <div class="hero-visual">
          <div class="visual-frame">
            <img src="/api/placeholder/600/700" alt="Luxury color scheme" class="hero-image"/>
            <div class="color-overlay">
              <div class="overlay-gradient"></div>
            </div>
            <div class="floating-elements">
              <div class="floating-card platinum-service">
                <div class="service-icon">◆</div>
                <span class="service-name">PLATINUM STYLING</span>
                <span class="service-price">FROM $250</span>
              </div>
              <div class="floating-card midnight-lounge">
                <div class="lounge-icon">◈</div>
                <span class="lounge-text">MIDNIGHT LOUNGE</span>
                <span class="lounge-subtitle">PRIVATE SANCTUARY</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .hero-luxury-color-scheme {
      min-height: 90vh;
      background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #2d1810 100%);
      display: flex;
      align-items: center;
      position: relative;
      overflow: hidden;
    }

    .hero-luxury-color-scheme::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 50%;
      height: 100%;
      background: linear-gradient(135deg, rgba(139, 69, 19, 0.1) 0%, rgba(212, 175, 55, 0.05) 100%);
      opacity: 0.7;
    }

    .hero-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4rem;
      align-items: center;
      position: relative;
      z-index: 2;
    }

    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, #c9c9c9 0%, #a8a8a8 100%);
      color: #000000;
      padding: 0.5rem 1rem;
      border-radius: 2rem;
      font-size: 0.875rem;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 1.5rem;
      box-shadow: 0 4px 15px rgba(201, 201, 201, 0.3);
    }

    .badge-icon {
      color: #000000;
    }

    .hero-title {
      font-size: 3.5rem;
      font-weight: 700;
      line-height: 1.1;
      color: #ffffff;
      margin-bottom: 1.5rem;
      font-family: 'Playfair Display', serif;
    }

    .highlight {
      background: linear-gradient(120deg, #c9c9c9 0%, #ffffff 50%, #d4af37 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero-subtitle {
      font-size: 1.125rem;
      color: #c9c9c9;
      line-height: 1.6;
      margin-bottom: 2.5rem;
      max-width: 500px;
    }

    .hero-actions {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: linear-gradient(135deg, #8B1538 0%, #5C0F24 100%);
      color: #ffffff;
      border: none;
      padding: 1.25rem 2rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(139, 21, 56, 0.4);
      position: relative;
      overflow: hidden;
    }

    .btn-primary::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(201, 201, 201, 0.2), transparent);
      transition: left 0.6s ease;
    }

    .btn-primary:hover::before {
      left: 100%;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(139, 21, 56, 0.5);
    }

    .btn-accent {
      width: 8px;
      height: 8px;
      background: #d4af37;
      border-radius: 50%;
    }

    .btn-secondary {
      background: transparent;
      color: #c9c9c9;
      border: 2px solid #c9c9c9;
      padding: 1.25rem 2rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-secondary:hover {
      background: #c9c9c9;
      color: #000000;
      border-color: #c9c9c9;
    }

    .color-showcase {
      margin-bottom: 3rem;
    }

    .color-palette {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .palette-item {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding-bottom: 0.5rem;
      position: relative;
      cursor: pointer;
      transition: transform 0.3s ease;
    }

    .palette-item:hover {
      transform: scale(1.1);
    }

    .palette-item.midnight {
      background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%);
      border: 2px solid #333333;
    }

    .palette-item.platinum {
      background: linear-gradient(135deg, #c9c9c9 0%, #ffffff 100%);
      border: 2px solid #a8a8a8;
    }

    .palette-item.burgundy {
      background: linear-gradient(135deg, #8B1538 0%, #5C0F24 100%);
      border: 2px solid #6b1129;
    }

    .palette-item.gold {
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      border: 2px solid #9d7e1a;
    }

    .palette-label {
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #ffffff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }

    .palette-item.platinum .palette-label {
      color: #000000;
      text-shadow: 0 1px 2px rgba(255,255,255,0.8);
    }

    .palette-description {
      font-size: 0.875rem;
      color: #a8a8a8;
      font-style: italic;
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
      color: #c9c9c9;
    }

    .trust-label {
      font-size: 0.75rem;
      color: #a8a8a8;
      font-weight: 500;
    }

    .hero-visual {
      position: relative;
    }

    .visual-frame {
      position: relative;
      border-radius: 1rem;
      overflow: hidden;
    }

    .hero-image {
      width: 100%;
      height: auto;
      display: block;
    }

    .color-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .overlay-gradient {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg,
        rgba(0,0,0,0.3) 0%,
        rgba(139,21,56,0.2) 30%,
        rgba(201,201,201,0.1) 60%,
        rgba(212,175,55,0.2) 100%);
    }

    .floating-elements {
      position: absolute;
      inset: 0;
    }

    .floating-card {
      position: absolute;
      padding: 1.5rem;
      border-radius: 0.75rem;
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }

    .platinum-service {
      top: 20%;
      right: -30px;
      background: rgba(201, 201, 201, 0.95);
      color: #000000;
      text-align: center;
      min-width: 140px;
    }

    .service-icon {
      font-size: 1.5rem;
      color: #8B1538;
      margin-bottom: 0.5rem;
    }

    .service-name {
      display: block;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 0.25rem;
    }

    .service-price {
      font-size: 0.875rem;
      font-weight: 600;
      color: #8B1538;
    }

    .midnight-lounge {
      bottom: 20%;
      left: -30px;
      background: rgba(0, 0, 0, 0.9);
      color: #c9c9c9;
      text-align: center;
      min-width: 140px;
      border: 1px solid #333333;
    }

    .lounge-icon {
      font-size: 1.5rem;
      color: #d4af37;
      margin-bottom: 0.5rem;
    }

    .lounge-text {
      display: block;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 0.25rem;
    }

    .lounge-subtitle {
      font-size: 0.625rem;
      color: #a8a8a8;
      font-style: italic;
    }

    @media (max-width: 768px) {
      .hero-container {
        grid-template-columns: 1fr;
        gap: 3rem;
        text-align: center;
      }

      .hero-title {
        font-size: 2.5rem;
      }

      .hero-actions {
        flex-direction: column;
        align-items: center;
      }

      .color-palette {
        justify-content: center;
      }

      .hero-trust-indicators {
        justify-content: center;
      }

      .floating-card {
        display: none;
      }
    }
    `,
    {
      badge: 'PLATINUM EXCELLENCE',
      title: 'WHERE MIDNIGHT MEETS PLATINUM',
      subtitle: 'Experience the depths of luxury in our redesigned sanctuary, where sophisticated midnight tones embrace platinum elegance and burgundy warmth creates an atmosphere of unparalleled exclusivity.',
      primaryCTA: 'DISCOVER PLATINUM EXPERIENCE',
      secondaryCTA: 'EXPLORE NEW AMBIANCE',
      colorPalette: [
        { name: 'MIDNIGHT', value: '#000000' },
        { name: 'PLATINUM', value: '#c9c9c9' },
        { name: 'BURGUNDY', value: '#8B1538' },
        { name: 'GOLD', value: '#d4af37' }
      ],
      trustIndicators: [
        { number: '500+', label: 'Platinum Members' },
        { number: '15+', label: 'Design Awards' },
        { number: '5★', label: 'Elite Rating' }
      ]
    }
  ),

  'add-more-compelling-copy': createLuxuryHero(
    'luxury-premium-hero-compelling-copy',
    'Add more compelling copy',
    'Crafted persuasive luxury copy with emotional triggers, exclusivity messaging, and sophisticated storytelling. Enhanced with power words, scarcity elements, and compelling value propositions that resonate with high-end clientele.',
    `
    <section class="hero-luxury-compelling" data-section-type="hero">
      <div class="hero-container">
        <div class="hero-content">
          <div class="hero-announcement">
            <div class="announcement-badge">
              <span class="badge-icon">⚡</span>
              <span class="badge-text">EXCLUSIVE INVITATION</span>
            </div>
            <p class="announcement-text">
              You've been personally selected to experience the pinnacle of luxury beauty
            </p>
          </div>

          <h1 class="hero-title">
            <span class="title-transform">TRANSFORM</span>
            <span class="title-yourself">YOURSELF</span>
            <span class="title-subtitle">INTO EXTRAORDINARY</span>
          </h1>

          <div class="hero-value-proposition">
            <p class="value-main">
              <strong>This isn't just a salon visit.</strong> This is your metamorphosis into the most
              confident, radiant version of yourself. Where world-renowned master artisans don't just
              style your hair—they sculpt your destiny.
            </p>

            <div class="value-points">
              <div class="value-point">
                <span class="point-icon">✦</span>
                <span class="point-text"><strong>Master Artisans</strong> with 20+ years of elite experience</span>
              </div>
              <div class="value-point">
                <span class="point-icon">✦</span>
                <span class="point-text"><strong>Private VIP Suites</strong> with champagne and personal concierge</span>
              </div>
              <div class="value-point">
                <span class="point-icon">✦</span>
                <span class="point-text"><strong>Exclusive Techniques</strong> used by A-list celebrities and royalty</span>
              </div>
            </div>
          </div>

          <div class="urgency-section">
            <div class="scarcity-message">
              <div class="scarcity-header">
                <span class="scarcity-icon">⏰</span>
                <span class="scarcity-title">LIMITED AVAILABILITY</span>
              </div>
              <p class="scarcity-text">
                Only <strong>3 VIP appointments</strong> remain this month.
                Once filled, the next availability is <strong>February 2025</strong>.
              </p>
            </div>

            <div class="social-proof">
              <p class="proof-text">
                "I've tried every luxury salon from Paris to Tokyo. Nothing compares to the
                <strong>life-changing transformation</strong> I experienced here."
              </p>
              <span class="proof-author">- Victoria Sterling, Fashion Executive</span>
            </div>
          </div>

          <div class="hero-actions-compelling">
            <button class="btn-primary-vip">
              <div class="btn-content">
                <span class="btn-main">CLAIM YOUR VIP TRANSFORMATION</span>
                <span class="btn-sub">Secure your exclusive appointment now</span>
              </div>
              <div class="btn-arrow">→</div>
            </button>

            <button class="btn-guarantee">
              <span class="guarantee-icon">🛡️</span>
              <span class="guarantee-text">100% SATISFACTION GUARANTEED</span>
            </button>
          </div>

          <div class="hero-exclusivity">
            <div class="exclusivity-stats">
              <div class="stat-item">
                <span class="stat-number">$2M+</span>
                <span class="stat-label">In Celebrity Transformations</span>
              </div>
              <div class="stat-divider">|</div>
              <div class="stat-item">
                <span class="stat-number">500+</span>
                <span class="stat-label">VIP Members Worldwide</span>
              </div>
              <div class="stat-divider">|</div>
              <div class="stat-item">
                <span class="stat-number">15+</span>
                <span class="stat-label">International Beauty Awards</span>
              </div>
            </div>

            <p class="exclusivity-text">
              <em>Join an elite circle where ordinary becomes <strong>extraordinary</strong></em>
            </p>
          </div>
        </div>

        <div class="hero-visual">
          <div class="transformation-showcase">
            <img src="/api/placeholder/600/700" alt="Luxury transformation" class="hero-image"/>

            <div class="before-after-indicator">
              <div class="indicator-badge">
                <span class="indicator-text">ACTUAL CLIENT TRANSFORMATION</span>
                <div class="indicator-rating">★★★★★</div>
              </div>
            </div>

            <div class="floating-testimonial">
              <div class="testimonial-bubble">
                <p class="bubble-quote">"My life literally changed after this experience!"</p>
                <span class="bubble-author">- Sarah M.</span>
                <div class="bubble-verification">✓ Verified VIP Client</div>
              </div>
            </div>

            <div class="price-anchor">
              <div class="price-badge">
                <span class="price-label">VIP EXPERIENCE</span>
                <span class="price-value">FROM $299</span>
                <span class="price-note">Investment in your transformation</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .hero-luxury-compelling {
      min-height: 100vh;
      background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%);
      display: flex;
      align-items: center;
      position: relative;
      padding: 2rem 0;
    }

    .hero-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 4rem;
      align-items: center;
    }

    .hero-announcement {
      margin-bottom: 2rem;
    }

    .announcement-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      padding: 0.5rem 1rem;
      border-radius: 2rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 0.75rem;
      box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);
      animation: gentle-pulse 3s ease-in-out infinite;
    }

    @keyframes gentle-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }

    .announcement-text {
      font-size: 1rem;
      color: #8B4513;
      font-weight: 500;
      line-height: 1.4;
      max-width: 400px;
    }

    .hero-title {
      margin-bottom: 2rem;
      line-height: 1;
    }

    .title-transform {
      display: block;
      font-size: 4.5rem;
      font-weight: 900;
      color: #2c1810;
      font-family: 'Playfair Display', serif;
      letter-spacing: -2px;
      margin-bottom: 0.25rem;
    }

    .title-yourself {
      display: block;
      font-size: 4.5rem;
      font-weight: 300;
      background: linear-gradient(120deg, #d4af37 0%, #f4e4bc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-family: 'Playfair Display', serif;
      letter-spacing: -2px;
      margin-bottom: 1rem;
    }

    .title-subtitle {
      display: block;
      font-size: 1.25rem;
      color: #8B4513;
      font-weight: 400;
      letter-spacing: 3px;
      font-style: italic;
    }

    .hero-value-proposition {
      margin-bottom: 2.5rem;
    }

    .value-main {
      font-size: 1.25rem;
      color: #2c1810;
      line-height: 1.6;
      margin-bottom: 2rem;
    }

    .value-main strong {
      color: #d4af37;
      font-weight: 700;
    }

    .value-points {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .value-point {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .point-icon {
      color: #d4af37;
      font-size: 1rem;
    }

    .point-text {
      font-size: 1rem;
      color: #6b5b4f;
      line-height: 1.4;
    }

    .point-text strong {
      color: #2c1810;
      font-weight: 700;
    }

    .urgency-section {
      margin-bottom: 2.5rem;
      padding: 2rem;
      background: rgba(212, 175, 55, 0.05);
      border-radius: 1rem;
      border-left: 4px solid #d4af37;
    }

    .scarcity-message {
      margin-bottom: 1.5rem;
    }

    .scarcity-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .scarcity-icon {
      color: #ff4757;
      font-size: 1.125rem;
    }

    .scarcity-title {
      font-size: 0.875rem;
      font-weight: 700;
      color: #ff4757;
      letter-spacing: 1px;
    }

    .scarcity-text {
      font-size: 1rem;
      color: #2c1810;
      line-height: 1.5;
    }

    .scarcity-text strong {
      color: #d4af37;
      font-weight: 700;
    }

    .social-proof {
      padding-top: 1.5rem;
      border-top: 1px solid rgba(212, 175, 55, 0.2);
    }

    .proof-text {
      font-size: 1.125rem;
      color: #2c1810;
      line-height: 1.5;
      font-style: italic;
      margin-bottom: 0.5rem;
    }

    .proof-text strong {
      color: #d4af37;
      font-weight: 700;
    }

    .proof-author {
      font-size: 0.875rem;
      color: #8B4513;
      font-weight: 600;
    }

    .hero-actions-compelling {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 3rem;
    }

    .btn-primary-vip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border: none;
      padding: 1.75rem 2.5rem;
      border-radius: 0.75rem;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 6px 25px rgba(212, 175, 55, 0.4);
      text-align: left;
    }

    .btn-primary-vip:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 30px rgba(212, 175, 55, 0.5);
    }

    .btn-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .btn-main {
      font-size: 1.125rem;
      font-weight: 700;
      letter-spacing: 1px;
    }

    .btn-sub {
      font-size: 0.875rem;
      font-weight: 500;
      opacity: 0.9;
    }

    .btn-arrow {
      font-size: 1.5rem;
      font-weight: 700;
      transition: transform 0.3s ease;
    }

    .btn-primary-vip:hover .btn-arrow {
      transform: translateX(4px);
    }

    .btn-guarantee {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      background: transparent;
      color: #8B4513;
      border: 2px solid #d4af37;
      padding: 1rem 2rem;
      border-radius: 0.75rem;
      cursor: pointer;
      transition: all 0.3s ease;
      font-weight: 600;
      font-size: 0.875rem;
      letter-spacing: 0.5px;
    }

    .btn-guarantee:hover {
      background: rgba(212, 175, 55, 0.1);
      transform: translateY(-1px);
    }

    .hero-exclusivity {
      text-align: center;
    }

    .exclusivity-stats {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      margin-bottom: 1rem;
    }

    .stat-item {
      text-align: center;
    }

    .stat-number {
      display: block;
      font-size: 1.75rem;
      font-weight: 700;
      color: #d4af37;
      line-height: 1;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #6b5b4f;
      font-weight: 500;
      line-height: 1.2;
    }

    .stat-divider {
      color: #d4af37;
      font-size: 1.5rem;
      font-weight: 300;
    }

    .exclusivity-text {
      font-size: 1rem;
      color: #8B4513;
      font-style: italic;
    }

    .exclusivity-text strong {
      color: #d4af37;
      font-weight: 700;
    }

    .hero-visual {
      position: relative;
    }

    .transformation-showcase {
      position: relative;
    }

    .hero-image {
      width: 100%;
      height: auto;
      border-radius: 1rem;
    }

    .before-after-indicator {
      position: absolute;
      top: 20px;
      left: 20px;
    }

    .indicator-badge {
      background: rgba(0, 0, 0, 0.8);
      color: #ffffff;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      text-align: center;
      backdrop-filter: blur(10px);
    }

    .indicator-text {
      display: block;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 0.25rem;
    }

    .indicator-rating {
      color: #d4af37;
      font-size: 0.875rem;
    }

    .floating-testimonial {
      position: absolute;
      bottom: 20px;
      left: 20px;
    }

    .testimonial-bubble {
      background: #ffffff;
      padding: 1.25rem;
      border-radius: 1rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.15);
      max-width: 220px;
    }

    .bubble-quote {
      font-size: 0.875rem;
      color: #2c1810;
      line-height: 1.4;
      margin-bottom: 0.5rem;
      font-style: italic;
      font-weight: 600;
    }

    .bubble-author {
      font-size: 0.75rem;
      color: #8B4513;
      font-weight: 600;
      display: block;
      margin-bottom: 0.25rem;
    }

    .bubble-verification {
      font-size: 0.625rem;
      color: #22c55e;
      font-weight: 600;
    }

    .price-anchor {
      position: absolute;
      top: 20px;
      right: 20px;
    }

    .price-badge {
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      padding: 1rem;
      border-radius: 0.75rem;
      text-align: center;
      box-shadow: 0 6px 20px rgba(212, 175, 55, 0.3);
    }

    .price-label {
      display: block;
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 0.25rem;
    }

    .price-value {
      display: block;
      font-size: 1.5rem;
      font-weight: 900;
      margin-bottom: 0.25rem;
    }

    .price-note {
      font-size: 0.625rem;
      font-weight: 500;
      opacity: 0.9;
    }

    @media (max-width: 768px) {
      .hero-container {
        grid-template-columns: 1fr;
        gap: 3rem;
      }

      .title-transform, .title-yourself {
        font-size: 3rem;
      }

      .value-main {
        font-size: 1.125rem;
      }

      .exclusivity-stats {
        flex-direction: column;
        gap: 1rem;
      }

      .stat-divider {
        display: none;
      }

      .floating-testimonial,
      .price-anchor {
        position: relative;
        top: 0;
        left: 0;
        right: 0;
        margin-top: 1rem;
      }
    }
    `,
    {
      announcement: 'You\'ve been personally selected to experience the pinnacle of luxury beauty',
      title: 'TRANSFORM YOURSELF INTO EXTRAORDINARY',
      valueProposition: 'This isn\'t just a salon visit. This is your metamorphosis into the most confident, radiant version of yourself.',
      masterPoints: [
        'Master Artisans with 20+ years of elite experience',
        'Private VIP Suites with champagne and personal concierge',
        'Exclusive Techniques used by A-list celebrities and royalty'
      ],
      scarcity: 'Only 3 VIP appointments remain this month',
      socialProof: 'I\'ve tried every luxury salon from Paris to Tokyo. Nothing compares to the life-changing transformation I experienced here.',
      primaryCTA: 'CLAIM YOUR VIP TRANSFORMATION',
      guarantee: '100% SATISFACTION GUARANTEED',
      stats: [
        { number: '$2M+', label: 'In Celebrity Transformations' },
        { number: '500+', label: 'VIP Members Worldwide' },
        { number: '15+', label: 'International Beauty Awards' }
      ]
    }
  )
}
