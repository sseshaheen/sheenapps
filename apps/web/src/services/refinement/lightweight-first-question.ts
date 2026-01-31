// Lightweight first question data without heavy preview configurations
// Extracted from enhanced-ideal-ai-response.ts for API endpoints

export interface LightweightOption {
  id: string
  title: string
  description: string
  shortDescription: string
  impactTags: {
    visual: string[]
    layout: string[]
    functionality: string[]
    experience: string[]
    device: string[]
  }
}

export interface LightweightQuestion {
  id: string
  category: string
  question: string
  context: string
  difficulty: string
  paginationEnabled?: boolean
  optionsPerPage?: number
  options: LightweightOption[]
}

export const LIGHTWEIGHT_FIRST_QUESTION: LightweightQuestion = {
  id: "visual-foundation-1",
  category: "visual-foundation",
  question: "What personality and target audience from below conveys the mood for your salon app?",
  context: "This sets the general mood for your brand. More fine-tuning can be done later.",
  difficulty: "beginner",
  paginationEnabled: true,
  optionsPerPage: 4,
  options: [
    {
      id: "luxury-premium",
      title: "Luxury & Premium",
      description: "Sophisticated, high-end experience for discerning clients",
      shortDescription: "High-end elegance",
      impactTags: {
        visual: ["luxury", "sophisticated", "elegant"],
        layout: ["spacious", "minimal"],
        functionality: ["vip-features", "concierge"],
        experience: ["premium", "exclusive"],
        device: ["desktop-optimized"]
      }
    },
    {
      id: "warm-approachable",
      title: "Warm & Approachable",
      description: "Friendly, welcoming atmosphere for the whole community",
      shortDescription: "Friendly & welcoming",
      impactTags: {
        visual: ["warm", "friendly", "colorful"],
        layout: ["cozy", "playful"],
        functionality: ["social", "community"],
        experience: ["casual", "fun"],
        device: ["mobile-first"]
      }
    },
    {
      id: "modern-minimal",
      title: "Modern & Minimal",
      description: "Clean, contemporary design focused on efficiency",
      shortDescription: "Clean & modern",
      impactTags: {
        visual: ["minimal", "clean", "modern"],
        layout: ["grid", "spacious"],
        functionality: ["streamlined", "efficient"],
        experience: ["professional", "focused"],
        device: ["responsive"]
      }
    },
    {
      id: "bold-vibrant",
      title: "Bold & Vibrant",
      description: "Eye-catching design that makes a statement",
      shortDescription: "Bold & energetic",
      impactTags: {
        visual: ["bold", "vibrant", "energetic"],
        layout: ["dynamic", "creative"],
        functionality: ["interactive", "engaging"],
        experience: ["exciting", "memorable"],
        device: ["immersive"]
      }
    },
    {
      id: "classic-timeless",
      title: "Classic & Timeless",
      description: "Traditional elegance with enduring appeal",
      shortDescription: "Timeless elegance",
      impactTags: {
        visual: ["classic", "timeless", "traditional"],
        layout: ["balanced", "formal"],
        functionality: ["proven", "reliable"],
        experience: ["comfortable", "familiar"],
        device: ["all-devices"]
      }
    },
    {
      id: "boutique-exclusive",
      title: "Boutique & Exclusive",
      description: "Intimate, personalized service for select clientele",
      shortDescription: "Exclusive boutique",
      impactTags: {
        visual: ["intimate", "exclusive", "refined"],
        layout: ["curated", "focused"],
        functionality: ["personalized", "bespoke"],
        experience: ["intimate", "special"],
        device: ["premium-optimized"]
      }
    },
    {
      id: "eco-natural",
      title: "Eco & Natural",
      description: "Sustainable, organic approach to beauty and wellness",
      shortDescription: "Natural & sustainable",
      impactTags: {
        visual: ["natural", "organic", "earthy"],
        layout: ["flowing", "harmonious"],
        functionality: ["sustainable", "wellness"],
        experience: ["mindful", "healthy"],
        device: ["eco-conscious"]
      }
    },
    {
      id: "tech-modern",
      title: "Tech-Forward & Modern",
      description: "Cutting-edge technology meets contemporary styling",
      shortDescription: "Tech-forward",
      impactTags: {
        visual: ["futuristic", "sleek", "digital"],
        layout: ["smart", "automated"],
        functionality: ["ai-powered", "connected"],
        experience: ["innovative", "seamless"],
        device: ["app-centric"]
      }
    },
    {
      id: "families-children",
      title: "Families with Children",
      description: "Parents looking for a family-friendly salon experience",
      shortDescription: "Family-focused",
      impactTags: {
        visual: ["playful", "safe", "welcoming"],
        layout: ["open", "accessible"],
        functionality: ["family-oriented", "kid-friendly"],
        experience: ["fun", "stress-free"],
        device: ["parent-child-optimized"]
      }
    },
    {
      id: "young-professionals",
      title: "Young Professionals",
      description: "Career-focused individuals seeking efficient, quality service",
      shortDescription: "Professional-focused",
      impactTags: {
        visual: ["clean", "professional", "efficient"],
        layout: ["streamlined", "minimal"],
        functionality: ["fast-booking", "mobile-optimized"],
        experience: ["time-efficient", "consistent"],
        device: ["mobile-first"]
      }
    },
    {
      id: "trendy-youth",
      title: "Trendy Youth",
      description: "Fashion-forward young adults seeking latest trends",
      shortDescription: "Trend-focused",
      impactTags: {
        visual: ["vibrant", "trendy", "creative"],
        layout: ["dynamic", "social"],
        functionality: ["social-sharing", "trend-booking"],
        experience: ["creative", "Instagram-ready"],
        device: ["social-optimized"]
      }
    }
  ]
}
