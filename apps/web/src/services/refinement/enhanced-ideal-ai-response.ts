// Enhanced Ideal AI Response with Modular Design System
// Multiple questions with granular, composable visual components

import { ANIMATION_PRESETS, COLOR_SCHEMES, COMPONENT_MODULES, TYPOGRAPHY_SYSTEMS } from './modular-design-system'
import {
  luxuryPremiumCSS,
  warmApproachableCSS,
  modernMinimalCSS,
  boldVibrantCSS,
  classicTimelessCSS,
  boutiqueExclusiveCSS,
  ecoNaturalCSS,
  techModernCSS,
  familiesChildrenCSS
} from './customCSS'

interface ModularPreviewImpact {
  type: 'modular-transformation'
  modules: {
    colorScheme?: string
    typography?: string
    header?: {
      component: string
      props: { [key: string]: any }
    }
    hero?: {
      component: string
      props: { [key: string]: any }
    }
    features?: {
      component: string
      props: { [key: string]: any }
    }
    animations?: string[]
    customCSS?: string
  }
}

export const ENHANCED_IDEAL_AI_RESPONSE = {
  questions: [
    {
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
          },
          previewHints: {
            primaryEffect: "luxury",
            secondaryEffects: ["spacious", "premium"],
            targetElements: ["header", "hero", "color-scheme"],
            complexity: "high"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "luxury",
              typography: "elegant",
              header: {
                component: "luxury",
                props: {
                  businessName: "ÉLITE SALON",
                  tagline: "LUXURY REDEFINED",
                  logoIcon: "♛",
                  navItems: [
                    { label: "Masterpieces", url: "#" },
                    { label: "Artisans", url: "#" },
                    { label: "Private Suites", url: "#" }
                  ],
                  ctaText: "RESERVE VIP"
                }
              },
              hero: {
                component: "luxury-immersive",
                props: {
                  badge: "FINEST CRAFTSMANSHIP",
                  title: "WHERE LUXURY TRANSCENDS EXPECTATION",
                  subtitle: "Indulge in the artistry of master craftsmen who transform beauty into an extraordinary experience",
                  primaryCTA: "BOOK PRIVATE ATELIER",
                  secondaryCTA: "DISCOVER EXCELLENCE"
                }
              },
              features: {
                component: "service-showcase",
                props: {
                  primaryServices: [
                    {
                      name: "VIP Styling",
                      description: "Exclusive one-on-one styling sessions with master artisans",
                      icon: "👑",
                      price: "From $200"
                    },
                    {
                      name: "Private Suites",
                      description: "Luxury private rooms with champagne service",
                      icon: "✨",
                      price: "From $150"
                    },
                    {
                      name: "Master Classes",
                      description: "Learn premium styling techniques from experts",
                      icon: "🎓",
                      price: "From $300"
                    }
                  ]
                }
              },
              animations: ["goldenShimmer", "luxuryFloat", "premiumGlow"],
              customCSS: luxuryPremiumCSS
            }
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
          },
          previewHints: {
            primaryEffect: "warm",
            secondaryEffects: ["playful", "community"],
            targetElements: ["header", "hero", "color-scheme"],
            complexity: "medium"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "warm",
              typography: "playful",
              header: {
                component: "playful",
                props: {
                  businessName: "Sunny Styles",
                  subtitle: "YOUR FRIENDLY NEIGHBORHOOD SALON",
                  logoIcon: "☀️",
                  navItems: [
                    { label: "Services", emoji: "💇‍♀️", url: "#" },
                    { label: "Our Family", emoji: "🤗", url: "#" },
                    { label: "Visit Us", emoji: "💕", url: "#" }
                  ],
                  ctaText: "Come Say Hi!",
                  ctaEmoji: "👋"
                }
              },
              hero: {
                component: "warm-community",
                props: {
                  badge: "WELCOME HOME",
                  title: "Where Every Visit Feels Like a Warm Hug",
                  subtitle: "Creating beautiful moments and lasting friendships, one gentle touch at a time",
                  primaryCTA: "Join Our Family",
                  secondaryCTA: "Meet Our Team"
                }
              },
              features: {
                component: "service-showcase",
                props: {
                  primaryServices: [
                    {
                      name: "Family Cuts",
                      description: "Gentle styling for the whole family in a cozy environment",
                      icon: "👨‍👩‍👧‍👦",
                      price: "From $35"
                    },
                    {
                      name: "Kids Corner",
                      description: "Special play area with fun styling chairs for little ones",
                      icon: "🎨",
                      price: "From $25"
                    },
                    {
                      name: "Community Events",
                      description: "Join our monthly styling workshops and social gatherings",
                      icon: "🤗",
                      price: "Free"
                    }
                  ]
                }
              },
              animations: ["gentleBounce", "warmGlow", "heartFloat"],
              customCSS: warmApproachableCSS
            }
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
          },
          previewHints: {
            primaryEffect: "minimal",
            secondaryEffects: ["clean", "modern"],
            targetElements: ["header", "hero", "layout"],
            complexity: "low"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "minimal",
              typography: "modern",
              header: {
                component: "minimal",
                props: {
                  businessName: "MONO",
                  logoIcon: "◯",
                  navItems: [
                    { label: "Services", url: "#" },
                    { label: "Studio", url: "#" },
                    { label: "Book", url: "#" }
                  ],
                  ctaText: "Schedule"
                }
              },
              hero: {
                component: "splitLayout",
                props: {
                  badge: "PRECISION CRAFT",
                  title: "Less is More",
                  subtitle: "Clean lines. Perfect execution. Timeless results.",
                  primaryCTA: "Book Session",
                  secondaryCTA: "Explore",
                  stats: [
                    { number: "500+", label: "Clients" },
                    { number: "5.0", label: "Rating" },
                    { number: "12", label: "Years" }
                  ]
                }
              },
              features: {
                component: "service-showcase",
                props: {
                  primaryServices: [
                    {
                      name: "Precision Cuts",
                      description: "Clean, geometric cuts with perfect lines and minimal styling",
                      icon: "✂️",
                      price: "From $60"
                    },
                    {
                      name: "Express Service",
                      description: "Efficient 30-minute appointments for busy professionals",
                      icon: "⚡",
                      price: "From $45"
                    },
                    {
                      name: "Digital Booking",
                      description: "Seamless online scheduling with real-time availability",
                      icon: "📱",
                      price: "Free"
                    }
                  ]
                }
              },
              animations: ["cleanSlide", "precisionFade", "geometricScale"],
              customCSS: modernMinimalCSS
            }
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
          },
          previewHints: {
            primaryEffect: "vibrant",
            secondaryEffects: ["bold", "energetic"],
            targetElements: ["entire-site"],
            complexity: "high"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "vibrant",
              typography: "modern",
              header: {
                component: "vibrant-bold",
                props: {
                  businessName: "VIVID SALON",
                  tagline: "UNLEASH YOUR STYLE",
                  logoIcon: "💫",
                  navItems: [
                    { label: "Styles", url: "#" },
                    { label: "Artists", url: "#" },
                    { label: "Gallery", url: "#" }
                  ],
                  ctaText: "GET STYLED"
                }
              },
              hero: {
                component: "vibrant-energetic",
                props: {
                  badge: "BOLD EXPRESSION",
                  title: "UNLEASH YOUR CREATIVE SPIRIT",
                  subtitle: "Electric colors, dynamic styles, and fearless expression for those who dare to stand out",
                  primaryCTA: "Get Bold",
                  secondaryCTA: "See Styles"
                }
              },
              features: {
                component: "service-showcase",
                props: {
                  primaryServices: [
                    {
                      name: "Color Explosion",
                      description: "Bold, vibrant colors that turn heads and express your personality",
                      icon: "🌈",
                      price: "From $80"
                    },
                    {
                      name: "Creative Cuts",
                      description: "Edgy, artistic styles that push the boundaries of fashion",
                      icon: "⚡",
                      price: "From $70"
                    },
                    {
                      name: "Style Workshops",
                      description: "Learn to create your own bold looks with our artist stylists",
                      icon: "🎨",
                      price: "From $120"
                    }
                  ]
                }
              },
              animations: ["vibrantPulse", "energyBurst", "colorShift"],
              customCSS: boldVibrantCSS
            }
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
          },
          previewHints: {
            primaryEffect: "classic",
            secondaryEffects: ["timeless", "elegant"],
            targetElements: ["header", "hero", "typography"],
            complexity: "medium"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "luxury",
              typography: "elegant",
              header: {
                component: "classic",
                props: {
                  businessName: "Heritage Salon",
                  tagline: "EST. TRADITION",
                  logoIcon: "👑",
                  navItems: [
                    { label: "Services", url: "#" },
                    { label: "About", url: "#" },
                    { label: "Contact", url: "#" }
                  ],
                  ctaText: "Book Appointment"
                }
              },
              hero: {
                component: "classic-formal",
                props: {
                  badge: "TIMELESS TRADITION",
                  title: "Where Classic Beauty Meets Modern Excellence",
                  subtitle: "Serving generations with time-honored techniques and contemporary care",
                  primaryCTA: "Reserve Your Visit",
                  secondaryCTA: "Our Heritage"
                }
              },
              animations: ["heritageRise", "elegantFloat", "timelessGlow"],
              customCSS: classicTimelessCSS
            }
          }
        },
        {
          id: "boutique-exclusive",
          title: "Boutique & Exclusive",
          description: "Intimate, personalized service for select clientele",
          shortDescription: "Exclusive boutique",
          impactTags: {
            visual: ["boutique", "exclusive", "intimate"],
            layout: ["curated", "selective"],
            functionality: ["personalized", "premium"],
            experience: ["exclusive", "intimate"],
            device: ["desktop-focused"]
          },
          previewHints: {
            primaryEffect: "boutique",
            secondaryEffects: ["exclusive", "intimate"],
            targetElements: ["header", "hero", "features"],
            complexity: "high"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "minimal",
              typography: "elegant",
              header: {
                component: "boutique",
                props: {
                  businessName: "Atelier Hair",
                  tagline: "BY APPOINTMENT ONLY",
                  logoIcon: "✨",
                  navItems: [
                    { label: "Consultation", url: "#" },
                    { label: "Master Stylists", url: "#" },
                    { label: "Private Sessions", url: "#" }
                  ],
                  ctaText: "Request Consultation"
                }
              },
              hero: {
                component: "boutique-intimate",
                props: {
                  badge: "EXCLUSIVE ATELIER",
                  title: "Curated Beauty, Personalized Experience",
                  subtitle: "Limited clientele, unlimited attention to your unique style",
                  primaryCTA: "Join Our Circle",
                  secondaryCTA: "Learn More",
                  exclusiveFeatures: ["Private Consultations", "Master Stylists", "Bespoke Services"]
                }
              },
              animations: ["refinedEntry", "whisperFloat", "exclusiveGlow"],
              customCSS: boutiqueExclusiveCSS
            }
          }
        },
        {
          id: "eco-natural",
          title: "Eco & Natural",
          description: "Sustainable, organic approach to beauty and wellness",
          shortDescription: "Natural & sustainable",
          impactTags: {
            visual: ["natural", "organic", "earthy"],
            layout: ["natural", "flowing"],
            functionality: ["sustainable", "mindful"],
            experience: ["wholesome", "conscious"],
            device: ["mobile-optimized"]
          },
          previewHints: {
            primaryEffect: "natural",
            secondaryEffects: ["organic", "earthy"],
            targetElements: ["colors", "imagery", "content"],
            complexity: "medium"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "warm",
              typography: "natural",
              header: {
                component: "natural",
                props: {
                  businessName: "Earth & Beauty",
                  tagline: "NATURALLY BEAUTIFUL",
                  logoIcon: "🌿",
                  navItems: [
                    { label: "Organic Services", url: "#" },
                    { label: "Natural Products", url: "#" },
                    { label: "Wellness", url: "#" }
                  ],
                  ctaText: "Go Natural"
                }
              },
              hero: {
                component: "eco-natural",
                props: {
                  badge: "CERTIFIED ORGANIC",
                  title: "Beauty in Harmony with Nature",
                  subtitle: "Discover the power of natural ingredients and sustainable practices for healthier hair and a healthier planet",
                  primaryCTA: "Book Natural Service",
                  secondaryCTA: "Our Philosophy",
                  ecoFeatures: ["100% Organic Products", "Sustainable Practices", "Cruelty-Free"]
                }
              },
              animations: ["leafFloat", "naturalGrow", "ecoBreeze"],
              customCSS: ecoNaturalCSS
            }
          }
        },
        {
          id: "tech-modern",
          title: "Tech-Forward & Modern",
          description: "Cutting-edge technology meets contemporary styling",
          shortDescription: "Tech-forward",
          impactTags: {
            visual: ["tech", "modern", "futuristic"],
            layout: ["digital", "interactive"],
            functionality: ["smart", "automated"],
            experience: ["innovative", "efficient"],
            device: ["app-integrated"]
          },
          previewHints: {
            primaryEffect: "tech",
            secondaryEffects: ["modern", "interactive"],
            targetElements: ["entire-site", "animations"],
            complexity: "high"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "minimal",
              typography: "modern",
              header: {
                component: "tech-modern",
                props: {
                  businessName: "TECH.SALON",
                  tagline: "FUTURE OF BEAUTY",
                  logoIcon: "⚡",
                  navItems: [
                    { label: "AI Styling", url: "#" },
                    { label: "Smart Booking", url: "#" },
                    { label: "Virtual Try-On", url: "#" },
                    { label: "Account", url: "#" }
                  ],
                  ctaText: "Experience Tech"
                }
              },
              hero: {
                component: "tech-futuristic",
                props: {
                  badge: "POWERED BY AI",
                  title: "The Future of Hair Styling is Here",
                  subtitle: "Experience next-generation hair care with AI-powered style recommendations and smart booking technology",
                  primaryCTA: "Try AI Styling",
                  secondaryCTA: "See Technology",
                  techFeatures: ["AI Style Matching", "Smart Scheduling", "Digital Consultations", "App Integration"]
                }
              },
              animations: ["digitalGlow", "matrixEffect", "neonPulse"],
              customCSS: techModernCSS
            }
          }
        },
        {
          id: "families-children",
          title: "Families with Children",
          description: "Parents looking for a family-friendly salon experience",
          shortDescription: "Family-focused",
          impactTags: {
            visual: ["warm", "playful", "welcoming"],
            layout: ["family-friendly", "spacious"],
            functionality: ["family-booking", "kids-area"],
            experience: ["fun", "comfortable"],
            device: ["tablet-optimized"]
          },
          previewHints: {
            primaryEffect: "family-friendly",
            secondaryEffects: ["warm", "playful"],
            targetElements: ["header", "hero", "layout"],
            complexity: "medium"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "warm",
              typography: "playful",
              header: {
                component: "playful",
                props: {
                  businessName: "Family Hair Studio",
                  logoIcon: "👨‍👩‍👧‍👦",
                  tagline: "WHERE FAMILIES FEEL AT HOME",
                  navItems: [
                    { label: "Family Cuts", url: "#", emoji: "✂️" },
                    { label: "Kids Zone", url: "#", emoji: "🎈" },
                    { label: "Parents Corner", url: "#", emoji: "☕" },
                    { label: "Book Now", url: "#", emoji: "📅" }
                  ],
                  ctaText: "Book Family Session",
                  ctaEmoji: "👨‍👩‍👧‍👦"
                }
              },
              hero: {
                component: "family-focused",
                props: {
                  badge: "FAMILY FIRST",
                  title: "Family Hair Care Made Fun!",
                  subtitle: "Where kids love getting haircuts and parents can relax",
                  primaryCTA: "Book Family Session",
                  secondaryCTA: "See Kids Area"
                }
              },
              animations: ["bounce", "fadeInUp"],
              customCSS: familiesChildrenCSS
            }
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
          },
          previewHints: {
            primaryEffect: "professional",
            secondaryEffects: ["efficient", "minimal"],
            targetElements: ["header", "hero", "booking"],
            complexity: "medium"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "minimal",
              typography: "modern",
              header: {
                component: "minimal",
                props: {
                  businessName: "Executive Cuts",
                  logoIcon: "💼",
                  navItems: [
                    { label: "Express Services", url: "#" },
                    { label: "Schedule", url: "#" },
                    { label: "Membership", url: "#" },
                    { label: "Account", url: "#" }
                  ],
                  ctaText: "Book Now"
                }
              },
              hero: {
                component: "professional-efficient",
                props: {
                  badge: "EXECUTIVE STYLE",
                  title: "Professional Styling for Busy Lives",
                  subtitle: "Time-efficient service without compromising quality",
                  primaryCTA: "Quick Book",
                  secondaryCTA: "View Services"
                }
              },
              animations: ["fadeInUp"],
              customCSS: `
                /* Young Professionals: Clean, efficient, business-focused */
                :root {
                  --professional-blue: #2563eb;
                  --professional-gray: #64748b;
                  --professional-white: #f8fafc;
                  --professional-navy: #1e293b;
                }

                body {
                  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);
                  font-family: 'Inter', 'SF Pro Display', sans-serif;
                  color: var(--professional-navy);
                }

                .professional-stats {
                  display: flex;
                  justify-content: space-around;
                  margin: 2rem 0;
                }

                .stat-card {
                  text-align: center;
                  background: rgba(37, 99, 235, 0.1);
                  padding: 1.5rem;
                  border-radius: 8px;
                  border: 1px solid rgba(37, 99, 235, 0.2);
                }
              `
            }
          }
        },
        {
          id: "luxury-clientele",
          title: "Luxury Clientele",
          description: "High-end customers expecting premium experiences",
          shortDescription: "Luxury-focused",
          impactTags: {
            visual: ["elegant", "sophisticated", "premium"],
            layout: ["spacious", "exclusive"],
            functionality: ["concierge", "private-booking"],
            experience: ["luxury", "personalized"],
            device: ["desktop-optimized"]
          },
          previewHints: {
            primaryEffect: "luxury",
            secondaryEffects: ["exclusive", "sophisticated"],
            targetElements: ["header", "hero", "amenities"],
            complexity: "high"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "luxury",
              typography: "elegant",
              header: {
                component: "luxury",
                props: {
                  businessName: "Atelier de Beauté",
                  logoIcon: "👑",
                  tagline: "EXCELLENCE REDEFINED",
                  navItems: [
                    { label: "Private Suites", url: "#" },
                    { label: "Master Stylists", url: "#" },
                    { label: "Concierge", url: "#" },
                    { label: "Membership", url: "#" }
                  ],
                  ctaText: "Reserve Experience"
                }
              },
              hero: {
                component: "luxury-experience",
                props: {
                  badge: "EXCLUSIVE ARTISTRY",
                  title: "Exclusive Hair Artistry",
                  subtitle: "Champagne service, personal consultation, luxury amenities",
                  primaryCTA: "Reserve Private Suite",
                  secondaryCTA: "View Portfolio"
                }
              },
              animations: ["gradientShift", "shimmer", "float"],
              customCSS: `
                /* Luxury Clientele: Premium, exclusive, high-end experience */
                :root {
                  --luxury-gold: #D4AF37;
                  --luxury-black: #0a0a0a;
                  --luxury-champagne: #F7E7CE;
                  --luxury-platinum: #E5E4E2;
                }

                body {
                  background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #2a2a2a 100%);
                  font-family: 'Playfair Display', 'Times New Roman', serif;
                  color: var(--luxury-champagne);
                }

                .luxury-amenities {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                  gap: 2rem;
                  margin: 3rem 0;
                }

                .amenity-card {
                  background: rgba(212, 175, 55, 0.1);
                  backdrop-filter: blur(20px);
                  border: 1px solid rgba(212, 175, 55, 0.3);
                  border-radius: 20px;
                  padding: 2rem;
                  text-align: center;
                }
              `
            }
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
          },
          previewHints: {
            primaryEffect: "trendy",
            secondaryEffects: ["vibrant", "creative"],
            targetElements: ["header", "hero", "gallery"],
            complexity: "high"
          },
          modularPreviewImpact: {
            type: "modular-transformation",
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
        }
      ]
    },
    {
      id: "target-audience-1",
      category: "target-audience",
      question: "Who is your primary target audience?",
      context: "Understanding your audience helps tailor the user experience and features",
      difficulty: "beginner",
      options: [
        {
          id: "families-children",
          title: "Families with Children",
          description: "Parents looking for a family-friendly salon experience",
          shortDescription: "Family-focused",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "warm",
              typography: "playful",
              header: {
                component: "playful",
                props: {
                  businessName: "Family Hair Studio",
                  logoIcon: "👨‍👩‍👧‍👦",
                  tagline: "Where families feel at home",
                  navItems: [
                    { label: "Family Cuts", url: "#", emoji: "✂️" },
                    { label: "Kids Zone", url: "#", emoji: "🎈" },
                    { label: "Parents Corner", url: "#", emoji: "☕" },
                    { label: "Book Now", url: "#", emoji: "📅" }
                  ],
                  ctaText: "Book Family Session",
                  ctaEmoji: "👨‍👩‍👧‍👦"
                }
              },
              hero: {
                component: "family-focused",
                props: {
                  title: "Family Hair Care Made Fun!",
                  features: ["Kids Play Area", "Family Packages", "Patient Stylists"],
                  testimonial: "My kids actually look forward to haircuts now! - Sarah M."
                }
              },
              animations: ["bounce", "fadeInUp"],
              customCSS: familiesChildrenCSS
            }
          }
        },
        {
          id: "young-professionals",
          title: "Young Professionals",
          description: "Career-focused individuals seeking efficient, quality service",
          shortDescription: "Professional-focused",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "minimal",
              typography: "modern",
              header: {
                component: "minimal",
                props: {
                  businessName: "Executive Cuts",
                  logoIcon: "💼",
                  navItems: [
                    { label: "Express Services", url: "#" },
                    { label: "Schedule", url: "#" },
                    { label: "Membership", url: "#" },
                    { label: "Account", url: "#" }
                  ],
                  ctaText: "Book Now"
                }
              },
              hero: {
                component: "professional-efficient",
                props: {
                  title: "Professional Styling for Busy Lives",
                  features: ["Express Services", "Online Booking", "Early/Late Hours"],
                  benefits: ["Time-Efficient", "Consistent Quality", "Flexible Scheduling"]
                }
              },
              animations: ["fadeInUp"],
              customCSS: `
                .professional-stats {
                  display: flex;
                  justify-content: space-around;
                  margin: 2rem 0;
                }
                .stat-card {
                  text-align: center;
                  background: rgba(37, 99, 235, 0.1);
                  padding: 1.5rem;
                  border-radius: 8px;
                  border: 1px solid rgba(37, 99, 235, 0.2);
                }
                body { background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%) !important; }
              `
            }
          }
        },
        {
          id: "luxury-clientele",
          title: "Luxury Clientele",
          description: "High-end customers expecting premium experiences",
          shortDescription: "Luxury-focused",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "luxury",
              typography: "elegant",
              header: {
                component: "luxury",
                props: {
                  businessName: "Atelier de Beauté",
                  logoIcon: "👑",
                  tagline: "EXCELLENCE REDEFINED",
                  navItems: [
                    { label: "Private Suites", url: "#" },
                    { label: "Master Stylists", url: "#" },
                    { label: "Concierge", url: "#" },
                    { label: "Membership", url: "#" }
                  ],
                  ctaText: "Reserve Experience"
                }
              },
              hero: {
                component: "luxury-experience",
                props: {
                  title: "Exclusive Hair Artistry",
                  features: ["Private Suites", "Master Stylists", "Premium Products"],
                  experience: "Champagne service, personal consultation, luxury amenities"
                }
              },
              animations: ["gradientShift", "shimmer", "float"],
              customCSS: `
                .luxury-amenities {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                  gap: 2rem;
                  margin: 3rem 0;
                }
                .amenity-card {
                  background: rgba(212, 175, 55, 0.1);
                  backdrop-filter: blur(20px);
                  border: 1px solid rgba(212, 175, 55, 0.3);
                  border-radius: 20px;
                  padding: 2rem;
                  text-align: center;
                }
                body { background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #2a2a2a 100%) !important; }
              `
            }
          }
        },
        {
          id: "trendy-youth",
          title: "Trendy Youth",
          description: "Fashion-forward young adults seeking latest trends",
          shortDescription: "Trend-focused",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "vibrant",
              typography: "playful",
              header: {
                component: "vibrant-bold",
                props: {
                  businessName: "VIBE STUDIOS",
                  logoIcon: "🌈",
                  tagline: "Express Your True Colors",
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
                  title: "Where Trends Come to Life",
                  features: ["Color Specialists", "Creative Cuts", "Social Media Ready"],
                  trending: ["Balayage", "Rainbow Colors", "Undercuts", "Braiding"]
                }
              },
              animations: ["bounce", "shimmer", "wiggle"],
              customCSS: `
                .trending-gallery {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                  gap: 1rem;
                  margin: 2rem 0;
                }
                .trend-card {
                  background: rgba(255, 255, 255, 0.15);
                  backdrop-filter: blur(20px);
                  border: 2px solid rgba(255, 255, 255, 0.2);
                  border-radius: 20px;
                  padding: 1.5rem;
                  text-align: center;
                  transition: transform 0.3s ease;
                }
                .trend-card:hover {
                  transform: translateY(-5px) scale(1.05);
                }
                body { background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 25%, #ec4899 50%, #f97316 75%, #eab308 100%) !important; }
              `
            }
          }
        }
      ]
    },
    {
      id: "business-focus-1",
      category: "business-focus",
      question: "What's your salon's main focus?",
      context: "This determines which features and services to highlight prominently",
      difficulty: "intermediate",
      options: [
        {
          id: "cutting-styling",
          title: "Cutting & Styling",
          description: "Expert haircuts and styling services",
          shortDescription: "Hair artistry",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              features: {
                component: "service-showcase",
                props: {
                  primaryServices: [
                    {
                      name: "Precision Cuts",
                      description: "Expert cutting techniques for every hair type",
                      icon: "✂️",
                      price: "From $45"
                    },
                    {
                      name: "Creative Styling",
                      description: "Updos, blowouts, and special occasion styles",
                      icon: "💫",
                      price: "From $35"
                    },
                    {
                      name: "Consultation",
                      description: "Personalized style recommendations",
                      icon: "💬",
                      price: "Free"
                    }
                  ]
                }
              }
            }
          }
        },
        {
          id: "color-treatments",
          title: "Color & Treatments",
          description: "Advanced coloring and hair treatment services",
          shortDescription: "Color specialists",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              features: {
                component: "color-showcase",
                props: {
                  colorServices: [
                    {
                      name: "Balayage",
                      description: "Hand-painted highlights for natural dimension",
                      before: "/images/before-balayage.jpg",
                      after: "/images/after-balayage.jpg",
                      duration: "2-3 hours",
                      price: "From $120"
                    },
                    {
                      name: "Color Correction",
                      description: "Fix and transform previous color work",
                      complexity: "Advanced",
                      consultation: "Required",
                      price: "From $200"
                    }
                  ]
                }
              }
            }
          }
        },
        {
          id: "wellness-spa",
          title: "Wellness & Spa",
          description: "Holistic hair and scalp treatments",
          shortDescription: "Wellness-focused",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "minimal",
              features: {
                component: "wellness-showcase",
                props: {
                  treatments: [
                    {
                      name: "Scalp Therapy",
                      description: "Deep cleansing and nourishing scalp treatments",
                      benefits: ["Promotes growth", "Reduces stress", "Improves health"],
                      duration: "45 minutes"
                    },
                    {
                      name: "Hair Restoration",
                      description: "Intensive treatments for damaged hair",
                      process: ["Analysis", "Treatment", "Maintenance plan"],
                      results: "Visible improvement in 4-6 weeks"
                    }
                  ]
                }
              }
            }
          }
        }
      ]
    },
    {
      id: "user-experience-1",
      category: "user-experience",
      question: "How should customers interact with your app?",
      context: "This affects navigation style, booking flow, and overall user journey",
      difficulty: "intermediate",
      options: [
        {
          id: "simple-streamlined",
          title: "Simple & Streamlined",
          description: "Minimal clicks, clear paths, efficient booking",
          shortDescription: "Efficiency-focused",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              header: {
                component: "minimal",
                props: {
                  navItems: [
                    { label: "Services", url: "#" },
                    { label: "Book", url: "#" }
                  ]
                }
              },
              customCSS: `
                .quick-booking {
                  position: fixed;
                  bottom: 2rem;
                  right: 2rem;
                  background: var(--primary);
                  color: white;
                  border: none;
                  padding: 1rem 2rem;
                  border-radius: 50px;
                  font-weight: bold;
                  cursor: pointer;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                  z-index: 1000;
                }
                .streamlined-nav {
                  max-width: 600px;
                  margin: 0 auto;
                }
              `
            }
          }
        },
        {
          id: "rich-interactive",
          title: "Rich & Interactive",
          description: "Engaging animations, detailed previews, immersive experience",
          shortDescription: "Experience-rich",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              animations: ["fadeInUp", "bounce", "shimmer", "gradientShift"],
              customCSS: `
                .interactive-preview {
                  transition: all 0.3s ease;
                }
                .interactive-preview:hover {
                  transform: scale(1.05);
                  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                .rich-animations {
                  animation: fadeInUp 0.6s ease-out;
                }
                .hover-effects:hover {
                  background: linear-gradient(135deg, var(--primary), var(--secondary));
                }
              `
            }
          }
        },
        {
          id: "social-community",
          title: "Social & Community",
          description: "Reviews, gallery, social features, community engagement",
          shortDescription: "Community-focused",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              features: {
                component: "social-showcase",
                props: {
                  socialFeatures: [
                    {
                      name: "Client Gallery",
                      description: "Before/after photos with client consent",
                      interaction: "Like, share, comment"
                    },
                    {
                      name: "Reviews & Ratings",
                      description: "Authentic client feedback",
                      display: "Star ratings, written reviews, photos"
                    },
                    {
                      name: "Referral Program",
                      description: "Earn rewards for bringing friends",
                      benefits: "Discounts, free services, loyalty points"
                    }
                  ]
                }
              }
            }
          }
        }
      ]
    },
    {
      id: "feature-priorities-1",
      category: "feature-priorities",
      question: "Which features are most important for your salon?",
      context: "This determines the layout priority and development focus",
      difficulty: "advanced",
      options: [
        {
          id: "online-booking",
          title: "Online Booking System",
          description: "Comprehensive appointment scheduling and management",
          shortDescription: "Booking-focused",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              features: {
                component: "booking-showcase",
                props: {
                  bookingFeatures: [
                    {
                      feature: "Real-time Availability",
                      description: "See open slots instantly",
                      icon: "📅"
                    },
                    {
                      feature: "Service Selection",
                      description: "Choose from detailed service menu",
                      icon: "✂️"
                    },
                    {
                      feature: "Stylist Preferences",
                      description: "Book with your favorite stylist",
                      icon: "👨‍💼"
                    },
                    {
                      feature: "Reminder System",
                      description: "SMS and email confirmations",
                      icon: "🔔"
                    }
                  ]
                }
              }
            }
          }
        },
        {
          id: "portfolio-gallery",
          title: "Portfolio & Gallery",
          description: "Showcase work, before/after photos, style inspiration",
          shortDescription: "Visual showcase",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              features: {
                component: "gallery-showcase",
                props: {
                  galleryTypes: [
                    {
                      category: "Before & After",
                      description: "Transformation showcases",
                      layout: "split-view",
                      filters: ["Cut", "Color", "Style", "Treatment"]
                    },
                    {
                      category: "Style Gallery",
                      description: "Inspiration and trends",
                      layout: "masonry",
                      tags: ["Short", "Long", "Curly", "Straight", "Color"]
                    },
                    {
                      category: "Stylist Portfolios",
                      description: "Individual stylist work",
                      layout: "profile-based",
                      features: ["Specialties", "Experience", "Availability"]
                    }
                  ]
                }
              }
            }
          }
        },
        {
          id: "customer-management",
          title: "Customer Management",
          description: "Client profiles, history, preferences, loyalty programs",
          shortDescription: "Client-focused",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              features: {
                component: "customer-showcase",
                props: {
                  customerFeatures: [
                    {
                      feature: "Client Profiles",
                      description: "Detailed customer information and preferences",
                      benefits: ["Personalized service", "Allergy tracking", "Style history"]
                    },
                    {
                      feature: "Loyalty Program",
                      description: "Reward repeat customers",
                      tiers: ["Silver", "Gold", "Platinum"],
                      rewards: ["Discounts", "Free services", "Priority booking"]
                    },
                    {
                      feature: "History Tracking",
                      description: "Complete service timeline",
                      includes: ["Services received", "Products used", "Photos", "Notes"]
                    }
                  ]
                }
              }
            }
          }
        },
        {
          id: "marketing-tools",
          title: "Marketing & Promotions",
          description: "Social media integration, promotions, referral systems",
          shortDescription: "Growth-focused",
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              features: {
                component: "marketing-showcase",
                props: {
                  marketingTools: [
                    {
                      tool: "Social Media Integration",
                      platforms: ["Instagram", "Facebook", "TikTok"],
                      features: ["Auto-posting", "Hashtag suggestions", "Story templates"]
                    },
                    {
                      tool: "Promotion Engine",
                      types: ["Seasonal offers", "New client specials", "Package deals"],
                      targeting: ["Customer segments", "Service preferences", "Visit frequency"]
                    },
                    {
                      tool: "Referral System",
                      mechanics: ["Share codes", "Automatic tracking", "Reward distribution"],
                      incentives: ["Cash rewards", "Service credits", "Product discounts"]
                    }
                  ]
                }
              }
            }
          }
        }
      ]
    }
  ]
}

