import { URL } from 'url';
import { JSDOM } from 'jsdom';
import { unifiedLogger } from './unifiedLogger';

export interface CrawlResult {
  pages: PageResult[];
  assets: AssetResult[];
  metadata: CrawlMetadata;
}

export interface PageResult {
  url: string;
  html: string;
  title: string;
  statusCode: number;
  contentType?: string;
  links: string[];
}

export interface AssetResult {
  url: string;
  type: 'image' | 'css' | 'js' | 'font' | 'other';
  size?: number;
}

export interface CrawlMetadata {
  startTime: number;
  endTime?: number;
  pagesCrawled: number;
  pagesSkipped: number;
  errors: Array<{ url: string; error: string }>;
}

export interface ShallowAnalysisResult {
  url: string;
  statusCode: number;
  title: string;
  description?: string | undefined;
  pageCount: 1;
  preview: true;
  html: string;
}

/**
 * Website Crawler Service with SSRF Protection
 *
 * Security features:
 * - Blocks private IP ranges (127.0.0.0/8, 10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12)
 * - Blocks link-local addresses (169.254.0.0/16)
 * - Blocks AWS metadata endpoint (169.254.169.254)
 * - Enforces same-origin policy for deep crawls
 * - Manual redirect handling with validation
 * - Timeout protection (10s per request)
 */
export class WebsiteCrawlerService {
  // Blocked IP ranges (SSRF protection)
  private readonly BLOCKED_RANGES = [
    /^127\./,          // Localhost
    /^10\./,           // Private (10.0.0.0/8)
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private (172.16.0.0/12)
    /^192\.168\./,     // Private (192.168.0.0/16)
    /^169\.254\./,     // Link-local (169.254.0.0/16)
    /^0\./,            // Invalid
    /^::1$/,           // IPv6 localhost
    /^fe80:/,          // IPv6 link-local
    /^fc00:/,          // IPv6 unique local
    /^fd00:/,          // IPv6 unique local
  ];

  /**
   * Validate URL is safe to crawl (SSRF protection)
   */
  private validateUrl(url: string, baseUrl: string): boolean {
    try {
      const parsed = new URL(url, baseUrl);

      // 1. Only HTTP/HTTPS
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }

      // 2. Block private IPs
      const hostname = parsed.hostname.toLowerCase();
      if (this.BLOCKED_RANGES.some(regex => regex.test(hostname))) {
        return false;
      }

      // 3. Block metadata endpoints
      if (hostname === '169.254.169.254') { // AWS metadata
        return false;
      }
      if (hostname === 'metadata.google.internal') { // GCP metadata
        return false;
      }

      // 4. Block localhost variants
      if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
        return false;
      }

      // 5. Enforce same-origin for deep crawls (or allow subdomains)
      const baseHostname = new URL(baseUrl).hostname.toLowerCase();
      if (hostname !== baseHostname) {
        // Allow subdomains (e.g., www.example.com when base is example.com)
        const isSubdomain = hostname.endsWith(`.${baseHostname}`);
        if (!isSubdomain) {
          return false;
        }
      }

