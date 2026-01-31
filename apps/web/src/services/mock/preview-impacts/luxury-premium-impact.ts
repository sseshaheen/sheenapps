// ModularPreviewImpact for luxury-premium option
import { luxuryPremiumCSS } from '../../refinement/customCSS'

export const luxuryPremiumImpact = {
  type: "modular-transformation" as const,
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