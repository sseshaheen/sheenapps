import { OpenAIService } from '@/services/ai/openai-service';
import { logger } from '@/utils/logger';

// Simple wrapper around existing OpenAI service for GPT-4 fallback
export async function gpt4Runner(prompt: string): Promise<string> {
  try {
    const openAIService = new OpenAIService();
    const completion = await openAIService.generateCompletion(prompt);
    
    logger.info('GPT-4 fallback used for Claude request');
    
    return completion;
  } catch (error) {
    logger.error('GPT-4 fallback failed:', error);
    throw new Error('Both Claude and GPT-4 services unavailable');
  }
}