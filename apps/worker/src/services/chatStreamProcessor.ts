/**
 * Chat Stream Processor
 *
 * Transforms raw Claude stream events into clean, simplified events for frontend consumption.
 * This service acts as a filter and transformer, converting verbose Claude output
 * into meaningful, actionable events that enhance the user experience.
 */

import { ChatMode } from './chatPlanService';
import * as path from 'path';

// =====================================================================
// Types
// =====================================================================

/**
 * Stream event types based on actual Claude CLI output + value-added processing
 *
 * Raw Claude events: system, assistant, user, result, error
 * Processed events map to what frontend needs to know
 */
export type StreamEventType =
  | 'assistant_text'      // When Claude sends text content
  | 'tool_use'           // When Claude uses a tool (Read, Grep, etc.)
  | 'tool_result'        // When tool results are returned
  | 'progress_update'    // Progress stage updates
  | 'intent_detected'    // When intent is identified
  | 'references'         // When code references are found
  | 'metrics'           // Processing metrics (internal use)
  | 'complete'           // When Claude sends 'result' type
  | 'error';            // When Claude sends 'error' type or we detect errors

export interface StreamEvent {
  event: StreamEventType;
  data: any;
  timestamp: string;
}

export interface AssistantMessageData {
  text: string;  // Raw text from Claude (already localized)
  index: number;
  isPartial: boolean;
  metadata?: {
    chunkNumber: number;
    timestamp: number;  // ms since start
  };
}

export interface IntentData {
  intent: ChatMode;
  confidence?: number;
}

export interface ReferencesData {
  files: Array<{
    file: string;
    line?: number;
    snippet?: string;
    relevance?: 'high' | 'medium' | 'low';
  }>;
}

export interface MetricsData {
  tokensUsed?: number;
  processingTime?: number;
  cacheHit?: boolean;
}

export interface CompleteData {
  fullResponse: any;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
  duration: number;
  sessionId?: string;
}

export interface ErrorData {
  code: string;  // Error code for i18n (e.g., 'CHAT_ERROR_INSUFFICIENT_BALANCE')
  params?: Record<string, string | number>;  // Raw values only
  recoverable?: boolean;
}

// =====================================================================
// Template Keys for i18n
// =====================================================================

/**
 * Template keys for frontend localization
 * Frontend will map these to localized messages based on user's locale
 */
export const CHAT_STREAM_TEMPLATES = {
  // Thinking/Processing states
  CHAT_ANALYZING: 'CHAT_ANALYZING',
  CHAT_PLANNING: 'CHAT_PLANNING',
  CHAT_SEARCHING: 'CHAT_SEARCHING',
  CHAT_PROCESSING: 'CHAT_PROCESSING',
  CHAT_REVIEWING: 'CHAT_REVIEWING',
  CHAT_UNDERSTANDING: 'CHAT_UNDERSTANDING',

  // Connection states
  CHAT_CONNECTION_ESTABLISHED: 'CHAT_CONNECTION_ESTABLISHED',
  CHAT_SESSION_RESUMED: 'CHAT_SESSION_RESUMED',

  // Error states
  CHAT_ERROR_PARSE_FAILED: 'CHAT_ERROR_PARSE_FAILED',
  CHAT_ERROR_INSUFFICIENT_BALANCE: 'CHAT_ERROR_INSUFFICIENT_BALANCE',
  CHAT_ERROR_TIMEOUT: 'CHAT_ERROR_TIMEOUT',
  CHAT_ERROR_GENERAL: 'CHAT_ERROR_GENERAL',

  // Completion states
  CHAT_COMPLETE_SUCCESS: 'CHAT_COMPLETE_SUCCESS',
  CHAT_COMPLETE_WITH_REFERENCES: 'CHAT_COMPLETE_WITH_REFERENCES'
} as const;

export type ChatStreamTemplate = typeof CHAT_STREAM_TEMPLATES[keyof typeof CHAT_STREAM_TEMPLATES];

// =====================================================================
// Stream Processor Implementation
// =====================================================================

export class ChatStreamProcessor {
  private buffer: string = '';
  private sessionId?: string | undefined;
  private intentDetected: boolean = false;
  private chunks: string[] = [];
  private startTime: number;
  private isProcessingResult: boolean = false;
  private accumulatedAssistantText: string = '';
  private lastEventTime: number = 0;
  private eventCount: number = 0;
  
