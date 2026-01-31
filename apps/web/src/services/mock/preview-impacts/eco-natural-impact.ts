// ModularPreviewImpact for eco-natural option
import { ecoNaturalCSS } from '../../refinement/customCSS'

export const ecoNaturalImpact = {
  type: "modular-transformation" as const,
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