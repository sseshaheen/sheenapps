# Project Structure

## Overview
This is a Next.js 15 project with TypeScript, Tailwind CSS v4, and Framer Motion for the SheenApps marketing site.

## Directory Structure

```
SheenAppsAI/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── favicon.ico
│   │   ├── globals.css         # Global styles and Tailwind theme
│   │   ├── layout.tsx          # Root layout with metadata
│   │   └── page.tsx            # Home page
│   │
│   ├── components/             # React components
│   │   ├── ui/                 # Reusable UI components
│   │   │   ├── button.tsx      # Button component with variants
│   │   │   └── index.ts        # UI components barrel export
│   │   │
│   │   ├── layout/             # Layout components
│   │   │   └── header.tsx      # Site header with navigation
│   │   │
│   │   └── sections/           # Page sections
│   │       ├── hero.tsx        # Hero section
│   │       └── features.tsx    # Features grid section
│   │
│   ├── lib/                    # Utility functions
│   │   └── utils.ts            # cn() utility for className merging
│   │
│   ├── hooks/                  # Custom React hooks (empty for now)
│   ├── types/                  # TypeScript type definitions (empty for now)
│   └── styles/                 # Additional styles (empty for now)
│
├── public/                    # Static assets
├── eslint.config.mjs          # ESLint configuration
├── next.config.ts             # Next.js configuration
├── postcss.config.mjs         # PostCSS configuration
├── tsconfig.json              # TypeScript configuration
├── package.json               # Dependencies and scripts
└── README.md                  # Project documentation
```

## Key Technologies

### Core
- **Next.js 15.3.3** - React framework with App Router
- **React 19** - UI library
- **TypeScript 5** - Type safety
- **Tailwind CSS 4** - Utility-first CSS framework

### UI Libraries
- **Framer Motion 12** - Animation library
- **Radix UI** - Unstyled, accessible components
  - @radix-ui/react-dialog
  - @radix-ui/react-tabs
  - @radix-ui/react-accordion
  - @radix-ui/react-dropdown-menu
  - @radix-ui/react-navigation-menu
  - @radix-ui/react-popover
  - @radix-ui/react-scroll-area
  - @radix-ui/react-separator
  - @radix-ui/react-slot
  - @radix-ui/react-tooltip
- **Lucide React** - Icon library
- **clsx** - Conditional class names
- **tailwind-merge** - Merge Tailwind classes safely
- **class-variance-authority** - Component variants

## Scripts

```bash
# Development with Turbopack
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Run linting
npm run lint
```

## Theme Configuration

The project uses a custom theme defined in `src/app/globals.css` with:
- CSS variables for colors (HSL format)
- Light and dark mode support
- Semantic color tokens (primary, secondary, muted, etc.)
- Responsive design utilities

## Component Architecture

- **UI Components**: Reusable, styled components in `src/components/ui/`
- **Layout Components**: Page structure components in `src/components/layout/`
- **Section Components**: Page-specific sections in `src/components/sections/`
- **Utility Functions**: Helper functions in `src/lib/`

## Completed Features

✅ **Hero Section**: Animated hero with live typing demo of multi-language business ideas
✅ **Tech Team Section**: Introduction to human advisors with availability status
✅ **Feature Workflow**: Timeline visualization showing feature request to deployment
✅ **Pricing Section**: Three-tier pricing with advisor minutes and billing toggle
✅ **Features Grid**: Overview of platform capabilities
✅ **Futuristic UI**: Dark theme with gradient orbs, animations, and glassmorphism
✅ **Responsive Design**: Mobile-first design with smooth animations
✅ **Navigation**: Smooth scroll navigation with section anchors
✅ **Mobile Optimizations**: Fixed mobile quirks, touch interactions, and performance
✅ **Internationalization**: Complete multi-locale support with dialect-specific translations

## Mobile Fixes Applied

✅ **Typography & Spacing**: Responsive text sizes, better line heights, mobile-specific spacing
✅ **Touch Interactions**: Touch-optimized buttons with proper tap targets (44px+)
✅ **Performance**: Reduced motion for battery life, optimized animations for mobile
✅ **Layout**: Fixed overflow issues, better mobile navigation, responsive grids
✅ **Header**: Mobile-friendly navigation with appropriate sizes
✅ **Animations**: Mobile-optimized gradient orbs with reduced complexity
✅ **CSS Optimizations**: Touch scroll, zoom prevention, tap highlighting

## Internationalization Implementation

✅ **Multi-Dialect Arabic Support**: 
- Egyptian Arabic (العربية المصرية) with local expressions and EGP pricing
- Saudi Arabic (العربية السعودية) with formal tone and SAR pricing  
- UAE Arabic (العربية الإماراتية) with premium positioning and AED pricing
- Modern Standard Arabic (العربية) for general MENA market

✅ **French Market Support**:
- Moroccan French (Français Maroc) with local adaptations and MAD pricing
- Standard French (Français) for European market with EUR pricing

✅ **Technical Features**:
- next-intl integration with locale routing
- Currency formatting with regional pricing multipliers
- RTL layout support with proper CSS
- Locale-specific pricing strategies
- Cultural adaptations in tone and terminology

✅ **Regional Pricing Intelligence**:
- Egypt: 15% of USD pricing + 20% launch discount
- Saudi Arabia: 110% of USD pricing (premium market)
- UAE: 120% of USD pricing (premium market) 
- Morocco: 30% of USD pricing + 15% emerging market discount
- France: Standard USD pricing in EUR

## Live Demo

The marketing site is now running at `http://localhost:3000` with:
- Stunning visual effects and animations (optimized for mobile)
- Multi-language typing demonstration
- Interactive elements and touch-friendly hover effects
- Complete user journey from landing to pricing
- Fully mobile-responsive design with fixed quirks

## Next Steps

1. Add Arabic/French language switcher functionality
2. Implement form handling for "Start Building" CTAs
3. Add onboarding flow pages
4. Connect to backend APIs
5. Add analytics and tracking
6. Optimize for SEO and performance