  /**
   * Common server path patterns to sanitize
   * These patterns identify paths that should not be exposed to users
   */
  private readonly SERVER_PATH_PATTERNS = [
    /\/Users\/[^/]+\/projects\/[^/]+\/[^/]+/,  // Mac project paths
    /\/home\/[^/]+\/projects\/[^/]+\/[^/]+/,    // Linux project paths
    /C:\\Users\\[^\\]+\\projects\\[^\\]+\\[^\\]+/,  // Windows paths
    /\/var\/[^/]+\/projects\/[^/]+\/[^/]+/,     // Server deployment paths
    /\/tmp\/[^/]+\/projects\/[^/]+\/[^/]+/,     // Temp paths
  ];

  /**
   * Claude CLI actually sends these event types:
   * - system: Initialization, session info, tools list
   * - assistant: Claude's text responses (can be multiple)
   * - user: User messages (in conversation history)
   * - result: Final JSON result with intent and response
   * - error: Error messages
   *
   * We transform these into cleaner events for frontend consumption
   */

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Process a raw Claude stream event and return cleaned events for frontend
   */
  processClaudeEvent(rawEvent: string): StreamEvent[] {
    const events: StreamEvent[] = [];

    // Skip empty lines
    if (!rawEvent.trim()) {
      return events;
    }

    try {
      const json = JSON.parse(rawEvent);

      switch(json.type) {
        case 'system':
          events.push(...this.processSystemEvent(json));
          break;

        case 'assistant':
          events.push(...this.processAssistantEvent(json));
          break;

        case 'user':
          // User messages contain tool results being fed back to Claude
          events.push(...this.processUserEvent(json));
          break;

        case 'result':
          events.push(...this.processResultEvent(json));
          break;

        case 'error':
          // Sanitize error messages to remove any server paths
          const sanitizedMessage = this.sanitizeText(json.message || 'Unknown error');
          events.push(this.createErrorEvent(
            CHAT_STREAM_TEMPLATES.CHAT_ERROR_GENERAL,
            { message: sanitizedMessage }
          ));
          break;

        default:
          console.log('[Stream Processor] Unknown event type:', json.type);
      }
    } catch (error) {
      // If we can't parse the event, log it but don't fail the stream
      console.error('[Stream Processor] Error parsing event:', error, 'Raw:', rawEvent);

      // Try to extract useful information from the raw event
      if (rawEvent.includes('insufficient') || rawEvent.includes('balance')) {
        events.push(this.createErrorEvent(CHAT_STREAM_TEMPLATES.CHAT_ERROR_INSUFFICIENT_BALANCE));
      }
    }

    return events;
  }

  /**
   * Process system events (initialization, session info, etc.)
   */
  private processSystemEvent(json: any): StreamEvent[] {
    const events: StreamEvent[] = [];

    if (json.session_id) {
      this.sessionId = json.session_id;
      // Store session ID internally but don't send connection event
      console.log('[Stream Processor] Session started:', json.session_id);
    }

    // Extract available tools/capabilities if present
    if (json.tools && Array.isArray(json.tools)) {
      // We could expose this to frontend if needed
      // Don't log tools as they might contain paths
      console.log('[Stream Processor] Available tools:', json.tools.length, 'tools');
    }

    return events;
  }

