/**
 * FigmaImportService - Convert Figma designs to React/Next.js code
 *
 * Fetches Figma designs via the connectors SDK and generates
 * React components with Tailwind CSS styling.
 */

import { getPool } from '../database'
import {
  getInhouseConnectorService,
  Connection,
} from '../inhouse/InhouseConnectorService'

// ============================================================================
// Types
// ============================================================================

export interface FigmaUrl {
  fileKey: string
  nodeIds?: string[]
  pageName?: string
}

export interface FigmaFile {
  name: string
  lastModified: string
  thumbnailUrl?: string
  document: FigmaNode
  components: Record<string, FigmaComponent>
  styles: Record<string, FigmaStyle>
}

export interface FigmaNode {
  id: string
  name: string
  type: FigmaNodeType
  visible?: boolean
  children?: FigmaNode[]
  absoluteBoundingBox?: BoundingBox
  constraints?: Constraints
  fills?: Paint[]
  strokes?: Paint[]
  strokeWeight?: number
  cornerRadius?: number
  rectangleCornerRadii?: [number, number, number, number]
  effects?: Effect[]
  opacity?: number
  blendMode?: string
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE'
  primaryAxisSizingMode?: 'FIXED' | 'AUTO'
  counterAxisSizingMode?: 'FIXED' | 'AUTO'
  primaryAxisAlignItems?: string
  counterAxisAlignItems?: string
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  itemSpacing?: number
  characters?: string
  style?: TypeStyle
  characterStyleOverrides?: number[]
  styleOverrideTable?: Record<string, TypeStyle>
}

export type FigmaNodeType =
  | 'DOCUMENT'
  | 'CANVAS'
  | 'FRAME'
  | 'GROUP'
  | 'VECTOR'
  | 'BOOLEAN_OPERATION'
  | 'STAR'
  | 'LINE'
  | 'ELLIPSE'
  | 'REGULAR_POLYGON'
  | 'RECTANGLE'
  | 'TEXT'
  | 'SLICE'
  | 'COMPONENT'
  | 'COMPONENT_SET'
  | 'INSTANCE'
  | 'STICKY'
  | 'SHAPE_WITH_TEXT'
  | 'CONNECTOR'
  | 'SECTION'

export interface FigmaComponent {
  key: string
  name: string
  description?: string
}

export interface FigmaStyle {
  key: string
  name: string
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID'
  description?: string
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface Constraints {
  vertical: string
  horizontal: string
}

export interface Paint {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE' | 'EMOJI'
  visible?: boolean
  opacity?: number
  color?: RGBA
  gradientHandlePositions?: Vector[]
  gradientStops?: ColorStop[]
  scaleMode?: string
  imageRef?: string
}

export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

export interface Vector {
  x: number
  y: number
}

export interface ColorStop {
  position: number
  color: RGBA
}

export interface Effect {
  type: 'INNER_SHADOW' | 'DROP_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'
  visible?: boolean
  radius?: number
  color?: RGBA
  offset?: Vector
  spread?: number
}

export interface TypeStyle {
  fontFamily?: string
  fontPostScriptName?: string
  fontWeight?: number
  fontSize?: number
  textAlignHorizontal?: string
  textAlignVertical?: string
  letterSpacing?: number
  lineHeightPx?: number
  lineHeightPercent?: number
  lineHeightPercentFontSize?: number
  lineHeightUnit?: string
}

// ============================================================================
// Design Tokens
// ============================================================================

export interface DesignTokens {
  colors: Record<string, string>
  typography: Record<string, TypographyToken>
  spacing: number[]
  borderRadius: number[]
  shadows: Record<string, string>
}

export interface TypographyToken {
  fontFamily: string
  fontSize: string
  fontWeight: number
  lineHeight: string
  letterSpacing?: string
}

// ============================================================================
// Component Tree
// ============================================================================

export interface ComponentTree {
  type: 'container' | 'text' | 'image' | 'button' | 'input' | 'icon' | 'group'
  name: string
  props: Record<string, unknown>
  styles: Record<string, string | number>
  children?: ComponentTree[]
  text?: string
  imageSrc?: string
}

// ============================================================================
// Import Result
// ============================================================================

export interface FigmaImportResult {
  success: boolean
  components: GeneratedComponent[]
  tokens: DesignTokens
  errors?: string[]
}

export interface GeneratedComponent {
  name: string
  code: string
  path: string
}

// ============================================================================
// Service Class
// ============================================================================

export class FigmaImportService {
  private readonly projectId: string