      return true;

    } catch {
      return false;
    }
  }

  /**
   * Shallow analysis: Fetch ONLY homepage (safe, no verification needed)
   * Used for preview before ownership verification
   */
  async crawlShallow(sourceUrl: string): Promise<ShallowAnalysisResult> {
    unifiedLogger.system('startup', 'info', 'Starting shallow crawl', { sourceUrl });

    // Validate URL
    if (!this.validateUrl(sourceUrl, sourceUrl)) {
      throw new Error('Invalid or unsafe URL');
    }

    try {
      const response = await fetch(sourceUrl, {
        redirect: 'manual', // Don't follow redirects
        headers: { 'User-Agent': 'SheenApps Migration Tool (Preview)' },
        signal: AbortSignal.timeout(5000), // 5 second timeout for preview
      });

      // Handle redirects manually
      if ([301, 302, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (location) {
          const redirectUrl = new URL(location, sourceUrl).toString();
          if (this.validateUrl(redirectUrl, sourceUrl)) {
            // Follow ONE redirect for preview
            return this.crawlShallow(redirectUrl);
          }
        }
        throw new Error(`Redirect to unsafe URL: ${location}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Extract basic metadata
      const title = document.querySelector('title')?.textContent?.trim() || '';
      const descriptionElement = document.querySelector('meta[name="description"]');
      const description = descriptionElement?.getAttribute('content') ?? undefined;

      unifiedLogger.system('startup', 'info', 'Shallow crawl complete', {
        sourceUrl,
        statusCode: response.status,
        title,
      });

      const result: ShallowAnalysisResult = {
        url: sourceUrl,
        statusCode: response.status,
        title,
        pageCount: 1,
        preview: true,
        html,
      };

      // Only add description if it exists
      if (description !== undefined) {
        result.description = description;
      }

      return result;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Shallow crawl failed', {
        sourceUrl,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Deep crawl: Full website crawl with link following
   * ONLY use after ownership verification
   */
  async crawlWebsite(url: string, maxPages: number = 50): Promise<CrawlResult> {
    unifiedLogger.system('startup', 'info', 'Starting deep crawl', { url, maxPages });

    const visited = new Set<string>();
    const pages: PageResult[] = [];
    const assets = new Set<string>();
    const errors: Array<{ url: string; error: string }> = [];
    let pagesSkipped = 0;

    const metadata: CrawlMetadata = {
      startTime: Date.now(),
      pagesCrawled: 0,
      pagesSkipped: 0,
      errors: [],
    };

    // Validate base URL
    if (!this.validateUrl(url, url)) {
      throw new Error('Invalid or unsafe URL');
    }

    // Normalize base URL (remove trailing slash)
    const baseUrl = url.replace(/\/$/, '');
    const queue = [baseUrl];

    while (queue.length > 0 && pages.length < maxPages) {
      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;

      // Validate before fetching
      if (!this.validateUrl(currentUrl, baseUrl)) {
        pagesSkipped++;
        continue;
      }

      visited.add(currentUrl);

      try {
        const response = await fetch(currentUrl, {
          redirect: 'manual', // Don't follow redirects automatically
          headers: { 'User-Agent': 'SheenApps Migration Tool' },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        // Handle redirects manually (with validation)
        if ([301, 302, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (location) {
            const redirectUrl = new URL(location, currentUrl).toString();
            if (this.validateUrl(redirectUrl, baseUrl) && !visited.has(redirectUrl)) {
              queue.push(redirectUrl);
            }
          }
          continue;
        }

        if (!response.ok) {
          errors.push({ url: currentUrl, error: `HTTP ${response.status}` });
          continue;
        }

        const contentType = response.headers.get('content-type') || '';

        // Only process HTML pages
        if (!contentType.includes('text/html')) {
          continue;
        }

        const html = await response.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        // Extract title
        const title = document.querySelector('title')?.textContent?.trim() || '';

        // Extract links
        const links: string[] = [];
        const linkElements = document.querySelectorAll('a[href]');
        linkElements.forEach((link) => {
          const href = link.getAttribute('href');
          if (href) {
            try {
              const absoluteUrl = new URL(href, currentUrl).toString();
              // Remove fragment
              const cleanUrl = absoluteUrl.split('#')[0] || absoluteUrl;
              if (cleanUrl && !visited.has(cleanUrl) && !queue.includes(cleanUrl)) {
                if (this.validateUrl(cleanUrl, baseUrl)) {
                  links.push(cleanUrl);
                  queue.push(cleanUrl);
                }
              }
            } catch {
              // Invalid URL, skip
            }
          }
        });

        // Extract assets
        this.extractAssets(document, currentUrl, baseUrl, assets);

        pages.push({
          url: currentUrl,
          html,
          title,
          statusCode: response.status,
          contentType,
          links,
        });

        unifiedLogger.system('startup', 'info', 'Page crawled', {
          url: currentUrl,
          linksFound: links.length,
          progress: `${pages.length}/${maxPages}`,
        });

      } catch (error) {
        const errorMessage = (error as Error).message;
        errors.push({ url: currentUrl, error: errorMessage });
        unifiedLogger.system('error', 'warn', 'Failed to crawl URL', {
          url: currentUrl,
          error: errorMessage,
        });
      }
    }

    metadata.endTime = Date.now();
    metadata.pagesCrawled = pages.length;
    metadata.pagesSkipped = pagesSkipped;
    metadata.errors = errors;

    unifiedLogger.system('startup', 'info', 'Deep crawl complete', {
      url,
      pagesCrawled: pages.length,
      pagesSkipped,
      errors: errors.length,
      duration: metadata.endTime - metadata.startTime,
    });

    return {
      pages,
      assets: Array.from(assets).map(url => ({
        url,
        type: this.getAssetType(url),
      })),
      metadata,
    };
  }

  /**
   * Extract assets (images, CSS, JS) from HTML
   */
  private extractAssets(
    document: Document,
    currentUrl: string,
    baseUrl: string,
    assets: Set<string>
  ): void {
    // Images
    const images = document.querySelectorAll('img[src]');
    images.forEach((img) => {
      const src = img.getAttribute('src');
      if (src) {
        try {
          const absoluteUrl = new URL(src, currentUrl).toString();
          assets.add(absoluteUrl);
        } catch {
          // Invalid URL
        }
      }
    });

    // CSS
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"][href]');
    stylesheets.forEach((link) => {
      const href = link.getAttribute('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, currentUrl).toString();
          assets.add(absoluteUrl);
        } catch {
          // Invalid URL
        }
      }
    });

    // JavaScript
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach((script) => {
      const src = script.getAttribute('src');
      if (src) {
        try {
          const absoluteUrl = new URL(src, currentUrl).toString();
          assets.add(absoluteUrl);
        } catch {
          // Invalid URL
        }
      }
    });
  }

  /**
   * Determine asset type from URL
   */
  private getAssetType(url: string): 'image' | 'css' | 'js' | 'font' | 'other' {
    const lowerUrl = url.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|svg|webp|ico)(\?|$)/i.test(lowerUrl)) {
      return 'image';
    }
    if (/\.css(\?|$)/i.test(lowerUrl)) {
      return 'css';
    }
    if (/\.js(\?|$)/i.test(lowerUrl)) {
      return 'js';
    }
    if (/\.(woff|woff2|ttf|eot|otf)(\?|$)/i.test(lowerUrl)) {
      return 'font';
    }
    return 'other';
  }
}