  /**
   * Process assistant events (Claude's responses)
   * Assistant messages can contain: text, tool_use, or both
   */
  private processAssistantEvent(json: any): StreamEvent[] {
    const events: StreamEvent[] = [];

    // Check if this is a text message
    if (json.message?.content) {
      for (const content of json.message.content) {
        if (content.type === 'text' && content.text) {
          // Stream text content - sanitize any exposed paths
          const sanitizedText = this.sanitizeText(content.text);
          events.push({
            event: 'assistant_text',
            data: {
              text: sanitizedText,
              messageId: json.message.id,
              index: this.chunks.length,
              isPartial: json.stop_reason === null  // null means more coming
            },
            timestamp: new Date().toISOString()
          });

          this.chunks.push(sanitizedText);
          this.accumulatedAssistantText += sanitizedText + '\n';
        } else if (content.type === 'tool_use') {
          // Claude is using a tool - sanitize any paths in the input
          const sanitizedInput = this.sanitizeToolInput(content.input);
          events.push({
            event: 'tool_use',
            data: {
              toolName: content.name,
              toolId: content.id,
              input: sanitizedInput,
              // Add friendly descriptions for common tools
              description: this.getToolDescription(content.name, sanitizedInput)
            },
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Don't expose usage data to frontend - track server-side only
    // Usage is logged internally but not streamed to client

    return events;
  }

  /**
   * Process result events (final response from Claude)
   */
  private processResultEvent(json: any): StreamEvent[] {
    const events: StreamEvent[] = [];
    this.isProcessingResult = true;

    if (json.result) {
      // Sanitize the entire result before processing
      const sanitizedResultStr = this.sanitizeText(json.result);
      const result = this.parseResult(sanitizedResultStr);
      
      // Also sanitize the parsed result object
      this.sanitizeResultObject(result);

      // Extract intent from result
      if (result.intent && !this.intentDetected) {
        this.intentDetected = true;
        
        // Map "build" to "feature" for backward compatibility
        let intent = result.intent;
        if (intent === 'build') {
          console.log('[Stream Processor] Mapping deprecated "build" intent to "feature"');
          intent = 'feature';
          // Also update the result object
          result.intent = 'feature';
        }
        
        events.push({
          event: 'intent_detected',
          data: {
            intent: intent,
            confidence: 1.0
          } as IntentData,
          timestamp: new Date().toISOString()
        });
      }

      // Extract references if present - sanitize file paths
      if (result.response?.references && Array.isArray(result.response.references)) {
        const sanitizedReferences = result.response.references.map((ref: any) => ({
          ...ref,
          file: this.sanitizePath(ref.file)
        }));
        events.push({
          event: 'references',
          data: {
            files: sanitizedReferences
          } as ReferencesData,
          timestamp: new Date().toISOString()
        });
      }

      // Send metrics if available
      if (json.usage || json.duration_ms) {
        events.push({
          event: 'metrics',
          data: {
            tokensUsed: json.usage?.total_tokens,
            processingTime: json.duration_ms || (Date.now() - this.startTime),
            cacheHit: json.usage?.cache_read_input_tokens > 0
          } as MetricsData,
          timestamp: new Date().toISOString()
        });
      }

      // Send complete event (without usage data)
      events.push({
        event: 'complete',
        data: {
          fullResponse: result,
          duration: Date.now() - this.startTime,
          sessionId: json.session_id || this.sessionId
        } as CompleteData,
        timestamp: new Date().toISOString()
      });
    }

    return events;
  }

  /**
   * Extract text from various assistant message formats
   */
  private extractAssistantText(json: any): string | null {
    // Format 1: message.content array
    if (json.message?.content && Array.isArray(json.message.content)) {
      for (const content of json.message.content) {
        if (content.type === 'text' && content.text) {
          return content.text;
        }
      }
    }

    // Format 2: direct text field
    if (json.text) {
      return json.text;
    }

    // Format 3: direct content field
    if (json.content) {
      return typeof json.content === 'string'
        ? json.content
        : JSON.stringify(json.content);
    }

    return null;
  }

  /**
   * Parse the result string, handling both JSON and plain text
   */
  private parseResult(resultStr: string): any {
    try {
      // First try to parse as JSON
      const parsed = JSON.parse(resultStr);
      return parsed;
    } catch {
      // If not JSON, check if it's wrapped in markdown code block
      const jsonMatch = resultStr.match(/```json\s*\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          // Still couldn't parse, fall through
        }
      }

      // Return as plain text response - already sanitized
      return {
        intent: 'general',
        response: {
          message: resultStr
        }
      };
    }
  }

  /**
   * Process user events (tool results being fed back to Claude)
   */
  private processUserEvent(json: any): StreamEvent[] {
    const events: StreamEvent[] = [];

    if (json.message?.content) {
      for (const content of json.message.content) {
        if (content.type === 'tool_result') {
          // Don't stream the full content (can be huge for file reads)
          // Just notify that a tool result was received
          // Sanitize the preview to remove server paths
          const sanitizedPreview = this.sanitizePath(this.getToolResultPreview(content.content));
          events.push({
            event: 'tool_result',
            data: {
              toolUseId: content.tool_use_id,
              preview: sanitizedPreview,
              size: content.content?.length || 0
            },
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    return events;
  }

  /**
   * Sanitize paths in tool input to remove server-specific information
   */
  private sanitizeToolInput(input: any): any {
    if (!input) return input;
    
    // Deep clone to avoid modifying original
    const sanitized = JSON.parse(JSON.stringify(input));
    
    // List of fields that typically contain paths
    const pathFields = ['file_path', 'path', 'cwd', 'directory', 'file', 'folder'];
    
    // Recursively sanitize all path fields
    const sanitizeObject = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const key in obj) {
        if (pathFields.includes(key) && typeof obj[key] === 'string') {
          obj[key] = this.sanitizePath(obj[key]);
        } else if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key]);
        } else if (typeof obj[key] === 'string' && this.looksLikePath(obj[key])) {
          // Also sanitize string values that look like paths
          obj[key] = this.sanitizePath(obj[key]);
        }
      }
    };
    
    sanitizeObject(sanitized);
    return sanitized;
  }
  
  /**
   * Sanitize a single path by removing server-specific prefixes
   */
  private sanitizePath(filePath: string): string {
    if (!filePath) return filePath;
    
    // For each pattern, try to extract just the project-relative part
    for (const pattern of this.SERVER_PATH_PATTERNS) {
      const match = filePath.match(pattern);
      if (match) {
        // Extract everything after the project directory
        const projectPath = match[0];
        const relativePath = filePath.substring(projectPath.length);
        
        // Clean up the relative path
        let cleaned = relativePath.replace(/^\/+/, ''); // Remove leading slashes
        
        // If it's just a filename, return it
        if (!cleaned.includes('/') && !cleaned.includes('\\')) {
          return cleaned;
        }
        
        // Otherwise return with a single leading slash for clarity
        return '/' + cleaned;
      }
    }
    
    // Additional pattern to handle paths with UUID directories
    // Match patterns like /any/path/UUID/UUID/actual/file/path
    const uuidPattern = /^.*\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/(.*)/i;
    const uuidMatch = filePath.match(uuidPattern);
    if (uuidMatch && uuidMatch[1]) {
      // Return the path after the two UUIDs
      return '/' + uuidMatch[1];
    }
    
    // If no server path pattern matched, check if it's already a relative path
    // or if it contains sensitive information
    if (filePath.includes('/Users/') || 
        filePath.includes('/home/') || 
        filePath.includes('C:\\Users\\') ||
        filePath.includes('/var/') ||
        filePath.includes('/tmp/')) {
      // Try to extract path after UUID patterns
      const parts = filePath.split('/');
      let startIdx = -1;
      
      // Find where the actual project files start (after UUIDs)
      for (let i = 0; i < parts.length - 1; i++) {
        const current = parts[i];
        const next = parts[i + 1];
        if (current?.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i) &&
            next?.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
          startIdx = i + 2;
          break;
        }
      }
      
      if (startIdx > 0 && startIdx < parts.length) {
        return '/' + parts.slice(startIdx).join('/');
      }
      
      // Extract just the filename if we can't properly sanitize
      const basename = path.basename(filePath);
      return basename;
    }
    
    // Return as-is if it looks safe (relative path or just a filename)
    return filePath;
  }
  
  /**
   * Check if a string looks like a file path
   */
  private looksLikePath(str: string): boolean {
    if (!str || typeof str !== 'string') return false;
    
    // Check for common path indicators
    return (
      str.includes('/Users/') ||
      str.includes('/home/') ||
      str.includes('/var/') ||
      str.includes('/tmp/') ||
      str.includes('C:\\') ||
      str.includes('\\Users\\') ||
      (str.includes('/') && str.includes('.')) || // Has slash and extension
      (str.includes('\\') && str.includes('.'))   // Windows path with extension
    );
  }
  
  /**
   * Get a friendly description for tool usage
   */
  private getToolDescription(toolName: string, input: any): string {
    // Return template keys for i18n
    // Note: file paths in params are already sanitized
    switch(toolName) {
      case 'Read':
        return `CHAT_TOOL_READ_FILE`; // params: {file: input.file_path}
      case 'Grep':
        return `CHAT_TOOL_SEARCH_CODE`; // params: {pattern: input.pattern}
      case 'Glob':
        return `CHAT_TOOL_FIND_FILES`; // params: {pattern: input.pattern}
      case 'Write':
        return `CHAT_TOOL_WRITE_FILE`; // params: {file: input.file_path}
      case 'Edit':
        return `CHAT_TOOL_EDIT_FILE`; // params: {file: input.file_path}
      default:
        return `CHAT_TOOL_GENERIC`; // params: {tool: toolName}
    }
  }

  /**
   * Sanitize text content to remove server paths
   */
  private sanitizeText(text: string): string {
    if (!text) return text;
    
    let sanitized = text;
    
    // First, handle paths with double UUIDs pattern
    const uuidPattern = /([\/\\])[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}[\/\\][a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}([\/\\])/gi;
    sanitized = sanitized.replace(uuidPattern, '$2');
    
    // Replace any full paths found in the text
    for (const pattern of this.SERVER_PATH_PATTERNS) {
      sanitized = sanitized.replace(new RegExp(pattern, 'g'), (match) => {
        // Extract the relative path from the match
        const parts = match.split(/[\/\\]/);
        // Keep last 2 parts (usually project-id/version-id/file)
        const relevantParts = parts.slice(-2);
        return '/' + relevantParts.join('/');
      });
    }
    
    // Additional patterns to catch any remaining server paths
    sanitized = sanitized
      .replace(/\/Users\/[^\/\s]+\/[^\/\s]+\//g, '/')  // Mac home paths
      .replace(/\/home\/[^\/\s]+\/[^\/\s]+\//g, '/')   // Linux home paths
      .replace(/C:\\Users\\[^\\\s]+\\[^\\\s]+\\/g, '/')  // Windows paths
      .replace(/\/var\/[^\/\s]+\//g, '/')  // Server paths
      .replace(/\/tmp\/[^\/\s]+\//g, '/'); // Temp paths
    
    return sanitized;
  }
  
  /**
   * Sanitize a result object recursively
   */
  private sanitizeResultObject(obj: any): void {
    if (!obj || typeof obj !== 'object') return;
    
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Sanitize string values that might contain paths
        if (this.looksLikePath(obj[key]) || obj[key].includes('/Users/') || obj[key].includes('/home/')) {
          obj[key] = this.sanitizeText(obj[key]);
        }
      } else if (Array.isArray(obj[key])) {
        // Sanitize array elements
        obj[key] = obj[key].map((item: any) => {
          if (typeof item === 'string') {
            return this.sanitizeText(item);
          } else if (typeof item === 'object') {
            this.sanitizeResultObject(item);
            return item;
          }
          return item;
        });
      } else if (typeof obj[key] === 'object') {
        // Recursively sanitize nested objects
        this.sanitizeResultObject(obj[key]);
      }
    }
  }
  
  /**
   * Get a preview of tool result for streaming
   */
  private getToolResultPreview(content: string): string {
    if (!content) return '';

    // For file reads, just show first few lines
    const lines = content.split('\n').slice(0, 3);
    if (lines.length < 3) return content;

    return lines.join('\n') + '...';
  }

  /**
   * Sanitize progress or metadata events
   */
  private sanitizeMetadata(metadata: any): any {
    if (!metadata) return metadata;
    
    const sanitized = JSON.parse(JSON.stringify(metadata));
    
    // Recursively sanitize all string values
    const sanitizeObj = (obj: any) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = this.sanitizeText(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObj(obj[key]);
        }
      }
    };
    
    sanitizeObj(sanitized);
    return sanitized;
  }
  
  /**
   * Try to detect intent from accumulated text
   */
  private detectIntentFromText(text: string): ChatMode | null {
    // Look for intent patterns in the accumulated text
    const patterns = {
      'question': /"intent":\s*"question"/i,
      'feature': /"intent":\s*"feature"/i,
      'fix': /"intent":\s*"fix"/i,
      'analysis': /"intent":\s*"analysis"/i,
      // 'build': /"intent":\s*"build"/i,
      'general': /"intent":\s*"general"/i
    };

    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return intent as ChatMode;
      }
    }

    return null;
  }

  /**
   * Create an error event with template key for i18n
   */
  private createErrorEvent(code: string, params?: Record<string, string | number>): StreamEvent {
    // Sanitize params if they contain strings
    const sanitizedParams = params ? { ...params } : undefined;
    if (sanitizedParams) {
      for (const key in sanitizedParams) {
        if (typeof sanitizedParams[key] === 'string') {
          sanitizedParams[key] = this.sanitizeText(sanitizedParams[key] as string);
        }
      }
    }
    
    return {
      event: 'error',
      data: {
        code,
        params: sanitizedParams,
        recoverable: code !== CHAT_STREAM_TEMPLATES.CHAT_ERROR_INSUFFICIENT_BALANCE
      } as ErrorData,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get processor statistics
   */
  getStats() {
    return {
      sessionId: this.sessionId,
      chunksProcessed: this.chunks.length,
      totalCharacters: this.chunks.reduce((sum, chunk) => sum + chunk.length, 0),
      processingTime: Date.now() - this.startTime,
      intentDetected: this.intentDetected,
      eventCount: this.eventCount
    };
  }

  /**
   * Reset the processor for a new stream
   */
  reset() {
    this.buffer = '';
    this.sessionId = undefined;
    this.intentDetected = false;
    this.chunks = [];
    this.startTime = Date.now();
    this.isProcessingResult = false;
    this.accumulatedAssistantText = '';
    this.lastEventTime = 0;
    this.eventCount = 0;
  }
}
