// ModularPreviewImpact for bold-vibrant option
import { boldVibrantCSS } from '../../refinement/customCSS'

export const boldVibrantImpact = {
  type: "modular-transformation" as const,
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