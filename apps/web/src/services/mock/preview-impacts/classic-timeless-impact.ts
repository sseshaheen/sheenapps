// ModularPreviewImpact for classic-timeless option
import { classicTimelessCSS } from '../../refinement/customCSS'

export const classicTimelessImpact = {
  type: "modular-transformation" as const,
  modules: {
    colorScheme: "classic",
    typography: "traditional",
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
    features: {
      component: "classic-services",
      props: {
        sectionTitle: "Time-Honored Services",
        subtitle: "Traditional techniques perfected over generations",
        primaryServices: [
          {
            name: "Classic Cut & Style",
            description: "Traditional precision cutting with timeless styling",
            icon: "✂️",
            price: "From $85",
            heritage: "Est. 1952"
          },
          {
            name: "Traditional Color",
            description: "Professional coloring using proven techniques",
            icon: "🎨",
            price: "From $95",
            heritage: "Classic Method"
          },
          {
            name: "Vintage Styling",
            description: "Recreate iconic looks from bygone eras",
            icon: "💫",
            price: "From $75",
            heritage: "Period Authentic"
          },
          {
            name: "Formal Occasions",
            description: "Elegant styling for special events and ceremonies",
            icon: "👸",
            price: "From $120",
            heritage: "White Glove Service"
          }
        ]
      }
    },
    testimonials: {
      component: "heritage-testimonials",
      props: {
        sectionTitle: "Trusted by Generations",
        subtitle: "What our long-standing clients say",
        testimonials: [
          {
            text: "I've been coming here for over 20 years. The quality and professionalism never wavers. It's like a trusted family tradition.",
            author: "Margaret Thompson",
            relationship: "Client since 1998",
            service: "Regular styling",
            rating: 5
          },
          {
            text: "Three generations of women in my family have been clients. They understand timeless elegance better than anyone.",
            author: "Elizabeth Crawford",
            relationship: "Third generation client",
            service: "Family tradition",
            rating: 5
          },
          {
            text: "For formal events, there's nowhere else I'd trust. They create looks that are both classic and current.",
            author: "Victoria Sterling",
            relationship: "Client since 2005",
            service: "Special occasions",
            rating: 5
          }
        ]
      }
    },
    animations: ["heritageRise", "elegantFloat", "timelessGlow"],
    customCSS: classicTimelessCSS
  }
}