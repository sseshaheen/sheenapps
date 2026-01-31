// Luxury Premium Testimonials Responses
// Sophisticated testimonial presentations with high-profile client endorsements and elegant design

import type { AIComponentResponse } from '../../../types'

const createLuxuryTestimonials = (
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
    type: 'testimonials',
    name: 'Luxury Premium Testimonials',
    html,
    css,
    props,
    responsive: {
      mobile: { css: `/* Mobile luxury testimonials optimizations */` },
      tablet: { css: `/* Tablet luxury testimonials optimizations */` }
    },
    accessibility: {
      ariaLabels: { 'testimonials-grid': 'Client testimonials', 'testimonial-card': 'Client testimonial' },
      keyboardNavigation: true,
      screenReaderOptimized: true
    },
    seo: {
      structuredData: { '@type': 'Review', 'itemReviewed': 'ÉLITE SALON' },
      metaTags: { description: 'Luxury premium salon testimonials' }
    },
    performance: {
      lazyLoad: true,
      criticalCSS: '.testimonials-luxury { padding: 6rem 0; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); }',
      optimizedImages: true
    }
  },
  metadata: {
    model: 'claude-3-sonnet',
    prompt: `Modify luxury premium salon testimonials: ${suggestion}`,
    reasoning,
    confidence: 95,
    processingTime: 1400,
    alternatives: [],
    tags: ['luxury', 'premium', 'elegant', 'sophisticated', 'testimonials']
  },
  feedback: {
    requestFeedback: true,
    improvementSuggestions: ['Consider adding video testimonials', 'Include celebrity endorsements']
  }
})

