// Luxury Premium Features Responses
// Sophisticated feature presentations with premium service offerings and elegant design

import type { AIComponentResponse } from '../../../types'

const createLuxuryFeatures = (
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
    type: 'features',
    name: 'Luxury Premium Features',
    html,
    css,
    props,
    responsive: {
      mobile: { css: `/* Mobile luxury features optimizations */` },
      tablet: { css: `/* Tablet luxury features optimizations */` }
    },
    accessibility: {
      ariaLabels: { 'features-grid': 'Premium salon services', 'feature-item': 'Service feature' },
      keyboardNavigation: true,
      screenReaderOptimized: true
    },
    seo: {
      structuredData: { '@type': 'Service', 'provider': 'ÉLITE SALON' },
      metaTags: { description: 'Luxury premium salon features' }
    },
    performance: {
      lazyLoad: true,
      criticalCSS: '.features-luxury { padding: 6rem 0; background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%); }',
      optimizedImages: true
    }
  },
  metadata: {
    model: 'claude-3-sonnet',
    prompt: `Modify luxury premium salon features: ${suggestion}`,
    reasoning,
    confidence: 95,
    processingTime: 1500,
    alternatives: [],
    tags: ['luxury', 'premium', 'elegant', 'sophisticated', 'gold-accents']
  },
  feedback: {
    requestFeedback: true,
    improvementSuggestions: ['Consider adding VIP exclusive services', 'Include master stylist certifications']
  }
})

