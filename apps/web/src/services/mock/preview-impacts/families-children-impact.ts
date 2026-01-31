// ModularPreviewImpact for families-children option
import { familiesChildrenCSS } from '../../refinement/customCSS'

export const familiesChildrenImpact = {
  type: "modular-transformation" as const,
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