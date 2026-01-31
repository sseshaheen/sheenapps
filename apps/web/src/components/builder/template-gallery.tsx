'use client'

/**
 * Template Gallery Component
 *
 * Enhanced template browsing experience with:
 * - Category filtering tabs
 * - Visual preview cards with gradients
 * - Preview modal for template details
 * - "All" category option
 */

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import Icon from '@/components/ui/icon'
import type { TemplateId, TemplateTier, TemplateCategory } from '@sheenapps/templates'

// Category to gradient mapping for visual previews
const CATEGORY_GRADIENTS: Record<string, string> = {
  retail: 'from-orange-400 to-rose-500',
  services: 'from-blue-400 to-indigo-500',
  technology: 'from-violet-400 to-purple-500',
  platform: 'from-cyan-400 to-blue-500',
  food: 'from-amber-400 to-orange-500',
  creative: 'from-pink-400 to-rose-500',
  education: 'from-emerald-400 to-teal-500',
  corporate: 'from-slate-400 to-zinc-500',
  health: 'from-green-400 to-emerald-500',
  publishing: 'from-indigo-400 to-violet-500',
  events: 'from-fuchsia-400 to-pink-500',
  'real-estate': 'from-sky-400 to-blue-500',
}

// Category icons - using available IconName values
import type { IconName } from '@/components/ui/icon'
const CATEGORY_ICONS: Record<string, IconName> = {
  retail: 'credit-card',
  services: 'calendar',
  technology: 'cpu',
  platform: 'grid-3x3',
  food: 'flame',
  creative: 'palette',
  education: 'book-open',
  corporate: 'building',
  health: 'heart',
  publishing: 'file-text',
  events: 'calendar',
  'real-estate': 'globe',
}

export interface TemplateGalleryTemplate {
  id: TemplateId
  name: string
  description: string
  emoji: string
  tier: TemplateTier
  category: TemplateCategory
  categoryKey: string
}

export interface TemplateGalleryTranslations {
  title: string
  subtitle: string
  viewAll: string
  allCategories: string
  preview: string
  useTemplate: string
  proRequired: string
  features: string
  categories: Record<string, string>
}

export interface TemplateGalleryProps {
  templates: TemplateGalleryTemplate[]
  translations: TemplateGalleryTranslations
  onSelectTemplate: (templateId: TemplateId) => void
  canAccessPro?: boolean
  isLoading?: boolean
}

interface TemplatePreviewModalProps {
  template: TemplateGalleryTemplate | null
  translations: TemplateGalleryTranslations
  categoryTranslation: string
  onClose: () => void
  onSelect: () => void
  canAccess: boolean
}

