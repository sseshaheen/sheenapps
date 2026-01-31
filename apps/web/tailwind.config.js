/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}', // EXPERT FIX: Ensure all src/ files are included
  ],
  // EXPERT FIX: Safelist critical classes that get purged in production
  safelist: [
    // Grid/flex structure classes that cause preview-under-chat issue
    'grid', 'grid-cols-1', 'md:grid-cols-[auto_1fr]',
    'col-start-1', 'row-start-1', 'md:col-start-2',
    'min-h-0', 'min-w-0', 'overflow-hidden',
    // Sidebar width classes that get purged
    'w-16', 'w-80', 'lg:w-96', 'xl:w-[400px]',
    // Custom utility classes for container queries
    'cq-workspace', 'hide-on-mobile', 'sidebar-collapsed',
    'sidebar-expanded', 'sidebar-auto-collapse', '@lg:sidebar-auto-expand',
    // Grid row classes for header/workspace structure
    'grid-rows-[auto_1fr]', 'row-start-2', 'row-end-3',
    // Mobile layout classes
    'h-full', 'min-h-app', 'flex-1', 'flex-shrink-0',
    // Container query class
    '[container-type:inline-size]',
    // Blue background classes for advisor profile headers
    'bg-blue-50/50', 'bg-blue-950/20', 'border-blue-1200', 'border-blue-900/30',
  ],
  theme: {
    extend: {
      colors: {
        // Core system colors (use template tokens for scoping)
        bg: 'hsl(var(--tpl-bg) / <alpha-value>)',
        fg: 'hsl(var(--tpl-fg) / <alpha-value>)',
        surface: 'hsl(var(--tpl-surface) / <alpha-value>)',
        neutral: 'hsl(var(--tpl-neutral) / <alpha-value>)',
        muted: 'hsl(var(--tpl-muted) / <alpha-value>)',

        // Interactive colors with states
        accent: {
          DEFAULT: 'hsl(var(--tpl-accent) / <alpha-value>)',
          hover: 'hsl(var(--accent-hover) / <alpha-value>)',
          active: 'hsl(var(--accent-active) / <alpha-value>)'
        },
        border: 'hsl(var(--tpl-border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',

        // Semantic colors (always global)
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          hover: 'hsl(var(--success-hover) / <alpha-value>)'
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          hover: 'hsl(var(--warning-hover) / <alpha-value>)'
        },
        error: {
          DEFAULT: 'hsl(var(--error) / <alpha-value>)',
          hover: 'hsl(var(--error-hover) / <alpha-value>)'
        },

        // Accessibility contrast pairs
        'btn-on-accent': 'hsl(var(--btn-fg-on-accent) / <alpha-value>)',
        'btn-on-surface': 'hsl(var(--btn-fg-on-surface) / <alpha-value>)',
        'chip-on-surface': 'hsl(var(--chip-fg-on-surface) / <alpha-value>)',

        // Chart colors for data visualization
        'chart-primary': 'hsl(var(--chart-primary) / <alpha-value>)',
        'chart-secondary': 'hsl(var(--chart-secondary) / <alpha-value>)',
        'chart-success': 'hsl(var(--chart-success) / <alpha-value>)',
        'chart-warning': 'hsl(var(--chart-warning) / <alpha-value>)',
        'chart-danger': 'hsl(var(--chart-danger) / <alpha-value>)',

        // Legacy compatibility (keep shadcn/ui working)
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },

        // Keep Tailwind's gray intact - don't override!
        // gray: { ... } // Leave this to Tailwind
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        '1': 'var(--shadow-1)',
        '2': 'var(--shadow-2)',
        '3': 'var(--shadow-3)'
      },
    },
  },
  plugins: [
    require('@tailwindcss/container-queries'),
    // tailwindcss-rtl removed - Tailwind v4 has built-in logical properties (text-start, ms-*, pe-*, etc.)
  ],
}