export const featuresResponses = {
  'make-it-more-visually-appealing': createLuxuryFeatures(
    'luxury-premium-features-visual',
    'Make it more visually appealing',
    'Enhanced visual appeal with sophisticated iconography, premium imagery, elegant typography hierarchy, and luxurious gold accents. Added visual elements that convey prestige and exclusivity.',
    `
    <section class="features-luxury-visual" data-section-type="features">
      <div class="features-container">
        <div class="features-header">
          <div class="header-ornament">
            <div class="ornament-line"></div>
            <span class="ornament-icon">♛</span>
            <div class="ornament-line"></div>
          </div>
          <h2 class="features-title">SIGNATURE EXPERIENCES</h2>
          <p class="features-subtitle">Curated exclusively for the discerning connoisseur of luxury</p>
        </div>

        <div class="features-grid">
          <div class="feature-card premium">
            <div class="feature-icon-container">
              <div class="feature-icon luxury-cut">✂️</div>
              <div class="icon-glow"></div>
            </div>
            <h3 class="feature-title">MASTER ARTISTRY</h3>
            <p class="feature-description">
              Precision cuts by internationally certified master stylists with 15+ years of exclusive training
            </p>
            <div class="feature-accent-bar"></div>
          </div>

          <div class="feature-card premium">
            <div class="feature-icon-container">
              <div class="feature-icon luxury-spa">💎</div>
              <div class="icon-glow"></div>
            </div>
            <h3 class="feature-title">DIAMOND TREATMENTS</h3>
            <p class="feature-description">
              Rejuvenating treatments using rare minerals and precious elements sourced globally
            </p>
            <div class="feature-accent-bar"></div>
          </div>

          <div class="feature-card premium">
            <div class="feature-icon-container">
              <div class="feature-icon luxury-suite">🏛️</div>
              <div class="icon-glow"></div>
            </div>
            <h3 class="feature-title">PRIVATE SANCTUARIES</h3>
            <p class="feature-description">
              Exclusive suites with personal concierge service and champagne welcome
            </p>
            <div class="feature-accent-bar"></div>
          </div>

          <div class="feature-card premium">
            <div class="feature-icon-container">
              <div class="feature-icon luxury-products">👑</div>
              <div class="icon-glow"></div>
            </div>
            <h3 class="feature-title">ROYAL COLLECTIONS</h3>
            <p class="feature-description">
              Exclusive access to limited-edition luxury products from prestigious European houses
            </p>
            <div class="feature-accent-bar"></div>
          </div>
        </div>

        <div class="features-showcase">
          <div class="showcase-badge">
            <span class="badge-text">INTERNATIONALLY AWARDED</span>
            <div class="badge-stars">✦ ✦ ✦ ✦ ✦</div>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .features-luxury-visual {
      padding: 6rem 0;
      background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%);
      position: relative;
    }

    .features-luxury-visual::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="1" fill="%23d4af37" opacity="0.1"/></svg>') repeat;
      background-size: 80px 80px;
    }

    .features-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      position: relative;
      z-index: 1;
    }

    .features-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .header-ornament {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .ornament-line {
      width: 80px;
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, #d4af37 50%, transparent 100%);
    }

    .ornament-icon {
      font-size: 1.5rem;
      color: #d4af37;
      text-shadow: 0 0 15px rgba(212, 175, 55, 0.4);
    }

    .features-title {
      font-size: 3rem;
      font-weight: 700;
      color: #2d2d2d;
      font-family: 'Playfair Display', serif;
      letter-spacing: 3px;
      margin-bottom: 1rem;
    }

    .features-subtitle {
      font-size: 1.125rem;
      color: #666666;
      font-style: italic;
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.6;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 2.5rem;
      margin-bottom: 4rem;
    }

    .feature-card {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 1rem;
      padding: 3rem 2rem;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(212, 175, 55, 0.2);
      transition: all 0.4s ease;
      position: relative;
      overflow: hidden;
    }

    .feature-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #d4af37 0%, #b8941f 100%);
      transform: scaleX(0);
      transition: transform 0.4s ease;
    }

    .feature-card:hover {
      transform: translateY(-10px);
      box-shadow: 0 30px 80px rgba(212, 175, 55, 0.15);
    }

    .feature-card:hover::before {
      transform: scaleX(1);
    }

    .feature-icon-container {
      position: relative;
      margin-bottom: 2rem;
    }

    .feature-icon {
      font-size: 3rem;
      margin-bottom: 1.5rem;
      display: inline-block;
      position: relative;
      z-index: 2;
    }

    .icon-glow {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80px;
      height: 80px;
      background: radial-gradient(circle, rgba(212, 175, 55, 0.2) 0%, transparent 70%);
      border-radius: 50%;
      z-index: 1;
    }

    .feature-title {
      font-size: 1.375rem;
      font-weight: 700;
      color: #2d2d2d;
      margin-bottom: 1rem;
      font-family: 'Playfair Display', serif;
      letter-spacing: 1px;
    }

    .feature-description {
      font-size: 1rem;
      color: #666666;
      line-height: 1.7;
      margin-bottom: 1.5rem;
    }

    .feature-accent-bar {
      width: 60px;
      height: 3px;
      background: linear-gradient(90deg, #d4af37 0%, #b8941f 100%);
      margin: 0 auto;
      border-radius: 2px;
    }

    .features-showcase {
      text-align: center;
      padding: 2rem;
      background: rgba(212, 175, 55, 0.1);
      border-radius: 1rem;
      border: 1px solid rgba(212, 175, 55, 0.3);
    }

    .showcase-badge {
      display: inline-block;
    }

    .badge-text {
      display: block;
      font-size: 1rem;
      font-weight: 700;
      color: #d4af37;
      letter-spacing: 2px;
      margin-bottom: 0.5rem;
    }

    .badge-stars {
      font-size: 1.25rem;
      color: #d4af37;
      letter-spacing: 4px;
    }

    @media (max-width: 768px) {
      .features-title { font-size: 2rem; }
      .features-grid { grid-template-columns: 1fr; gap: 1.5rem; }
      .feature-card { padding: 2rem 1.5rem; }
    }
    `,
    {
      sectionTitle: 'SIGNATURE EXPERIENCES',
      subtitle: 'Curated exclusively for the discerning connoisseur of luxury',
      features: [
        {
          icon: '✂️',
          title: 'MASTER ARTISTRY',
          description: 'Precision cuts by internationally certified master stylists with 15+ years of exclusive training'
        },
        {
          icon: '💎',
          title: 'DIAMOND TREATMENTS',
          description: 'Rejuvenating treatments using rare minerals and precious elements sourced globally'
        },
        {
          icon: '🏛️',
          title: 'PRIVATE SANCTUARIES',
          description: 'Exclusive suites with personal concierge service and champagne welcome'
        },
        {
          icon: '👑',
          title: 'ROYAL COLLECTIONS',
          description: 'Exclusive access to limited-edition luxury products from prestigious European houses'
        }
      ],
      badge: 'INTERNATIONALLY AWARDED'
    }
  ),

  'add-pricing-information': createLuxuryFeatures(
    'luxury-premium-features-pricing',
    'Add pricing information',
    'Integrated sophisticated pricing display with luxury service tiers. Presented pricing as exclusive membership levels rather than simple costs, maintaining premium positioning while providing transparency.',
    `
    <section class="features-luxury-pricing" data-section-type="features">
      <div class="features-container">
        <div class="features-header">
          <h2 class="features-title">EXCLUSIVE MEMBERSHIPS</h2>
          <p class="features-subtitle">Investment in excellence • Bespoke experiences curated for distinction</p>
        </div>

        <div class="pricing-tiers">
          <div class="tier-card platinum">
            <div class="tier-badge">
              <span class="tier-icon">♛</span>
              <span class="tier-name">PLATINUM ÉLITE</span>
            </div>
            <div class="tier-pricing">
              <span class="tier-price">$2,500</span>
              <span class="tier-period">quarterly membership</span>
            </div>
            <div class="tier-features">
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Unlimited premium cuts & styling</span>
              </div>
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Monthly diamond facial treatment</span>
              </div>
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Private suite with concierge</span>
              </div>
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Exclusive product collections</span>
              </div>
            </div>
            <div class="tier-exclusive">
              <span class="exclusive-text">LIMITED TO 50 MEMBERS</span>
            </div>
          </div>

          <div class="tier-card gold">
            <div class="tier-badge">
              <span class="tier-icon">👑</span>
              <span class="tier-name">GOLD PRESTIGE</span>
            </div>
            <div class="tier-pricing">
              <span class="tier-price">$1,200</span>
              <span class="tier-period">quarterly membership</span>
            </div>
            <div class="tier-features">
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Monthly master stylist sessions</span>
              </div>
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Bi-weekly luxury treatments</span>
              </div>
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Priority booking privileges</span>
              </div>
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Complimentary champagne service</span>
              </div>
            </div>
          </div>

          <div class="tier-card signature">
            <div class="tier-badge">
              <span class="tier-icon">💎</span>
              <span class="tier-name">SIGNATURE CLASSIC</span>
            </div>
            <div class="tier-pricing">
              <span class="tier-price">$650</span>
              <span class="tier-period">quarterly membership</span>
            </div>
            <div class="tier-features">
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Bi-weekly styling sessions</span>
              </div>
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Monthly luxury treatment</span>
              </div>
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Preferred appointment times</span>
              </div>
              <div class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">Member appreciation events</span>
              </div>
            </div>
          </div>
        </div>

        <div class="pricing-footer">
          <p class="pricing-note">
            All memberships include complimentary consultations with our master stylists and access to our exclusive product line.
          </p>
          <button class="btn-consultation">
            <span class="btn-text">SCHEDULE PRIVATE CONSULTATION</span>
            <span class="btn-icon">→</span>
          </button>
        </div>
      </div>
    </section>
    `,
    `
    .features-luxury-pricing {
      padding: 6rem 0;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #ffffff;
    }

    .features-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
    }

    .features-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .features-title {
      font-size: 3rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      letter-spacing: 3px;
      margin-bottom: 1rem;
    }

    .features-subtitle {
      font-size: 1.125rem;
      color: #d4af37;
      font-style: italic;
      max-width: 700px;
      margin: 0 auto;
      line-height: 1.6;
    }

    .pricing-tiers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 2rem;
      margin-bottom: 3rem;
    }

    .tier-card {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 1rem;
      padding: 2.5rem;
      text-align: center;
      border: 2px solid transparent;
      transition: all 0.4s ease;
      position: relative;
      backdrop-filter: blur(10px);
    }

    .tier-card.platinum {
      border-color: #d4af37;
      box-shadow: 0 0 40px rgba(212, 175, 55, 0.2);
    }

    .tier-card.gold {
      border-color: rgba(212, 175, 55, 0.6);
    }

    .tier-card.signature {
      border-color: rgba(212, 175, 55, 0.3);
    }

    .tier-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 20px 60px rgba(212, 175, 55, 0.15);
    }

    .tier-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
    }

    .tier-icon {
      font-size: 1.5rem;
      color: #d4af37;
    }

    .tier-name {
      font-size: 1.25rem;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 2px;
      font-family: 'Playfair Display', serif;
    }

    .tier-pricing {
      margin-bottom: 2.5rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid rgba(212, 175, 55, 0.3);
    }

    .tier-price {
      display: block;
      font-size: 2.5rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.5rem;
    }

    .tier-period {
      font-size: 0.875rem;
      color: #cccccc;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .tier-features {
      text-align: left;
      margin-bottom: 2rem;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 0.5rem 0;
    }

    .feature-check {
      width: 20px;
      height: 20px;
      background: #d4af37;
      color: #000000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.875rem;
      font-weight: 700;
      flex-shrink: 0;
    }

    .feature-text {
      color: #cccccc;
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .tier-exclusive {
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 0.75rem;
      letter-spacing: 1px;
    }

    .pricing-footer {
      text-align: center;
      padding-top: 3rem;
      border-top: 1px solid rgba(212, 175, 55, 0.3);
    }

    .pricing-note {
      color: #cccccc;
      font-size: 0.95rem;
      margin-bottom: 2rem;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.6;
      font-style: italic;
    }

    .btn-consultation {
      display: inline-flex;
      align-items: center;
      gap: 1rem;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border: none;
      padding: 1.25rem 2.5rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 0.95rem;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(212, 175, 55, 0.3);
    }

    .btn-consultation:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(212, 175, 55, 0.4);
    }

    @media (max-width: 768px) {
      .features-title { font-size: 2rem; }
      .pricing-tiers { grid-template-columns: 1fr; }
      .tier-card { padding: 2rem 1.5rem; }
    }
    `,
    {
      sectionTitle: 'EXCLUSIVE MEMBERSHIPS',
      subtitle: 'Investment in excellence • Bespoke experiences curated for distinction',
      tiers: [
        {
          name: 'PLATINUM ÉLITE',
          icon: '♛',
          price: '$2,500',
          period: 'quarterly membership',
          features: [
            'Unlimited premium cuts & styling',
            'Monthly diamond facial treatment',
            'Private suite with concierge',
            'Exclusive product collections'
          ],
          exclusive: 'LIMITED TO 50 MEMBERS'
        },
        {
          name: 'GOLD PRESTIGE',
          icon: '👑',
          price: '$1,200',
          period: 'quarterly membership',
          features: [
            'Monthly master stylist sessions',
            'Bi-weekly luxury treatments',
            'Priority booking privileges',
            'Complimentary champagne service'
          ]
        },
        {
          name: 'SIGNATURE CLASSIC',
          icon: '💎',
          price: '$650',
          period: 'quarterly membership',
          features: [
            'Bi-weekly styling sessions',
            'Monthly luxury treatment',
            'Preferred appointment times',
            'Member appreciation events'
          ]
        }
      ]
    }
  ),

  'include-customer-testimonials': createLuxuryFeatures(
    'luxury-premium-features-testimonials',
    'Include customer testimonials',
    'Integrated sophisticated customer testimonials with luxury client profiles. Featured high-profile testimonials with elegant presentation that reinforces exclusivity and premium positioning.',
    `
    <section class="features-luxury-testimonials" data-section-type="features">
      <div class="features-container">
        <div class="features-header">
          <h2 class="features-title">DISTINGUISHED SERVICES</h2>
          <p class="features-subtitle">Celebrated by discerning clients worldwide</p>
        </div>

        <div class="features-testimonials-grid">
          <div class="feature-testimonial-card">
            <div class="feature-content">
              <div class="feature-icon">✂️</div>
              <h3 class="feature-title">MASTER PRECISION CUTS</h3>
              <p class="feature-description">
                Artisanal cutting techniques perfected by internationally trained masters
              </p>
            </div>
            <div class="testimonial-section">
              <div class="testimonial-content">
                <div class="quote-icon">"</div>
                <p class="testimonial-text">
                  "The precision and artistry here is unmatched. My stylist transformed my vision into perfection."
                </p>
              </div>
              <div class="testimonial-author">
                <div class="author-avatar">CE</div>
                <div class="author-info">
                  <span class="author-name">Catherine Everhart</span>
                  <span class="author-title">Executive Producer, Metropolitan Opera</span>
                </div>
              </div>
            </div>
          </div>

          <div class="feature-testimonial-card">
            <div class="feature-content">
              <div class="feature-icon">💎</div>
              <h3 class="feature-title">DIAMOND REJUVENATION</h3>
              <p class="feature-description">
                Exclusive treatments using rare minerals and precious elements
              </p>
            </div>
            <div class="testimonial-section">
              <div class="testimonial-content">
                <div class="quote-icon">"</div>
                <p class="testimonial-text">
                  "The diamond treatment is extraordinary. My skin has never looked more radiant and youthful."
                </p>
              </div>
              <div class="testimonial-author">
                <div class="author-avatar">VR</div>
                <div class="author-info">
                  <span class="author-name">Victoria Richmond</span>
                  <span class="author-title">Art Gallery Director</span>
                </div>
              </div>
            </div>
          </div>

          <div class="feature-testimonial-card">
            <div class="feature-content">
              <div class="feature-icon">🏛️</div>
              <h3 class="feature-title">PRIVATE SANCTUARIES</h3>
              <p class="feature-description">
                Exclusive suites with personalized concierge service
              </p>
            </div>
            <div class="testimonial-section">
              <div class="testimonial-content">
                <div class="quote-icon">"</div>
                <p class="testimonial-text">
                  "The private suite experience is unparalleled. Pure luxury from arrival to departure."
                </p>
              </div>
              <div class="testimonial-author">
                <div class="author-avatar">JM</div>
                <div class="author-info">
                  <span class="author-name">Jonathan Marseille</span>
                  <span class="author-title">Luxury Brand Consultant</span>
                </div>
              </div>
            </div>
          </div>

          <div class="feature-testimonial-card">
            <div class="feature-content">
              <div class="feature-icon">👑</div>
              <h3 class="feature-title">ROYAL COLLECTIONS</h3>
              <p class="feature-description">
                Exclusive access to limited-edition luxury product lines
              </p>
            </div>
            <div class="testimonial-section">
              <div class="testimonial-content">
                <div class="quote-icon">"</div>
                <p class="testimonial-text">
                  "Access to products unavailable anywhere else. Truly makes you feel like royalty."
                </p>
              </div>
              <div class="testimonial-author">
                <div class="author-avatar">AS</div>
                <div class="author-info">
                  <span class="author-name">Anastasia Sterling</span>
                  <span class="author-title">Fashion Week Creative Director</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="features-showcase">
          <div class="showcase-stats">
            <div class="stat-item">
              <span class="stat-number">500+</span>
              <span class="stat-label">Distinguished Clients</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-number">98%</span>
              <span class="stat-label">Client Retention</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-number">25+</span>
              <span class="stat-label">Years Excellence</span>
            </div>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .features-luxury-testimonials {
      padding: 6rem 0;
      background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%);
    }

    .features-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
    }

    .features-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .features-title {
      font-size: 3rem;
      font-weight: 700;
      color: #2d2d2d;
      font-family: 'Playfair Display', serif;
      letter-spacing: 3px;
      margin-bottom: 1rem;
    }

    .features-subtitle {
      font-size: 1.125rem;
      color: #666666;
      font-style: italic;
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.6;
    }

    .features-testimonials-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 2rem;
      margin-bottom: 4rem;
    }

    .feature-testimonial-card {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 1rem;
      padding: 0;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(212, 175, 55, 0.2);
      transition: all 0.4s ease;
      overflow: hidden;
    }

    .feature-testimonial-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 30px 80px rgba(212, 175, 55, 0.15);
    }

    .feature-content {
      padding: 2.5rem 2rem 2rem;
      text-align: center;
      border-bottom: 1px solid rgba(212, 175, 55, 0.2);
    }

    .feature-icon {
      font-size: 2.5rem;
      margin-bottom: 1.5rem;
      display: inline-block;
    }

    .feature-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #2d2d2d;
      margin-bottom: 1rem;
      font-family: 'Playfair Display', serif;
      letter-spacing: 1px;
    }

    .feature-description {
      font-size: 0.95rem;
      color: #666666;
      line-height: 1.6;
    }

    .testimonial-section {
      padding: 2rem;
      background: rgba(212, 175, 55, 0.05);
    }

    .testimonial-content {
      margin-bottom: 1.5rem;
      position: relative;
    }

    .quote-icon {
      font-size: 3rem;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      position: absolute;
      top: -10px;
      left: -10px;
      opacity: 0.3;
    }

    .testimonial-text {
      font-size: 0.95rem;
      color: #555555;
      line-height: 1.7;
      font-style: italic;
      padding-left: 1.5rem;
      position: relative;
      z-index: 1;
    }

    .testimonial-author {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .author-avatar {
      width: 45px;
      height: 45px;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #ffffff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.875rem;
      flex-shrink: 0;
    }

    .author-info {
      display: flex;
      flex-direction: column;
    }

    .author-name {
      font-weight: 600;
      color: #2d2d2d;
      font-size: 0.95rem;
      margin-bottom: 2px;
    }

    .author-title {
      font-size: 0.8rem;
      color: #888888;
      line-height: 1.3;
    }

    .features-showcase {
      text-align: center;
      padding: 3rem 2rem;
      background: rgba(212, 175, 55, 0.1);
      border-radius: 1rem;
      border: 1px solid rgba(212, 175, 55, 0.3);
    }

    .showcase-stats {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 3rem;
      flex-wrap: wrap;
    }

    .stat-item {
      text-align: center;
    }

    .stat-number {
      display: block;
      font-size: 2.5rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.5rem;
    }

    .stat-label {
      font-size: 0.875rem;
      color: #666666;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .stat-divider {
      width: 1px;
      height: 60px;
      background: linear-gradient(180deg, transparent 0%, #d4af37 50%, transparent 100%);
    }

    @media (max-width: 768px) {
      .features-title { font-size: 2rem; }
      .features-testimonials-grid { grid-template-columns: 1fr; }
      .showcase-stats { flex-direction: column; gap: 2rem; }
      .stat-divider { display: none; }
    }
    `,
    {
      sectionTitle: 'DISTINGUISHED SERVICES',
      subtitle: 'Celebrated by discerning clients worldwide',
      featuresWithTestimonials: [
        {
          icon: '✂️',
          title: 'MASTER PRECISION CUTS',
          description: 'Artisanal cutting techniques perfected by internationally trained masters',
          testimonial: {
            text: 'The precision and artistry here is unmatched. My stylist transformed my vision into perfection.',
            author: 'Catherine Everhart',
            title: 'Executive Producer, Metropolitan Opera',
            avatar: 'CE'
          }
        },
        {
          icon: '💎',
          title: 'DIAMOND REJUVENATION',
          description: 'Exclusive treatments using rare minerals and precious elements',
          testimonial: {
            text: 'The diamond treatment is extraordinary. My skin has never looked more radiant and youthful.',
            author: 'Victoria Richmond',
            title: 'Art Gallery Director',
            avatar: 'VR'
          }
        },
        {
          icon: '🏛️',
          title: 'PRIVATE SANCTUARIES',
          description: 'Exclusive suites with personalized concierge service',
          testimonial: {
            text: 'The private suite experience is unparalleled. Pure luxury from arrival to departure.',
            author: 'Jonathan Marseille',
            title: 'Luxury Brand Consultant',
            avatar: 'JM'
          }
        },
        {
          icon: '👑',
          title: 'ROYAL COLLECTIONS',
          description: 'Exclusive access to limited-edition luxury product lines',
          testimonial: {
            text: 'Access to products unavailable anywhere else. Truly makes you feel like royalty.',
            author: 'Anastasia Sterling',
            title: 'Fashion Week Creative Director',
            avatar: 'AS'
          }
        }
      ],
      stats: [
        { number: '500+', label: 'Distinguished Clients' },
        { number: '98%', label: 'Client Retention' },
        { number: '25+', label: 'Years Excellence' }
      ]
    }
  ),

  'change-the-layout': createLuxuryFeatures(
    'luxury-premium-features-layout',
    'Change the layout',
    'Redesigned with sophisticated asymmetrical layout featuring elegant spacing, premium visual hierarchy, and luxury presentation. Created distinctive sections with refined typography and gold accent patterns.',
    `
    <section class="features-luxury-layout" data-section-type="features">
      <div class="features-container">
        <div class="layout-hero-section">
          <div class="hero-content">
            <h2 class="features-title">CURATED EXCELLENCE</h2>
            <p class="features-subtitle">Where artistry meets sophistication in every detail</p>
          </div>
          <div class="hero-accent">
            <div class="accent-pattern">
              <div class="pattern-line"></div>
              <span class="pattern-icon">♛</span>
              <div class="pattern-line"></div>
            </div>
          </div>
        </div>

        <div class="features-asymmetric-grid">
          <div class="feature-column primary">
            <div class="feature-card-large">
              <div class="card-header">
                <div class="header-icon">✂️</div>
                <h3 class="header-title">MASTER ATELIER</h3>
              </div>
              <div class="card-content">
                <p class="card-description">
                  Our internationally certified master stylists bring decades of artisanal expertise, 
                  trained in the most prestigious academies of Paris, Milan, and New York.
                </p>
                <div class="card-features">
                  <div class="feature-point">
                    <span class="point-icon">◆</span>
                    <span class="point-text">Precision cutting mastery</span>
                  </div>
                  <div class="feature-point">
                    <span class="point-icon">◆</span>
                    <span class="point-text">Color artistry excellence</span>
                  </div>
                  <div class="feature-point">
                    <span class="point-icon">◆</span>
                    <span class="point-text">Styling innovation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="feature-column secondary">
            <div class="feature-card-medium">
              <div class="card-icon">💎</div>
              <h3 class="card-title">DIAMOND SPA</h3>
              <p class="card-text">
                Rejuvenating treatments using rare minerals and precious elements
              </p>
            </div>

            <div class="feature-card-medium">
              <div class="card-icon">🏛️</div>
              <h3 class="card-title">PRIVATE SALONS</h3>
              <p class="card-text">
                Exclusive suites with personal concierge and champagne service
              </p>
            </div>
          </div>

          <div class="feature-column tertiary">
            <div class="feature-stats-panel">
              <h4 class="panel-title">DISTINGUISHED HERITAGE</h4>
              <div class="stat-item">
                <span class="stat-number">1985</span>
                <span class="stat-label">Established</span>
              </div>
              <div class="stat-item">
                <span class="stat-number">500+</span>
                <span class="stat-label">Elite Members</span>
              </div>
              <div class="stat-item">
                <span class="stat-number">25+</span>
                <span class="stat-label">Master Artisans</span>
              </div>
            </div>

            <div class="feature-membership-preview">
              <h4 class="preview-title">EXCLUSIVE ACCESS</h4>
              <div class="membership-tier">
                <span class="tier-icon">♛</span>
                <div class="tier-info">
                  <span class="tier-name">Platinum Élite</span>
                  <span class="tier-desc">Unlimited luxury experiences</span>
                </div>
              </div>
              <button class="btn-explore">
                <span class="btn-text">EXPLORE MEMBERSHIPS</span>
                <span class="btn-arrow">→</span>
              </button>
            </div>
          </div>
        </div>

        <div class="features-footer-showcase">
          <div class="showcase-content">
            <div class="showcase-badge">
              <span class="badge-icon">★</span>
              <span class="badge-text">INTERNATIONALLY AWARDED EXCELLENCE</span>
              <span class="badge-icon">★</span>
            </div>
            <p class="showcase-description">
              Recognized by the International Luxury Beauty Association for outstanding service and innovation
            </p>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .features-luxury-layout {
      padding: 6rem 0;
      background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%);
      position: relative;
    }

    .features-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
    }

    .layout-hero-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4rem;
      padding-bottom: 3rem;
      border-bottom: 1px solid rgba(212, 175, 55, 0.3);
    }

    .hero-content {
      flex: 1;
    }

    .features-title {
      font-size: 3.5rem;
      font-weight: 700;
      color: #2d2d2d;
      font-family: 'Playfair Display', serif;
      letter-spacing: 4px;
      margin-bottom: 1rem;
      line-height: 1.2;
    }

    .features-subtitle {
      font-size: 1.25rem;
      color: #666666;
      font-style: italic;
      max-width: 500px;
      line-height: 1.6;
    }

    .hero-accent {
      flex-shrink: 0;
      margin-left: 2rem;
    }

    .accent-pattern {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .pattern-line {
      width: 60px;
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, #d4af37 50%, transparent 100%);
    }

    .pattern-icon {
      font-size: 2rem;
      color: #d4af37;
      text-shadow: 0 0 15px rgba(212, 175, 55, 0.4);
    }

    .features-asymmetric-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 2rem;
      margin-bottom: 4rem;
    }

    .feature-column {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    .feature-card-large {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 1rem;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(212, 175, 55, 0.2);
      height: fit-content;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid rgba(212, 175, 55, 0.2);
    }

    .header-icon {
      font-size: 2.5rem;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: #2d2d2d;
      font-family: 'Playfair Display', serif;
      letter-spacing: 2px;
    }

    .card-description {
      font-size: 1.125rem;
      color: #555555;
      line-height: 1.7;
      margin-bottom: 2rem;
    }

    .card-features {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .feature-point {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .point-icon {
      color: #d4af37;
      font-size: 0.875rem;
    }

    .point-text {
      color: #666666;
      font-weight: 500;
    }

    .feature-card-medium {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 1rem;
      padding: 2rem;
      text-align: center;
      box-shadow: 0 15px 40px rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(212, 175, 55, 0.15);
      transition: all 0.3s ease;
    }

    .feature-card-medium:hover {
      transform: translateY(-5px);
      box-shadow: 0 20px 50px rgba(212, 175, 55, 0.15);
    }

    .card-icon {
      font-size: 2rem;
      margin-bottom: 1rem;
    }

    .card-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #2d2d2d;
      font-family: 'Playfair Display', serif;
      margin-bottom: 1rem;
      letter-spacing: 1px;
    }

    .card-text {
      font-size: 0.95rem;
      color: #666666;
      line-height: 1.6;
    }

    .feature-stats-panel {
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #ffffff;
      border-radius: 1rem;
      padding: 2rem;
      text-align: center;
      margin-bottom: 1rem;
    }

    .panel-title {
      font-size: 0.875rem;
      color: #d4af37;
      font-weight: 700;
      letter-spacing: 2px;
      margin-bottom: 2rem;
    }

    .stat-item {
      margin-bottom: 1.5rem;
    }

    .stat-number {
      display: block;
      font-size: 2rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.25rem;
    }

    .stat-label {
      font-size: 0.8rem;
      color: #cccccc;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .feature-membership-preview {
      background: rgba(212, 175, 55, 0.1);
      border-radius: 1rem;
      padding: 2rem;
      border: 1px solid rgba(212, 175, 55, 0.3);
    }

    .preview-title {
      font-size: 0.875rem;
      color: #d4af37;
      font-weight: 700;
      letter-spacing: 2px;
      margin-bottom: 1.5rem;
      text-align: center;
    }

    .membership-tier {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .tier-icon {
      font-size: 1.5rem;
      color: #d4af37;
    }

    .tier-info {
      display: flex;
      flex-direction: column;
    }

    .tier-name {
      font-weight: 700;
      color: #2d2d2d;
      font-size: 0.95rem;
    }

    .tier-desc {
      font-size: 0.8rem;
      color: #666666;
    }

    .btn-explore {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border: none;
      padding: 0.875rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 0.8rem;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 100%;
    }

    .btn-explore:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(212, 175, 55, 0.3);
    }

    .features-footer-showcase {
      text-align: center;
      padding: 3rem 2rem;
      background: rgba(212, 175, 55, 0.1);
      border-radius: 1rem;
      border: 1px solid rgba(212, 175, 55, 0.3);
    }

    .showcase-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .badge-icon {
      color: #d4af37;
      font-size: 1.25rem;
    }

    .badge-text {
      font-size: 1rem;
      font-weight: 700;
      color: #d4af37;
      letter-spacing: 2px;
    }

    .showcase-description {
      color: #666666;
      font-size: 0.95rem;
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.6;
      font-style: italic;
    }

    @media (max-width: 1024px) {
      .features-asymmetric-grid {
        grid-template-columns: 1fr;
      }
      .layout-hero-section {
        flex-direction: column;
        text-align: center;
        gap: 2rem;
      }
      .hero-accent {
        margin-left: 0;
      }
    }

    @media (max-width: 768px) {
      .features-title { font-size: 2.5rem; }
      .feature-card-large { padding: 2rem; }
    }
    `,
    {
      sectionTitle: 'CURATED EXCELLENCE',
      subtitle: 'Where artistry meets sophistication in every detail',
      primaryFeature: {
        icon: '✂️',
        title: 'MASTER ATELIER',
        description: 'Our internationally certified master stylists bring decades of artisanal expertise, trained in the most prestigious academies of Paris, Milan, and New York.',
        points: [
          'Precision cutting mastery',
          'Color artistry excellence', 
          'Styling innovation'
        ]
      },
      secondaryFeatures: [
        {
          icon: '💎',
          title: 'DIAMOND SPA',
          description: 'Rejuvenating treatments using rare minerals and precious elements'
        },
        {
          icon: '🏛️',
          title: 'PRIVATE SALONS',
          description: 'Exclusive suites with personal concierge and champagne service'
        }
      ],
      stats: [
        { number: '1985', label: 'Established' },
        { number: '500+', label: 'Elite Members' },
        { number: '25+', label: 'Master Artisans' }
      ],
      membership: {
        name: 'Platinum Élite',
        description: 'Unlimited luxury experiences'
      },
      badge: 'INTERNATIONALLY AWARDED EXCELLENCE'
    }
  )
}