export interface TimeoutConfig {
  install: number;
  build: number;
  default: number;
  longOperationThreshold: number;
}

export const CLAUDE_TIMEOUTS: TimeoutConfig = {
  install: parseInt(process.env.CLAUDE_TIMEOUT_INSTALL || '90000'),
  build: parseInt(process.env.CLAUDE_TIMEOUT_BUILD || '60000'),
  default: parseInt(process.env.CLAUDE_TIMEOUT_DEFAULT || '30000'),
  longOperationThreshold: parseInt(process.env.CLAUDE_LONG_OP_THRESHOLD || '45000')
};

export function getTimeoutForOperation(outputBuffer: string[]): { timeout: number; operationType: string } {
  const lastLines = outputBuffer.slice(-5).join(' ').toLowerCase();
  let timeout: number;
  let operationType = 'default';
  
  if (lastLines.includes('npm install') || lastLines.includes('pnpm install')) {
    timeout = CLAUDE_TIMEOUTS.install;
    operationType = 'install';
  } else if (lastLines.includes('npm run build') || lastLines.includes('vite build') || lastLines.includes('tsc &&')) {
    timeout = CLAUDE_TIMEOUTS.build;
    operationType = 'build';
  } else {
    timeout = CLAUDE_TIMEOUTS.default;
  }
  
  // Emit warning for long operations
  if (timeout > CLAUDE_TIMEOUTS.longOperationThreshold) {
    console.warn(`[ClaudeSession] Long operation detected (${operationType}): ${timeout/1000}s timeout`);
  }
  
  return { timeout, operationType };
}