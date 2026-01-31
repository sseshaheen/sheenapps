// ModularPreviewImpact for young-professionals option

export const youngProfessionalsImpact = {
  type: "modular-transformation" as const,
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