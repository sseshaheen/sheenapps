/**
 * Dynamic Component Loader
 * 
 * Loads and executes compiled React components in the iframe environment.
 * Handles component lifecycle, props updates, and error recovery.
 */

import { ComponentBundle } from './template-component-compiler';

export interface ComponentRenderRequest {
  componentName: string;
  props: any;
  containerId: string;
  sectionId?: string;
}

export interface ComponentUpdateRequest {
  componentName: string;
  newProps: any;
  containerId: string;
}

export interface LoaderMessage {
  type: 'render-component' | 'update-props' | 'cleanup' | 'get-height' | 'error';
  data: any;
  requestId?: string;
}

export interface ComponentInstance {
  componentName: string;
  containerId: string;
  props: any;
  root: any; // React root instance
  lastRendered: number;
}

export class DynamicComponentLoader {
  private iframe: HTMLIFrameElement | null = null;
  private loadedBundle: ComponentBundle | null = null;
  private componentInstances: Map<string, ComponentInstance> = new Map();
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private isReady = false;
  private readyCallbacks: (() => void)[] = [];

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
    this.setupMessageHandling();
  }

  /**
   * Setup message handling between parent and iframe
   */
  private setupMessageHandling(): void {
    window.addEventListener('message', (event) => {
      if (event.source !== this.iframe?.contentWindow) return;
      
      const message = event.data as LoaderMessage;
      
      switch (message.type) {
        case 'error':
          console.error('🚨 Component execution error:', message.data);
          break;
          
        case 'get-height':
          // Handle height updates for responsive iframe
          if (this.iframe) {
            this.iframe.style.height = `${message.data.height}px`;
          }
          break;
          
        default:
          const handler = this.messageHandlers.get(message.type);
          if (handler) {
            handler(message.data);
          }
      }
    });
  }

  /**
   * Load component bundle into iframe
   */
  async loadBundle(bundle: ComponentBundle): Promise<void> {
    if (!this.iframe) {
      throw new Error('Iframe not available');
    }

    console.log('📦 Loading component bundle into iframe', {
      componentCount: bundle.components.length,
      bundleSize: bundle.bundleCode.length
    });

    this.loadedBundle = bundle;
    this.isReady = false;

    // Build iframe document with bundle
    const iframeDoc = this.buildIframeDocument(bundle);
    
    // Set iframe content
    this.iframe.srcdoc = iframeDoc;
    
    // Wait for iframe to load
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Component bundle load timeout'));
      }, 10000);
      
      const handleLoad = () => {
        clearTimeout(timeout);
        this.iframe?.removeEventListener('load', handleLoad);
        
        // Wait for bundle to initialize
        this.waitForBundleReady()
          .then(() => {
            this.isReady = true;
            this.readyCallbacks.forEach(callback => callback());
            this.readyCallbacks = [];
            resolve();
          })
          .catch(reject);
      };
      
      this.iframe?.addEventListener('load', handleLoad);
    });

    console.log('✅ Component bundle loaded and ready');
  }

  /**
   * Wait for bundle to be ready in iframe
   */
  private async waitForBundleReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkReady = () => {
        if (!this.iframe?.contentWindow) {
          reject(new Error('Iframe content window not available'));
          return;
        }
        
        const win = this.iframe.contentWindow as any;
        if (win.__templateComponents && win.__renderComponent) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      
      checkReady();
    });
  }

  /**
   * Build iframe document with component bundle
   */
  private buildIframeDocument(bundle: ComponentBundle): string {
    const reactCDN = 'https://unpkg.com/react@18/umd/react.development.js';
    const reactDOMCDN = 'https://unpkg.com/react-dom@18/umd/react-dom.development.js';
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { 
      margin: 0; 
      padding: 0; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    }
    * { box-sizing: border-box; }
    .component-container { 
      width: 100%; 
      min-height: 100px; 
    }
  </style>
</head>
<body>
  <div id="root"></div>
  
  <!-- React Dependencies -->
  <script crossorigin src="${reactCDN}"></script>
  <script crossorigin src="${reactDOMCDN}"></script>
  
  <!-- Component Bundle -->
  <script>
    // Error handling
    window.addEventListener('error', (event) => {
      window.parent.postMessage({
        type: 'error',
        data: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error ? event.error.toString() : null
        }
      }, '*');
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      window.parent.postMessage({
        type: 'error',
        data: {
          message: event.reason?.message || String(event.reason),
          type: 'unhandledRejection'
        }
      }, '*');
    });
    
    // Bundle code
    ${bundle.bundleCode}
    
    // Message handling
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      
      const message = event.data;
      
      try {
        switch (message.type) {
          case 'render-component':
            window.__renderComponent(
              message.componentName,
              message.props,
              message.containerId || 'root'
            );
            break;
            
          case 'update-props':
            // Re-render with new props
            window.__renderComponent(
              message.componentName,
              message.newProps,
              message.containerId || 'root'
            );
            break;
            
          case 'cleanup':
            // Clean up all components
            const containers = document.querySelectorAll('[id]');
            containers.forEach(container => {
              container.innerHTML = '';
            });
            break;
        }
      } catch (error) {
        window.parent.postMessage({
          type: 'error',
          data: {
            message: error.message,
            stack: error.stack,
            context: 'message-handler'
          }
        }, '*');
      }
    });
    
    // Height reporting
    const reportHeight = () => {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.offsetHeight,
        document.body.offsetHeight
      );
      
      window.parent.postMessage({
        type: 'get-height',
        data: { height }
      }, '*');
    };
    
    // Report height on changes
    const resizeObserver = new ResizeObserver(reportHeight);
    resizeObserver.observe(document.body);
    
    // Initial height report
    setTimeout(reportHeight, 100);
  </script>
