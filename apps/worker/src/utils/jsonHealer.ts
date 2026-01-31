/**
 * JSON Healer - Utilities to clean and heal malformed JSON files
 * Handles common formatting issues, especially those introduced by AI tools
 */

interface HealResult {
  healed: boolean;
  content: string;
  fixes: string[];
}

/**
 * Main function to heal malformed JSON content
 * @param content - The potentially malformed JSON string
 * @param filePath - Optional file path for better error messages
 * @returns Object containing healed status, cleaned content, and list of fixes applied
 */
export function healJSON(content: string, filePath?: string): HealResult {
  const fixes: string[] = [];
  let workingContent = content;
  
  // Track if we made any changes
  const originalContent = content;
  
  try {
    // Step 1: Remove markdown code blocks
    workingContent = removeMarkdownCodeBlocks(workingContent, fixes);
    
    // Step 2: Fix common formatting issues
    workingContent = fixCommonJSONIssues(workingContent, fixes);
    
    // Step 3: Attempt to parse and validate
    try {
      JSON.parse(workingContent);
      
      // If we made changes and parsing succeeds
      if (workingContent !== originalContent) {
        logFixes(fixes, filePath);
        return {
          healed: true,
          content: workingContent,
          fixes
        };
      }
      
      // No changes needed, already valid
      return {
        healed: false,
        content: originalContent,
        fixes: []
      };
    } catch (parseError) {
      // Try more aggressive fixes
      workingContent = applyAggressiveFixes(workingContent, fixes);
      
      // Final validation attempt
      JSON.parse(workingContent);
      
      logFixes(fixes, filePath);
      return {
        healed: true,
        content: workingContent,
        fixes
      };
    }
  } catch (error) {
    // Could not heal the JSON completely, but return partially fixed content if we made any changes
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const fileInfo = filePath ? ` in file ${filePath}` : '';
    
    // If we applied any fixes, return the partially healed content
    if (fixes.length > 0 && workingContent !== originalContent) {
      console.warn(`Partially healed JSON${fileInfo} - ${fixes.length} fixes applied but parsing still fails: ${errorMessage}`);
      
      // Try one more aggressive fix: ensure the content ends with a valid closing
      if (!workingContent.trim().endsWith('}') && !workingContent.trim().endsWith(']')) {
        if (workingContent.includes('{')) {
          workingContent = workingContent.trim() + '}';
          fixes.push('Added missing closing brace at end');
        }
      }
      
      // Return the partially healed content
      return {
        healed: true,
        content: workingContent,
        fixes
      };
    }
    
    console.error(`Failed to heal JSON${fileInfo}: ${errorMessage}`);
    
    return {
      healed: false,
      content: originalContent,
      fixes: []
    };
  }
}

/**
 * Remove markdown code blocks from JSON content
 */
