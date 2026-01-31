export const baseStyles = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --primary: #8b5cf6;
      --secondary: #ec4899;
      --accent: #06b6d4;
      --background: #0a0a0a;
      --surface: rgba(255,255,255,0.05);
      --text: #ffffff;
      --text-muted: rgba(255,255,255,0.7);
    }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--background);
      color: var(--text);
      min-height: 100vh;
      overflow-x: hidden;
    }
    .animated {
      animation: fadeIn 0.5s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .header { 
      padding: 1rem 0;
      background: var(--surface);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 2rem;
    }
    .logo {
      font-size: 1.5rem;
      font-weight: bold;
      background: linear-gradient(to right, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .nav-links {
      display: flex;
      gap: 2rem;
      list-style: none;
    }
    .nav-links a {
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.2s;
    }
    .nav-links a:hover {
      color: var(--text);
    }
    .hero {
      min-height: 70vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 4rem 2rem;
      position: relative;
    }
    .hero-content {
      max-width: 800px;
      z-index: 1;
    }
    .hero h1 {
      font-size: clamp(2.5rem, 5vw, 4rem);
      margin-bottom: 1.5rem;
      line-height: 1.2;
    }
    .hero p {
      font-size: 1.25rem;
      color: var(--text-muted);
      margin-bottom: 2rem;
    }
    .btn {
      background: linear-gradient(to right, var(--primary), var(--secondary));
      color: white;
      padding: 0.75rem 2rem;
      border-radius: 0.5rem;
      text-decoration: none;
      display: inline-block;
      transition: all 0.2s;
      font-weight: 500;
    }
    .btn:hover { 
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(139, 92, 246, 0.3);
    }
    .gradient-orb {
      position: absolute;
      width: 400px;
      height: 400px;
      border-radius: 50%;
      background: radial-gradient(circle, var(--primary), transparent);
      opacity: 0.2;
      filter: blur(100px);
      animation: float 20s ease-in-out infinite;
    }
    @keyframes float {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(30px, -30px); }
    }
    .features {
      padding: 4rem 2rem;
      background: var(--surface);
    }
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
      margin-top: 3rem;
    }
    .feature-card {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 1rem;
      padding: 2rem;
      transition: all 0.3s;
    }
    .feature-card:hover {
      background: rgba(255,255,255,0.05);
      border-color: var(--primary);
      transform: translateY(-5px);
    }
    .feature-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(to right, var(--primary), var(--secondary));
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1rem;
    }
  </style>
`

export const templates = {
  initial: {
    html: `
      <header class="header animated">
        <nav class="nav">
          <div class="logo">Your Business</div>
          <ul class="nav-links">
            <li><a href="#">About</a></li>
            <li><a href="#">Services</a></li>
            <li><a href="#">Contact</a></li>
          </ul>
        </nav>
      </header>
      <main class="hero">
        <div class="gradient-orb" style="top: 10%; left: 10%;"></div>
        <div class="gradient-orb" style="bottom: 10%; right: 10%; animation-delay: -10s;"></div>
        <div class="hero-content animated">
          <h1>Welcome to Your New Business</h1>
          <p>We're building something extraordinary based on your vision</p>
          <a href="#" class="btn">Get Started</a>
        </div>
      </main>
    `
  },
  
  saas: {
    html: `
      <header class="header animated">
        <nav class="nav">
          <div class="logo">YourSaaS</div>
          <ul class="nav-links">
            <li><a href="#">Features</a></li>
            <li><a href="#">Pricing</a></li>
            <li><a href="#">Docs</a></li>
            <li><a href="#">Login</a></li>
          </ul>
        </nav>
      </header>
      <main class="hero">
        <div class="gradient-orb" style="top: 10%; left: 10%;"></div>
        <div class="hero-content animated">
          <h1>The All-in-One Platform for Your Business</h1>
          <p>Streamline your workflow with powerful tools and integrations</p>
          <a href="#" class="btn">Start Free Trial</a>
        </div>
      </main>
      <section class="features">
        <div class="container">
          <h2 style="text-align: center; font-size: 2.5rem; margin-bottom: 1rem;">Features that Scale</h2>
          <div class="features-grid animated">
            <div class="feature-card">
              <div class="feature-icon">⚡</div>
              <h3>Lightning Fast</h3>
              <p style="color: var(--text-muted);">Built for speed and performance</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">🔒</div>
              <h3>Secure by Default</h3>
              <p style="color: var(--text-muted);">Enterprise-grade security</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">📊</div>
              <h3>Analytics Dashboard</h3>
              <p style="color: var(--text-muted);">Real-time insights and metrics</p>
            </div>
          </div>
        </div>
      </section>
    `
  },
  
  ecommerce: {
    html: `
      <header class="header animated">
        <nav class="nav">
          <div class="logo">YourStore</div>
          <ul class="nav-links">
            <li><a href="#">Shop</a></li>
            <li><a href="#">Collections</a></li>
            <li><a href="#">About</a></li>
            <li><a href="#">Cart (0)</a></li>
          </ul>
        </nav>
      </header>
      <main class="hero">
        <div class="gradient-orb" style="top: 10%; right: 10%;"></div>
        <div class="hero-content animated">
          <h1>Discover Amazing Products</h1>
          <p>Handcrafted with love, delivered to your door</p>
          <a href="#" class="btn">Shop Now</a>
        </div>
      </main>
      <section class="features">
        <div class="container">
          <h2 style="text-align: center; font-size: 2.5rem; margin-bottom: 1rem;">Featured Collections</h2>
          <div class="features-grid animated">
            <div class="feature-card">
              <div class="feature-icon">🎁</div>
              <h3>New Arrivals</h3>
              <p style="color: var(--text-muted);">Fresh products every week</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">⭐</div>
              <h3>Best Sellers</h3>
              <p style="color: var(--text-muted);">Customer favorites</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">💎</div>
              <h3>Premium Collection</h3>
              <p style="color: var(--text-muted);">Luxury items</p>
            </div>
          </div>
        </div>
      </section>
    `
  }
}

export const colorThemes = {
  'Purple Passion': {
    primary: '#8b5cf6',
    secondary: '#ec4899',
    accent: '#06b6d4'
  },
  'Ocean Blue': {
    primary: '#3b82f6',
    secondary: '#06b6d4',
    accent: '#10b981'
  },
  'Forest Green': {
    primary: '#10b981',
    secondary: '#84cc16',
    accent: '#06b6d4'
  },
  'Sunset Orange': {
    primary: '#f97316',
    secondary: '#ef4444',
    accent: '#f59e0b'
  },
  'Midnight Dark': {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    accent: '#a78bfa'
  }
}

export const businessNames = {
  'SaaS Platform': ['CloudSync', 'DataFlow', 'TeamHub', 'WorkStream'],
  'E-commerce Store': ['ShopEase', 'MarketPlace', 'BuyNow', 'StoreHub'],
  'Marketplace': ['ConnectMarket', 'TradeHub', 'LocalBazaar', 'MarketSquare'],
  'Portfolio Site': ['CreativeStudio', 'DesignWorks', 'PortfolioPlus', 'ShowcaseHub']
}