</body>
</html>`;
  }

  /**
   * Render a component in the iframe
   */
  async renderComponent(request: ComponentRenderRequest): Promise<void> {
    if (!this.isReady) {
      await new Promise<void>((resolve) => {
        this.readyCallbacks.push(resolve);
      });
    }

    console.log('🎨 Rendering component:', request.componentName, {
      containerId: request.containerId,
      props: request.props
    });

    // Create container if it doesn't exist
    await this.ensureContainer(request.containerId);

    // Send render message to iframe
    this.sendMessage({
      type: 'render-component',
      componentName: request.componentName,
      props: request.props,
      containerId: request.containerId
    });

    // Track component instance
    this.componentInstances.set(request.containerId, {
      componentName: request.componentName,
      containerId: request.containerId,
      props: request.props,
      root: null, // Will be set by iframe
      lastRendered: Date.now()
    });

    console.log('✅ Component render message sent');
  }

  /**
   * Update component props
   */
  async updateProps(request: ComponentUpdateRequest): Promise<void> {
    if (!this.isReady) {
      console.warn('Loader not ready, skipping props update');
      return;
    }

    console.log('🔄 Updating component props:', request.componentName, {
      containerId: request.containerId,
      newProps: request.newProps
    });

    // Send update message to iframe
    this.sendMessage({
      type: 'update-props',
      componentName: request.componentName,
      newProps: request.newProps,
      containerId: request.containerId
    });

    // Update tracked instance
    const instance = this.componentInstances.get(request.containerId);
    if (instance) {
      instance.props = request.newProps;
      instance.lastRendered = Date.now();
    }
  }

  /**
   * Ensure container exists in iframe
   */
  private async ensureContainer(containerId: string): Promise<void> {
    this.sendMessage({
      type: 'ensure-container',
      containerId
    });
  }

  /**
   * Send message to iframe
   */
  private sendMessage(message: any): void {
    if (!this.iframe?.contentWindow) {
      throw new Error('Iframe content window not available');
    }

    this.iframe.contentWindow.postMessage(message, '*');
  }

  /**
   * Clean up all components
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up components');

    this.sendMessage({
      type: 'cleanup'
    });

    this.componentInstances.clear();
    this.isReady = false;
  }

  /**
   * Get component instance info
   */
  getComponentInstances(): ComponentInstance[] {
    return Array.from(this.componentInstances.values());
  }

  /**
   * Check if loader is ready
   */
  isLoaderReady(): boolean {
    return this.isReady && this.loadedBundle !== null;
  }

  /**
   * Get loaded bundle info
   */
  getLoadedBundle(): ComponentBundle | null {
    return this.loadedBundle;
  }

  /**
   * Register message handler
   */
  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Remove message handler
   */
  offMessage(type: string): void {
    this.messageHandlers.delete(type);
  }

  /**
   * Render multiple components at once
   */
  async renderComponents(requests: ComponentRenderRequest[]): Promise<void> {
    console.log('🎨 Rendering multiple components:', requests.length);

    for (const request of requests) {
      await this.renderComponent(request);
    }
  }
}

// Factory function for creating loader instances
export function createDynamicComponentLoader(iframe: HTMLIFrameElement): DynamicComponentLoader {
  return new DynamicComponentLoader(iframe);
}