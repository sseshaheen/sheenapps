// ModularPreviewImpact for boutique-exclusive option
import { boutiqueExclusiveCSS } from '../../refinement/customCSS'

export const boutiqueExclusiveImpact = {
  type: "modular-transformation" as const,
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