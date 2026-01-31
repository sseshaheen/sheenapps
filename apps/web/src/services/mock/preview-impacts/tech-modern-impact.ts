// ModularPreviewImpact for tech-modern option
import { techModernCSS } from '../../refinement/customCSS'

export const techModernImpact = {
  type: "modular-transformation" as const,
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