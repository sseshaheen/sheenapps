/**
 * Chart Color Utilities
 * Provides standardized colors for data visualization using design tokens
 */

// Standard chart color palette using CSS variables
export const CHART_COLORS = {
  primary: 'hsl(var(--chart-primary))',     // Purple - #8b5cf6 equivalent
  secondary: 'hsl(var(--chart-secondary))', // Blue - #3b82f6 equivalent  
  success: 'hsl(var(--chart-success))',     // Green - #10b981 equivalent
  warning: 'hsl(var(--chart-warning))',     // Orange - #f59e0b equivalent
  danger: 'hsl(var(--chart-danger))',       // Red - #ef4444 equivalent
} as const

// Array format for libraries that expect color arrays (like Recharts)
export const CHART_COLOR_ARRAY = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
] as const

// Semantic color mapping for different chart types
export const getChartColor = (type: 'revenue' | 'usage' | 'conversion' | 'error' | 'success') => {
  switch (type) {
    case 'revenue':
      return CHART_COLORS.success
    case 'usage':
      return CHART_COLORS.primary
    case 'conversion':
      return CHART_COLORS.secondary
    case 'error':
      return CHART_COLORS.danger
    case 'success':
      return CHART_COLORS.success
    default:
      return CHART_COLORS.primary
  }
}

// For components that need hex values (backwards compatibility)
export const getChartColorHex = (index: number): string => {
  const hexColors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
  return hexColors[index % hexColors.length]
}

// Dark mode compatible chart colors (auto-adjusts via CSS variables)
export const getDarkModeChartColor = (colorKey: keyof typeof CHART_COLORS) => {
  return CHART_COLORS[colorKey] // CSS variables handle dark mode automatically
}