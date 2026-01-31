/**
 * Template Component Compiler
 * 
 * Extracts and compiles React components from template files
 * for execution in the preview iframe.
 */

// Use Babel Standalone for browser compatibility
declare global {
  interface Window {
    Babel: any
  }
}

// Load Babel Standalone dynamically
const loadBabelStandalone = async () => {
  if (typeof window !== 'undefined' && !window.Babel) {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@babel/standalone@7.25.7/babel.min.js'
    document.head.appendChild(script)
    
    return new Promise<void>((resolve, reject) => {
      script.onload = () => resolve()
      script.onerror = reject
    })
  }
}

const transformWithBabel = async (code: string, options: any): Promise<{ code: string; map?: any }> => {
  // Ensure Babel is loaded
  await loadBabelStandalone()
  
  if (typeof window !== 'undefined' && window.Babel) {
    return window.Babel.transform(code, options)
  }
  
  // Fallback - just return the code as-is if Babel isn't available
  console.warn('Babel not available, returning code as-is')
  return { code }
}

export interface TemplateFile {
  path: string;
  content: string;
  type: 'tsx' | 'jsx' | 'css' | 'json';
}

export interface ComponentDefinition {
  name: string;
  source: string;
  dependencies: string[];
  props: Record<string, any>;
  exports: string[];
  filePath: string;
}

export interface CompiledComponent {
  name: string;
  compiledCode: string;
  sourceMap?: string;
  dependencies: string[];
  props: Record<string, any>;
}

export interface ComponentBundle {
  bundleCode: string;
  entryPoint: string;
  components: CompiledComponent[];
  dependencies: string[];
  sourceMap?: string;
}

export class TemplateComponentCompiler {
  private babelOptions = {
    presets: [
      ['react', { runtime: 'automatic' }],
      ['typescript', { isTSX: true, allExtensions: true }]
    ],
    plugins: [],
    filename: 'component.tsx'
  };

  /**
   * Extract all React components from template files
   */
  async extractComponents(templateFiles: TemplateFile[]): Promise<ComponentDefinition[]> {
    const components: ComponentDefinition[] = [];
    
    console.log('🔍 TemplateComponentCompiler: Extracting components from template files', {
      fileCount: templateFiles.length,
      tsxFiles: templateFiles.filter(f => f.path.endsWith('.tsx')).length
    });
    
    for (const file of templateFiles) {
      if (file.path.endsWith('.tsx') || file.path.endsWith('.jsx')) {
        try {
          const componentDefs = await this.parseFileForComponents(file);
          components.push(...componentDefs);
          
          console.log(`✅ Extracted ${componentDefs.length} components from ${file.path}`, {
            componentNames: componentDefs.map(c => c.name)
          });
        } catch (error) {
          console.error(`❌ Failed to extract components from ${file.path}:`, error);
        }
      }
    }
    
    return components;
  }

  /**
   * Parse a single file for React component definitions
   */
  private async parseFileForComponents(file: TemplateFile): Promise<ComponentDefinition[]> {
    const components: ComponentDefinition[] = [];
    
    // Use regex to extract function components (simpler than full AST parsing)
    const functionComponentRegex = /export\s+default\s+function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/g;
    const arrowComponentRegex = /export\s+default\s+function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/g;
    const constComponentRegex = /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\}/g;
    
    let match;
    
    // Extract function components
    while ((match = functionComponentRegex.exec(file.content)) !== null) {
      const [fullMatch, componentName, componentBody] = match;
      
      components.push({
        name: componentName,
        source: fullMatch,
        dependencies: this.extractImports(file.content),
        props: this.extractPropsFromSource(fullMatch),
        exports: ['default'],
        filePath: file.path
      });
    }
    
    // Extract const arrow components
    while ((match = constComponentRegex.exec(file.content)) !== null) {
      const [fullMatch, componentName, componentBody] = match;
      
      // Check if it's exported
      if (file.content.includes(`export default ${componentName}`)) {
        components.push({
          name: componentName,
          source: fullMatch,
          dependencies: this.extractImports(file.content),
          props: this.extractPropsFromSource(fullMatch),
          exports: ['default'],
          filePath: file.path
        });
      }
    }
    
