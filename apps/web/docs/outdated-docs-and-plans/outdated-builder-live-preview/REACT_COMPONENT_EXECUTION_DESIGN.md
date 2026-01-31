# React Component Execution Design for Preview System

## Overview

This document outlines the design for compiling and executing actual React components from templates in the preview system, replacing the current static HTML generation approach.

## Current vs. Proposed Architecture

### Current (Static HTML Generation)
```
Template Components → Props Extraction → Static HTML → Iframe Rendering
```

### Proposed (React Component Execution)
```
Template Components → Component Compilation → Bundle Generation → React Execution in Iframe
```

## Design Components

### 1. Template Component Compiler

**Purpose**: Extract and compile individual React components from template files

**Location**: `src/services/preview/template-component-compiler.ts`

**Responsibilities**:
- Parse template files and extract component definitions
- Compile components using existing esbuild infrastructure
- Handle component dependencies and imports
- Generate executable component bundles

**Key Features**:
```typescript
export class TemplateComponentCompiler {
  async extractComponents(templateFiles: TemplateFile[]): Promise<ComponentDefinition[]>
  async compileComponent(component: ComponentDefinition): Promise<CompiledComponent>
  async createBundle(components: CompiledComponent[]): Promise<ComponentBundle>
}
```

### 2. Component Bundle Generator

**Purpose**: Create executable bundles that can run in the iframe

**Location**: `src/services/preview/component-bundle-generator.ts`

**Responsibilities**:
- Combine compiled components into a single bundle
- Handle React and ReactDOM imports
- Include necessary polyfills and dependencies
- Generate bundle with proper entry point

**Bundle Structure**:
```typescript
interface ComponentBundle {
  bundleCode: string
  entryPoint: string
  dependencies: string[]
  sourceMap?: string
  metadata: BundleMetadata
}
```

### 3. Dynamic Component Loader

**Purpose**: Load and execute components dynamically in the iframe

**Location**: `src/services/preview/dynamic-component-loader.ts`

**Responsibilities**:
- Load component bundles in iframe context
- Create React rendering environment
- Handle component lifecycle and props updates
- Manage component state and re-rendering

**Key Features**:
```typescript
export class DynamicComponentLoader {
  async loadBundle(bundle: ComponentBundle): Promise<void>
  async renderComponent(componentName: string, props: any): Promise<void>
  async updateProps(componentName: string, newProps: any): Promise<void>
  async cleanup(): Promise<void>
}
```

### 4. Template-to-Component Mapper

**Purpose**: Map template structure to individual React components

**Location**: `src/services/preview/template-component-mapper.ts`

**Responsibilities**:
- Map template files to component definitions
- Handle component dependencies and relationships
- Resolve component imports and exports
- Generate component execution order

## Implementation Strategy

### Phase 1: Component Extraction and Compilation

#### 1.1 Template File Analysis
```typescript
interface TemplateFile {
  path: string
  content: string
  type: 'tsx' | 'jsx' | 'css' | 'json'
}

interface ComponentDefinition {
  name: string
  source: string
  dependencies: string[]
  props: ComponentProps
  exports: string[]
}
```

#### 1.2 Component Compilation Pipeline
```typescript
class ComponentCompiler {
  private async parseComponent(source: string): Promise<ComponentAST>
  private async resolveImports(ast: ComponentAST): Promise<ResolvedComponent>
  private async bundleComponent(component: ResolvedComponent): Promise<CompiledComponent>
}
```

