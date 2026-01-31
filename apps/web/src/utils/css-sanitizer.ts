/**
 * Sanitizes CSS to prevent injection attacks
 */
export function sanitizeCSS(css: string): string {
  if (!css) return '';
  
  // Remove any </style> tags that could break out of the style block
  let sanitized = css.replace(/<\/style>/gi, '');
  
  // Remove javascript: protocol in url()
  sanitized = sanitized.replace(/url\s*\(\s*["']?javascript:/gi, 'url(blocked:');
  
  // Remove data: URLs that could contain scripts
  sanitized = sanitized.replace(/url\s*\(\s*["']?data:text\/html/gi, 'url(blocked:');
  
  // Remove expression() which was used in old IE for JS execution
  sanitized = sanitized.replace(/expression\s*\(/gi, 'blocked(');
  
  // Remove @import to prevent loading external malicious stylesheets
  sanitized = sanitized.replace(/@import/gi, '/* @import blocked */');
  
  // Escape quotes in content to prevent breaking out
  sanitized = sanitized.replace(/content\s*:\s*["']([^"']*["'][^"']*)+["']/gi, (match) => {
    return match.replace(/["']/g, (quote) => '\\' + quote);
  });
  
  return sanitized;
}