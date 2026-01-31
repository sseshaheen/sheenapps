// ModularPreviewImpact for trendy-youth option

export const trendyYouthImpact = {
  type: "modular-transformation" as const,
  modules: {
    colorScheme: "vibrant",
    typography: "playful",
    header: {
      component: "vibrant-bold",
      props: {
        businessName: "VIBE STUDIOS",
        logoIcon: "🌈",
        tagline: "EXPRESS YOUR TRUE COLORS",
        navItems: [
          { label: "Color Magic", url: "#" },
          { label: "Trending Cuts", url: "#" },
          { label: "Gallery", url: "#" },
          { label: "Book Session", url: "#" }
        ],
        ctaText: "CREATE YOUR LOOK"
      }
    },
    hero: {
      component: "trendy-creative",
      props: {
        badge: "TREND CREATORS",
        title: "Where Trends Come to Life",
        subtitle: "Color specialists, creative cuts, and Instagram-ready styles",
        primaryCTA: "Book Transformation",
        secondaryCTA: "View Gallery"
      }
    },
    animations: ["bounce", "shimmer", "wiggle"],
    customCSS: `
      /* Trendy Youth: Vibrant, creative, social media focused */
      :root {
        --trendy-pink: #FF1493;
        --trendy-purple: #8A2BE2;
        --trendy-cyan: #00FFFF;
        --trendy-lime: #32CD32;
        --trendy-orange: #FF4500;
      }

      body {
        background: linear-gradient(45deg,
          var(--trendy-purple) 0%,
          var(--trendy-pink) 25%,
          var(--trendy-orange) 50%,
          var(--trendy-lime) 75%,
          var(--trendy-cyan) 100%);
        font-family: 'Fredoka One', 'Comic Sans MS', sans-serif;
        color: #2D3748;
      }

      .trending-gallery {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin: 2rem 0;
      }

      .trend-card {
        background: rgba(255, 255, 255, 0.9);
        border-radius: 20px;
        padding: 1.5rem;
        border: 3px solid var(--trendy-pink);
        box-shadow: 0 10px 30px rgba(255, 20, 147, 0.3);
      }
    `
  }
}