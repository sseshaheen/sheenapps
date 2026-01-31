/**
 * Website Analysis Service
 *
 * Handles crawling, analysis, and technology detection for websites
 * during the migration process. Uses Puppeteer for JavaScript rendering
 * and implements safety measures for crawling.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { getPool } from './database';
import { unifiedLogger } from './unifiedLogger';
import { URL } from 'url';

export interface CrawlConfig {
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  renderJS: boolean;
  delayMs: number;
  respectRobots: boolean;
  allowedHosts: string[];
  sameOriginOnly: boolean;
  timeout: number;
}

export interface SiteAnalysisResult {
  technologies: TechnologyDetection[];
  structure: SiteStructure;
  content: ContentAnalysis;
  assets: AssetInventory;
  performance: PerformanceMetrics;
  seo: SEOAnalysis;
  accessibility: AccessibilityBasics;
}

export interface TechnologyDetection {
  category: string;
  name: string;
  version?: string;
  confidence: number;
  evidence: string[];
}

export interface SiteStructure {
  totalPages: number;
  pageTypes: PageTypeAnalysis[];
  navigation: NavigationStructure;
  sitemap?: string[];
}

export interface ContentAnalysis {
  totalText: number;
  languages: string[];
  headings: HeadingStructure[];
  forms: FormAnalysis[];
  mediaCount: number;
}

export interface AssetInventory {
  images: AssetInfo[];
  stylesheets: AssetInfo[];
  scripts: AssetInfo[];
  fonts: AssetInfo[];
  documents: AssetInfo[];
  totalSize: number;
}

export interface AssetInfo {
  url: string;
  type: string;
  size?: number;
  critical: boolean;
}

export interface PerformanceMetrics {
  loadTime: number;
  firstContentfulPaint: number;
  totalRequests: number;
  totalSize: number;
  criticalPathResources: number;
}

export interface SEOAnalysis {
  hasMetaDescription: boolean;
  hasTitleTags: boolean;
  hasStructuredData: boolean;
  hasCanonical: boolean;
  imageAltText: number;
  headingStructure: boolean;
}

export interface AccessibilityBasics {
  hasAltText: boolean;
  hasAriaLabels: boolean;
  hasSemanticHTML: boolean;
  colorContrast: 'unknown' | 'good' | 'poor';
}

export interface PageTypeAnalysis {
  type: string;
  count: number;
  templates: string[];
}

export interface NavigationStructure {
  primary: string[];
  secondary: string[];
  footer: string[];
  breadcrumbs: boolean;
}

export interface HeadingStructure {
  level: number;
  text: string;
  count: number;
}

export interface FormAnalysis {
  action: string;
  method: string;
  fields: number;
  type: 'contact' | 'login' | 'search' | 'newsletter' | 'unknown';
}

export class WebsiteAnalysisService {
  private pool = getPool();

  /**
   * Perform preliminary analysis of a website
   */
  async performPreliminaryAnalysis(url: string): Promise<SiteAnalysisResult> {
    const config: CrawlConfig = {
      maxPages: 10,        // Limited for preliminary analysis
      maxDepth: 2,
      concurrency: 2,
      renderJS: true,
      delayMs: 500,
      respectRobots: true,
      allowedHosts: [new URL(url).hostname],
      sameOriginOnly: true,
      timeout: 30000
    };

    return this.analyzeSite(url, config);
  }

  /**
   * Perform detailed analysis of a website
   */
  async performDetailedAnalysis(url: string): Promise<SiteAnalysisResult> {
    const config: CrawlConfig = {
      maxPages: 50,
      maxDepth: 4,
      concurrency: 3,
      renderJS: true,
      delayMs: 250,
      respectRobots: true,
      allowedHosts: [new URL(url).hostname],
      sameOriginOnly: true,
      timeout: 60000
    };

    return this.analyzeSite(url, config);
  }

  /**
   * Main site analysis method
   */
  private async analyzeSite(url: string, config: CrawlConfig): Promise<SiteAnalysisResult> {
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-features=VizDisplayCompositor',
          '--disable-web-security', // For crawling analysis
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        timeout: 30000
      });

      const crawledData = await this.crawlSite(browser, url, config);
      const analysis = await this.analyzeContent(crawledData);

      unifiedLogger.system('startup', 'info', 'Site analysis completed', {
        url,
        pagesAnalyzed: crawledData.length,
        technologiesFound: analysis.technologies.length
      });

      return analysis;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Site analysis failed', { url, error: (error as Error).message });
      throw new Error(`Site analysis failed: ${(error as Error).message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Crawl website pages
   */
  private async crawlSite(browser: Browser, startUrl: string, config: CrawlConfig): Promise<any[]> {
    const crawledUrls = new Set<string>();
    const crawledData: any[] = [];
    const urlsToVisit = [{ url: startUrl, depth: 0 }];

    while (urlsToVisit.length > 0 && crawledData.length < config.maxPages) {
      const batch = urlsToVisit.splice(0, config.concurrency);
      const promises = batch.map(({ url, depth }) =>
        this.crawlPage(browser, url, depth, config, crawledUrls, urlsToVisit)
      );

      const results = await Promise.allSettled(promises);

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          crawledData.push(result.value);
        }
      }

      // Respect delay
      if (urlsToVisit.length > 0) {
        await this.delay(config.delayMs);
      }
    }

    return crawledData;
  }

  /**
   * Crawl individual page
   */
  private async crawlPage(
    browser: Browser,
    url: string,
    depth: number,
    config: CrawlConfig,
    crawledUrls: Set<string>,
    urlsToVisit: { url: string; depth: number }[]
  ): Promise<any | null> {
    if (crawledUrls.has(url) || depth > config.maxDepth) {
      return null;
    }

    crawledUrls.add(url);

    const page = await browser.newPage();
    try {
      // Set realistic user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });

      // Track network requests for asset inventory
      const networkRequests: any[] = [];
      page.on('response', (response: any) => {
        networkRequests.push({
          url: response.url(),
          status: response.status(),
          contentType: response.headers()['content-type'],
          size: parseInt(response.headers()['content-length'] || '0')
        });
      });

      // Navigate to page
      const response = await page.goto(url, {
        waitUntil: config.renderJS ? 'networkidle2' : 'domcontentloaded',
        timeout: config.timeout
      });

      if (!response || response.status() >= 400) {
        unifiedLogger.system('warning', 'warn', 'Failed to load page', { url, status: response?.status() });
        return null;
      }

      // Extract page data
      const pageData = await page.evaluate((currentUrl: any) => {
        // Technology detection function (inline since it runs in browser context)
        function detectTechnologies() {
          const technologies: any[] = [];

          // Framework detection
          if ((window as any).React) {
            technologies.push({
              category: 'JavaScript Frameworks',
              name: 'React',
              confidence: 0.9,
              evidence: ['window.React detected']
            });
          }

          if ((window as any).Vue) {
            technologies.push({
              category: 'JavaScript Frameworks',
              name: 'Vue.js',
              confidence: 0.9,
              evidence: ['window.Vue detected']
            });
          }

          if ((window as any).angular) {
            technologies.push({
              category: 'JavaScript Frameworks',
              name: 'AngularJS',
              confidence: 0.9,
              evidence: ['window.angular detected']
            });
          }

          // jQuery detection
          if ((window as any).jQuery || (window as any).$) {
            technologies.push({
              category: 'JavaScript Libraries',
              name: 'jQuery',
              confidence: 0.9,
              evidence: ['window.jQuery detected']
            });
          }

          // CMS detection by meta tags
          const generator = document.querySelector('meta[name="generator"]')?.getAttribute('content') || '';
          if (generator.toLowerCase().includes('wordpress')) {
            technologies.push({
              category: 'CMS',
              name: 'WordPress',
              confidence: 0.9,
              evidence: [`Generator meta tag: ${generator}`]
            });
          }

          if (generator.toLowerCase().includes('drupal')) {
            technologies.push({
              category: 'CMS',
              name: 'Drupal',
              confidence: 0.9,
              evidence: [`Generator meta tag: ${generator}`]
            });
          }

          return technologies;
        }

        const technologies = detectTechnologies();

        // Content extraction
        const content = {
          title: document.title,
          metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content'),
          headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
            level: parseInt(h.tagName.substring(1)),
            text: h.textContent?.trim() || ''
          })),
          text: document.body.textContent?.trim() || '',
          forms: Array.from(document.forms).map(form => ({
            action: form.action,
            method: form.method,
            fields: form.elements.length
          })),
          links: Array.from(document.links).map(link => link.href)
        };

        // SEO analysis
        const seo = {
          hasMetaDescription: !!document.querySelector('meta[name="description"]'),
          hasTitleTag: !!document.title,
          hasCanonical: !!document.querySelector('link[rel="canonical"]'),
          hasStructuredData: !!document.querySelector('script[type="application/ld+json"]'),
          imageAltText: Array.from(document.images).filter(img => img.alt).length
        };

        // Navigation structure
        const navigation = {
          primary: Array.from(document.querySelectorAll('nav a, .nav a, .navigation a')).map(a => a.textContent?.trim() || ''),
          footer: Array.from(document.querySelectorAll('footer a')).map(a => a.textContent?.trim() || '')
        };

        return {
          url: currentUrl,
          content,
          seo,
          navigation,
          technologies,
          html: document.documentElement.outerHTML
        };
      }, url);

      // Find new URLs to crawl
      if (depth < config.maxDepth) {
        const newUrls = await this.extractUrls(pageData.content.links, url, config);
        for (const newUrl of newUrls) {
          if (!crawledUrls.has(newUrl)) {
            urlsToVisit.push({ url: newUrl, depth: depth + 1 });
          }
        }
      }

      // Add network data
      (pageData as any).networkRequests = networkRequests;
      (pageData as any).loadTime = Date.now(); // Simplified timing

      return pageData;

    } catch (error) {
      unifiedLogger.system('warning', 'warn', 'Error crawling page', { url, error: (error as Error).message });
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Detect technologies used on the page
   */
  private detectTechnologies(): TechnologyDetection[] {
    const technologies: TechnologyDetection[] = [];

    // Framework detection
    if ((window as any).React) {
      technologies.push({
        category: 'JavaScript Frameworks',
        name: 'React',
        confidence: 0.9,
        evidence: ['window.React detected']
      });
    }

    if ((window as any).Vue) {
      technologies.push({
        category: 'JavaScript Frameworks',
        name: 'Vue.js',
        confidence: 0.9,
        evidence: ['window.Vue detected']
      });
    }

    if ((window as any).angular) {
      technologies.push({
        category: 'JavaScript Frameworks',
        name: 'AngularJS',
        confidence: 0.9,
        evidence: ['window.angular detected']
      });
    }

    // jQuery detection
    if ((window as any).jQuery || (window as any).$) {
      technologies.push({
        category: 'JavaScript Libraries',
        name: 'jQuery',
        confidence: 0.9,
        evidence: ['window.jQuery detected']
      });
    }

    // CSS frameworks
    const stylesheets = Array.from(document.styleSheets);
    for (const sheet of stylesheets) {
      try {
        const href = sheet.href || '';
        if (href.includes('bootstrap')) {
          technologies.push({
            category: 'CSS Frameworks',
            name: 'Bootstrap',
            confidence: 0.8,
            evidence: [`Stylesheet: ${href}`]
          });
        }
        if (href.includes('tailwind')) {
          technologies.push({
            category: 'CSS Frameworks',
            name: 'Tailwind CSS',
            confidence: 0.8,
            evidence: [`Stylesheet: ${href}`]
          });
        }
      } catch (e) {
        // Cross-origin stylesheet access denied
      }
    }

    // CMS detection by meta tags
    const generator = document.querySelector('meta[name="generator"]')?.getAttribute('content') || '';
    if (generator.toLowerCase().includes('wordpress')) {
      technologies.push({
        category: 'CMS',
        name: 'WordPress',
        confidence: 0.9,
        evidence: [`Generator meta tag: ${generator}`]
      });
    }
    if (generator.toLowerCase().includes('drupal')) {
      technologies.push({
        category: 'CMS',
        name: 'Drupal',
        confidence: 0.9,
        evidence: [`Generator meta tag: ${generator}`]
      });
    }

    return technologies;
  }

  /**
   * Extract and filter URLs for crawling
   */
  private extractUrls(links: string[], baseUrl: string, config: CrawlConfig): string[] {
    const baseHost = new URL(baseUrl).hostname;
    const validUrls: string[] = [];

    for (const link of links) {
      try {
        const url = new URL(link, baseUrl);

        // Filter by allowed hosts
        if (config.sameOriginOnly && url.hostname !== baseHost) {
          continue;
        }

        // Skip non-HTTP protocols
        if (!['http:', 'https:'].includes(url.protocol)) {
          continue;
        }

        // Skip file extensions that are not web pages
        const path = url.pathname.toLowerCase();
        if (path.match(/\.(pdf|doc|docx|xls|xlsx|zip|rar|exe|dmg|jpg|jpeg|png|gif|mp4|mp3|wav)$/)) {
          continue;
        }

        validUrls.push(url.toString());
      } catch (e) {
        // Invalid URL, skip
      }
    }

    return [...new Set(validUrls)]; // Remove duplicates
  }

  /**
   * Analyze crawled content and generate insights
   */
  private async analyzeContent(crawledData: any[]): Promise<SiteAnalysisResult> {
    if (crawledData.length === 0) {
      throw new Error('No pages could be crawled');
    }

    // Aggregate technologies
    const allTechnologies = new Map<string, TechnologyDetection>();
    crawledData.forEach(page => {
      page.technologies?.forEach((tech: TechnologyDetection) => {
        const key = `${tech.category}-${tech.name}`;
        if (!allTechnologies.has(key) || allTechnologies.get(key)!.confidence < tech.confidence) {
          allTechnologies.set(key, tech);
        }
      });
    });

    // Analyze structure
    const structure: SiteStructure = {
      totalPages: crawledData.length,
      pageTypes: this.analyzePageTypes(crawledData),
      navigation: this.analyzeNavigation(crawledData),
      sitemap: crawledData.map(page => page.url)
    };

    // Analyze content
    const content: ContentAnalysis = {
      totalText: crawledData.reduce((sum, page) => sum + (page.content?.text?.length || 0), 0),
      languages: ['en'], // Simplified - would need language detection
      headings: this.aggregateHeadings(crawledData),
      forms: this.analyzeForms(crawledData),
      mediaCount: this.countMedia(crawledData)
    };

    // Asset inventory
    const assets: AssetInventory = this.buildAssetInventory(crawledData);

    // Performance metrics (simplified)
    const performance: PerformanceMetrics = {
      loadTime: crawledData.reduce((sum, page) => sum + (page.loadTime || 0), 0) / crawledData.length,
      firstContentfulPaint: 0, // Would need real performance API data
      totalRequests: crawledData.reduce((sum, page) => sum + (page.networkRequests?.length || 0), 0),
      totalSize: assets.totalSize,
      criticalPathResources: 0
    };

    // SEO analysis
    const seo: SEOAnalysis = {
      hasMetaDescription: crawledData.some(page => page.seo?.hasMetaDescription),
      hasTitleTags: crawledData.every(page => page.seo?.hasTitleTag),
      hasStructuredData: crawledData.some(page => page.seo?.hasStructuredData),
      hasCanonical: crawledData.some(page => page.seo?.hasCanonical),
      imageAltText: crawledData.reduce((sum, page) => sum + (page.seo?.imageAltText || 0), 0),
      headingStructure: this.analyzeHeadingStructure(crawledData)
    };

    // Accessibility (basic analysis)
    const accessibility: AccessibilityBasics = {
      hasAltText: seo.imageAltText > 0,
      hasAriaLabels: false, // Would need DOM analysis
      hasSemanticHTML: false, // Would need DOM analysis
      colorContrast: 'unknown'
    };

    return {
      technologies: Array.from(allTechnologies.values()),
      structure,
      content,
      assets,
      performance,
      seo,
      accessibility
    };
  }

  /**
   * Helper methods for content analysis
   */
  private analyzePageTypes(crawledData: any[]): PageTypeAnalysis[] {
    // Simplified page type detection
    return [
      { type: 'page', count: crawledData.length, templates: ['default'] }
    ];
  }

  private analyzeNavigation(crawledData: any[]): NavigationStructure {
    const allNavigation = crawledData.map(page => page.navigation);
    return {
      primary: [...new Set(allNavigation.flatMap(nav => nav?.primary || []))],
      secondary: [],
      footer: [...new Set(allNavigation.flatMap(nav => nav?.footer || []))],
      breadcrumbs: false
    };
  }

  private aggregateHeadings(crawledData: any[]): HeadingStructure[] {
    const headingCounts = new Map<string, { level: number; count: number }>();

    crawledData.forEach(page => {
      page.content?.headings?.forEach((heading: any) => {
        const key = `${heading.level}-${heading.text}`;
        if (headingCounts.has(key)) {
          headingCounts.get(key)!.count++;
        } else {
          headingCounts.set(key, { level: heading.level, count: 1 });
        }
      });
    });

    return Array.from(headingCounts.entries()).map(([text, data]) => ({
      level: data.level,
      text: text.split('-').slice(1).join('-'),
      count: data.count
    }));
  }

  private analyzeForms(crawledData: any[]): FormAnalysis[] {
    const forms: FormAnalysis[] = [];

    crawledData.forEach(page => {
      page.content?.forms?.forEach((form: any) => {
        forms.push({
          action: form.action,
          method: form.method,
          fields: form.fields,
          type: this.determineFormType(form)
        });
      });
    });

    return forms;
  }

  private determineFormType(form: any): 'contact' | 'login' | 'search' | 'newsletter' | 'unknown' {
    const action = form.action.toLowerCase();
    if (action.includes('contact')) return 'contact';
    if (action.includes('login') || action.includes('signin')) return 'login';
    if (action.includes('search')) return 'search';
    if (action.includes('newsletter') || action.includes('subscribe')) return 'newsletter';
    return 'unknown';
  }

  private countMedia(crawledData: any[]): number {
    return crawledData.reduce((sum, page) => {
      const html = page.html || '';
      const imageCount = (html.match(/<img/gi) || []).length;
      const videoCount = (html.match(/<video/gi) || []).length;
      return sum + imageCount + videoCount;
    }, 0);
  }

  private buildAssetInventory(crawledData: any[]): AssetInventory {
    const assets: AssetInventory = {
      images: [],
      stylesheets: [],
      scripts: [],
      fonts: [],
      documents: [],
      totalSize: 0
    };

    crawledData.forEach(page => {
      page.networkRequests?.forEach((request: any) => {
        const contentType = request.contentType || '';
        const size = request.size || 0;

        const assetInfo: AssetInfo = {
          url: request.url,
          type: contentType,
          size,
          critical: false // Would need analysis to determine
        };

        if (contentType.includes('image/')) {
          assets.images.push(assetInfo);
        } else if (contentType.includes('text/css')) {
          assets.stylesheets.push(assetInfo);
        } else if (contentType.includes('javascript')) {
          assets.scripts.push(assetInfo);
        } else if (contentType.includes('font/')) {
          assets.fonts.push(assetInfo);
        }

        assets.totalSize += size;
      });
    });

    return assets;
  }

  private analyzeHeadingStructure(crawledData: any[]): boolean {
    // Check if pages have proper heading hierarchy
    return crawledData.some(page =>
      page.content?.headings?.some((h: any) => h.level === 1)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}