function TemplatePreviewModal({
  template,
  translations,
  categoryTranslation,
  onClose,
  onSelect,
  canAccess,
}: TemplatePreviewModalProps) {
  if (!template) return null

  const gradient = CATEGORY_GRADIENTS[template.categoryKey] || 'from-gray-400 to-gray-500'
  const isPro = template.tier === 'pro'

  return (
    <Dialog open={!!template} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">{template.emoji}</span>
            <div>
              <DialogTitle className="text-xl">{template.name}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {categoryTranslation}
                </Badge>
                {isPro && (
                  <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
                    PRO
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <DialogDescription className="text-base">
            {template.description}
          </DialogDescription>
        </DialogHeader>

        {/* Visual Preview */}
        <div className={cn(
          'relative h-48 rounded-lg bg-gradient-to-br overflow-hidden',
          gradient
        )}>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-8xl opacity-30">{template.emoji}</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
            <p className="text-white text-sm font-medium">{template.name}</p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>
            {/* Close / Cancel */}
            <Icon name="x" className="w-4 h-4 me-2" />
            Cancel
          </Button>
          <Button
            onClick={onSelect}
            disabled={!canAccess}
            className={cn(
              isPro && !canAccess && 'opacity-50'
            )}
          >
            {!canAccess && isPro ? (
              <>
                <Icon name="lock" className="w-4 h-4 me-2" />
                {translations.proRequired}
              </>
            ) : (
              <>
                <Icon name="rocket" className="w-4 h-4 me-2" />
                {translations.useTemplate}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TemplateGallery({
  templates,
  translations,
  onSelectTemplate,
  canAccessPro = false,
  isLoading = false,
}: TemplateGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<TemplateGalleryTemplate | null>(null)

  // Get unique categories from templates
  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(templates.map(t => t.categoryKey))]
    return uniqueCategories.sort()
  }, [templates])

  // Filter templates by selected category
  const filteredTemplates = useMemo(() => {
    if (!selectedCategory) return templates
    return templates.filter(t => t.categoryKey === selectedCategory)
  }, [templates, selectedCategory])

  const handlePreview = useCallback((template: TemplateGalleryTemplate) => {
    setPreviewTemplate(template)
  }, [])

  const handleClosePreview = useCallback(() => {
    setPreviewTemplate(null)
  }, [])

  const handleSelectFromPreview = useCallback(() => {
    if (previewTemplate) {
      onSelectTemplate(previewTemplate.id)
      setPreviewTemplate(null)
    }
  }, [previewTemplate, onSelectTemplate])

  const canAccessTemplate = useCallback((template: TemplateGalleryTemplate) => {
    return template.tier === 'free' || canAccessPro
  }, [canAccessPro])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {translations.title}
          </h2>
          <p className="text-muted-foreground mt-1">
            {translations.subtitle}
          </p>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedCategory === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory(null)}
          className="rounded-full"
        >
          {translations.allCategories}
          <Badge variant="secondary" className="ms-2 rounded-full">
            {templates.length}
          </Badge>
        </Button>
        {categories.map((categoryKey) => {
          const count = templates.filter(t => t.categoryKey === categoryKey).length
          const categoryName = translations.categories[categoryKey] || categoryKey
          const icon = CATEGORY_ICONS[categoryKey]

          return (
            <Button
              key={categoryKey}
              variant={selectedCategory === categoryKey ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(categoryKey)}
              className="rounded-full"
            >
              {icon && <Icon name={icon} className="w-4 h-4 me-1.5" />}
              {categoryName}
              <Badge variant="secondary" className="ms-2 rounded-full">
                {count}
              </Badge>
            </Button>
          )
        })}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredTemplates.map((template) => {
          const isPro = template.tier === 'pro'
          const canAccess = canAccessTemplate(template)
          const gradient = CATEGORY_GRADIENTS[template.categoryKey] || 'from-gray-400 to-gray-500'
          const categoryName = translations.categories[template.categoryKey] || template.categoryKey

          return (
            <Card
              key={template.id}
              className={cn(
                'group relative overflow-hidden cursor-pointer transition-all duration-200',
                'hover:shadow-lg hover:scale-[1.02] hover:border-primary/50',
                'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2',
                !canAccess && 'opacity-75'
              )}
            >
              {/* Visual Preview Area */}
              <div className={cn(
                'relative h-32 bg-gradient-to-br overflow-hidden',
                gradient
              )}>
                {/* PRO Badge */}
                {isPro && (
                  <div className="absolute top-2 end-2 z-10">
                    <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 shadow-md">
                      PRO
                    </Badge>
                  </div>
                )}

                {/* Emoji Watermark */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-6xl opacity-30 group-hover:scale-110 transition-transform duration-300">
                    {template.emoji}
                  </span>
                </div>

                {/* Preview Button - appears on hover */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-200">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePreview(template)
                    }}
                  >
                    <Icon name="eye" className="w-4 h-4 me-1.5" />
                    {translations.preview}
                  </Button>
                </div>
              </div>

              {/* Content */}
              <CardHeader
                className="space-y-2 cursor-pointer"
                onClick={() => canAccess && onSelectTemplate(template.id)}
                tabIndex={canAccess ? 0 : -1}
                onKeyDown={(e) => {
                  if (canAccess && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    onSelectTemplate(template.id)
                  }
                }}
                role="button"
                aria-label={`${template.name}${isPro ? ' (PRO)' : ''}`}
                aria-disabled={!canAccess}
              >
                <div className="flex items-start gap-2">
                  <span className="text-2xl">{template.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-semibold leading-tight">
                      {template.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {categoryName}
                    </p>
                  </div>
                </div>
                <CardDescription className="text-sm line-clamp-2">
                  {template.description}
                </CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      {/* Empty State */}
      {filteredTemplates.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <Icon name="search" className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground mt-4">
            No templates found in this category
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setSelectedCategory(null)}
          >
            {translations.allCategories}
          </Button>
        </div>
      )}

      {/* Preview Modal */}
      <TemplatePreviewModal
        template={previewTemplate}
        translations={translations}
        categoryTranslation={
          previewTemplate
            ? translations.categories[previewTemplate.categoryKey] || previewTemplate.categoryKey
            : ''
        }
        onClose={handleClosePreview}
        onSelect={handleSelectFromPreview}
        canAccess={previewTemplate ? canAccessTemplate(previewTemplate) : false}
      />
    </div>
  )
}

export default TemplateGallery
