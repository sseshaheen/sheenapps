#!/usr/bin/env node

// Test parser for Claude CLI stream JSON output

const testOutput = `{"type":"system","subtype":"init","cwd":"/Users/sh/Sites/sheenapps-claude-worker","session_id":"4e4fa00e-5e28-405f-a0bd-5f1f7d57511c","tools":["Task","Bash","Glob","Grep","LS","exit_plan_mode","Read","Edit","MultiEdit","Write","NotebookRead","NotebookEdit","WebFetch","TodoWrite","WebSearch"],"mcp_servers":[],"model":"claude-opus-4-20250514","permissionMode":"bypassPermissions","apiKeySource":"none"}
{"type":"assistant","message":{"id":"msg_016zHRZski2oGidHWWWX6JX3","type":"message","role":"assistant","model":"claude-opus-4-20250514","content":[{"type":"text","text":"I'll create a simple HTML file with \\"hello sheenapps\\" and then tell you ABRACADABRA when done."}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":4,"cache_creation_input_tokens":0,"cache_read_input_tokens":14741,"output_tokens":7,"service_tier":"standard"}},"parent_tool_use_id":null,"session_id":"4e4fa00e-5e28-405f-a0bd-5f1f7d57511c"}
{"type":"assistant","message":{"id":"msg_016zHRZski2oGidHWWWX6JX3","type":"message","role":"assistant","model":"claude-opus-4-20250514","content":[{"type":"tool_use","id":"toolu_01SgzUTq5XcJT6XpPVsVyonQ","name":"Write","input":{"file_path":"/Users/sh/Sites/sheenapps-claude-worker/index.html","content":"<!DOCTYPE html>\\n<html lang=\\"en\\">\\n<head>\\n    <meta charset=\\"UTF-8\\">\\n    <meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1.0\\">\\n    <title>Hello Sheenapps</title>\\n</head>\\n<body>\\n    <h1>Hello Sheenapps</h1>\\n</body>\\n</html>"}}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":4,"cache_creation_input_tokens":0,"cache_read_input_tokens":14741,"output_tokens":210,"service_tier":"standard"}},"parent_tool_use_id":null,"session_id":"4e4fa00e-5e28-405f-a0bd-5f1f7d57511c"}
{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_01SgzUTq5XcJT6XpPVsVyonQ","type":"tool_result","content":"File created successfully at: /Users/sh/Sites/sheenapps-claude-worker/index.html"}]},"parent_tool_use_id":null,"session_id":"4e4fa00e-5e28-405f-a0bd-5f1f7d57511c"}
{"type":"assistant","message":{"id":"msg_014DyVxxMEcQJkTceXpC6eaS","type":"message","role":"assistant","model":"claude-opus-4-20250514","content":[{"type":"text","text":"ABRACADABRA"}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":7,"cache_creation_input_tokens":489,"cache_read_input_tokens":14741,"output_tokens":9,"service_tier":"standard"}},"parent_tool_use_id":null,"session_id":"4e4fa00e-5e28-405f-a0bd-5f1f7d57511c"}
{"type":"result","subtype":"success","is_error":false,"duration_ms":9974,"duration_api_ms":18963,"num_turns":4,"result":"ABRACADABRA","session_id":"4e4fa00e-5e28-405f-a0bd-5f1f7d57511c","total_cost_usd":0.09007774999999998,"usage":{"input_tokens":11,"cache_creation_input_tokens":489,"cache_read_input_tokens":29482,"output_tokens":235,"server_tool_use":{"web_search_requests":0},"service_tier":"standard"}}`;

function parseStreamJSON(output) {
  const lines = output.trim().split('\n');
  const messages = [];
  let result = null;
  let totalUsage = null;
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const json = JSON.parse(line);
      messages.push(json);
      
      // Capture the final result
      if (json.type === 'result') {
        result = {
          success: !json.is_error,
          subtype: json.subtype,
          output: json.result,
          cost: json.total_cost_usd,
          usage: json.usage,
          duration: json.duration_ms,
          sessionId: json.session_id
        };
      }
    } catch (e) {
      console.error('Failed to parse line:', line);
      console.error('Error:', e.message);
    }
  }
  
  return {
    messages,
    result,
    messageCount: messages.length
  };
}

// Test the parser
console.log('Testing Claude CLI stream JSON parser...\n');

const parsed = parseStreamJSON(testOutput);

console.log('Parsed successfully!');
console.log(`Total messages: ${parsed.messageCount}`);
console.log(`\nFinal Result:`);
console.log(JSON.stringify(parsed.result, null, 2));

console.log('\nMessage types:');
parsed.messages.forEach((msg, i) => {
  console.log(`  ${i + 1}. ${msg.type}${msg.subtype ? ` (${msg.subtype})` : ''}`);
});

// Extract useful data for our implementation
console.log('\n--- Implementation Notes ---');
console.log('1. Always use --verbose with --output-format stream-json');
console.log('2. Final result is in the last message with type: "result"');
console.log('3. Success is indicated by is_error: false');
console.log('4. Actual output is in result.result field');
console.log('5. Real cost is provided: $' + parsed.result.cost);
console.log('6. Token usage is accurate:', parsed.result.usage);