  constructor(projectId: string) {
    this.projectId = projectId
  }

  /**
   * Import design from a Figma URL
   */
  async importFromUrl(
    url: string,
    connectionId: string,
    options?: {
      generateTokens?: boolean
      targetPath?: string
    }
  ): Promise<FigmaImportResult> {
    const errors: string[] = []

    // 1. Parse Figma URL
    const figmaUrl = this.parseFigmaUrl(url)
    if (!figmaUrl) {
      return {
        success: false,
        components: [],
        tokens: this.emptyTokens(),
        errors: ['Invalid Figma URL'],
      }
    }

    // 2. Verify connection
    const connectorService = getInhouseConnectorService(this.projectId)
    const connection = await connectorService.getConnection(connectionId)
    if (!connection || connection.type !== 'figma') {
      return {
        success: false,
        components: [],
        tokens: this.emptyTokens(),
        errors: ['Invalid or missing Figma connection'],
      }
    }

    // 3. Fetch design from Figma
    let figmaFile: FigmaFile
    try {
      figmaFile = await this.fetchFigmaFile(connectionId, figmaUrl)
    } catch (error) {
      return {
        success: false,
        components: [],
        tokens: this.emptyTokens(),
        errors: [`Failed to fetch Figma file: ${error instanceof Error ? error.message : 'Unknown error'}`],
      }
    }

    // 4. Extract design tokens
    const tokens = this.extractDesignTokens(figmaFile)

    // 5. Get nodes to process
    const nodesToProcess = figmaUrl.nodeIds?.length
      ? this.findNodesByIds(figmaFile.document, figmaUrl.nodeIds)
      : this.getTopLevelFrames(figmaFile.document)

    if (nodesToProcess.length === 0) {
      return {
        success: false,
        components: [],
        tokens,
        errors: ['No frames found to import'],
      }
    }

    // 6. Map nodes to component tree
    const componentTrees = nodesToProcess.map(node => this.mapNodeToComponentTree(node))

    // 7. Generate code via AI (stub for now - needs AIService integration)
    const components: GeneratedComponent[] = []
    const targetPath = options?.targetPath || 'src/components/figma'

    for (const tree of componentTrees) {
      const componentName = this.sanitizeComponentName(tree.name)
      const code = this.generateComponentCode(tree, tokens, componentName)

      components.push({
        name: componentName,
        code,
        path: `${targetPath}/${componentName}.tsx`,
      })
    }

    return {
      success: true,
      components,
      tokens,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Parse Figma URL to extract file key and node IDs
   */
  parseFigmaUrl(url: string): FigmaUrl | null {
    try {
      const urlObj = new URL(url)

      // Check if it's a Figma URL
      if (!urlObj.hostname.includes('figma.com')) {
        return null
      }

      // Extract file key from path
      // Formats:
      // - https://www.figma.com/file/{fileKey}/{title}
      // - https://www.figma.com/design/{fileKey}/{title}
      const pathParts = urlObj.pathname.split('/')
      const fileIndex = pathParts.findIndex(p => p === 'file' || p === 'design')
      const fileKey = pathParts[fileIndex + 1]
      if (fileIndex === -1 || !fileKey) {
        return null
      }

      // Extract node IDs from URL params (node-id=X:Y or node-id=X-Y)
      const nodeIdParam = urlObj.searchParams.get('node-id')
      let nodeIds: string[] | undefined

      if (nodeIdParam) {
        // Node IDs can be comma-separated
        nodeIds = nodeIdParam.split(',').map(id => {
          // Convert hyphen format to colon format
          return id.replace(/-/g, ':')
        })
      }

      return {
        fileKey,
        nodeIds,
      }
    } catch {
      return null
    }
  }

  /**
   * Fetch Figma file via the connector service
   */
  private async fetchFigmaFile(connectionId: string, figmaUrl: FigmaUrl): Promise<FigmaFile> {
    const connectorService = getInhouseConnectorService(this.projectId)

    // For now, since connector call isn't fully implemented,
    // we'll need to call the Figma API directly once the connector
    // service is complete
    throw new Error('Figma API call not yet implemented - pending connector call implementation')
  }

  /**
   * Extract design tokens from Figma file
   */
  extractDesignTokens(file: FigmaFile): DesignTokens {
    const colors: Record<string, string> = {}
    const typography: Record<string, TypographyToken> = {}
    const spacingSet = new Set<number>()
    const borderRadiusSet = new Set<number>()
    const shadows: Record<string, string> = {}

    // Extract from styles
    for (const [key, style] of Object.entries(file.styles || {})) {
      if (style.styleType === 'FILL') {
        // Color styles handled when we traverse nodes
      } else if (style.styleType === 'TEXT') {
        // Text styles handled when we traverse nodes
      }
    }

    // Extract from document by traversing all nodes
    this.traverseNodes(file.document, node => {
      // Extract colors from fills
      if (node.fills) {
        for (const fill of node.fills) {
          if (fill.type === 'SOLID' && fill.color) {
            const hex = this.rgbaToHex(fill.color)
            const colorName = this.generateColorName(hex, node.name)
            if (!colors[colorName]) {
              colors[colorName] = hex
            }
          }
        }
      }

      // Extract typography from text nodes
      if (node.type === 'TEXT' && node.style) {
        const tokenName = this.sanitizeTokenName(node.name)
        if (!typography[tokenName] && node.style.fontFamily) {
          typography[tokenName] = {
            fontFamily: node.style.fontFamily,
            fontSize: `${node.style.fontSize || 16}px`,
            fontWeight: node.style.fontWeight || 400,
            lineHeight: node.style.lineHeightPx
              ? `${node.style.lineHeightPx}px`
              : node.style.lineHeightPercent
              ? `${node.style.lineHeightPercent}%`
              : 'normal',
            letterSpacing: node.style.letterSpacing
              ? `${node.style.letterSpacing}px`
              : undefined,
          }
        }
      }

      // Extract spacing from layout nodes
      if (node.paddingTop !== undefined) spacingSet.add(Math.round(node.paddingTop))
      if (node.paddingBottom !== undefined) spacingSet.add(Math.round(node.paddingBottom))
      if (node.paddingLeft !== undefined) spacingSet.add(Math.round(node.paddingLeft))
      if (node.paddingRight !== undefined) spacingSet.add(Math.round(node.paddingRight))
      if (node.itemSpacing !== undefined) spacingSet.add(Math.round(node.itemSpacing))

      // Extract border radius
      if (node.cornerRadius !== undefined) {
        borderRadiusSet.add(Math.round(node.cornerRadius))
      }
      if (node.rectangleCornerRadii) {
        for (const r of node.rectangleCornerRadii) {
          borderRadiusSet.add(Math.round(r))
        }
      }

      // Extract shadows
      if (node.effects) {
        for (const effect of node.effects) {
          if (
            (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') &&
            effect.visible !== false
          ) {
            const shadowName = effect.type === 'INNER_SHADOW' ? 'inner' : 'default'
            if (!shadows[shadowName]) {
              const color = effect.color ? this.rgbaToHex(effect.color, true) : 'rgba(0,0,0,0.25)'
              const x = effect.offset?.x || 0
              const y = effect.offset?.y || 0
              const blur = effect.radius || 0
              const spread = effect.spread || 0
              const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : ''
              shadows[shadowName] = `${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`
            }
          }
        }
      }
    })

    // Sort and dedupe spacing/radius
    const spacing = [...spacingSet].filter(n => n > 0).sort((a, b) => a - b)
    const borderRadius = [...borderRadiusSet].filter(n => n > 0).sort((a, b) => a - b)

    return {
      colors,
      typography,
      spacing: spacing.length > 0 ? spacing : [4, 8, 12, 16, 24, 32, 48, 64],
      borderRadius: borderRadius.length > 0 ? borderRadius : [4, 8, 12, 16],
      shadows,
    }
  }

  /**
   * Traverse all nodes in the document
   */
  private traverseNodes(node: FigmaNode, callback: (node: FigmaNode) => void): void {
    callback(node)
    if (node.children) {
      for (const child of node.children) {
        this.traverseNodes(child, callback)
      }
    }
  }

  /**
   * Find nodes by their IDs
   */
  private findNodesByIds(root: FigmaNode, ids: string[]): FigmaNode[] {
    const found: FigmaNode[] = []
    const idSet = new Set(ids)

    this.traverseNodes(root, node => {
      if (idSet.has(node.id)) {
        found.push(node)
      }
    })

    return found
  }

  /**
   * Get top-level frames (typically the main artboards)
   */
  private getTopLevelFrames(document: FigmaNode): FigmaNode[] {
    const frames: FigmaNode[] = []

    // Document -> Canvas (pages) -> Frames
    if (document.children) {
      for (const canvas of document.children) {
        if (canvas.type === 'CANVAS' && canvas.children) {
          for (const node of canvas.children) {
            if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
              frames.push(node)
            }
          }
        }
      }
    }

    return frames
  }

  /**
   * Map Figma node to component tree
   */
  mapNodeToComponentTree(node: FigmaNode): ComponentTree {
    const styles = this.extractNodeStyles(node)
    const type = this.inferComponentType(node)

    const tree: ComponentTree = {
      type,
      name: node.name,
      props: {},
      styles,
    }

    // Handle text content
    if (node.type === 'TEXT' && node.characters) {
      tree.text = node.characters
    }

    // Handle children
    if (node.children && node.children.length > 0) {
      tree.children = node.children
        .filter(child => child.visible !== false)
        .map(child => this.mapNodeToComponentTree(child))
    }

    return tree
  }

  /**
   * Infer component type from Figma node
   */
  private inferComponentType(node: FigmaNode): ComponentTree['type'] {
    const nameLower = node.name.toLowerCase()

    // Check name for hints
    if (nameLower.includes('button') || nameLower.includes('btn')) {
      return 'button'
    }
    if (nameLower.includes('input') || nameLower.includes('field') || nameLower.includes('textfield')) {
      return 'input'
    }
    if (nameLower.includes('icon')) {
      return 'icon'
    }
    if (nameLower.includes('image') || nameLower.includes('img') || nameLower.includes('photo')) {
      return 'image'
    }

    // Check node type
    if (node.type === 'TEXT') {
      return 'text'
    }
    if (node.type === 'GROUP') {
      return 'group'
    }

    return 'container'
  }

  /**
   * Extract styles from a Figma node
   */
  private extractNodeStyles(node: FigmaNode): Record<string, string | number> {
    const styles: Record<string, string | number> = {}

    // Size
    if (node.absoluteBoundingBox) {
      styles.width = Math.round(node.absoluteBoundingBox.width)
      styles.height = Math.round(node.absoluteBoundingBox.height)
    }

    // Layout
    if (node.layoutMode === 'HORIZONTAL') {
      styles.display = 'flex'
      styles.flexDirection = 'row'
    } else if (node.layoutMode === 'VERTICAL') {
      styles.display = 'flex'
      styles.flexDirection = 'column'
    }

    // Alignment
    if (node.primaryAxisAlignItems) {
      styles.justifyContent = this.mapFigmaAlignment(node.primaryAxisAlignItems)
    }
    if (node.counterAxisAlignItems) {
      styles.alignItems = this.mapFigmaAlignment(node.counterAxisAlignItems)
    }

    // Padding
    if (node.paddingTop !== undefined) styles.paddingTop = node.paddingTop
    if (node.paddingBottom !== undefined) styles.paddingBottom = node.paddingBottom
    if (node.paddingLeft !== undefined) styles.paddingLeft = node.paddingLeft
    if (node.paddingRight !== undefined) styles.paddingRight = node.paddingRight

    // Gap
    if (node.itemSpacing !== undefined) styles.gap = node.itemSpacing

    // Background color
    if (node.fills) {
      const solidFill = node.fills.find(f => f.type === 'SOLID' && f.visible !== false)
      if (solidFill?.color) {
        styles.backgroundColor = this.rgbaToHex(solidFill.color, solidFill.opacity !== 1)
      }
    }

    // Border radius
    if (node.cornerRadius !== undefined) {
      styles.borderRadius = node.cornerRadius
    } else if (node.rectangleCornerRadii) {
      const [tl, tr, br, bl] = node.rectangleCornerRadii
      styles.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`
    }

    // Opacity
    if (node.opacity !== undefined && node.opacity < 1) {
      styles.opacity = node.opacity
    }

    // Text styles
    if (node.style) {
      if (node.style.fontFamily) styles.fontFamily = node.style.fontFamily
      if (node.style.fontSize) styles.fontSize = node.style.fontSize
      if (node.style.fontWeight) styles.fontWeight = node.style.fontWeight
      if (node.style.letterSpacing) styles.letterSpacing = node.style.letterSpacing
      if (node.style.lineHeightPx) styles.lineHeight = node.style.lineHeightPx
      if (node.style.textAlignHorizontal) {
        styles.textAlign = node.style.textAlignHorizontal.toLowerCase()
      }
    }

    return styles
  }

  /**
   * Map Figma alignment to CSS
   */
  private mapFigmaAlignment(alignment: string): string {
    const map: Record<string, string> = {
      MIN: 'flex-start',
      CENTER: 'center',
      MAX: 'flex-end',
      SPACE_BETWEEN: 'space-between',
    }
    return map[alignment] || 'flex-start'
  }

  /**
   * Generate component code from tree
   */
  private generateComponentCode(tree: ComponentTree, tokens: DesignTokens, componentName: string): string {
    // Generate Tailwind classes from styles
    const renderNode = (node: ComponentTree, indent: number): string => {
      const spaces = '  '.repeat(indent)
      const classes = this.stylesToTailwind(node.styles, tokens)
      const className = classes.length > 0 ? ` className="${classes.join(' ')}"` : ''

      if (node.type === 'text' && node.text) {
        return `${spaces}<span${className}>${this.escapeHtml(node.text)}</span>`
      }

      if (node.type === 'image') {
        return `${spaces}<img${className} src="${node.imageSrc || '/placeholder.jpg'}" alt="${node.name}" />`
      }

      const tag = node.type === 'button' ? 'button' : 'div'
      const children = node.children?.map(child => renderNode(child, indent + 1)).join('\n') || ''

      if (children) {
        return `${spaces}<${tag}${className}>\n${children}\n${spaces}</${tag}>`
      }

      return `${spaces}<${tag}${className} />`
    }

    const jsxContent = renderNode(tree, 2)

    return `import React from 'react'

interface ${componentName}Props {
  className?: string
}

export function ${componentName}({ className }: ${componentName}Props) {
  return (
    <div className={className}>
${jsxContent}
    </div>
  )
}
`
  }

  /**
   * Convert styles to Tailwind classes
   */
  private stylesToTailwind(styles: Record<string, string | number>, tokens: DesignTokens): string[] {
    const classes: string[] = []

    // Width
    if (styles.width !== undefined) {
      const w = styles.width as number
      if (w === 100) classes.push('w-full')
      else classes.push(`w-[${w}px]`)
    }

    // Height
    if (styles.height !== undefined) {
      const h = styles.height as number
      if (h === 100) classes.push('h-full')
      else classes.push(`h-[${h}px]`)
    }

    // Display
    if (styles.display === 'flex') {
      classes.push('flex')
      if (styles.flexDirection === 'column') classes.push('flex-col')
    }

    // Alignment
    if (styles.justifyContent) {
      const jc = styles.justifyContent as string
      if (jc === 'center') classes.push('justify-center')
      else if (jc === 'flex-end') classes.push('justify-end')
      else if (jc === 'space-between') classes.push('justify-between')
    }
    if (styles.alignItems) {
      const ai = styles.alignItems as string
      if (ai === 'center') classes.push('items-center')
      else if (ai === 'flex-end') classes.push('items-end')
    }

    // Gap
    if (styles.gap !== undefined) {
      classes.push(`gap-[${styles.gap}px]`)
    }

    // Padding
    const pt = styles.paddingTop as number | undefined
    const pb = styles.paddingBottom as number | undefined
    const pl = styles.paddingLeft as number | undefined
    const pr = styles.paddingRight as number | undefined
    if (pt && pb && pl && pr && pt === pb && pl === pr && pt === pl) {
      classes.push(`p-[${pt}px]`)
    } else {
      if (pt !== undefined) classes.push(`pt-[${pt}px]`)
      if (pb !== undefined) classes.push(`pb-[${pb}px]`)
      if (pl !== undefined) classes.push(`pl-[${pl}px]`)
      if (pr !== undefined) classes.push(`pr-[${pr}px]`)
    }

    // Background color
    if (styles.backgroundColor) {
      classes.push(`bg-[${styles.backgroundColor}]`)
    }

    // Border radius
    if (styles.borderRadius !== undefined) {
      if (typeof styles.borderRadius === 'number') {
        classes.push(`rounded-[${styles.borderRadius}px]`)
      } else {
        classes.push(`rounded-[${styles.borderRadius}]`)
      }
    }

    // Opacity
    if (styles.opacity !== undefined) {
      classes.push(`opacity-[${styles.opacity}]`)
    }

    // Font
    if (styles.fontSize !== undefined) {
      classes.push(`text-[${styles.fontSize}px]`)
    }
    if (styles.fontWeight !== undefined) {
      const fw = styles.fontWeight as number
      if (fw >= 700) classes.push('font-bold')
      else if (fw >= 500) classes.push('font-medium')
    }

    return classes
  }

  /**
   * Convert RGBA to hex color
   */
  private rgbaToHex(color: RGBA, includeAlpha = false): string {
    const r = Math.round(color.r * 255)
    const g = Math.round(color.g * 255)
    const b = Math.round(color.b * 255)

    if (includeAlpha && color.a < 1) {
      return `rgba(${r},${g},${b},${color.a.toFixed(2)})`
    }

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  /**
   * Generate a color name from hex value
   */
  private generateColorName(hex: string, nodeName: string): string {
    // Use node name if it looks like a color token
    const nameLower = nodeName.toLowerCase()
    if (
      nameLower.includes('primary') ||
      nameLower.includes('secondary') ||
      nameLower.includes('accent') ||
      nameLower.includes('background') ||
      nameLower.includes('text') ||
      nameLower.includes('border')
    ) {
      return this.sanitizeTokenName(nodeName)
    }

    // Generate name from hex
    return `color-${hex.replace('#', '')}`
  }

  /**
   * Sanitize a name for use as a token
   */
  private sanitizeTokenName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  /**
   * Sanitize a name for use as a component name
   */
  private sanitizeComponentName(name: string): string {
    // Convert to PascalCase
    return name
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  /**
   * Return empty design tokens
   */
  private emptyTokens(): DesignTokens {
    return {
      colors: {},
      typography: {},
      spacing: [4, 8, 12, 16, 24, 32, 48, 64],
      borderRadius: [4, 8, 12, 16],
      shadows: {},
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function getFigmaImportService(projectId: string): FigmaImportService {
  return new FigmaImportService(projectId)
}
