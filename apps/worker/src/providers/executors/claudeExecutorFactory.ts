import type { IClaudeExecutor } from '../IClaudeExecutor';
import { RedisClaudeExecutor } from './redisExecutor';

export class ClaudeExecutorFactory {
  private static instance: IClaudeExecutor | null = null;
  
  static create(): IClaudeExecutor {
    // Return cached instance if available
    if (this.instance) {
      return this.instance;
    }
    
    const mode = process.env.CLAUDE_EXECUTOR_MODE || 'redis';
    
    switch (mode) {
      case 'redis':
        this.instance = new RedisClaudeExecutor();
        break;
        
      case 'http':
        // TODO: Implement HTTPClaudeExecutor
        throw new Error('HTTP executor not yet implemented');
        
      case 'direct':
        // TODO: Implement DirectClaudeExecutor for testing
        throw new Error('Direct executor not yet implemented');
        
      default:
        throw new Error(`Unknown executor mode: ${mode}`);
    }
    
    console.log(`[Claude Executor] Using ${mode} mode`);
    return this.instance;
  }
  
  static reset(): void {
    this.instance = null;
  }
}