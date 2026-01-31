'use client'

import React, { useRef } from 'react'
import { applyTemplateTheme, clearTemplateTheme, TEMPLATE_THEMES } from '@/utils/template-theme-loader'

export default function TestTokensPage() {
  const previewRef = useRef<HTMLDivElement>(null)
  
  const handleThemeChange = (themeId: string) => {
    if (previewRef.current) {
      if (themeId === 'clear') {
        clearTemplateTheme(previewRef.current)
      } else {
        applyTemplateTheme(previewRef.current, themeId)
      }
    }
  }

  return (
    <div className="min-h-screen bg-bg text-fg p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold">Token System Test</h1>
        
        {/* Theme Controls */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Template Themes</h2>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => handleThemeChange('clear')}
              className="px-4 py-2 bg-neutral text-fg rounded hover:bg-accent hover:text-btn-on-accent"
            >
              Clear Theme
            </button>
            {Object.values(TEMPLATE_THEMES).map(theme => (
              <button
                key={theme.id}
                onClick={() => handleThemeChange(theme.id)}
                className="px-4 py-2 bg-accent text-btn-on-accent rounded hover:bg-accent-hover"
              >
                {theme.name}
              </button>
            ))}
          </div>
        </div>

        {/* Test Preview Container */}
        <div 
          ref={previewRef}
          className="p-8 bg-surface border border-border rounded-lg"
        >
          <h3 className="text-xl font-semibold text-fg mb-4">Template Preview Container</h3>
          <p className="text-muted mb-4">
            This container should change colors when you apply different template themes.
            The background uses --tpl-surface and the accent color uses --tpl-accent.
          </p>
          
          <div className="space-y-4">
            <div className="p-4 bg-accent text-btn-on-accent rounded shadow-2">
              Accent Background - Should change with template
            </div>
            
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-accent text-btn-on-accent rounded hover:bg-accent-hover shadow-1 hover:shadow-2 transition-all">
                Primary Button
              </button>
              <button className="px-4 py-2 bg-surface border border-border text-fg rounded hover:bg-neutral shadow-1">
                Secondary Button
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="p-3 bg-success text-white rounded hover:bg-success-hover transition-colors shadow-1">
                Success State
              </div>
              <div className="p-3 bg-warning text-white rounded hover:bg-warning-hover transition-colors shadow-1">
                Warning State
              </div>
              <div className="p-3 bg-error text-white rounded hover:bg-error-hover transition-colors shadow-1">
                Error State
              </div>
            </div>
          </div>
        </div>

        {/* Shadow Tokens Showcase */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Shadow System (Expert Enhancement)</h2>
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-surface p-6 rounded-lg shadow-1">
              <h3 className="font-medium mb-2">Subtle Shadow</h3>
              <code className="text-sm text-muted">shadow-1</code>
            </div>
            <div className="bg-surface p-6 rounded-lg shadow-2">
              <h3 className="font-medium mb-2">Medium Shadow</h3>
              <code className="text-sm text-muted">shadow-2</code>
            </div>
            <div className="bg-surface p-6 rounded-lg shadow-3">
              <h3 className="font-medium mb-2">Deep Shadow</h3>
              <code className="text-sm text-muted">shadow-3</code>
            </div>
          </div>
        </div>

        {/* Token Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface p-6 rounded-lg border border-border">
            <h3 className="font-semibold mb-3">Core Tokens</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>--bg:</span>
                <div className="w-6 h-6 rounded" style={{ backgroundColor: 'hsl(var(--bg))' }}></div>
              </div>
              <div className="flex justify-between">
                <span>--fg:</span>
                <div className="w-6 h-6 rounded border" style={{ backgroundColor: 'hsl(var(--fg))' }}></div>
              </div>
              <div className="flex justify-between">
                <span>--accent:</span>
                <div className="w-6 h-6 rounded" style={{ backgroundColor: 'hsl(var(--accent))' }}></div>
              </div>
              <div className="flex justify-between">
                <span>--surface:</span>
                <div className="w-6 h-6 rounded border" style={{ backgroundColor: 'hsl(var(--surface))' }}></div>
              </div>
            </div>
          </div>

          <div className="bg-surface p-6 rounded-lg border border-border">
            <h3 className="font-semibold mb-3">Template Tokens</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>--tpl-bg:</span>
                <div className="w-6 h-6 rounded" style={{ backgroundColor: 'hsl(var(--tpl-bg))' }}></div>
              </div>
              <div className="flex justify-between">
                <span>--tpl-fg:</span>
                <div className="w-6 h-6 rounded border" style={{ backgroundColor: 'hsl(var(--tpl-fg))' }}></div>
              </div>
              <div className="flex justify-between">
                <span>--tpl-accent:</span>
                <div className="w-6 h-6 rounded" style={{ backgroundColor: 'hsl(var(--tpl-accent))' }}></div>
              </div>
              <div className="flex justify-between">
                <span>--tpl-surface:</span>
                <div className="w-6 h-6 rounded border" style={{ backgroundColor: 'hsl(var(--tpl-surface))' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}