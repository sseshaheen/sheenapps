
'use client'

import Icon from '@/components/ui/icon'
import { ROUTES } from '@/i18n/routes'
import { Link, usePathname } from '@/i18n/routing'
import { getInitialsAvatar } from '@/lib/user-utils'
import { useEffect, useRef, useState } from 'react'




import { cn } from '@/lib/utils'

interface UserMenuProps {
  user: {
    name?: string
    avatar?: string
    plan?: string
    email?: string
  }
  onLogout: () => void | Promise<void>
  variant?: 'header' | 'mobile' | 'workspace' | 'compact'
  showPlan?: boolean
  className?: string
  translations?: {
    profile: string
    settings: string
    billing: string
    upgrade: string
    logout: string
    clickToLogout: string
    plan: string
    planCapitalized: string
    comingSoon: string
  }
}

export function UserMenu({
  user,
  onLogout,
  variant = 'header',
  showPlan = true,
  className,
  translations
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Extract locale from pathname (e.g., /en/dashboard -> en)
  const locale = pathname.split('/')[1] || 'en'

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    setIsOpen(false)
    await onLogout()
  }

  const avatarSize = {
    header: 'w-8 h-8',
    workspace: 'w-8 h-8',
    compact: 'w-8 h-8',
    mobile: 'w-10 h-10'
  }[variant]

  const menuPosition = {
    header: 'right-0 top-full mt-2',
    workspace: 'right-0 top-full mt-2',
    compact: 'right-4 top-full mt-2',
    mobile: 'right-0 bottom-full mb-2'
  }[variant]

  return (
    <div className={cn("relative", className)} ref={menuRef}>
      {/* User Info & Avatar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-lg p-1"
        aria-label="User menu"
      >
        {/* User Details (for workspace/header variants only) - ALWAYS rendered but hidden via CSS */}
        {(variant === 'header' || variant === 'workspace') && showPlan && (
          <div className={cn(
            "text-right",
            // ✅ EXPERT FIX: Always render element, use CSS to hide - prevents hydration anchor remount
            "hidden sm:block"
          )}>
            <div className={cn(
              "text-sm font-medium",
              variant === 'header' ? "text-foreground" : "text-white"
            )}>{user.name || user.email?.split('@')[0] || 'User'}</div>
            {showPlan && (
              <div className="text-xs text-gray-400 capitalize flex items-center gap-1 justify-end">
                {user.plan === 'pro' && <Icon name="crown" className="w-3 h-3"  />}
                {user.plan === 'free' && <Icon name="credit-card" className="w-3 h-3"  />}
                {user.plan || 'free'} {translations?.plan || 'plan'}
              </div>
            )}
          </div>
        )}

        {/* Mobile variant shows user info inline */}
        {variant === 'mobile' && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={user.avatar || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiM2QjdBODAiLz4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxMiIgcj0iNSIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTYgMjZDNiAyMC40NzcyIDEwLjQ3NzIgMTYgMTYgMTZDMjEuNTIyOCAxNiAyNiAyMC40NzcyIDI2IDI2VjI2SDZWMjZaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K'}
                alt={user.name || 'User'}
                className="w-10 h-10 rounded-full ring-2 ring-gray-600"
              />
              {/* Plan indicator */}
              <div className={cn(
                "absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold",
                user.plan === 'growth' || user.plan === 'scale'
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  : "bg-gray-600 text-gray-300"
              )}>
                {user.plan === 'growth' ? '⭐' : user.plan === 'scale' ? '💎' : user.plan === 'starter' ? 'S' : 'F'}
              </div>
            </div>

            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {user.name || user.email?.split('@')[0] || 'User'}
              </div>
              <div className="text-xs text-gray-400 capitalize">
                {user.plan || 'free'} {translations?.planCapitalized || 'Plan'}
              </div>
            </div>
          </div>
        )}

        {/* Avatar (for header/workspace/compact variants) */}
        {variant !== 'mobile' && (
          <div className="relative">
            <div className={cn(
              avatarSize,
              "rounded-full overflow-hidden hover:ring-2 hover:ring-purple-500 transition-all",
              "bg-gradient-to-br from-purple-500 to-pink-500"
            )}>
              <img
                src={user.avatar || getInitialsAvatar(user.name, user.email)}
                alt={user.name || 'User'}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Plan indicator for compact variant - inset to avoid overlap with neighbors */}
            {variant === 'compact' && showPlan && (
              <div className={cn(
                "pointer-events-none absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full",
                "flex items-center justify-center text-[10px] font-bold ring-1 ring-gray-800",
                user.plan === 'pro' || user.plan === 'growth' || user.plan === 'scale'
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  : "bg-gray-600 text-gray-300"
              )}>
                {user.plan === 'pro' ? '👑' : user.plan === 'growth' ? '⭐' : user.plan === 'scale' ? '💎' : 'F'}
              </div>
            )}
          </div>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={cn(
          "absolute w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-200",
          menuPosition
        )}
        style={{ zIndex: 99999 }}>
          {/* User Info Header */}
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <img
                src={user.avatar || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiM2QjdBODAiLz4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxMiIgcj0iNSIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTYgMjZDNiAyMC40NzcyIDEwLjQ3NzIgMTYgMTYgMTZDMjEuNTIyOCAxNiAyNiAyMC40NzcyIDI2IDI2VjI2SDZWMjZaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K'}
                alt={user.name || 'User'}
                className="w-10 h-10 rounded-full"
              />
              <div>
                <div className="font-medium text-white">{user.name || user.email?.split('@')[0] || 'User'}</div>
                {user.email && (
                  <div className="text-sm text-gray-400">{user.email}</div>
                )}
                <div className="text-xs text-gray-500 capitalize flex items-center gap-1 mt-1">
                  {user.plan === 'pro' && <Icon name="crown" className="w-3 h-3 text-yellow-500"  />}
                  {user.plan === 'free' && <Icon name="credit-card" className="w-3 h-3"  />}
                  {user.plan || 'free'} {translations?.plan || 'plan'}
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="p-2">
            {/* Profile - Coming Soon */}
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-md transition-colors opacity-50 cursor-not-allowed"
              disabled
            >
              <Icon name="user" className="w-4 h-4"  />
              {translations?.profile || 'Profile'} <span className="text-xs ml-auto">({translations?.comingSoon || 'Coming Soon'})</span>
            </button>

            {/* Settings - Coming Soon */}
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-md transition-colors opacity-50 cursor-not-allowed"
              disabled
            >
              <Icon name="settings" className="w-4 h-4"  />
              {translations?.settings || 'Settings'} <span className="text-xs ml-auto">({translations?.comingSoon || 'Coming Soon'})</span>
            </button>

            <Link
              href={ROUTES.BILLING}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-md transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Icon name="credit-card" className="w-4 h-4"  />
              {translations?.billing || 'Billing'}
            </Link>

            {/* Blog Link */}
            <Link
              href="/blog"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-md transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Icon name="book-open" className="w-4 h-4"  />
              Blog
            </Link>

            {(!user.plan || user.plan === 'free') && (
              <Link
                href={ROUTES.BILLING}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-400 hover:bg-gray-800 rounded-md transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Icon name="crown" className="w-4 h-4"  />
                {translations?.upgrade || 'Upgrade to Pro'}
              </Link>
            )}

            <hr className="my-2 border-gray-700" />

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-gray-800 rounded-md transition-colors"
            >
              <Icon name="log-out" className="w-4 h-4"  />
              {translations?.logout || 'Logout'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Simplified version for quick logout (like current workspace header)
export function UserAvatar({ user, onLogout, className, translations }: Pick<UserMenuProps, 'user' | 'onLogout' | 'className' | 'translations'>) {
  return (
    <button
      onClick={onLogout}
      className={cn(
        "w-8 h-8 rounded-full overflow-hidden hover:ring-2 hover:ring-purple-500 transition-all",
        "focus:outline-none focus:ring-2 focus:ring-purple-500",
        className
      )}
      title={translations?.clickToLogout || "Click to logout"}
    >
      <img
        src={user.avatar || '/default-avatar.png'}
        alt={user.name || 'User'}
        className="w-full h-full object-cover"
      />
    </button>
  )
}
