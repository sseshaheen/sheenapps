/**
 * PII Scrubber Service
 *
 * Server-side PII detection and redaction for feedback text fields.
 * Applied before storage to prevent accidental data leakage.
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Privacy & Consent section
 */

// Patterns to detect and redact
const PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Email addresses
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    label: '[EMAIL]',
  },
  // Phone numbers (various formats)
  {
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    label: '[PHONE]',
  },
  // International phone numbers
  {
    pattern: /\b\+\d{1,3}[-.\s]?\d{1,14}\b/g,
    label: '[PHONE]',
  },
  // API keys (common prefixes)
  {
    pattern: /\b(sk-|pk_|sk_live_|pk_live_|sk_test_|pk_test_)[a-zA-Z0-9]{20,}\b/g,
    label: '[API_KEY]',
  },
  // Stripe keys specifically
  {
    pattern: /\b(whsec_|rk_live_|rk_test_)[a-zA-Z0-9]{20,}\b/g,
    label: '[API_KEY]',
  },
  // Generic API keys (32+ alphanumeric)
  {
    pattern: /\b[a-zA-Z0-9]{32,}\b/g,
    label: '[POSSIBLE_KEY]',
  },
  // Secrets in key=value format
  {
    pattern: /\b(password|secret|token|api_key|apikey|auth_token|access_token|private_key)\s*[:=]\s*\S+/gi,
    label: '[SECRET]',
  },
  // Credit card numbers (basic detection)
  {
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    label: '[CARD]',
  },
  // SSN (US format)
  {
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    label: '[SSN]',
  },
  // IP addresses (v4)
  {
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    label: '[IP]',
  },
  // URLs with potential auth tokens
  {
    pattern: /https?:\/\/[^\s]*(?:token|key|auth|secret|password)=[^\s&]+/gi,
    label: '[URL_WITH_SECRET]',
  },
];

/**
 * Scrub PII from text content
 * @param text - Raw text to scrub
 * @returns Scrubbed text with PII replaced by labels
 */
export function scrubPII(text: string | null | undefined): string | null {
  if (!text) return null;

  let scrubbed = text;

  for (const { pattern, label } of PII_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    scrubbed = scrubbed.replace(pattern, label);
  }

  return scrubbed;
}

/**
 * Check if text likely contains PII (for metrics/logging)
 * Does NOT modify the text
 */
export function containsPII(text: string | null | undefined): boolean {
  if (!text) return false;

  for (const { pattern } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Get summary of PII types found (for audit logging)
 */
export function getPIISummary(text: string | null | undefined): string[] {
  if (!text) return [];

  const found: string[] = [];

  for (const { pattern, label } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      found.push(label);
    }
  }

  return [...new Set(found)]; // Dedupe
}
