/**
 * Icon map for admin navigation
 * Maps string icon names from nav model to actual Lucide components
 */

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Clock,
  Database,
  DollarSign,
  FileText,
  Flag,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  Headphones,
  HeartPulse,
  Inbox,
  KeyRound,
  LineChart,
  Lock,
  Mail,
  Mic,
  Package,
  Plug,
  Radio,
  Server,
  Settings,
  Shield,
  Sparkles,
  Tags,
  Terminal,
  TestTube,
  TrendingUp,
  UserCheck,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react'

export const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Clock,
  Database,
  DollarSign,
  FileText,
  Flag,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  Headphones,
  HeartPulse,
  Inbox,
  KeyRound,
  LineChart,
  Lock,
  Mail,
  Mic,
  Package,
  Plug,
  Radio,
  Server,
  Settings,
  Shield,
  Sparkles,
  Tags,
  Terminal,
  TestTube,
  TrendingUp,
  UserCheck,
  Users,
  Workflow,
  Zap,
}

/**
 * Get icon component by name
 * Returns Shield as fallback if icon not found
 */
export function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Shield
}
