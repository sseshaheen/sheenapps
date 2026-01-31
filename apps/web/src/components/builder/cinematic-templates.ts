import { GeneratedContent } from './content-orchestra'

export interface CinematicTemplate {
  id: string
  name: string
  html: string
  animations: string
  transformations: Record<string, string>
}

export const cinematicStyles = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --primary: #8b5cf6;
      --secondary: #ec4899;
      --accent: #06b6d4;
      --background: #0a0a0a;
      --surface: rgba(255,255,255,0.05);
      --surface-bright: rgba(255,255,255,0.1);
      --text: #ffffff;
      --text-muted: rgba(255,255,255,0.7);
      --text-dim: rgba(255,255,255,0.5);
      --border: rgba(255,255,255,0.1);
      --shadow: rgba(139, 92, 246, 0.3);
    }

    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
      background: var(--background);
      color: var(--text);
      line-height: 1.6;
      overflow-x: hidden;
      scroll-behavior: smooth;
    }

    /* Cinematic Animations */
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(40px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fadeInLeft {
      from { opacity: 0; transform: translateX(-30px); }
      to { opacity: 1; transform: translateX(0); }
    }

    @keyframes fadeInRight {
      from { opacity: 0; transform: translateX(30px); }
      to { opacity: 1; transform: translateX(0); }
    }

    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes glow {
      0%, 100% { box-shadow: 0 0 20px var(--shadow); }
      50% { box-shadow: 0 0 40px var(--shadow), 0 0 60px var(--shadow); }
    }

    @keyframes float {
      0%, 100% { transform: translateY(0px) rotate(0deg); }
      33% { transform: translateY(-10px) rotate(1deg); }
      66% { transform: translateY(-5px) rotate(-1deg); }
    }

    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    /* Layout Components */
    .container { 
      max-width: 1200px; 
      margin: 0 auto; 
      padding: 0 2rem; 
    }

    /* Header Styles */
    .header {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: rgba(10, 10, 10, 0.8);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border);
      animation: fadeInUp 0.8s ease-out;
    }

    .nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 0;
      min-height: 80px;
    }

    .logo {
      font-size: 1.75rem;
      font-weight: 800;
      background: linear-gradient(135deg, var(--primary), var(--secondary), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.025em;
      animation: fadeInLeft 0.8s ease-out 0.2s both;
    }

    .nav-links {
      display: flex;
      gap: 2.5rem;
      list-style: none;
      animation: fadeInRight 0.8s ease-out 0.4s both;
    }

    .nav-links a {
      color: var(--text-muted);
      text-decoration: none;
      font-weight: 500;
      transition: all 0.3s ease;
      position: relative;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
    }

    .nav-links a:hover {
      color: var(--text);
      background: var(--surface);
      transform: translateY(-2px);
    }

    .nav-links a::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      width: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--primary), var(--secondary));
      transition: all 0.3s ease;
      transform: translateX(-50%);
    }

    .nav-links a:hover::after {
      width: 80%;
    }

    /* Hero Section */
    .hero {
      min-height: 90vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      background: radial-gradient(ellipse at top, rgba(139, 92, 246, 0.1), transparent 50%);
    }

    .hero-background {
      position: absolute;
      inset: 0;
      z-index: -1;
    }

    .gradient-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.4;
      animation: float 20s ease-in-out infinite;
    }

    .orb-1 {
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, var(--primary), transparent);
      top: 20%;
      left: 10%;
      animation-delay: 0s;
    }

    .orb-2 {
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, var(--secondary), transparent);
      bottom: 30%;
      right: 20%;
      animation-delay: -7s;
    }

    .orb-3 {
      width: 150px;
      height: 150px;
      background: radial-gradient(circle, var(--accent), transparent);
      top: 60%;
      left: 70%;
      animation-delay: -14s;
    }

    .hero-content {
      text-align: center;
      max-width: 900px;
      z-index: 1;
      animation: fadeInUp 1s ease-out 0.6s both;
    }

    .hero h1 {
      font-size: clamp(2.5rem, 6vw, 5rem);
      font-weight: 900;
      line-height: 1.1;
      margin-bottom: 1.5rem;
      background: linear-gradient(135deg, var(--text) 30%, var(--primary) 60%, var(--secondary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.02em;
    }

    .hero p {
      font-size: clamp(1.1rem, 2vw, 1.4rem);
      color: var(--text-muted);
      margin-bottom: 3rem;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.8;
    }

    .cta-button {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: white;
      padding: 1rem 2.5rem;
      border-radius: 50px;
      text-decoration: none;
      font-weight: 600;
      font-size: 1.1rem;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
      box-shadow: 0 10px 30px var(--shadow);
    }

    .cta-button:hover {
      transform: translateY(-3px);
      box-shadow: 0 15px 40px var(--shadow);
      animation: glow 2s infinite;
    }

    .cta-button::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      transition: left 0.5s ease;
    }

    .cta-button:hover::before {
      left: 100%;
    }

    /* Features Section */
    .features {
      padding: 8rem 0;
      background: linear-gradient(180deg, transparent, var(--surface), transparent);
      position: relative;
    }

    .section-title {
      text-align: center;
      font-size: clamp(2rem, 4vw, 3.5rem);
      font-weight: 800;
      margin-bottom: 1rem;
      color: var(--text);
      animation: fadeInUp 0.8s ease-out;
    }

    .section-subtitle {
      text-align: center;
      font-size: 1.25rem;
      color: var(--text-muted);
      margin-bottom: 4rem;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
      animation: fadeInUp 0.8s ease-out 0.2s both;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 2rem;
      margin-top: 4rem;
    }

    .feature-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 1.5rem;
      padding: 2.5rem;
      transition: all 0.4s ease;
      position: relative;
      overflow: hidden;
      animation: fadeInUp 0.8s ease-out;
    }

    .feature-card:nth-child(1) { animation-delay: 0.1s; }
    .feature-card:nth-child(2) { animation-delay: 0.2s; }
    .feature-card:nth-child(3) { animation-delay: 0.3s; }

    .feature-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, var(--primary), var(--secondary), var(--accent));
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .feature-card:hover {
      background: var(--surface-bright);
      border-color: var(--primary);
      transform: translateY(-8px);
      box-shadow: 0 20px 60px rgba(139, 92, 246, 0.2);
    }

    .feature-card:hover::before {
      opacity: 1;
    }

    .feature-icon {
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      border-radius: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
      transition: all 0.3s ease;
    }

    .feature-card:hover .feature-icon {
      transform: scale(1.1) rotate(5deg);
      animation: float 3s ease-in-out infinite;
    }

    .feature-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 1rem;
      color: var(--text);
    }

    .feature-description {
      color: var(--text-muted);
      line-height: 1.7;
      font-size: 1rem;
    }

    /* Pricing Section */
    .pricing {
      padding: 8rem 0;
      background: radial-gradient(ellipse at center, rgba(139, 92, 246, 0.05), transparent 70%);
    }

    .pricing-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
      margin-top: 4rem;
    }

    .pricing-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 1.5rem;
      padding: 2.5rem;
      text-align: center;
      position: relative;
      transition: all 0.4s ease;
      animation: scaleIn 0.8s ease-out;
    }

    .pricing-card.popular {
      border-color: var(--primary);
      background: linear-gradient(135deg, var(--surface), rgba(139, 92, 246, 0.1));
      transform: scale(1.05);
      box-shadow: 0 20px 60px rgba(139, 92, 246, 0.2);
    }

    .pricing-card.popular::before {
      content: 'Most Popular';
      position: absolute;
      top: -15px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: white;
      padding: 0.5rem 2rem;
      border-radius: 50px;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .pricing-card:hover {
      transform: translateY(-10px);
      border-color: var(--primary);
      box-shadow: 0 25px 70px rgba(139, 92, 246, 0.3);
    }

    .price {
      font-size: 3rem;
      font-weight: 900;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 1rem 0;
    }

    /* Footer */
    .footer {
      background: var(--surface);
      border-top: 1px solid var(--border);
      padding: 4rem 0 2rem;
      margin-top: 8rem;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .container { padding: 0 1rem; }
      .nav { flex-direction: column; gap: 1rem; }
      .nav-links { gap: 1.5rem; }
      .hero { min-height: 70vh; padding: 2rem 0; }
      .features-grid { grid-template-columns: 1fr; }
      .pricing-grid { grid-template-columns: 1fr; }
    }

    /* Content Transformation Classes */
    .content-update {
      animation: fadeInUp 0.6s ease-out;
    }

    .theme-transition {
      transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .morphing-element {
      transition: all 0.5s ease-out;
    }

    .shimmer-effect {
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
      background-size: 200% 100%;
      animation: shimmer 2s infinite;
    }
  </style>
`

export function generateCinematicTemplate(content: GeneratedContent): string {
  const { hero, navigation, features, pricing } = content
  
  return `
    ${cinematicStyles}
    <body class="theme-transition">
      <!-- Header -->
      <header class="header">
        <nav class="nav">
          <div class="container">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div class="logo morphing-element">${navigation.logo}</div>
              <ul class="nav-links">
                ${navigation.items.map(item => `
                  <li><a href="${item.href}" class="morphing-element">${item.label}</a></li>
                `).join('')}
              </ul>
            </div>
          </div>
        </nav>
      </header>

      <!-- Hero Section -->
      <section class="hero">
        <div class="hero-background">
          <div class="gradient-orb orb-1"></div>
          <div class="gradient-orb orb-2"></div>
          <div class="gradient-orb orb-3"></div>
        </div>
        <div class="container">
          <div class="hero-content">
            <h1 class="morphing-element content-update">${hero.headline}</h1>
            <p class="morphing-element content-update">${hero.subheadline}</p>
            <a href="#features" class="cta-button morphing-element">
              ${hero.cta}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </a>
          </div>
        </div>
      </section>

      <!-- Features Section -->
      <section class="features" id="features">
        <div class="container">
          <h2 class="section-title morphing-element">Why Choose ${navigation.logo}?</h2>
          <p class="section-subtitle morphing-element">Experience the difference with our powerful features</p>
          
          <div class="features-grid">
            ${features.slice(0, 3).map((feature, index) => `
              <div class="feature-card morphing-element" style="animation-delay: ${0.1 * (index + 1)}s;">
                <div class="feature-icon">${feature.icon}</div>
                <h3 class="feature-title">${feature.title}</h3>
                <p class="feature-description">${feature.description}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- Pricing Section -->
      <section class="pricing" id="pricing">
        <div class="container">
          <h2 class="section-title morphing-element">Simple, Transparent Pricing</h2>
          <p class="section-subtitle morphing-element">Choose the plan that's right for your business</p>
          
          <div class="pricing-grid">
            ${pricing.tiers.map((tier, index) => `
              <div class="pricing-card morphing-element ${tier.popular ? 'popular' : ''}" style="animation-delay: ${0.2 * (index + 1)}s;">
                <h3 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem;">${tier.name}</h3>
                <div class="price">${tier.price}</div>
                <ul style="list-style: none; padding: 0; margin: 2rem 0; color: var(--text-muted);">
                  ${tier.features.map(feature => `
                    <li style="padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" style="margin-right: 0.5rem;">
                        <polyline points="20,6 9,17 4,12"/>
                      </svg>
                      ${feature}
                    </li>
                  `).join('')}
                </ul>
                <a href="#contact" class="cta-button" style="width: 100%; justify-content: center;">
                  Get Started
                </a>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="footer">
        <div class="container">
          <div style="text-align: center; color: var(--text-muted);">
            <p>&copy; 2024 ${navigation.logo}. Crafted with passion.</p>
          </div>
        </div>
      </footer>
    </body>
  `
}

// Template transformation functions for dramatic preview updates
export const transformations = {
  businessType: (html: string, newType: string): string => {
    // Transform the entire layout based on business type
    if (newType === 'E-commerce Store') {
      return html
        .replace(/Why Choose.*?\?/, 'Featured Products')
        .replace(/Experience the difference with our powerful features/, 'Discover our curated collection')
        .replace(/Simple, Transparent Pricing/, 'Shop by Category')
    }
    return html
  },

  colorTheme: (documentRoot: HTMLElement, theme: Record<string, string>): void => {
    // Apply color transformations with smooth animations
    Object.entries(theme).forEach(([property, value]) => {
      documentRoot.style.setProperty(`--${property}`, value)
    })
  },

  brandName: (html: string, newName: string): string => {
    // Update all brand references
    return html.replace(/\${navigation\.logo}/g, newName)
  },

  content: (element: Element, newContent: string): void => {
    // Animate content changes
    element.classList.add('shimmer-effect')
    setTimeout(() => {
      element.textContent = newContent
      element.classList.remove('shimmer-effect')
      element.classList.add('content-update')
    }, 300)
  }
}

export const industryThemes = {
  'Food & Beverage': {
    primary: '#f97316', // Orange
    secondary: '#ef4444', // Red
    accent: '#84cc16' // Lime
  },
  'Fashion & Accessories': {
    primary: '#ec4899', // Pink
    secondary: '#8b5cf6', // Purple
    accent: '#06b6d4' // Cyan
  },
  'Technology': {
    primary: '#3b82f6', // Blue
    secondary: '#8b5cf6', // Purple
    accent: '#06b6d4' // Cyan
  },
  'Health & Beauty': {
    primary: '#10b981', // Emerald
    secondary: '#84cc16', // Lime
    accent: '#f59e0b' // Amber
  },
  'Professional Services': {
    primary: '#6366f1', // Indigo
    secondary: '#8b5cf6', // Purple
    accent: '#06b6d4' // Cyan
  }
}