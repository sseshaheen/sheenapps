// AI Service Factory - temporary implementation for prompt-to-code integration
import { MockAIService } from './mock-service';

export interface AIService {
  // Add AI service methods as needed
  modifyComponentStructure?: (params: any) => Promise<any>;
  generatePatch?: (params: any) => Promise<any>;
}

let aiServiceInstance: AIService | null = null;

export function getAIService(): AIService {
  if (!aiServiceInstance) {
    // For now, use the mock service
    aiServiceInstance = new MockAIService() as any;
  }
  
  return aiServiceInstance;
}