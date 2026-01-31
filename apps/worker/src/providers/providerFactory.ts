import type { AIProvider } from './aiProvider';
// ClaudeProvider removed - all Claude execution now uses CLI via ClaudeCLIProvider
import { ClaudeCLIProvider } from './claudeCLIProvider';
import { CodexCLIProvider, CodexProviderConfig } from './codexCLIProvider';
import { MockAIProvider } from './mockProvider';

export type ProviderType = 'claude' | 'claude-cli' | 'codex-cli' | 'mock' | 'gpt';

export class ProviderFactory {
  private static providers = new Map<ProviderType, AIProvider>();
  
  static getProvider(type?: ProviderType): AIProvider {
    // Determine provider type from environment or parameter
    const rawType = type || (process.env.AI_PROVIDER as ProviderType) || 'claude-cli';
    // Normalize 'claude' to 'claude-cli' to avoid duplicate cached instances
    const providerType: ProviderType = rawType === 'claude' ? 'claude-cli' : rawType;

    // Return mock provider in test mode
    if (process.env.NODE_ENV === 'test' && !process.env.USE_REAL_PROVIDER) {
      return this.getMockProvider();
    }

    // Check cache
    const cached = this.providers.get(providerType);
    if (cached) {
      return cached;
    }
    
    // Create new provider
    let provider: AIProvider;
    
    switch (providerType) {
      case 'claude-cli':
        // 'claude' is normalized to 'claude-cli' above, so only handle 'claude-cli' here
        provider = new ClaudeCLIProvider();
        break;

      case 'codex-cli':
        provider = new CodexCLIProvider(this.getCodexConfig());
        break;

      case 'mock':
        provider = new MockAIProvider();
        break;
        
      case 'gpt':
        // Placeholder for future GPT provider
        throw new Error('GPT provider not yet implemented');
        
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
    
    // Cache and return
    this.providers.set(providerType, provider);
    return provider;
  }
  
  static getMockProvider(): AIProvider {
    const cached = this.providers.get('mock');
    if (cached) {
      return cached;
    }
    
    const provider = new MockAIProvider();
    this.providers.set('mock', provider);
    return provider;
  }
  
  static clearCache(): void {
    this.providers.clear();
  }

  /**
   * Get Codex configuration from environment variables
   */
  private static getCodexConfig(): CodexProviderConfig {
    return {
      ...(process.env.CODEX_MODEL && { model: process.env.CODEX_MODEL }),
      approvalPolicy: (process.env.CODEX_APPROVAL_POLICY as CodexProviderConfig['approvalPolicy']) || 'never',
      sandboxMode: (process.env.CODEX_SANDBOX_MODE as CodexProviderConfig['sandboxMode']) || 'workspace-write',
      skipGitRepoCheck: process.env.CODEX_SKIP_GIT_REPO_CHECK !== 'false',  // Default true
      ...(process.env.CODEX_HOME && { codexHome: process.env.CODEX_HOME }),
      ...(process.env.CODEX_API_KEY && { apiKey: process.env.CODEX_API_KEY })
    };
  }
}