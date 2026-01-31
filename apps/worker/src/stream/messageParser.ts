export interface StreamMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string;
  message?: {
    id: string;
    type: 'message';
    role: string;
    model: string;
    content: Array<{
      type: 'text' | 'tool_use' | 'tool_result';
      text?: string;
      id?: string;
      name?: string;
      input?: any;
      content?: string;
      tool_use_id?: string;
    }>;
    stop_reason?: string | null;
    stop_sequence?: string | null;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
      service_tier?: string;
    };
  };
  parent_tool_use_id?: string | null;
  session_id?: string;
  
  // Result type specific fields
  is_error?: boolean;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  result?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    server_tool_use?: {
      web_search_requests: number;
    };
    service_tier?: string;
  };
  
  // System type specific fields
  cwd?: string;
  tools?: string[];
  mcp_servers?: any[];
  permissionMode?: string;
  apiKeySource?: string;
}

export class MessageParser {
  static parse(line: string): StreamMessage | null {
    try {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) return null;
      
      // Remove line numbers if present (from the example file)
      const jsonStart = trimmed.indexOf('{');
      if (jsonStart > 0) {
        const json = trimmed.substring(jsonStart);
        return JSON.parse(json);
      }
      
      return JSON.parse(trimmed);
    } catch (error) {
      // Some lines might not be JSON (like the initial command line)
      // This is expected, so we just return null
      if (line.includes('claude -p') || line.trim() === '') {
        return null;
      }
      console.error('[MessageParser] Failed to parse line:', line);
      console.error('[MessageParser] Error:', error);
      return null;
    }
  }
  
  static isToolUse(message: StreamMessage): boolean {
    return message.type === 'assistant' && 
           message.message?.content?.some(c => c.type === 'tool_use') || false;
  }
  
  static extractToolUses(message: StreamMessage): Array<{name: string; input: any}> {
    if (!this.isToolUse(message)) return [];
    
    return message.message?.content
      ?.filter(c => c.type === 'tool_use')
      ?.map(c => ({ name: c.name || '', input: c.input })) || [];
  }
}