    return components;
  }

  /**
   * Extract import statements from file content
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+(?:{\s*([^}]+)\s*}|([^{}\s]+))\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const [, namedImports, defaultImport, module] = match;
      
      // Only include external dependencies, not relative imports
      if (!module.startsWith('.') && !module.startsWith('/')) {
        imports.push(module);
      }
    }
    
    return [...new Set(imports)]; // Remove duplicates
  }

  /**
   * Extract props interface from component source
   */
  private extractPropsFromSource(source: string): Record<string, any> {
    const props: Record<string, any> = {};
    
    // Look for props destructuring in function parameters
    const propsRegex = /function\s+\w+\s*\(\s*{\s*([^}]+)\s*}\s*[^)]*\)/;
    const match = propsRegex.exec(source);
    
    if (match) {
      const propsString = match[1];
      const propNames = propsString.split(',').map(p => p.trim());
      
      propNames.forEach(propName => {
        props[propName] = 'any'; // Default type
      });
    }
    
    return props;
  }

  /**
   * Compile a single component definition
   */
  async compileComponent(component: ComponentDefinition): Promise<CompiledComponent> {
    try {
      console.log(`🔨 Compiling component: ${component.name}`);
      
      // Transform the component source using Babel Standalone
      const result = await transformWithBabel(component.source, {
        ...this.babelOptions,
        filename: component.filePath
      });
      
      if (!result || !result.code) {
        throw new Error(`Failed to compile component ${component.name}`);
      }
      
      console.log(`✅ Compiled component: ${component.name}`);
      
      return {
        name: component.name,
        compiledCode: result.code,
        sourceMap: result.map ? JSON.stringify(result.map) : undefined,
        dependencies: component.dependencies,
        props: component.props
      };
    } catch (error) {
      console.error(`❌ Failed to compile component ${component.name}:`, error);
      throw error;
    }
  }

  /**
   * Create an executable bundle from compiled components
   */
  async createBundle(components: CompiledComponent[]): Promise<ComponentBundle> {
    console.log('📦 Creating component bundle', {
      componentCount: components.length,
      componentNames: components.map(c => c.name)
    });
    
    // Collect all dependencies
    const allDependencies = [...new Set(components.flatMap(c => c.dependencies))];
    
    // Create bundle template
    const bundleTemplate = `
// React Component Bundle
${this.generateImportStatements(allDependencies)}

${components.map(c => c.compiledCode).join('\n\n')}

// Component registry
window.__templateComponents = {
  ${components.map(c => `${c.name}: ${c.name}`).join(',\n  ')}
};

// Render function
window.__renderComponent = (name, props, containerId) => {
  const Component = window.__templateComponents[name];
  if (!Component) {
    throw new Error(\`Component \${name} not found. Available: \${Object.keys(window.__templateComponents).join(', ')}\`);
  }
  
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(\`Container \${containerId} not found\`);
  }
  
  // Clear existing content
  container.innerHTML = '';
  
  // Create React root and render
  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(Component, props));
  
  console.log(\`✅ Rendered component \${name} with props:\`, props);
};

// Initialize
console.log('🚀 Template component bundle loaded', {
  components: Object.keys(window.__templateComponents),
  timestamp: new Date().toISOString()
});
`;
    
    const bundle: ComponentBundle = {
      bundleCode: bundleTemplate,
      entryPoint: 'window.__renderComponent',
      components,
      dependencies: allDependencies
    };
    
    console.log('✅ Component bundle created successfully', {
      bundleSize: bundleTemplate.length,
      componentCount: components.length,
      dependencyCount: allDependencies.length
    });
    
    return bundle;
  }

  /**
   * Generate import statements for dependencies
   */
  private generateImportStatements(dependencies: string[]): string {
    const imports = [
      'const React = window.React;',
      'const ReactDOM = window.ReactDOM;'
    ];
    
    // Add other dependencies as needed
    dependencies.forEach(dep => {
      if (dep !== 'react' && dep !== 'react-dom') {
        imports.push(`const ${dep} = window.${dep};`);
      }
    });
    
    return imports.join('\n');
  }

  /**
   * Get component by name from template files
   */
  async getComponentByName(templateFiles: TemplateFile[], componentName: string): Promise<ComponentDefinition | null> {
    const components = await this.extractComponents(templateFiles);
    return components.find(c => c.name === componentName) || null;
  }

  /**
   * Compile all components and create bundle in one step
   */
  async compileTemplateToBundle(templateFiles: TemplateFile[]): Promise<ComponentBundle> {
    console.log('🏗️ Starting template compilation to bundle');
    
    // Extract components
    const componentDefs = await this.extractComponents(templateFiles);
    
    if (componentDefs.length === 0) {
      throw new Error('No components found in template files');
    }
    
    // Compile all components
    const compiledComponents = await Promise.all(
      componentDefs.map(def => this.compileComponent(def))
    );
    
    // Create bundle
    const bundle = await this.createBundle(compiledComponents);
    
    console.log('✅ Template compilation completed successfully');
    return bundle;
  }
}

// Export singleton instance
export const templateComponentCompiler = new TemplateComponentCompiler();