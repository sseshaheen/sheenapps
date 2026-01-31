import { ChatPlanService, LocaleAwarePromptBuilder } from '../chatPlanService';
import { pool } from '../database';
import { WebhookService } from '../webhookService';

// Mock dependencies
jest.mock('../webhookService');
jest.mock('../database');
jest.mock('../../providers/executors/claudeExecutorFactory');

describe('ChatPlanService', () => {
  let chatPlanService: ChatPlanService;
  let mockWebhookService: jest.Mocked<WebhookService>;

  beforeEach(() => {
    mockWebhookService = new WebhookService() as jest.Mocked<WebhookService>;
    chatPlanService = new ChatPlanService(mockWebhookService);
    jest.clearAllMocks();
  });

  describe('processChatPlan', () => {
    it('should process a question chat plan request', async () => {
      const request = {
        userId: 'test-user',
        projectId: 'test-project',
        message: 'How do I add authentication?',
        chatMode: 'question' as const,
        locale: 'en-US'
      };

      // Mock database queries
      (pool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ total_seconds: 1000 }] }) // Balance check
        .mockResolvedValueOnce({ rows: [] }) // Session upsert
        .mockResolvedValueOnce({ rows: [] }) // Insert user message
        .mockResolvedValueOnce({ rows: [] }) // Insert assistant response
        .mockResolvedValueOnce({ rows: [] }) // Update session metrics
        .mockResolvedValueOnce({ rows: [] }); // Record consumption

      // Mock Claude executor
      const mockExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: JSON.stringify({
            answer: 'You can add authentication using...',
            references: []
          }),
          usage: { totalTokens: 100 }
        })
      };

      jest.spyOn(chatPlanService as any, 'executor', 'get').mockReturnValue(mockExecutor);

      const response = await chatPlanService.processChatPlan(request);

      expect(response.type).toBe('chat_response');
      expect(response.subtype).toBe('success');
      expect(response.mode).toBe('question');
      expect(response.data).toHaveProperty('answer');
      expect(mockWebhookService.send).toHaveBeenCalled();
    });

    it('should handle insufficient balance error', async () => {
      const request = {
        userId: 'test-user',
        projectId: 'test-project',
        message: 'Build me a complex feature',
        chatMode: 'feature' as const
      };

      // Mock insufficient balance
      (pool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ total_seconds: 10 }] }); // Insufficient balance

      await expect(chatPlanService.processChatPlan(request))
        .rejects.toThrow('INSUFFICIENT_BALANCE');
    });

    it('should validate Arabic responses when locale is Arabic', async () => {
      const request = {
        userId: 'test-user',
        projectId: 'test-project',
        message: 'كيف أضيف المصادقة؟',
        chatMode: 'question' as const,
        locale: 'ar-EG'
      };

      // Mock database queries
      (pool as any).query = jest.fn().mockResolvedValue({ rows: [] });

      // Mock Claude executor with non-Arabic response first, then Arabic
      const mockExecutor = {
        execute: jest.fn()
          .mockResolvedValueOnce({
            output: 'English response',
            usage: { totalTokens: 100 }
          })
          .mockResolvedValueOnce({
            output: 'يمكنك إضافة المصادقة باستخدام...',
            usage: { totalTokens: 100 }
          })
      };

      jest.spyOn(chatPlanService as any, 'executor', 'get').mockReturnValue(mockExecutor);

      await chatPlanService.processChatPlan(request);

      // Should have called execute twice (retry for Arabic)
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('convertToBuild', () => {
    it('should convert a plan session to a build', async () => {
      const sessionId = 'test-session';
      const planData = { plan: { steps: [] } };
      const userId = 'test-user';
      const projectId = 'test-project';

      // Mock database queries
      (pool as any).query = jest.fn().mockResolvedValue({ rows: [] });

      const result = await chatPlanService.convertTouild(
        sessionId,
        planData,
        userId,
        projectId
      );

      expect(result).toHaveProperty('buildId');
      expect(result.status).toBe('queued');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE project_chat_plan_sessions'),
        expect.arrayContaining([sessionId, 'converted'])
      );
    });
  });
});

describe('LocaleAwarePromptBuilder', () => {
  let promptBuilder: LocaleAwarePromptBuilder;

  beforeEach(() => {
    promptBuilder = new LocaleAwarePromptBuilder();
  });

  describe('build', () => {
    it('should build English prompt correctly', () => {
      const prompt = promptBuilder.build(
        'How to add auth?',
        'question',
        'en-US'
      );

      expect(prompt).toContain('How to add auth?');
      expect(prompt).toContain('BE PRECISE AND QUICK');
      expect(prompt).not.toContain('You are responding in');
    });

    it('should build Arabic prompt with RTL instructions', () => {
      const prompt = promptBuilder.build(
        'كيف أضيف المصادقة؟',
        'question',
        'ar-EG'
      );

      expect(prompt).toContain('You are responding in ar');
      expect(prompt).toContain('Do NOT translate code');
      expect(prompt).toContain('Use Western digits (0-9)');
    });

    it('should include context when provided', () => {
      const prompt = promptBuilder.build(
        'Fix the bug',
        'fix',
        'en-US',
        {
          includeVersionHistory: true,
          includeBuildErrors: true
        }
      );

      expect(prompt).toContain('Include version history context');
      expect(prompt).toContain('Include recent build errors');
    });
  });

  describe('validateArabicResponse', () => {
    it('should validate Arabic text correctly', () => {
      const arabicText = 'هذا نص عربي';
      const englishText = 'This is English text';

      expect(promptBuilder.validateArabicResponse(arabicText, 'ar')).toBe(true);
      expect(promptBuilder.validateArabicResponse(englishText, 'ar')).toBe(false);
      expect(promptBuilder.validateArabicResponse(englishText, 'en')).toBe(true);
    });
  });
});

describe('Chat Plan Integration', () => {
  it('should handle streaming responses correctly', async () => {
    // This would test SSE streaming functionality
    // Implementation would require mocking the FastifyReply raw stream
  });

  it('should enforce rate limits', async () => {
    // This would test rate limiting logic
    // Currently a placeholder in the implementation
  });

  it('should track session metrics accurately', async () => {
    // This would test session aggregation and billing
  });
});