// Helper function to render modular components
export function renderModularComponent(impact: ModularPreviewImpact, businessData: any): string {
  const { modules } = impact
  let html = ''
  let css = ''

  // Apply color scheme
  if (modules.colorScheme) {
    const colorScheme = COLOR_SCHEMES[modules.colorScheme]
    if (colorScheme) {
      css += `
        :root {
          --primary: ${colorScheme.primary};
          --secondary: ${colorScheme.secondary};
          --accent: ${colorScheme.accent};
          --background: ${colorScheme.background};
          --surface: ${colorScheme.surface};
          --text-primary: ${colorScheme.text.primary};
          --text-secondary: ${colorScheme.text.secondary};
          --text-accent: ${colorScheme.text.accent};
        }
      `
    }
  }

  // Apply typography
  if (modules.typography) {
    const typography = TYPOGRAPHY_SYSTEMS[modules.typography]
    if (typography) {
      css += `
        body { font-family: ${typography.bodyFont}; }
        h1, h2, h3, h4, h5, h6 { font-family: ${typography.headingFont}; }
      `
    }
  }

  // Render components
  if (modules.header) {
    const headerComponent = COMPONENT_MODULES.headers[modules.header.component]
    if (headerComponent) {
      html += interpolateTemplate(headerComponent.html, modules.header.props)
      css += interpolateTemplate(headerComponent.css, {
        ...COLOR_SCHEMES[headerComponent.colorSchemeId],
        ...TYPOGRAPHY_SYSTEMS[headerComponent.typographyId]
      })
    }
  }

  // Add animations
  if (modules.animations) {
    modules.animations.forEach(animationId => {
      const animation = ANIMATION_PRESETS[animationId]
      if (animation) {
        css += animation.keyframes
      }
    })
  }

  // Add custom CSS
  if (modules.customCSS) {
    css += modules.customCSS
  }

  return `
    <style>${css}</style>
    ${html}
  `
}

// Simple template interpolation
function interpolateTemplate(template: string, data: any): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const keys = key.trim().split('.')
    let value = data
    for (const k of keys) {
      value = value?.[k]
    }
    return value || match
  }).replace(/\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (match, key, content) => {
    const array = data[key.trim()]
    if (Array.isArray(array)) {
      return array.map(item => interpolateTemplate(content, item)).join('')
    }
    return ''
  })
}
