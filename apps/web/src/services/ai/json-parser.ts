import { logger } from '@/utils/logger';

/**
 * Robust JSON parser that handles AI responses with markdown code blocks,
 * extra text, and other common formatting issues
 */
export class RobustJSONParser {
  /**
   * Parse JSON from AI response, handling common formatting issues
   */
  static parse<T>(content: string): T {
    if (!content) {
      throw new Error('Empty content provided')
    }

    // Try direct JSON parse first (fastest path)
    try {
      return JSON.parse(content.trim()) as T
    } catch (error) {
      // Continue to robust parsing
    }

    // Clean the content and try various extraction methods
    const cleaned = this.cleanContent(content)
    
    // Method 1: Extract from markdown code blocks
    const jsonFromCodeBlock = this.extractFromCodeBlock(cleaned)
    if (jsonFromCodeBlock) {
      try {
        return JSON.parse(jsonFromCodeBlock) as T
      } catch (error) {
        // Continue to next method
      }
    }

    // Method 2: Extract JSON object/array from text
    const jsonFromText = this.extractJSONFromText(cleaned)
    if (jsonFromText) {
      try {
        return JSON.parse(jsonFromText) as T
      } catch (error) {
        // Continue to next method
      }
    }

    // Method 3: Try to fix common JSON issues and parse
    const fixedJSON = this.fixCommonJSONIssues(cleaned)
    if (fixedJSON) {
      try {
        return JSON.parse(fixedJSON) as T
      } catch (error) {
        // Continue to fallback
      }
    }

    // If all else fails, throw with helpful error
    throw new Error(`Failed to parse JSON from AI response. Content length: ${content.length}, starts with: "${content.slice(0, 20)}..."`)
  }

  /**
   * Clean content by removing common AI response artifacts
   */
  private static cleanContent(content: string): string {
    return content
      .trim()
      // Remove common AI prefixes
      .replace(/^(Here's|Here is|Sure,|Certainly,|Of course,).*?[:]/i, '')
      // Remove explanatory text before JSON
      .replace(/^.*?(?=[\[{])/, '')
      // Remove explanatory text after JSON
      .replace(/[\]}]\s*\n\n.*$/, (match) => match.split('\n\n')[0])
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Extract JSON from markdown code blocks
   */
  private static extractFromCodeBlock(content: string): string | null {
    // Match ```json ... ``` or ``` ... ```
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i
    const match = content.match(codeBlockRegex)
    
    if (match && match[1]) {
      return match[1].trim()
    }

    return null
  }

  /**
   * Extract JSON object or array from text
   */
  private static extractJSONFromText(content: string): string | null {
    // Find JSON object
    const objectMatch = content.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      return objectMatch[0]
    }

    // Find JSON array
    const arrayMatch = content.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      return arrayMatch[0]
    }

    return null
  }

  /**
   * Fix common JSON formatting issues
   */
  private static fixCommonJSONIssues(content: string): string | null {
    try {
      const fixed = content
        // Fix trailing commas
        .replace(/,(\s*[}\]])/g, '$1')
        // Fix single quotes to double quotes
        .replace(/'/g, '"')
        // Fix unquoted keys (basic cases)
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
        // Fix common escape issues
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t')

      return fixed
    } catch (error) {
      return null
    }
  }

  /**
   * Validate that parsed result has expected structure
   */
  static validateStructure<T>(data: any, expectedKeys: string[]): T {
    if (!data || typeof data !== 'object') {
      throw new Error('Parsed data is not an object')
    }

    const missingKeys = expectedKeys.filter(key => !(key in data))
    if (missingKeys.length > 0) {
      logger.warn('Missing expected keys:', missingKeys);
      // Don't throw, just warn - AI might use different naming
    }

    return data as T
  }
}