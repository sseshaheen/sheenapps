'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Icon, { IconName } from '@/components/ui/icon'
import { User } from '@/types/auth'

interface SidebarProps {
  activeTab: 'design' | 'preview' | 'export'
  onTabChange: (tab: 'design' | 'preview' | 'export') => void
  collapsed: boolean
  onToggleCollapse: () => void
  translations: {
    design: string
    preview: string
    export: string
    settings: string
    projects: string
  }
  user: User | null
  projectId: string
}

const TABS = [
  { id: 'design' as const, icon: 'sparkles' as IconName, label: 'design' },
  { id: 'preview' as const, icon: 'eye' as IconName, label: 'preview' },
  { id: 'export' as const, icon: 'download' as IconName, label: 'export' }
]

// Mock recent projects
const MOCK_RECENT_PROJECTS = [
  { id: 'proj_1', name: 'Salon Booking App', lastModified: '2h ago' },
  { id: 'proj_2', name: 'Cookie Store', lastModified: '1d ago' },
  { id: 'proj_3', name: 'Jewelry Shop', lastModified: '3d ago' }
]

export function Sidebar({ 
  activeTab, 
  onTabChange, 
  collapsed, 
  onToggleCollapse, 
  translations,
  user,
  projectId
}: SidebarProps) {
  return (
    <div className={cn(
      "bg-gray-800 border-r border-gray-700 flex flex-col transition-all duration-200",
      collapsed ? "w-12" : "w-64"
    )}>
      {/* Collapse Toggle */}
      <div className="p-2 border-b border-gray-700">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="w-full justify-center text-gray-400 hover:text-white"
        >
          {collapsed ? <Icon name="chevron-right" className="w-4 h-4"  /> : <Icon name="chevron-left" className="w-4 h-4"  />}
        </Button>
      </div>

      {/* Main Tabs */}
      <div className="p-2 space-y-1">
        {TABS.map(({ id, icon: iconName, label }) => (
          <Button
            key={id}
            variant={activeTab === id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onTabChange(id)}
            className={cn(
              "w-full justify-start",
              collapsed ? "px-2" : "px-3",
              activeTab === id 
                ? "bg-purple-600 text-white hover:bg-purple-700" 
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            )}
          >
            <Icon name={iconName} className={cn("w-4 h-4", collapsed ? "" : "mr-3")} />
            {!collapsed && (
              <span className="capitalize">
                {translations[label as keyof typeof translations]}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Projects Section (for authenticated users) */}
      {user && !collapsed && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="p-2 border-t border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {translations.projects}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-gray-400 hover:text-white"
              >
                <Icon name="x" className="w-3 h-3"  />
              </Button>
            </div>

            <div className="space-y-1 max-h-40 overflow-y-auto">
              {MOCK_RECENT_PROJECTS.map((project) => (
                <button
                  key={project.id}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-700 transition-colors",
                    project.id === projectId ? "bg-gray-700 text-white" : "text-gray-400"
                  )}
                >
                  <div className="truncate font-medium">{project.name}</div>
                  <div className="text-gray-500 text-xs">{project.lastModified}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="p-2 border-t border-gray-700">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start text-gray-400 hover:text-white hover:bg-gray-700",
            collapsed ? "px-2" : "px-3"
          )}
        >
          <Icon name="settings" className={cn("w-4 h-4", collapsed ? "" : "mr-3")}  />
          {!collapsed && translations.settings}
        </Button>
      </div>
    </div>
  )
}