#### 1.3 Bundle Generation
```typescript
class BundleGenerator {
  async createExecutableBundle(components: CompiledComponent[]): Promise<ComponentBundle> {
    const bundleTemplate = `
      import React from 'react';
      import ReactDOM from 'react-dom/client';
      
      ${components.map(c => c.source).join('\n')}
      
      window.__templateComponents = {
        ${components.map(c => `${c.name}: ${c.name}`).join(',\n')}
      };
      
      window.__renderComponent = (name, props, containerId) => {
        const Component = window.__templateComponents[name];
        if (!Component) throw new Error(\`Component \${name} not found\`);
        
        const container = document.getElementById(containerId);
        const root = ReactDOM.createRoot(container);
        root.render(React.createElement(Component, props));
      };
    `;
    
    return this.compile(bundleTemplate);
  }
}
```

### Phase 2: Iframe Integration

#### 2.1 Enhanced SrcDoc Builder
```typescript
// Update src/services/preview/srcdoc-builder.ts
export function buildReactComponentSrcDoc(options: ReactComponentSrcDocOptions): string {
  const { componentBundle, css, fonts, nonce } = options;
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${css}</style>
  ${fonts.map(font => `<link rel="stylesheet" href="${font}">`).join('\n')}
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    ${componentBundle.bundleCode}
  </script>
  <script nonce="${nonce}">
    window.addEventListener('message', (event) => {
      if (event.data.type === 'render-component') {
        window.__renderComponent(
          event.data.componentName,
          event.data.props,
          'root'
        );
      }
    });
  </script>
</body>
</html>`;
}
```

#### 2.2 Component Rendering Protocol
```typescript
interface ComponentRenderMessage {
  type: 'render-component'
  componentName: string
  props: any
  containerId: string
}

interface ComponentUpdateMessage {
  type: 'update-props'
  componentName: string
  newProps: any
}
```

### Phase 3: Preview Renderer Integration

#### 3.1 Updated Preview Renderer
```typescript
// Update src/components/builder/preview/preview-renderer.tsx
export function PreviewRenderer({ sections, isPreviewMode }: PreviewRendererProps) {
  const [componentBundle, setComponentBundle] = useState<ComponentBundle | null>(null);
  
  useEffect(() => {
    const compileComponents = async () => {
      // Get template from store
      const template = useBuilderStore.getState().template;
      
      // Compile components
      const compiler = new TemplateComponentCompiler();
      const components = await compiler.extractComponents(template.templateFiles);
      const compiledComponents = await Promise.all(
        components.map(c => compiler.compileComponent(c))
      );
      
      // Generate bundle
      const generator = new BundleGenerator();
      const bundle = await generator.createExecutableBundle(compiledComponents);
      
      setComponentBundle(bundle);
    };
    
    compileComponents();
  }, [sections]);
  
  const renderComponents = useCallback(async () => {
    if (!componentBundle) return;
    
    // Render each section component
    Object.entries(sections).forEach(([sectionId, section]) => {
      const componentName = getComponentNameForSection(section.type);
      const props = section.content.props;
      
      // Send render message to iframe
      iframeRef.current?.contentWindow?.postMessage({
        type: 'render-component',
        componentName,
        props,
        containerId: sectionId
      }, '*');
    });
  }, [componentBundle, sections]);
  
  return (
    <iframe
      ref={iframeRef}
      srcDoc={buildReactComponentSrcDoc({
        componentBundle,
        css: generateComponentCSS(sections),
        fonts: getTemplateFonts(),
        nonce: generateNonce()
      })}
      onLoad={renderComponents}
    />
  );
}
```

### Phase 4: Section-to-Component Mapping

#### 4.1 Component Mapping Strategy
```typescript
interface ComponentMapping {
  sectionType: string
  componentName: string
  propsMapping: Record<string, string>
  defaultProps?: any
}

const SALON_COMPONENT_MAPPINGS: ComponentMapping[] = [
  {
    sectionType: 'hero',
    componentName: 'Hero',
    propsMapping: {
      title: 'title',
      subtitle: 'subtitle',
      ctaText: 'ctaText'
    }
  },
  {
    sectionType: 'features',
    componentName: 'ServicesMenu',
    propsMapping: {
      features: 'services'
    }
  },
  {
    sectionType: 'pricing',
    componentName: 'PricingSection',
    propsMapping: {
      plans: 'pricingCategories'
    }
  }
];
```

#### 4.2 Props Transformation
```typescript
class PropsTransformer {
  transformSectionPropsToComponentProps(
    sectionProps: any,
    mapping: ComponentMapping
  ): any {
    const componentProps: any = {};
    
    Object.entries(mapping.propsMapping).forEach(([sectionKey, componentKey]) => {
      if (sectionProps[sectionKey] !== undefined) {
        componentProps[componentKey] = sectionProps[sectionKey];
      }
    });
    
    return {
      ...mapping.defaultProps,
      ...componentProps
    };
  }
}
```

## Technical Implementation Details

### 1. Component Extraction from Template Files

```typescript
export class TemplateComponentCompiler {
  async extractComponents(templateFiles: TemplateFile[]): Promise<ComponentDefinition[]> {
    const components: ComponentDefinition[] = [];
    
    for (const file of templateFiles) {
      if (file.path.endsWith('.tsx') || file.path.endsWith('.jsx')) {
        const componentDefs = await this.parseFileForComponents(file);
        components.push(...componentDefs);
      }
    }
    
    return components;
  }
  
  private async parseFileForComponents(file: TemplateFile): Promise<ComponentDefinition[]> {
    // Use existing Babel parser to extract component definitions
    const ast = await this.parseWithBabel(file.content);
    
    const components: ComponentDefinition[] = [];
    
    // Find all export declarations
    ast.body.forEach(node => {
      if (node.type === 'ExportDefaultDeclaration' && node.declaration.type === 'FunctionDeclaration') {
        components.push({
          name: node.declaration.id.name,
          source: this.extractFunctionSource(node.declaration),
          dependencies: this.extractImports(ast),
          props: this.extractProps(node.declaration),
          exports: ['default']
        });
      }
    });
    
    return components;
  }
}
```

### 2. CSS and Styling Preservation

```typescript
export class StylePreserver {
  extractStylesFromTemplate(templateFiles: TemplateFile[]): TemplateStyles {
    const styles: TemplateStyles = {
      globalCSS: '',
      componentStyles: new Map(),
      fonts: []
    };
    
    templateFiles.forEach(file => {
      if (file.path.endsWith('.css')) {
        styles.globalCSS += file.content;
      }
      
      if (file.path.endsWith('.tsx')) {
        // Extract styled-components or CSS-in-JS
        const componentStyles = this.extractInlineStyles(file.content);
        styles.componentStyles.set(file.path, componentStyles);
      }
    });
    
    return styles;
  }
}
```

### 3. Error Handling and Fallbacks

```typescript
export class ComponentExecutionManager {
  async executeWithFallback(
    componentBundle: ComponentBundle,
    sections: Record<string, SectionState>
  ): Promise<ExecutionResult> {
    try {
      // Try to execute React components
      return await this.executeReactComponents(componentBundle, sections);
    } catch (error) {
      console.warn('React component execution failed, falling back to static HTML', error);
      
      // Fallback to current static HTML generation
      return await this.executeStaticHTMLFallback(sections);
    }
  }
}
```

## Performance Considerations

### 1. Bundle Size Optimization
- Tree shaking to remove unused code
- Code splitting for large templates
- Lazy loading of non-critical components

### 2. Compilation Caching
- Cache compiled components by template hash
- Incremental compilation for template changes
- LRU cache for frequently used templates

### 3. Iframe Memory Management
- Cleanup component instances on unmount
- Garbage collection of unused bundles
- Memory usage monitoring

## Testing Strategy

### 1. Unit Tests
- Component extraction accuracy
- Bundle generation correctness
- Props transformation validation

### 2. Integration Tests
- End-to-end component rendering
- Iframe communication protocol
- Error handling and fallbacks

### 3. Performance Tests
- Bundle size limits
- Compilation time benchmarks
- Memory usage monitoring

## Migration Strategy

### Phase 1: Parallel Implementation
- Implement new system alongside existing static HTML
- Feature flag to switch between systems
- A/B testing for performance comparison

### Phase 2: Template-by-Template Migration
- Start with salon template validation
- Extend to other templates incrementally
- Maintain backward compatibility

### Phase 3: Full Migration
- Remove static HTML generation
- Optimize for React-only execution
- Final performance tuning

## Success Metrics

1. **Visual Accuracy**: 100% match between preview and actual template
2. **Component Functionality**: All interactive elements work in preview
3. **Performance**: < 3 seconds for template compilation and rendering
4. **Memory Usage**: < 100MB for complete template execution
5. **Bundle Size**: < 1MB for typical template bundle

## Conclusion

This design provides a comprehensive solution for executing actual React components in the preview system. By compiling and executing the original template components, we ensure 100% accuracy between preview and final output while maintaining performance and reliability.

The implementation follows a phased approach, allowing for gradual migration and validation of the new system while maintaining the existing fallback mechanism.