function removeMarkdownCodeBlocks(content: string, fixes: string[]): string {
  // Pattern to match ```json...``` or ```...``` blocks
  const codeBlockPattern = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  
  let hasCodeBlocks = false;
  let cleanedContent = content;
  
  // Check if content is wrapped in code blocks
  const matches = content.match(codeBlockPattern);
  if (matches) {
    hasCodeBlocks = true;
    
    // If the entire content is wrapped in a single code block, extract it
    const singleBlockMatch = content.match(/^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
    if (singleBlockMatch && singleBlockMatch[1] !== undefined) {
      cleanedContent = singleBlockMatch[1];
      fixes.push('Removed wrapping markdown code block');
    } else {
      // Remove all code block markers
      cleanedContent = content.replace(codeBlockPattern, '$1');
      fixes.push('Removed multiple markdown code blocks');
    }
  }
  
  // Also check for inline code markers
  if (cleanedContent.includes('`')) {
    cleanedContent = cleanedContent.replace(/`/g, '');
    fixes.push('Removed inline code markers');
  }
  
  return cleanedContent;
}

/**
 * Fix common JSON formatting issues
 */
function fixCommonJSONIssues(content: string, fixes: string[]): string {
  let fixedContent = content;
  
  // Fix 1: Remove trailing commas
  const trailingCommaPattern = /,(\s*[}\]])/g;
  if (trailingCommaPattern.test(fixedContent)) {
    fixedContent = fixedContent.replace(trailingCommaPattern, '$1');
    fixes.push('Removed trailing commas');
  }
  
  // Fix 2: Replace single quotes with double quotes (careful with apostrophes)
  const singleQuotePattern = /(?<![a-zA-Z])'([^']*)'(?![a-zA-Z])/g;
  if (singleQuotePattern.test(fixedContent)) {
    fixedContent = fixedContent.replace(singleQuotePattern, '"$1"');
    fixes.push('Replaced single quotes with double quotes');
  }
  
  // Fix 3: Remove comments (// and /* */ style)
  const singleLineCommentPattern = /\/\/.*$/gm;
  const multiLineCommentPattern = /\/\*[\s\S]*?\*\//g;
  
  if (singleLineCommentPattern.test(fixedContent)) {
    fixedContent = fixedContent.replace(singleLineCommentPattern, '');
    fixes.push('Removed single-line comments');
  }
  
  if (multiLineCommentPattern.test(fixedContent)) {
    fixedContent = fixedContent.replace(multiLineCommentPattern, '');
    fixes.push('Removed multi-line comments');
  }
  
  // Fix 4: Quote escaping logic removed
  // The previous quote escaping logic was incorrectly escaping quotes that are part of the JSON structure
  // (like quotes around property names), which was breaking valid JSON. This type of fix is better handled
  // by the JSON parser itself, which will properly identify syntax errors.
  
  // Fix 5: Remove BOM (Byte Order Mark)
  if (fixedContent.charCodeAt(0) === 0xFEFF) {
    fixedContent = fixedContent.substring(1);
    fixes.push('Removed BOM character');
  }
  
  // Fix 6: Normalize whitespace
  fixedContent = fixedContent.trim();
  
  return fixedContent;
}

/**
 * Apply more aggressive fixes for severely malformed JSON
 */
function applyAggressiveFixes(content: string, fixes: string[]): string {
  let fixedContent = content;
  
  // Fix 1: Add missing closing brackets/braces
  const openBraces = (fixedContent.match(/{/g) || []).length;
  const closeBraces = (fixedContent.match(/}/g) || []).length;
  const openBrackets = (fixedContent.match(/\[/g) || []).length;
  const closeBrackets = (fixedContent.match(/]/g) || []).length;
  
  if (openBraces > closeBraces) {
    fixedContent += '}'.repeat(openBraces - closeBraces);
    fixes.push(`Added ${openBraces - closeBraces} missing closing brace(s)`);
  }
  
  if (openBrackets > closeBrackets) {
    fixedContent += ']'.repeat(openBrackets - closeBrackets);
    fixes.push(`Added ${openBrackets - closeBrackets} missing closing bracket(s)`);
  }
  
  // Fix 2: Fix missing commas between array/object items
  // Look for patterns like "} {" or "] [" or "123" "456"
  const missingCommaPatterns = [
    { pattern: /}\s*{/g, replacement: '},{', fix: 'Added missing commas between objects' },
    { pattern: /]\s*\[/g, replacement: '],[', fix: 'Added missing commas between arrays' },
    { pattern: /"\s+"(?![:])/g, replacement: '","', fix: 'Added missing commas between strings' },
    { pattern: /(\d)\s+(?=["{\[])/g, replacement: '$1,', fix: 'Added missing commas after numbers' },
    { pattern: /(true|false|null)\s+(?=["{\[])/g, replacement: '$1,', fix: 'Added missing commas after literals' }
  ];
  
  for (const { pattern, replacement, fix } of missingCommaPatterns) {
    if (pattern.test(fixedContent)) {
      fixedContent = fixedContent.replace(pattern, replacement);
      if (!fixes.includes(fix)) {
        fixes.push(fix);
      }
    }
  }
  
  // Fix 3: Ensure arrays and objects are properly terminated
  // This is a more complex fix that requires parsing context
  
  // Fix 4: Try to fix incomplete strings
  const incompleteStringPattern = /"([^"]*?)\s*$/;
  if (incompleteStringPattern.test(fixedContent)) {
    fixedContent = fixedContent.replace(incompleteStringPattern, '"$1"');
    fixes.push('Fixed incomplete string at end of file');
  }
  
  return fixedContent;
}

/**
 * Log the fixes applied for debugging
 */
function logFixes(fixes: string[], filePath?: string): void {
  if (fixes.length === 0) return;
  
  const fileInfo = filePath ? ` to ${filePath}` : '';
  console.log(`JSON Healer applied ${fixes.length} fix(es)${fileInfo}:`);
  
  fixes.forEach((fix, index) => {
    console.log(`  ${index + 1}. ${fix}`);
  });
}

/**
 * Helper function to validate if a string is valid JSON
 */
export function isValidJSON(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper function to get detailed JSON parsing error
 */
export function getJSONParseError(content: string): string | null {
  try {
    JSON.parse(content);
    return null;
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Try to extract line and column information from error message
      const match = error.message.match(/at position (\d+)/);
      if (match && match[1] !== undefined) {
        const position = parseInt(match[1], 10);
        const lines = content.substring(0, position).split('\n');
        const line = lines.length;
        const lastLine = lines[lines.length - 1];
        const column = (lastLine?.length ?? 0) + 1;
        
        return `${error.message} (approximately line ${line}, column ${column})`;
      }
      
      return error.message;
    }
    
    return 'Unknown parsing error';
  }
}

/**
 * Helper function to pretty print JSON with error highlighting
 */
export function prettyPrintJSONWithError(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    // Return original content with error marker
    const errorMatch = error instanceof SyntaxError ? error.message.match(/at position (\d+)/) : null;
    
    if (errorMatch && errorMatch[1] !== undefined) {
      const position = parseInt(errorMatch[1], 10);
      const before = content.substring(0, position);
      const after = content.substring(position);
      
      return `${before}⚠️ ERROR HERE ⚠️${after}`;
    }
    
    return content;
  }
}