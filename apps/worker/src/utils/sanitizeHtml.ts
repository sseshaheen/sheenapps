/**
 * HTML Sanitization Utility
 * 
 * Provides strict HTML sanitization for career portal content
 * Uses a whitelist approach to allow only safe HTML tags and attributes
 * Designed for sanitizing job descriptions, requirements, and benefits
 */

// =====================================================
// Configuration
// =====================================================

// Allowed HTML tags for career content
const ALLOWED_TAGS = new Set([
  'p', 'br',                           // Paragraphs and line breaks
  'h1', 'h2', 'h3', 'h4',              // Headings
  'b', 'strong', 'i', 'em',            // Text formatting
  'ul', 'ol', 'li',                    // Lists
  'a'                                   // Links
]);

// Allowed attributes per tag
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target'])        // Allow href and target for links
};

// URL schemes allowed in href attributes
const ALLOWED_URL_SCHEMES = new Set(['http', 'https', 'mailto']);

// =====================================================
// Sanitization Functions
// =====================================================

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  
  return text.replace(/[&<>"']/g, char => htmlEscapes[char] || char);
}

/**
 * Validates and sanitizes a URL
 */
function sanitizeUrl(url: string): string | null {
  if (!url) return null;
  
  const trimmed = url.trim();
  
  // Check for dangerous protocols
  const protocolMatch = trimmed.match(/^([a-zA-Z]+):/);
  if (protocolMatch && protocolMatch[1]) {
    const protocol = protocolMatch[1].toLowerCase();
    if (!ALLOWED_URL_SCHEMES.has(protocol)) {
      return null; // Reject dangerous protocols
    }
  } else {
    // Relative URLs are allowed
    if (!trimmed.startsWith('/') && !trimmed.startsWith('#')) {
      // Assume http:// for URLs without protocol
      return `http://${trimmed}`;
    }
  }
  
  // Remove javascript: and data: URLs
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return null;
  }
  
  return trimmed;
}

/**
 * Sanitizes HTML content using a strict whitelist approach
 * 
 * @param html - Raw HTML content to sanitize
 * @returns Sanitized HTML safe for storage and display
 */
export function sanitizeHtmlStrict(html: string | null | undefined): string {
  if (!html) return '';
  
  // Convert to string if needed
  const htmlStr = String(html);
  
  // First pass: Remove all script and style tags completely
  let cleaned = htmlStr
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Second pass: Process allowed tags
  const tagRegex = /<([\/]?)([a-zA-Z0-9]+)([^>]*)>/g;
  
  cleaned = cleaned.replace(tagRegex, (match, closing, tagName, attributes) => {
    const tag = tagName.toLowerCase();
    
    // Check if tag is allowed
    if (!ALLOWED_TAGS.has(tag)) {
      return ''; // Remove disallowed tags
    }
    
    // For closing tags, just return them
    if (closing) {
      return `</${tag}>`;
    }
    
    // Process attributes for opening tags
    let sanitizedAttrs = '';
    if (attributes && ALLOWED_ATTRS[tag]) {
      const allowedAttrsForTag = ALLOWED_ATTRS[tag];
      const attrRegex = /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      
      let attrMatch;
      const processedAttrs: string[] = [];
      
      while ((attrMatch = attrRegex.exec(attributes)) !== null) {
        if (!attrMatch[1]) continue;
        const attrName = attrMatch[1].toLowerCase();
        const attrValue = attrMatch[2] || attrMatch[3] || attrMatch[4] || '';
        
        if (allowedAttrsForTag.has(attrName)) {
          // Special handling for href
          if (attrName === 'href') {
            const sanitizedUrl = sanitizeUrl(attrValue);
            if (sanitizedUrl) {
              processedAttrs.push(`${attrName}="${escapeHtml(sanitizedUrl)}"`);
            }
          }
          // Special handling for target
          else if (attrName === 'target') {
            // Only allow _blank for target
            if (attrValue === '_blank') {
              processedAttrs.push(`${attrName}="_blank"`);
              // Add rel="noopener noreferrer" for security
              processedAttrs.push('rel="noopener noreferrer"');
            }
          }
          // Other attributes
          else {
            processedAttrs.push(`${attrName}="${escapeHtml(attrValue)}"`);
          }
        }
      }
      
      if (processedAttrs.length > 0) {
        sanitizedAttrs = ' ' + processedAttrs.join(' ');
      }
    }
    
    return `<${tag}${sanitizedAttrs}>`;
  });
  
  // Third pass: Remove any remaining dangerous patterns
  cleaned = cleaned
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')  // Remove event handlers
    .replace(/<!--[\s\S]*?-->/g, ''); // Remove HTML comments
  
  return cleaned.trim();
}

/**
 * Sanitizes multilingual HTML content
 * Applies sanitization to each language variant
 * 
 * @param multilingualField - Object with language codes as keys and HTML as values
 * @returns Sanitized multilingual field
 */
export function sanitizeMultilingualHtml(
  multilingualField: Record<string, string | undefined> | null | undefined
): Record<string, string> {
  if (!multilingualField) return {};
  
  const sanitized: Record<string, string> = {};
  
  for (const [lang, content] of Object.entries(multilingualField)) {
    if (content) {
      sanitized[lang] = sanitizeHtmlStrict(content);
    }
  }
  
  return sanitized;
}

/**
 * Strips all HTML tags from content
 * Useful for generating plain text previews
 * 
 * @param html - HTML content to strip
 * @returns Plain text without HTML tags
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  
  return String(html)
    .replace(/<[^>]*>/g, '') // Remove all tags
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Truncates HTML content while preserving tag structure
 * Useful for generating previews that maintain formatting
 * 
 * @param html - HTML content to truncate
 * @param maxLength - Maximum length of text content
 * @returns Truncated HTML with proper tag closure
 */
export function truncateHtml(html: string | null | undefined, maxLength: number): string {
  if (!html) return '';
  
  const sanitized = sanitizeHtmlStrict(html);
  const plainText = stripHtml(sanitized);
  
  if (plainText.length <= maxLength) {
    return sanitized;
  }
  
  // Simple truncation - for MVP, just return plain text truncated
  // A more sophisticated implementation would preserve HTML structure
  return escapeHtml(plainText.substring(0, maxLength) + '...');
}

// =====================================================
// Export Types
// =====================================================

export type SanitizeOptions = {
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  allowedUrlSchemes?: string[];
};