export const testimonialsResponses = {
  'make-them-more-compelling': createLuxuryTestimonials(
    'luxury-premium-testimonials-compelling',
    'Make them more compelling',
    'Enhanced testimonials with high-profile client endorsements, sophisticated presentation, and compelling narratives that showcase transformation stories and exclusive experiences. Added prestige indicators and emotional depth.',
    `
    <section class="testimonials-luxury-compelling" data-section-type="testimonials">
      <div class="testimonials-container">
        <div class="testimonials-header">
          <div class="header-accent">
            <div class="accent-line"></div>
            <span class="accent-icon">♛</span>
            <div class="accent-line"></div>
          </div>
          <h2 class="testimonials-title">DISTINGUISHED ENDORSEMENTS</h2>
          <p class="testimonials-subtitle">Transformative experiences celebrated by society's most discerning</p>
        </div>

        <div class="testimonials-featured">
          <div class="featured-testimonial">
            <div class="testimonial-content">
              <div class="quote-ornament">
                <span class="quote-icon">"</span>
                <div class="ornament-flourish">❦</div>
              </div>
              <p class="testimonial-text">
                "After 20 years in the entertainment industry, I thought I had experienced the pinnacle of luxury service. 
                ÉLITE SALON redefined my understanding of excellence. My stylist didn't just transform my appearance—they 
                elevated my entire presence. The precision, artistry, and attention to detail is simply unparalleled."
              </p>
              <div class="testimonial-author-featured">
                <div class="author-portrait">
                  <div class="portrait-initials">MS</div>
                  <div class="portrait-crown">♛</div>
                </div>
                <div class="author-details">
                  <h4 class="author-name">Margot Sinclair</h4>
                  <p class="author-title">Academy Award-Winning Actress</p>
                  <div class="author-credentials">
                    <span class="credential">✦ Red Carpet Icon</span>
                    <span class="credential">✦ Global Style Ambassador</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="testimonial-impact">
              <div class="impact-badge">
                <span class="impact-text">TRANSFORMATION ACHIEVED</span>
                <div class="impact-stats">
                  <div class="stat">
                    <span class="stat-number">3</span>
                    <span class="stat-label">Cover Shoots</span>
                  </div>
                  <div class="stat">
                    <span class="stat-number">15+</span>
                    <span class="stat-label">Awards Galas</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="testimonials-grid">
          <div class="testimonial-card premium">
            <div class="card-header">
              <div class="client-avatar">CE</div>
              <div class="client-info">
                <h4 class="client-name">Catherine Everhart</h4>
                <p class="client-title">CEO, Fortune 500 Company</p>
                <div class="client-rating">★★★★★</div>
              </div>
            </div>
            <p class="testimonial-quote">
              "In boardrooms across three continents, confidence is everything. My master stylist at ÉLITE 
              understands the power of impeccable presentation. Every cut is strategic, every color choice deliberate."
            </p>
            <div class="testimonial-achievement">
              <span class="achievement-text">Promoted to Global CEO within 6 months</span>
            </div>
          </div>

          <div class="testimonial-card premium">
            <div class="card-header">
              <div class="client-avatar">VR</div>
              <div class="client-info">
                <h4 class="client-name">Victoria Richmond</h4>
                <p class="client-title">International Art Curator</p>
                <div class="client-rating">★★★★★</div>
              </div>
            </div>
            <p class="testimonial-quote">
              "As someone who curates beauty for the world's most prestigious galleries, I demand perfection. 
              ÉLITE's artistry rivals the masterpieces I showcase. Pure sophistication."
            </p>
            <div class="testimonial-achievement">
              <span class="achievement-text">Featured in Vogue's "Power Women" edition</span>
            </div>
          </div>

          <div class="testimonial-card premium">
            <div class="card-header">
              <div class="client-avatar">JM</div>
              <div class="client-info">
                <h4 class="client-name">Dr. Jonathan Marseille</h4>
                <p class="client-title">Luxury Brand Consultant</p>
                <div class="client-rating">★★★★★</div>
              </div>
            </div>
            <p class="testimonial-quote">
              "I advise the world's most exclusive brands on luxury experiences. ÉLITE doesn't just meet luxury 
              standards—they define them. Absolutely extraordinary in every detail."
            </p>
            <div class="testimonial-achievement">
              <span class="achievement-text">Authored "The Future of Luxury" bestseller</span>
            </div>
          </div>
        </div>

        <div class="testimonials-credentials">
          <div class="credentials-grid">
            <div class="credential-item">
              <span class="credential-number">98%</span>
              <span class="credential-text">Client Retention Rate</span>
            </div>
            <div class="credential-item">
              <span class="credential-number">500+</span>
              <span class="credential-text">Distinguished Members</span>
            </div>
            <div class="credential-item">
              <span class="credential-number">25+</span>
              <span class="credential-text">Industry Awards</span>
            </div>
            <div class="credential-item">
              <span class="credential-number">40+</span>
              <span class="credential-text">Celebrity Clientele</span>
            </div>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .testimonials-luxury-compelling {
      padding: 6rem 0;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #ffffff;
      position: relative;
    }

    .testimonials-luxury-compelling::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="0.5" fill="%23d4af37" opacity="0.1"/></svg>') repeat;
      background-size: 120px 120px;
    }

    .testimonials-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      position: relative;
      z-index: 1;
    }

    .testimonials-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .header-accent {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .accent-line {
      width: 100px;
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, #d4af37 50%, transparent 100%);
    }

    .accent-icon {
      font-size: 1.75rem;
      color: #d4af37;
      text-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
    }

    .testimonials-title {
      font-size: 3.25rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      letter-spacing: 3px;
      margin-bottom: 1rem;
    }

    .testimonials-subtitle {
      font-size: 1.125rem;
      color: #d4af37;
      font-style: italic;
      max-width: 700px;
      margin: 0 auto;
      line-height: 1.6;
    }

    .testimonials-featured {
      margin-bottom: 4rem;
    }

    .featured-testimonial {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 1.5rem;
      padding: 3rem;
      border: 2px solid rgba(212, 175, 55, 0.3);
      backdrop-filter: blur(20px);
      box-shadow: 0 30px 80px rgba(212, 175, 55, 0.1);
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 3rem;
      align-items: center;
    }

    .testimonial-content {
      position: relative;
    }

    .quote-ornament {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .quote-icon {
      font-size: 4rem;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      opacity: 0.7;
    }

    .ornament-flourish {
      font-size: 1.5rem;
      color: #d4af37;
      opacity: 0.6;
    }

    .testimonial-text {
      font-size: 1.375rem;
      color: #ffffff;
      line-height: 1.8;
      font-style: italic;
      margin-bottom: 2.5rem;
      font-weight: 300;
    }

    .testimonial-author-featured {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .author-portrait {
      position: relative;
      flex-shrink: 0;
    }

    .portrait-initials {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.5rem;
      font-family: 'Playfair Display', serif;
      border: 3px solid rgba(212, 175, 55, 0.5);
    }

    .portrait-crown {
      position: absolute;
      top: -8px;
      right: -8px;
      background: #1a1a1a;
      color: #d4af37;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.875rem;
      border: 2px solid #d4af37;
    }

    .author-details {
      flex: 1;
    }

    .author-name {
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.5rem;
    }

    .author-title {
      font-size: 1rem;
      color: #d4af37;
      margin-bottom: 1rem;
      font-weight: 500;
    }

    .author-credentials {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .credential {
      font-size: 0.875rem;
      color: #cccccc;
      font-weight: 500;
    }

    .testimonial-impact {
      text-align: center;
    }

    .impact-badge {
      background: rgba(212, 175, 55, 0.1);
      border: 1px solid rgba(212, 175, 55, 0.3);
      border-radius: 1rem;
      padding: 2rem;
    }

    .impact-text {
      display: block;
      font-size: 0.875rem;
      color: #d4af37;
      font-weight: 700;
      letter-spacing: 2px;
      margin-bottom: 1.5rem;
    }

    .impact-stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
    }

    .stat {
      text-align: center;
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
      font-size: 0.75rem;
      color: #cccccc;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .testimonials-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 2rem;
      margin-bottom: 4rem;
    }

    .testimonial-card {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 1rem;
      padding: 2.5rem;
      border: 1px solid rgba(212, 175, 55, 0.2);
      backdrop-filter: blur(10px);
      transition: all 0.4s ease;
    }

    .testimonial-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 20px 60px rgba(212, 175, 55, 0.15);
      border-color: rgba(212, 175, 55, 0.4);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid rgba(212, 175, 55, 0.2);
    }

    .client-avatar {
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.125rem;
      font-family: 'Playfair Display', serif;
      flex-shrink: 0;
    }

    .client-info {
      flex: 1;
    }

    .client-name {
      font-size: 1.125rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.25rem;
    }

    .client-title {
      font-size: 0.875rem;
      color: #d4af37;
      margin-bottom: 0.75rem;
      font-weight: 500;
    }

    .client-rating {
      color: #d4af37;
      font-size: 0.875rem;
      letter-spacing: 2px;
    }

    .testimonial-quote {
      font-size: 1rem;
      color: #cccccc;
      line-height: 1.7;
      font-style: italic;
      margin-bottom: 1.5rem;
    }

    .testimonial-achievement {
      background: rgba(212, 175, 55, 0.1);
      border-radius: 0.5rem;
      padding: 1rem;
      border-left: 3px solid #d4af37;
    }

    .achievement-text {
      font-size: 0.875rem;
      color: #d4af37;
      font-weight: 600;
      font-style: italic;
    }

    .testimonials-credentials {
      background: rgba(212, 175, 55, 0.1);
      border-radius: 1rem;
      padding: 3rem 2rem;
      border: 1px solid rgba(212, 175, 55, 0.3);
    }

    .credentials-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 2rem;
      text-align: center;
    }

    .credential-item {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .credential-number {
      font-size: 2.5rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.5rem;
    }

    .credential-text {
      font-size: 0.875rem;
      color: #cccccc;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    @media (max-width: 1024px) {
      .featured-testimonial {
        grid-template-columns: 1fr;
        gap: 2rem;
      }
      .impact-stats {
        flex-direction: column;
        gap: 1rem;
      }
    }

    @media (max-width: 768px) {
      .testimonials-title { font-size: 2.5rem; }
      .testimonials-grid { grid-template-columns: 1fr; }
      .featured-testimonial { padding: 2rem; }
      .credentials-grid { grid-template-columns: repeat(2, 1fr); }
    }
    `,
    {
      sectionTitle: 'DISTINGUISHED ENDORSEMENTS',
      subtitle: 'Transformative experiences celebrated by society\'s most discerning',
      featuredTestimonial: {
        text: 'After 20 years in the entertainment industry, I thought I had experienced the pinnacle of luxury service. ÉLITE SALON redefined my understanding of excellence. My stylist didn\'t just transform my appearance—they elevated my entire presence. The precision, artistry, and attention to detail is simply unparalleled.',
        author: 'Margot Sinclair',
        title: 'Academy Award-Winning Actress',
        avatar: 'MS',
        credentials: ['Red Carpet Icon', 'Global Style Ambassador'],
        impact: {
          coverShoots: 3,
          awardGalas: '15+'
        }
      },
      testimonials: [
        {
          author: 'Catherine Everhart',
          title: 'CEO, Fortune 500 Company',
          avatar: 'CE',
          rating: 5,
          quote: 'In boardrooms across three continents, confidence is everything. My master stylist at ÉLITE understands the power of impeccable presentation. Every cut is strategic, every color choice deliberate.',
          achievement: 'Promoted to Global CEO within 6 months'
        },
        {
          author: 'Victoria Richmond',
          title: 'International Art Curator',
          avatar: 'VR',
          rating: 5,
          quote: 'As someone who curates beauty for the world\'s most prestigious galleries, I demand perfection. ÉLITE\'s artistry rivals the masterpieces I showcase. Pure sophistication.',
          achievement: 'Featured in Vogue\'s "Power Women" edition'
        },
        {
          author: 'Dr. Jonathan Marseille',
          title: 'Luxury Brand Consultant',
          avatar: 'JM',
          rating: 5,
          quote: 'I advise the world\'s most exclusive brands on luxury experiences. ÉLITE doesn\'t just meet luxury standards—they define them. Absolutely extraordinary in every detail.',
          achievement: 'Authored "The Future of Luxury" bestseller'
        }
      ],
      credentials: [
        { number: '98%', text: 'Client Retention Rate' },
        { number: '500+', text: 'Distinguished Members' },
        { number: '25+', text: 'Industry Awards' },
        { number: '40+', text: 'Celebrity Clientele' }
      ]
    }
  ),

  'add-star-ratings': createLuxuryTestimonials(
    'luxury-premium-testimonials-ratings',
    'Add star ratings',
    'Enhanced testimonials with sophisticated rating system, featuring gold star displays, rating averages, and prestige indicators. Integrated exclusive membership ratings and VIP client feedback scores.',
    `
    <section class="testimonials-luxury-ratings" data-section-type="testimonials">
      <div class="testimonials-container">
        <div class="testimonials-header">
          <h2 class="testimonials-title">EXCELLENCE VERIFIED</h2>
          <div class="header-rating-showcase">
            <div class="overall-rating">
              <span class="rating-number">4.98</span>
              <div class="rating-stars">★★★★★</div>
              <span class="rating-text">Platinum Standard Excellence</span>
            </div>
            <div class="rating-breakdown">
              <div class="breakdown-item">
                <span class="breakdown-label">Service Excellence</span>
                <div class="breakdown-stars">★★★★★</div>
                <span class="breakdown-score">5.0</span>
              </div>
              <div class="breakdown-item">
                <span class="breakdown-label">Artistry Mastery</span>
                <div class="breakdown-stars">★★★★★</div>
                <span class="breakdown-score">4.9</span>
              </div>
              <div class="breakdown-item">
                <span class="breakdown-label">Luxury Experience</span>
                <div class="breakdown-stars">★★★★★</div>
                <span class="breakdown-score">5.0</span>
              </div>
            </div>
          </div>
        </div>

        <div class="testimonials-featured-rating">
          <div class="featured-card">
            <div class="card-rating-header">
              <div class="vip-badge">
                <span class="vip-icon">♛</span>
                <span class="vip-text">VIP MEMBER</span>
              </div>
              <div class="rating-display">
                <div class="stars-large">★★★★★</div>
                <span class="rating-score">5.0</span>
              </div>
            </div>
            <p class="featured-quote">
              "Exceptional artistry that transcends expectations. Every visit is a masterpiece experience 
              that redefines luxury standards. The attention to detail is absolutely extraordinary."
            </p>
            <div class="featured-author">
              <div class="author-avatar-premium">
                <span class="avatar-initial">ES</span>
                <div class="avatar-crown">♛</div>
              </div>
              <div class="author-info">
                <h4 class="author-name">Elizabeth Sterling</h4>
                <p class="author-title">International Fashion Editor</p>
                <div class="author-membership">
                  <span class="membership-tier">Platinum Élite Member</span>
                  <span class="membership-duration">• 3 Years</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="testimonials-grid-ratings">
          <div class="testimonial-card-rated">
            <div class="card-rating-top">
              <div class="client-stars">★★★★★</div>
              <span class="client-score">5.0</span>
            </div>
            <div class="card-content">
              <p class="testimonial-text">
                "Precision and elegance in every cut. My master stylist understands exactly 
                what I need to command presence in any boardroom."
              </p>
              <div class="client-profile">
                <div class="client-avatar">CE</div>
                <div class="client-details">
                  <h5 class="client-name">Catherine E.</h5>
                  <p class="client-role">Fortune 500 CEO</p>
                  <div class="client-ratings-breakdown">
                    <div class="rating-category">
                      <span class="category-name">Style</span>
                      <div class="category-stars">★★★★★</div>
                    </div>
                    <div class="rating-category">
                      <span class="category-name">Service</span>
                      <div class="category-stars">★★★★★</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="testimonial-card-rated">
            <div class="card-rating-top">
              <div class="client-stars">★★★★★</div>
              <span class="client-score">4.9</span>
            </div>
            <div class="card-content">
              <p class="testimonial-text">
                "Transformative experience that elevated my confidence. The diamond treatment 
                results exceeded every expectation I had."
              </p>
              <div class="client-profile">
                <div class="client-avatar">VR</div>
                <div class="client-details">
                  <h5 class="client-name">Victoria R.</h5>
                  <p class="client-role">Art Gallery Director</p>
                  <div class="client-ratings-breakdown">
                    <div class="rating-category">
                      <span class="category-name">Treatment</span>
                      <div class="category-stars">★★★★★</div>
                    </div>
                    <div class="rating-category">
                      <span class="category-name">Results</span>
                      <div class="category-stars">★★★★☆</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="testimonial-card-rated">
            <div class="card-rating-top">
              <div class="client-stars">★★★★★</div>
              <span class="client-score">5.0</span>
            </div>
            <div class="card-content">
              <p class="testimonial-text">
                "Private suite experience is unmatched. Every detail curated for perfection. 
                This defines what luxury service should be."
              </p>
              <div class="client-profile">
                <div class="client-avatar">JM</div>
                <div class="client-details">
                  <h5 class="client-name">Jonathan M.</h5>
                  <p class="client-role">Luxury Consultant</p>
                  <div class="client-ratings-breakdown">
                    <div class="rating-category">
                      <span class="category-name">Ambiance</span>
                      <div class="category-stars">★★★★★</div>
                    </div>
                    <div class="rating-category">
                      <span class="category-name">Excellence</span>
                      <div class="category-stars">★★★★★</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="ratings-summary">
          <div class="summary-stats">
            <div class="stat-item">
              <span class="stat-number">500+</span>
              <div class="stat-stars">★★★★★</div>
              <span class="stat-label">Five-Star Reviews</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-number">98%</span>
              <div class="stat-stars">★★★★★</div>
              <span class="stat-label">Satisfaction Rate</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-number">#1</span>
              <div class="stat-stars">★★★★★</div>
              <span class="stat-label">Luxury Salon Rating</span>
            </div>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .testimonials-luxury-ratings {
      padding: 6rem 0;
      background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%);
    }

    .testimonials-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
    }

    .testimonials-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .testimonials-title {
      font-size: 3rem;
      font-weight: 700;
      color: #2d2d2d;
      font-family: 'Playfair Display', serif;
      letter-spacing: 3px;
      margin-bottom: 2rem;
    }

    .header-rating-showcase {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 4rem;
      flex-wrap: wrap;
    }

    .overall-rating {
      text-align: center;
    }

    .rating-number {
      display: block;
      font-size: 3rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.5rem;
    }

    .rating-stars {
      font-size: 1.5rem;
      color: #d4af37;
      margin-bottom: 0.5rem;
      letter-spacing: 2px;
    }

    .rating-text {
      font-size: 0.875rem;
      color: #666666;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .rating-breakdown {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .breakdown-item {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .breakdown-label {
      font-size: 0.875rem;
      color: #666666;
      min-width: 120px;
      text-align: left;
    }

    .breakdown-stars {
      color: #d4af37;
      font-size: 0.875rem;
      letter-spacing: 1px;
    }

    .breakdown-score {
      font-size: 0.875rem;
      color: #d4af37;
      font-weight: 700;
      min-width: 30px;
    }

    .testimonials-featured-rating {
      margin-bottom: 3rem;
    }

    .featured-card {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 1.5rem;
      padding: 3rem;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.1);
      border: 2px solid rgba(212, 175, 55, 0.3);
      text-align: center;
    }

    .card-rating-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .vip-badge {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 0.75rem;
      letter-spacing: 1px;
    }

    .vip-icon {
      font-size: 1rem;
    }

    .rating-display {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .stars-large {
      font-size: 1.5rem;
      color: #d4af37;
      letter-spacing: 2px;
    }

    .rating-score {
      font-size: 1.25rem;
      font-weight: 700;
      color: #d4af37;
    }

    .featured-quote {
      font-size: 1.25rem;
      color: #555555;
      line-height: 1.7;
      font-style: italic;
      margin-bottom: 2rem;
      max-width: 800px;
      margin-left: auto;
      margin-right: auto;
    }

    .featured-author {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 2rem;
    }

    .author-avatar-premium {
      position: relative;
      flex-shrink: 0;
    }

    .avatar-initial {
      width: 70px;
      height: 70px;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.25rem;
      font-family: 'Playfair Display', serif;
      border: 3px solid rgba(212, 175, 55, 0.5);
    }

    .avatar-crown {
      position: absolute;
      top: -6px;
      right: -6px;
      background: #f8f6f3;
      color: #d4af37;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      border: 2px solid #d4af37;
    }

    .author-info {
      text-align: left;
    }

    .author-name {
      font-size: 1.25rem;
      font-weight: 700;
      color: #2d2d2d;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.25rem;
    }

    .author-title {
      font-size: 0.95rem;
      color: #666666;
      margin-bottom: 0.5rem;
    }

    .author-membership {
      display: flex;
      align-items: center;
      font-size: 0.8rem;
      color: #d4af37;
      font-weight: 600;
    }

    .testimonials-grid-ratings {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 2rem;
      margin-bottom: 3rem;
    }

    .testimonial-card-rated {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 1rem;
      padding: 2rem;
      box-shadow: 0 15px 40px rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(212, 175, 55, 0.2);
      transition: all 0.3s ease;
    }

    .testimonial-card-rated:hover {
      transform: translateY(-5px);
      box-shadow: 0 25px 60px rgba(212, 175, 55, 0.15);
    }

    .card-rating-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(212, 175, 55, 0.2);
    }

    .client-stars {
      color: #d4af37;
      font-size: 1rem;
      letter-spacing: 1px;
    }

    .client-score {
      font-size: 1.125rem;
      font-weight: 700;
      color: #d4af37;
    }

    .testimonial-text {
      font-size: 0.95rem;
      color: #555555;
      line-height: 1.7;
      font-style: italic;
      margin-bottom: 1.5rem;
    }

    .client-profile {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .client-avatar {
      width: 50px;
      height: 50px;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1rem;
      font-family: 'Playfair Display', serif;
      flex-shrink: 0;
    }

    .client-details {
      flex: 1;
    }

    .client-name {
      font-size: 1rem;
      font-weight: 700;
      color: #2d2d2d;
      margin-bottom: 0.25rem;
    }

    .client-role {
      font-size: 0.8rem;
      color: #666666;
      margin-bottom: 0.75rem;
    }

    .client-ratings-breakdown {
      display: flex;
      gap: 1.5rem;
    }

    .rating-category {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .category-name {
      font-size: 0.7rem;
      color: #888888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .category-stars {
      color: #d4af37;
      font-size: 0.75rem;
      letter-spacing: 1px;
    }

    .ratings-summary {
      background: rgba(212, 175, 55, 0.1);
      border-radius: 1rem;
      padding: 3rem 2rem;
      border: 1px solid rgba(212, 175, 55, 0.3);
    }

    .summary-stats {
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

    .stat-stars {
      color: #d4af37;
      font-size: 1rem;
      margin-bottom: 0.5rem;
      letter-spacing: 1px;
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
      height: 80px;
      background: linear-gradient(180deg, transparent 0%, #d4af37 50%, transparent 100%);
    }

    @media (max-width: 1024px) {
      .header-rating-showcase {
        flex-direction: column;
        gap: 2rem;
      }
      .featured-author {
        flex-direction: column;
        text-align: center;
      }
      .author-info {
        text-align: center;
      }
    }

    @media (max-width: 768px) {
      .testimonials-title { font-size: 2rem; }
      .testimonials-grid-ratings { grid-template-columns: 1fr; }
      .summary-stats { flex-direction: column; gap: 2rem; }
      .stat-divider { display: none; }
      .client-ratings-breakdown { flex-direction: column; gap: 0.5rem; }
    }
    `,
    {
      sectionTitle: 'EXCELLENCE VERIFIED',
      overallRating: {
        score: 4.98,
        text: 'Platinum Standard Excellence',
        breakdown: [
          { category: 'Service Excellence', score: 5.0 },
          { category: 'Artistry Mastery', score: 4.9 },
          { category: 'Luxury Experience', score: 5.0 }
        ]
      },
      featuredTestimonial: {
        rating: 5.0,
        quote: 'Exceptional artistry that transcends expectations. Every visit is a masterpiece experience that redefines luxury standards. The attention to detail is absolutely extraordinary.',
        author: 'Elizabeth Sterling',
        title: 'International Fashion Editor',
        avatar: 'ES',
        membership: 'Platinum Élite Member',
        duration: '3 Years',
        isVip: true
      },
      testimonials: [
        {
          rating: 5.0,
          quote: 'Precision and elegance in every cut. My master stylist understands exactly what I need to command presence in any boardroom.',
          author: 'Catherine E.',
          title: 'Fortune 500 CEO',
          avatar: 'CE',
          categoryRatings: [
            { category: 'Style', rating: 5 },
            { category: 'Service', rating: 5 }
          ]
        },
        {
          rating: 4.9,
          quote: 'Transformative experience that elevated my confidence. The diamond treatment results exceeded every expectation I had.',
          author: 'Victoria R.',
          title: 'Art Gallery Director',
          avatar: 'VR',
          categoryRatings: [
            { category: 'Treatment', rating: 5 },
            { category: 'Results', rating: 4 }
          ]
        },
        {
          rating: 5.0,
          quote: 'Private suite experience is unmatched. Every detail curated for perfection. This defines what luxury service should be.',
          author: 'Jonathan M.',
          title: 'Luxury Consultant',
          avatar: 'JM',
          categoryRatings: [
            { category: 'Ambiance', rating: 5 },
            { category: 'Excellence', rating: 5 }
          ]
        }
      ],
      summary: [
        { number: '500+', label: 'Five-Star Reviews' },
        { number: '98%', label: 'Satisfaction Rate' },
        { number: '#1', label: 'Luxury Salon Rating' }
      ]
    }
  ),

  'include-more-reviews': createLuxuryTestimonials(
    'luxury-premium-testimonials-reviews',
    'Include more reviews',
    'Expanded testimonials section with comprehensive client reviews, featuring diverse luxury clientele experiences, detailed feedback, and sophisticated review presentation that showcases the breadth of elite satisfaction.',
    `
    <section class="testimonials-luxury-reviews" data-section-type="testimonials">
      <div class="testimonials-container">
        <div class="testimonials-header">
          <h2 class="testimonials-title">DISTINGUISHED CLIENTELE</h2>
          <p class="testimonials-subtitle">Comprehensive excellence validated by society's most discerning members</p>
          <div class="reviews-summary">
            <div class="summary-item">
              <span class="summary-number">750+</span>
              <span class="summary-label">Elite Reviews</span>
            </div>
            <div class="summary-item">
              <span class="summary-number">4.98</span>
              <span class="summary-label">Average Rating</span>
            </div>
            <div class="summary-item">
              <span class="summary-number">100%</span>
              <span class="summary-label">Would Recommend</span>
            </div>
          </div>
        </div>

        <div class="reviews-showcase">
          <div class="reviews-grid-expanded">
            <div class="review-card executive">
              <div class="review-header">
                <div class="reviewer-badge">
                  <span class="badge-icon">👑</span>
                  <span class="badge-text">EXECUTIVE MEMBER</span>
                </div>
                <div class="review-rating">★★★★★</div>
              </div>
              <p class="review-text">
                "Twenty-five years in corporate leadership taught me to recognize true excellence. 
                ÉLITE's precision, attention to detail, and sophisticated service consistently 
                exceed my highest expectations. Absolutely impeccable."
              </p>
              <div class="reviewer-info">
                <div class="reviewer-avatar">AW</div>
                <div class="reviewer-details">
                  <h5 class="reviewer-name">Alexander Windsor</h5>
                  <p class="reviewer-title">Global Investment Director</p>
                  <p class="reviewer-location">New York • 4 years member</p>
                </div>
              </div>
            </div>

            <div class="review-card celebrity">
              <div class="review-header">
                <div class="reviewer-badge">
                  <span class="badge-icon">⭐</span>
                  <span class="badge-text">CELEBRITY CLIENT</span>
                </div>
                <div class="review-rating">★★★★★</div>
              </div>
              <p class="review-text">
                "Red carpet ready, every single time. My stylist understands the artistry needed 
                for high-stakes appearances. The transformative results speak for themselves."
              </p>
              <div class="reviewer-info">
                <div class="reviewer-avatar">LM</div>
                <div class="reviewer-details">
                  <h5 class="reviewer-name">Luna Martinez</h5>
                  <p class="reviewer-title">International Recording Artist</p>
                  <p class="reviewer-location">Los Angeles • VIP Suite Access</p>
                </div>
              </div>
            </div>

            <div class="review-card diplomat">
              <div class="review-header">
                <div class="reviewer-badge">
                  <span class="badge-icon">🏛️</span>
                  <span class="badge-text">DIPLOMATIC ELITE</span>
                </div>
                <div class="review-rating">★★★★★</div>
              </div>
              <p class="review-text">
                "International presence requires impeccable presentation. ÉLITE's sophisticated 
                approach and cultural sensitivity make them invaluable for my diplomatic obligations."
              </p>
              <div class="reviewer-info">
                <div class="reviewer-avatar">HS</div>
                <div class="reviewer-details">
                  <h5 class="reviewer-name">Helena Sinclair</h5>
                  <p class="reviewer-title">Ambassador to the United Nations</p>
                  <p class="reviewer-location">Geneva • Platinum Priority</p>
                </div>
              </div>
            </div>

            <div class="review-card royalty">
              <div class="review-header">
                <div class="reviewer-badge">
                  <span class="badge-icon">♛</span>
                  <span class="badge-text">ROYAL PATRONAGE</span>
                </div>
                <div class="review-rating">★★★★★</div>
              </div>
              <p class="review-text">
                "Discretion, excellence, and royal treatment in every detail. The private sanctuary 
                experience maintains the standards befitting nobility while delivering artistic mastery."
              </p>
              <div class="reviewer-info">
                <div class="reviewer-avatar">CM</div>
                <div class="reviewer-details">
                  <h5 class="reviewer-name">Countess Marguerite</h5>
                  <p class="reviewer-title">European Aristocracy</p>
                  <p class="reviewer-location">Monaco • Royal Suite Exclusive</p>
                </div>
              </div>
            </div>

            <div class="review-card fashion">
              <div class="review-header">
                <div class="reviewer-badge">
                  <span class="badge-icon">✨</span>
                  <span class="badge-text">FASHION ICON</span>
                </div>
                <div class="review-rating">★★★★★</div>
              </div>
              <p class="review-text">
                "Trendsetting artistry that influences global fashion. My sessions here inspire 
                entire collections. The innovation and precision are simply extraordinary."
              </p>
              <div class="reviewer-info">
                <div class="reviewer-avatar">ZR</div>
                <div class="reviewer-details">
                  <h5 class="reviewer-name">Zara Romano</h5>
                  <p class="reviewer-title">Chief Creative Director, LUXE Fashion House</p>
                  <p class="reviewer-location">Milan • Master Artisan Program</p>
                </div>
              </div>
            </div>

            <div class="review-card entrepreneur">
              <div class="review-header">
                <div class="reviewer-badge">
                  <span class="badge-icon">💎</span>
                  <span class="badge-text">TECH MOGUL</span>
                </div>
                <div class="review-rating">★★★★★</div>
              </div>
              <p class="review-text">
                "Innovation meets tradition in the most remarkable way. The technical precision 
                combined with artistic vision creates results that enhance my professional presence."
              </p>
              <div class="reviewer-info">
                <div class="reviewer-avatar">DB</div>
                <div class="reviewer-details">
                  <h5 class="reviewer-name">Dr. Benjamin Chang</h5>
                  <p class="reviewer-title">Tech Entrepreneur & Venture Capitalist</p>
                  <p class="reviewer-location">Silicon Valley • Innovation Tier</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="reviews-categories">
          <h3 class="categories-title">Excellence Across All Services</h3>
          <div class="categories-grid">
            <div class="category-showcase">
              <h4 class="category-name">Master Styling</h4>
              <div class="category-rating">
                <div class="rating-stars">★★★★★</div>
                <span class="rating-score">4.99</span>
              </div>
              <p class="category-feedback">"Precision artistry that transforms vision into reality"</p>
              <span class="review-count">250+ reviews</span>
            </div>
            <div class="category-showcase">
              <h4 class="category-name">Diamond Treatments</h4>
              <div class="category-rating">
                <div class="rating-stars">★★★★★</div>
                <span class="rating-score">4.97</span>
              </div>
              <p class="category-feedback">"Rejuvenating experiences beyond expectation"</p>
              <span class="review-count">180+ reviews</span>
            </div>
            <div class="category-showcase">
              <h4 class="category-name">Private Suites</h4>
              <div class="category-rating">
                <div class="rating-stars">★★★★★</div>
                <span class="rating-score">5.00</span>
              </div>
              <p class="category-feedback">"Unparalleled luxury and personal attention"</p>
              <span class="review-count">320+ reviews</span>
            </div>
          </div>
        </div>

        <div class="reviews-testimonial-wall">
          <h3 class="wall-title">What Our Distinguished Members Say</h3>
          <div class="testimonial-highlights">
            <div class="highlight-quote">"Absolute perfection"</div>
            <div class="highlight-quote">"Transforms confidence"</div>
            <div class="highlight-quote">"Unmatched artistry"</div>
            <div class="highlight-quote">"Exceeds every expectation"</div>
            <div class="highlight-quote">"Redefines luxury standards"</div>
            <div class="highlight-quote">"Masterpiece experience"</div>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .testimonials-luxury-reviews {
      padding: 6rem 0;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #ffffff;
    }

    .testimonials-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
    }

    .testimonials-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .testimonials-title {
      font-size: 3rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      letter-spacing: 3px;
      margin-bottom: 1rem;
    }

    .testimonials-subtitle {
      font-size: 1.125rem;
      color: #d4af37;
      font-style: italic;
      max-width: 700px;
      margin: 0 auto 2rem;
      line-height: 1.6;
    }

    .reviews-summary {
      display: flex;
      justify-content: center;
      gap: 3rem;
      flex-wrap: wrap;
    }

    .summary-item {
      text-align: center;
    }

    .summary-number {
      display: block;
      font-size: 2.5rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.5rem;
    }

    .summary-label {
      font-size: 0.875rem;
      color: #cccccc;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .reviews-showcase {
      margin-bottom: 4rem;
    }

    .reviews-grid-expanded {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 2rem;
    }

    .review-card {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 1rem;
      padding: 2.5rem;
      border: 1px solid rgba(212, 175, 55, 0.2);
      backdrop-filter: blur(10px);
      transition: all 0.4s ease;
      position: relative;
    }

    .review-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 20px 60px rgba(212, 175, 55, 0.15);
      border-color: rgba(212, 175, 55, 0.4);
    }

    .review-card.executive { border-left: 4px solid #d4af37; }
    .review-card.celebrity { border-left: 4px solid #ff6b6b; }
    .review-card.diplomat { border-left: 4px solid #4ecdc4; }
    .review-card.royalty { border-left: 4px solid #9b59b6; }
    .review-card.fashion { border-left: 4px solid #f39c12; }
    .review-card.entrepreneur { border-left: 4px solid #2ecc71; }

    .review-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .reviewer-badge {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(212, 175, 55, 0.2);
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      border: 1px solid rgba(212, 175, 55, 0.3);
    }

    .badge-icon {
      font-size: 0.875rem;
    }

    .badge-text {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 1px;
      color: #d4af37;
    }

    .review-rating {
      color: #d4af37;
      font-size: 1rem;
      letter-spacing: 1px;
    }

    .review-text {
      font-size: 1rem;
      color: #cccccc;
      line-height: 1.7;
      font-style: italic;
      margin-bottom: 2rem;
    }

    .reviewer-info {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .reviewer-avatar {
      width: 55px;
      height: 55px;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.125rem;
      font-family: 'Playfair Display', serif;
      flex-shrink: 0;
    }

    .reviewer-details {
      flex: 1;
    }

    .reviewer-name {
      font-size: 1.125rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.25rem;
    }

    .reviewer-title {
      font-size: 0.875rem;
      color: #d4af37;
      margin-bottom: 0.25rem;
      font-weight: 500;
    }

    .reviewer-location {
      font-size: 0.8rem;
      color: #888888;
    }

    .reviews-categories {
      margin-bottom: 4rem;
      text-align: center;
    }

    .categories-title {
      font-size: 2rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      margin-bottom: 2rem;
    }

    .categories-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
    }

    .category-showcase {
      background: rgba(212, 175, 55, 0.1);
      border-radius: 1rem;
      padding: 2rem;
      border: 1px solid rgba(212, 175, 55, 0.3);
    }

    .category-name {
      font-size: 1.25rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      margin-bottom: 1rem;
    }

    .category-rating {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .rating-stars {
      color: #d4af37;
      font-size: 1.125rem;
      letter-spacing: 1px;
    }

    .rating-score {
      font-size: 1.25rem;
      font-weight: 700;
      color: #d4af37;
    }

    .category-feedback {
      font-size: 0.95rem;
      color: #cccccc;
      font-style: italic;
      margin-bottom: 1rem;
      line-height: 1.5;
    }

    .review-count {
      font-size: 0.8rem;
      color: #888888;
      font-weight: 600;
    }

    .reviews-testimonial-wall {
      text-align: center;
    }

    .wall-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: #ffffff;
      font-family: 'Playfair Display', serif;
      margin-bottom: 2rem;
    }

    .testimonial-highlights {
      display: flex;
      justify-content: center;
      gap: 2rem;
      flex-wrap: wrap;
    }

    .highlight-quote {
      background: rgba(212, 175, 55, 0.2);
      color: #d4af37;
      padding: 1rem 2rem;
      border-radius: 2rem;
      font-size: 0.95rem;
      font-weight: 600;
      font-style: italic;
      border: 1px solid rgba(212, 175, 55, 0.3);
      transition: all 0.3s ease;
    }

    .highlight-quote:hover {
      background: rgba(212, 175, 55, 0.3);
      transform: translateY(-2px);
    }

    @media (max-width: 1024px) {
      .reviews-grid-expanded {
        grid-template-columns: 1fr;
      }
      .reviews-summary {
        flex-direction: column;
        gap: 1.5rem;
      }
    }

    @media (max-width: 768px) {
      .testimonials-title { font-size: 2rem; }
      .review-card { padding: 2rem 1.5rem; }
      .reviewer-info { flex-direction: column; text-align: center; }
      .testimonial-highlights { flex-direction: column; align-items: center; }
      .highlight-quote { margin-bottom: 1rem; }
    }
    `,
    {
      sectionTitle: 'DISTINGUISHED CLIENTELE',
      subtitle: 'Comprehensive excellence validated by society\'s most discerning members',
      summary: [
        { number: '750+', label: 'Elite Reviews' },
        { number: '4.98', label: 'Average Rating' },
        { number: '100%', label: 'Would Recommend' }
      ],
      reviews: [
        {
          type: 'executive',
          badge: 'EXECUTIVE MEMBER',
          rating: 5,
          text: 'Twenty-five years in corporate leadership taught me to recognize true excellence. ÉLITE\'s precision, attention to detail, and sophisticated service consistently exceed my highest expectations. Absolutely impeccable.',
          author: 'Alexander Windsor',
          title: 'Global Investment Director',
          location: 'New York • 4 years member',
          avatar: 'AW'
        },
        {
          type: 'celebrity',
          badge: 'CELEBRITY CLIENT',
          rating: 5,
          text: 'Red carpet ready, every single time. My stylist understands the artistry needed for high-stakes appearances. The transformative results speak for themselves.',
          author: 'Luna Martinez',
          title: 'International Recording Artist',
          location: 'Los Angeles • VIP Suite Access',
          avatar: 'LM'
        },
        {
          type: 'diplomat',
          badge: 'DIPLOMATIC ELITE',
          rating: 5,
          text: 'International presence requires impeccable presentation. ÉLITE\'s sophisticated approach and cultural sensitivity make them invaluable for my diplomatic obligations.',
          author: 'Helena Sinclair',
          title: 'Ambassador to the United Nations',
          location: 'Geneva • Platinum Priority',
          avatar: 'HS'
        },
        {
          type: 'royalty',
          badge: 'ROYAL PATRONAGE',
          rating: 5,
          text: 'Discretion, excellence, and royal treatment in every detail. The private sanctuary experience maintains the standards befitting nobility while delivering artistic mastery.',
          author: 'Countess Marguerite',
          title: 'European Aristocracy',
          location: 'Monaco • Royal Suite Exclusive',
          avatar: 'CM'
        },
        {
          type: 'fashion',
          badge: 'FASHION ICON',
          rating: 5,
          text: 'Trendsetting artistry that influences global fashion. My sessions here inspire entire collections. The innovation and precision are simply extraordinary.',
          author: 'Zara Romano',
          title: 'Chief Creative Director, LUXE Fashion House',
          location: 'Milan • Master Artisan Program',
          avatar: 'ZR'
        },
        {
          type: 'entrepreneur',
          badge: 'TECH MOGUL',
          rating: 5,
          text: 'Innovation meets tradition in the most remarkable way. The technical precision combined with artistic vision creates results that enhance my professional presence.',
          author: 'Dr. Benjamin Chang',
          title: 'Tech Entrepreneur & Venture Capitalist',
          location: 'Silicon Valley • Innovation Tier',
          avatar: 'DB'
        }
      ],
      serviceCategories: [
        {
          name: 'Master Styling',
          rating: 4.99,
          feedback: 'Precision artistry that transforms vision into reality',
          reviewCount: '250+ reviews'
        },
        {
          name: 'Diamond Treatments',
          rating: 4.97,
          feedback: 'Rejuvenating experiences beyond expectation',
          reviewCount: '180+ reviews'
        },
        {
          name: 'Private Suites',
          rating: 5.00,
          feedback: 'Unparalleled luxury and personal attention',
          reviewCount: '320+ reviews'
        }
      ],
      highlights: [
        'Absolute perfection',
        'Transforms confidence',
        'Unmatched artistry',
        'Exceeds every expectation',
        'Redefines luxury standards',
        'Masterpiece experience'
      ]
    }
  ),

  'change-the-style': createLuxuryTestimonials(
    'luxury-premium-testimonials-style',
    'Change the style',
    'Redesigned testimonials with sophisticated asymmetrical layout, premium visual hierarchy, and elegant presentation. Created distinctive design elements with refined typography, luxury spacing, and sophisticated visual flow.',
    `
    <section class="testimonials-luxury-style" data-section-type="testimonials">
      <div class="testimonials-container">
        <div class="testimonials-hero">
          <div class="hero-content">
            <div class="hero-ornament">
              <div class="ornament-left">◆</div>
              <h2 class="testimonials-title">VOICES OF DISTINCTION</h2>
              <div class="ornament-right">◆</div>
            </div>
            <p class="testimonials-subtitle">
              Where excellence meets expectation • Celebrated by connoisseurs of luxury
            </p>
          </div>
          <div class="hero-stats">
            <div class="stat-circle">
              <span class="stat-number">4.98</span>
              <span class="stat-label">Rating</span>
            </div>
          </div>
        </div>

        <div class="testimonials-asymmetric">
          <div class="testimonials-primary">
            <div class="featured-testimonial-luxury">
              <div class="testimonial-frame">
                <div class="frame-corner tl"></div>
                <div class="frame-corner tr"></div>
                <div class="frame-corner bl"></div>
                <div class="frame-corner br"></div>
                
                <div class="testimonial-content-luxury">
                  <div class="quote-section">
                    <div class="quote-mark-large">"</div>
                    <p class="testimonial-text-featured">
                      In three decades of building luxury brands, I have never encountered such 
                      impeccable attention to detail. ÉLITE transforms the very definition of 
                      sophistication with each artisanal touch.
                    </p>
                    <div class="quote-mark-close">"</div>
                  </div>
                  
                  <div class="author-section-luxury">
                    <div class="author-portrait-frame">
                      <div class="portrait-inner">
                        <span class="portrait-initial">MS</span>
                      </div>
                      <div class="portrait-ring"></div>
                    </div>
                    <div class="author-credentials">
                      <h4 class="author-name-luxury">Maximilian Sterling</h4>
                      <p class="author-title-luxury">Chairman, Sterling Luxury Group</p>
                      <div class="author-details">
                        <span class="detail-item">✦ Platinum Member</span>
                        <span class="detail-separator">•</span>
                        <span class="detail-item">Executive Suite</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="testimonials-secondary">
            <div class="testimonial-stack">
              <div class="testimonial-card-elegant">
                <div class="card-header-elegant">
                  <div class="client-monogram">CE</div>
                  <div class="rating-elegant">★★★★★</div>
                </div>
                <p class="testimonial-quote-elegant">
                  "Precision meets artistry in ways that elevate confidence to new heights. 
                  Absolutely transformational."
                </p>
                <div class="client-signature">
                  <span class="signature-name">Catherine E.</span>
                  <span class="signature-title">Global CEO</span>
                </div>
              </div>

              <div class="testimonial-card-elegant">
                <div class="card-header-elegant">
                  <div class="client-monogram">VR</div>
                  <div class="rating-elegant">★★★★★</div>
                </div>
                <p class="testimonial-quote-elegant">
                  "As curator of the world's finest art, I recognize mastery. 
                  This is artistry at its purest form."
                </p>
                <div class="client-signature">
                  <span class="signature-name">Victoria R.</span>
                  <span class="signature-title">Art Director</span>
                </div>
              </div>

              <div class="testimonial-card-elegant">
                <div class="card-header-elegant">
                  <div class="client-monogram">JM</div>
                  <div class="rating-elegant">★★★★★</div>
                </div>
                <p class="testimonial-quote-elegant">
                  "Defines luxury standard. Every detail curated for absolute perfection. 
                  Simply extraordinary excellence."
                </p>
                <div class="client-signature">
                  <span class="signature-name">Jonathan M.</span>
                  <span class="signature-title">Luxury Advisor</span>
                </div>
              </div>
            </div>

            <div class="prestige-showcase">
              <h3 class="showcase-title">DISTINGUISHED RECOGNITION</h3>
              <div class="recognition-grid">
                <div class="recognition-item">
                  <div class="recognition-icon">🏆</div>
                  <span class="recognition-text">Luxury Service Award</span>
                </div>
                <div class="recognition-item">
                  <div class="recognition-icon">⭐</div>
                  <span class="recognition-text">Celebrity Choice</span>
                </div>
                <div class="recognition-item">
                  <div class="recognition-icon">👑</div>
                  <span class="recognition-text">Royal Patronage</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="testimonials-footer-elegant">
          <div class="footer-ornament">
            <div class="ornament-line-left"></div>
            <div class="ornament-center">
              <span class="center-icon">♛</span>
              <span class="center-text">EXCELLENCE AUTHENTICATED</span>
            </div>
            <div class="ornament-line-right"></div>
          </div>
          <div class="footer-metrics">
            <div class="metric-elegant">
              <span class="metric-number">500+</span>
              <span class="metric-text">Elite Members</span>
            </div>
            <div class="metric-elegant">
              <span class="metric-number">25+</span>
              <span class="metric-text">Master Artisans</span>
            </div>
            <div class="metric-elegant">
              <span class="metric-number">100%</span>
              <span class="metric-text">Satisfaction</span>
            </div>
          </div>
        </div>
      </div>
    </section>
    `,
    `
    .testimonials-luxury-style {
      padding: 6rem 0;
      background: linear-gradient(135deg, #f8f6f3 0%, #e8e2d8 100%);
      position: relative;
    }

    .testimonials-luxury-style::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="M100 20 L180 100 L100 180 L20 100 Z" fill="%23d4af37" opacity="0.02"/></svg>') repeat;
      background-size: 200px 200px;
    }

    .testimonials-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem;
      position: relative;
      z-index: 1;
    }

    .testimonials-hero {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4rem;
      padding-bottom: 3rem;
      border-bottom: 2px solid rgba(212, 175, 55, 0.3);
    }

    .hero-content {
      flex: 1;
    }

    .hero-ornament {
      display: flex;
      align-items: center;
      gap: 2rem;
      margin-bottom: 1.5rem;
    }

    .ornament-left, .ornament-right {
      color: #d4af37;
      font-size: 1.5rem;
    }

    .testimonials-title {
      font-size: 3.5rem;
      font-weight: 700;
      color: #2d2d2d;
      font-family: 'Playfair Display', serif;
      letter-spacing: 4px;
      text-align: center;
      flex: 1;
    }

    .testimonials-subtitle {
      font-size: 1.125rem;
      color: #666666;
      font-style: italic;
      max-width: 700px;
      line-height: 1.6;
      text-align: center;
    }

    .hero-stats {
      flex-shrink: 0;
      margin-left: 2rem;
    }

    .stat-circle {
      width: 120px;
      height: 120px;
      border: 3px solid #d4af37;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(212, 175, 55, 0.1);
      backdrop-filter: blur(10px);
    }

    .stat-number {
      font-size: 2rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.25rem;
    }

    .stat-label {
      font-size: 0.875rem;
      color: #666666;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .testimonials-asymmetric {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 3rem;
      margin-bottom: 4rem;
    }

    .featured-testimonial-luxury {
      position: relative;
    }

    .testimonial-frame {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 1.5rem;
      padding: 3rem;
      position: relative;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(212, 175, 55, 0.3);
    }

    .frame-corner {
      position: absolute;
      width: 20px;
      height: 20px;
      border: 2px solid #d4af37;
    }

    .frame-corner.tl {
      top: 15px;
      left: 15px;
      border-right: none;
      border-bottom: none;
    }

    .frame-corner.tr {
      top: 15px;
      right: 15px;
      border-left: none;
      border-bottom: none;
    }

    .frame-corner.bl {
      bottom: 15px;
      left: 15px;
      border-right: none;
      border-top: none;
    }

    .frame-corner.br {
      bottom: 15px;
      right: 15px;
      border-left: none;
      border-top: none;
    }

    .testimonial-content-luxury {
      position: relative;
      z-index: 2;
    }

    .quote-section {
      position: relative;
      margin-bottom: 3rem;
    }

    .quote-mark-large {
      font-size: 5rem;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      position: absolute;
      top: -20px;
      left: -10px;
      opacity: 0.3;
      z-index: 1;
    }

    .testimonial-text-featured {
      font-size: 1.375rem;
      color: #2d2d2d;
      line-height: 1.8;
      font-style: italic;
      position: relative;
      z-index: 2;
      padding-left: 3rem;
      font-weight: 300;
    }

    .quote-mark-close {
      font-size: 3rem;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      float: right;
      opacity: 0.3;
      margin-top: -1rem;
    }

    .author-section-luxury {
      display: flex;
      align-items: center;
      gap: 2rem;
      padding-top: 2rem;
      border-top: 1px solid rgba(212, 175, 55, 0.3);
    }

    .author-portrait-frame {
      position: relative;
      flex-shrink: 0;
    }

    .portrait-inner {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.5rem;
      font-family: 'Playfair Display', serif;
      position: relative;
      z-index: 2;
    }

    .portrait-ring {
      position: absolute;
      top: -5px;
      left: -5px;
      right: -5px;
      bottom: -5px;
      border: 2px solid rgba(212, 175, 55, 0.5);
      border-radius: 50%;
      z-index: 1;
    }

    .author-credentials {
      flex: 1;
    }

    .author-name-luxury {
      font-size: 1.5rem;
      font-weight: 700;
      color: #2d2d2d;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.5rem;
    }

    .author-title-luxury {
      font-size: 1rem;
      color: #666666;
      margin-bottom: 1rem;
      font-weight: 500;
    }

    .author-details {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.875rem;
      color: #d4af37;
      font-weight: 600;
    }

    .detail-separator {
      color: #888888;
    }

    .testimonial-stack {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .testimonial-card-elegant {
      background: rgba(255, 255, 255, 0.8);
      border-radius: 1rem;
      padding: 2rem;
      border: 1px solid rgba(212, 175, 55, 0.2);
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
    }

    .testimonial-card-elegant:hover {
      transform: translateX(10px);
      box-shadow: 0 15px 40px rgba(212, 175, 55, 0.15);
    }

    .card-header-elegant {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .client-monogram {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
      color: #000000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.875rem;
      font-family: 'Playfair Display', serif;
    }

    .rating-elegant {
      color: #d4af37;
      font-size: 0.875rem;
      letter-spacing: 1px;
    }

    .testimonial-quote-elegant {
      font-size: 0.95rem;
      color: #555555;
      line-height: 1.6;
      font-style: italic;
      margin-bottom: 1rem;
    }

    .client-signature {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
    }

    .signature-name {
      color: #2d2d2d;
      font-weight: 700;
    }

    .signature-title {
      color: #888888;
    }

    .prestige-showcase {
      background: rgba(212, 175, 55, 0.1);
      border-radius: 1rem;
      padding: 2rem;
      border: 1px solid rgba(212, 175, 55, 0.3);
      text-align: center;
    }

    .showcase-title {
      font-size: 1rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      margin-bottom: 1.5rem;
      letter-spacing: 2px;
    }

    .recognition-grid {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .recognition-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 0.5rem;
    }

    .recognition-icon {
      font-size: 1.25rem;
    }

    .recognition-text {
      font-size: 0.875rem;
      color: #666666;
      font-weight: 600;
    }

    .testimonials-footer-elegant {
      text-align: center;
    }

    .footer-ornament {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 2rem;
    }

    .ornament-line-left, .ornament-line-right {
      width: 100px;
      height: 1px;
      background: linear-gradient(90deg, transparent 0%, #d4af37 100%);
    }

    .ornament-line-right {
      background: linear-gradient(90deg, #d4af37 0%, transparent 100%);
    }

    .ornament-center {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0 2rem;
    }

    .center-icon {
      font-size: 1.5rem;
      color: #d4af37;
    }

    .center-text {
      font-size: 0.875rem;
      color: #666666;
      font-weight: 700;
      letter-spacing: 2px;
    }

    .footer-metrics {
      display: flex;
      justify-content: center;
      gap: 4rem;
    }

    .metric-elegant {
      text-align: center;
    }

    .metric-number {
      display: block;
      font-size: 2rem;
      font-weight: 700;
      color: #d4af37;
      font-family: 'Playfair Display', serif;
      margin-bottom: 0.25rem;
    }

    .metric-text {
      font-size: 0.875rem;
      color: #666666;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    @media (max-width: 1024px) {
      .testimonials-asymmetric {
        grid-template-columns: 1fr;
        gap: 2rem;
      }
      .testimonials-hero {
        flex-direction: column;
        text-align: center;
        gap: 2rem;
      }
      .hero-stats {
        margin-left: 0;
      }
    }

    @media (max-width: 768px) {
      .testimonials-title { font-size: 2.5rem; }
      .testimonial-frame { padding: 2rem; }
      .testimonial-text-featured { font-size: 1.125rem; padding-left: 2rem; }
      .footer-metrics { flex-direction: column; gap: 1.5rem; }
    }
    `,
    {
      sectionTitle: 'VOICES OF DISTINCTION',
      subtitle: 'Where excellence meets expectation • Celebrated by connoisseurs of luxury',
      overallRating: 4.98,
      featuredTestimonial: {
        text: 'In three decades of building luxury brands, I have never encountered such impeccable attention to detail. ÉLITE transforms the very definition of sophistication with each artisanal touch.',
        author: 'Maximilian Sterling',
        title: 'Chairman, Sterling Luxury Group',
        avatar: 'MS',
        membership: 'Platinum Member',
        suite: 'Executive Suite'
      },
      testimonials: [
        {
          quote: 'Precision meets artistry in ways that elevate confidence to new heights. Absolutely transformational.',
          author: 'Catherine E.',
          title: 'Global CEO',
          avatar: 'CE',
          rating: 5
        },
        {
          quote: 'As curator of the world\'s finest art, I recognize mastery. This is artistry at its purest form.',
          author: 'Victoria R.',
          title: 'Art Director',
          avatar: 'VR',
          rating: 5
        },
        {
          quote: 'Defines luxury standard. Every detail curated for absolute perfection. Simply extraordinary excellence.',
          author: 'Jonathan M.',
          title: 'Luxury Advisor',
          avatar: 'JM',
          rating: 5
        }
      ],
      recognitions: [
        { icon: '🏆', text: 'Luxury Service Award' },
        { icon: '⭐', text: 'Celebrity Choice' },
        { icon: '👑', text: 'Royal Patronage' }
      ],
      metrics: [
        { number: '500+', text: 'Elite Members' },
        { number: '25+', text: 'Master Artisans' },
        { number: '100%', text: 'Satisfaction' }
      ]
    }
  )
}