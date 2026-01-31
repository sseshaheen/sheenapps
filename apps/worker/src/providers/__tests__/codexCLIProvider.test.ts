import { CodexCLIProvider, CodexProviderConfig } from '../codexCLIProvider';
import { CodexSession, CodexSessionResult } from '../../stream/codexSession';
import type { PlanContext, TransformInput } from '../../types/modular';

// Mock dependencies
jest.mock('../../stream/codexSession');
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const MockedCodexSession = CodexSession as jest.MockedClass<typeof CodexSession>;
const { execSync } = require('child_process');

describe('CodexCLIProvider', () => {
  let provider: CodexCLIProvider;
  let mockSession: jest.Mocked<CodexSession>;

  const defaultPlanContext: PlanContext = {
    framework: 'react',
    projectPath: '/tmp/project-123',
    existingFiles: []
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock session
    mockSession = {
      run: jest.fn(),
      resume: jest.fn(),
      getSessionId: jest.fn()
    } as any;

    MockedCodexSession.mockImplementation(() => mockSession);

    // Default execSync mock (binary found)
    execSync.mockReturnValue('codex 1.0.0');
  });

  describe('Constructor & Configuration', () => {
    it('initializes with default config', () => {
      provider = new CodexCLIProvider();

      expect(provider.name).toBe('codex-cli');
    });

    it('applies default configuration values', () => {
      provider = new CodexCLIProvider();

      // Test that run is called with default options
      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: []
      };
      mockSession.run.mockResolvedValue(mockResult);

      provider.plan('Test', defaultPlanContext);

      // Verify defaults are used (tested indirectly through behavior)
      expect(mockSession.run).toHaveBeenCalled();
    });

    it('accepts custom configuration', () => {
      const customConfig: CodexProviderConfig = {
        model: 'gpt-5.2-codex',
        approvalPolicy: 'on-failure',
        sandboxMode: 'off',
        skipGitRepoCheck: false,
        codexHome: '/custom/codex-home',
        apiKey: 'sk-test-key'
      };

      provider = new CodexCLIProvider(customConfig);

      expect(provider.name).toBe('codex-cli');
    });
  });

  describe('initialize()', () => {
    it('succeeds when binary is found', async () => {
      provider = new CodexCLIProvider();
      execSync.mockReturnValue('codex 1.0.0');

      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it('throws when binary is not found', async () => {
      provider = new CodexCLIProvider();
      execSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      await expect(provider.initialize()).rejects.toThrow('health check failed');
    });
  });

  describe('healthCheck()', () => {
    it('returns true when codex binary is available', async () => {
      provider = new CodexCLIProvider();
      execSync.mockReturnValue('codex 1.0.0');

      const result = await provider.healthCheck();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith('codex --version', { stdio: 'pipe' });
    });

    it('returns false when codex binary is not found', async () => {
      provider = new CodexCLIProvider();
      execSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('plan()', () => {
    beforeEach(() => {
      provider = new CodexCLIProvider();
    });

    it('generates plan from valid JSON response', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          type: 'create_file',
          name: 'Create index.html',
          description: 'Create main HTML file',
          estimatedDuration: 10,
          priority: 1,
          input: { prompt: 'Create HTML', targetPath: 'index.html' }
        }
      ];

      const mockResult: CodexSessionResult = {
        success: true,
        result: JSON.stringify(mockTasks),
        messages: [],
        sessionId: 'th_abc123',
        tokenUsage: { input: 150, output: 75 }
      };

      mockSession.run.mockResolvedValue(mockResult);

      const result = await provider.plan('Create a React app', defaultPlanContext);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].type).toBe('create_file');
      expect(result.tasks[0].name).toBe('Create index.html');
      expect(result.claudeSessionId).toBe('th_abc123');
      expect(result.usage).toBeDefined();
      expect(result.usage.promptTokens).toBe(150);
      expect(result.usage.completionTokens).toBe(75);
    });

    it('falls back to default task when response is invalid', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: 'This is not valid JSON',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      const result = await provider.plan('Create a project', defaultPlanContext);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].type).toBe('create_file');
      expect(result.tasks[0].name).toBe('Create project');
    });

    it('extracts JSON from response with surrounding text', async () => {
      const mockTasks = [{ id: 'task-1', type: 'create_file', name: 'Test' }];
      const responseWithText = `Here's the plan:\n${JSON.stringify(mockTasks)}\nThat's the plan.`;

      const mockResult: CodexSessionResult = {
        success: true,
        result: responseWithText,
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      const result = await provider.plan('Create', defaultPlanContext);

      expect(result.tasks).toHaveLength(1);
    });

    it('resumes session when sessionId provided', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: [],
        sessionId: 'th_existing'
      };

      mockSession.resume.mockResolvedValue(mockResult);

      await provider.plan('Continue', defaultPlanContext, 'th_existing');

      expect(mockSession.resume).toHaveBeenCalledWith(
        'th_existing',
        expect.any(String),
        defaultPlanContext.projectPath,
        expect.any(String),
        undefined,
        undefined,
        undefined,
        expect.any(Object)
      );
    });

    it('falls back to new session when resume returns needsFallback', async () => {
      const resumeResult: CodexSessionResult = {
        success: false,
        result: '',
        error: 'Thread not found',
        messages: [],
        needsFallback: true
      };

      const runResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: []
      };

      mockSession.resume.mockResolvedValue(resumeResult);
      mockSession.run.mockResolvedValue(runResult);

      await provider.plan('Continue', defaultPlanContext, 'th_nonexistent');

      expect(mockSession.resume).toHaveBeenCalled();
      expect(mockSession.run).toHaveBeenCalled();
    });

    it('includes framework and context in prompt', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      await provider.plan('Create app', {
        framework: 'next',
        projectPath: '/tmp/next-app',
        existingFiles: ['package.json', 'tsconfig.json']
      });

      const callArgs = mockSession.run.mock.calls[0]!;
      const prompt = callArgs[0];

      expect(prompt).toContain('next');
      expect(prompt).toContain('package.json');
      expect(prompt).toContain('tsconfig.json');
    });

    it('estimates usage when token usage not provided', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: []
        // No tokenUsage
      };

      mockSession.run.mockResolvedValue(mockResult);

      const result = await provider.plan('Test', defaultPlanContext);

      expect(result.usage).toBeDefined();
      expect(result.usage.promptTokens).toBeGreaterThan(0);
      expect(result.usage.completionTokens).toBeGreaterThan(0);
    });
  });

  describe('transform()', () => {
    beforeEach(() => {
      provider = new CodexCLIProvider();
    });

    describe('code_gen', () => {
      it('generates code successfully', async () => {
        const mockResult: CodexSessionResult = {
          success: true,
          result: 'function hello() { return "Hello"; }',
          messages: [],
          tokenUsage: { input: 50, output: 30 }
        };

        mockSession.run.mockResolvedValue(mockResult);

        const input: TransformInput = {
          type: 'code_gen',
          input: 'Create a hello function',
          context: {
            framework: 'react',
            targetPath: 'src/hello.js',
            componentType: 'function'
          }
        };

        const result = await provider.transform(input);

        expect(result.output).toContain('hello');
        expect(result.usage.promptTokens).toBe(50);
        expect(result.usage.completionTokens).toBe(30);
      });

      it('includes context in prompt', async () => {
        const mockResult: CodexSessionResult = {
          success: true,
          result: 'const Component = () => {};',
          messages: []
        };

        mockSession.run.mockResolvedValue(mockResult);

        const input: TransformInput = {
          type: 'code_gen',
          input: 'Create component',
          context: {
            framework: 'react',
            targetPath: 'src/Component.tsx',
            componentType: 'functional'
          }
        };

        await provider.transform(input);

        const callArgs = mockSession.run.mock.calls[0]!;
        const prompt = callArgs[0];

        expect(prompt).toContain('react');
        expect(prompt).toContain('src/Component.tsx');
        expect(prompt).toContain('functional');
      });
    });

    describe('refactor', () => {
      it('refactors code successfully', async () => {
        const originalCode = 'function old() { var x = 1; }';
        const refactoredCode = 'function old() { const x = 1; }';

        const mockResult: CodexSessionResult = {
          success: true,
          result: refactoredCode,
          messages: []
        };

        mockSession.run.mockResolvedValue(mockResult);

        const input: TransformInput = {
          type: 'refactor',
          input: originalCode
        };

        const result = await provider.transform(input);

        expect(result.output).toBe(refactoredCode);
      });
    });

    describe('test_gen', () => {
      it('generates tests successfully', async () => {
        const testCode = `describe('add', () => {
  it('adds two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});`;

        const mockResult: CodexSessionResult = {
          success: true,
          result: testCode,
          messages: []
        };

        mockSession.run.mockResolvedValue(mockResult);

        const input: TransformInput = {
          type: 'test_gen',
          input: 'function add(a, b) { return a + b; }'
        };

        const result = await provider.transform(input);

        expect(result.output).toContain('describe');
        expect(result.output).toContain('expect');
      });
    });

    describe('lint_fix', () => {
      it('fixes linting issues', async () => {
        const fixedCode = 'const x = 1;';

        const mockResult: CodexSessionResult = {
          success: true,
          result: fixedCode,
          messages: []
        };

        mockSession.run.mockResolvedValue(mockResult);

        const input: TransformInput = {
          type: 'lint_fix',
          input: 'var x=1'
        };

        const result = await provider.transform(input);

        expect(result.output).toBe(fixedCode);
      });
    });

    describe('heal_json', () => {
      it('heals malformed JSON', async () => {
        const validJson = '{"name": "test"}';

        const mockResult: CodexSessionResult = {
          success: true,
          result: validJson,
          messages: []
        };

        mockSession.run.mockResolvedValue(mockResult);

        const input: TransformInput = {
          type: 'heal_json',
          input: '{name: "test"}'
        };

        const result = await provider.transform(input);

        expect(result.output).toBe(validJson);
      });

      it('extracts JSON from response with surrounding text', async () => {
        const responseWithText = 'Here is the JSON: {"valid": true} Done.';

        const mockResult: CodexSessionResult = {
          success: true,
          result: responseWithText,
          messages: []
        };

        mockSession.run.mockResolvedValue(mockResult);

        const input: TransformInput = {
          type: 'heal_json',
          input: '{invalid json}'
        };

        const result = await provider.transform(input);

        expect(result.output).toBe('{"valid": true}');
      });
    });

    it('trims output for non-heal_json types', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: '  const x = 1;  \n',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      const input: TransformInput = {
        type: 'code_gen',
        input: 'Create variable'
      };

      const result = await provider.transform(input);

      expect(result.output).toBe('const x = 1;');
    });

    it('passes sessionId for resume', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: 'code',
        messages: [],
        sessionId: 'th_123'
      };

      mockSession.resume.mockResolvedValue(mockResult);

      const input: TransformInput = {
        type: 'code_gen',
        input: 'Test'
      };

      await provider.transform(input, 'th_123');

      expect(mockSession.resume).toHaveBeenCalledWith(
        'th_123',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        undefined,
        undefined,
        undefined,
        expect.any(Object)
      );
    });
  });

  describe('transformWithSession()', () => {
    beforeEach(() => {
      provider = new CodexCLIProvider();
    });

    it('includes context prompt in transformation', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: 'transformed code',
        messages: []
      };

      mockSession.resume.mockResolvedValue(mockResult);

      const input: TransformInput = {
        type: 'code_gen',
        input: 'Create function'
      };

      const contextPrompt = 'Previous conversation context...';

      await provider.transformWithSession(input, 'th_123', contextPrompt);

      const callArgs = mockSession.resume.mock.calls[0]!;
      const prompt = callArgs[1];

      expect(prompt).toContain(contextPrompt);
      expect(prompt).toContain('Create function');
    });

    it('returns output and usage', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: 'output code',
        messages: [],
        tokenUsage: { input: 100, output: 50 }
      };

      mockSession.resume.mockResolvedValue(mockResult);

      const input: TransformInput = {
        type: 'refactor',
        input: 'old code'
      };

      const result = await provider.transformWithSession(input, 'th_123', 'context');

      expect(result.output).toBe('output code');
      expect(result.usage.promptTokens).toBe(100);
      expect(result.usage.completionTokens).toBe(50);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      provider = new CodexCLIProvider();
    });

    it('throws when session fails', async () => {
      const mockResult: CodexSessionResult = {
        success: false,
        result: '',
        error: 'Process crashed',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      await expect(provider.plan('Test', defaultPlanContext)).rejects.toThrow('Process crashed');
    });

    it('throws when session run throws', async () => {
      mockSession.run.mockRejectedValue(new Error('Spawn failed'));

      await expect(provider.plan('Test', defaultPlanContext)).rejects.toThrow('Codex CLI failed');
    });

    it('handles non-string transform response', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: null as any, // Non-string response
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      const input: TransformInput = {
        type: 'code_gen',
        input: 'Test'
      };

      const result = await provider.transform(input);

      expect(typeof result.output).toBe('string');
    });
  });

  describe('Cost Estimation', () => {
    beforeEach(() => {
      provider = new CodexCLIProvider();
    });

    it('estimates cost from token usage', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: [],
        tokenUsage: { input: 1000000, output: 1000000 } // 1M tokens each
      };

      mockSession.run.mockResolvedValue(mockResult);

      const result = await provider.plan('Test', defaultPlanContext);

      // At $10/M input and $30/M output
      expect(result.usage.totalCost).toBeCloseTo(40, 1); // $10 + $30 = $40
    });

    it('estimates usage when not provided', async () => {
      const longPrompt = 'a'.repeat(10000);
      const longResponse = 'b'.repeat(5000);

      const mockResult: CodexSessionResult = {
        success: true,
        result: longResponse,
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      const input: TransformInput = {
        type: 'code_gen',
        input: longPrompt
      };

      const result = await provider.transform(input);

      // Rough estimation: chars / 4 = tokens
      expect(result.usage.promptTokens).toBeGreaterThan(2000);
      expect(result.usage.completionTokens).toBeGreaterThan(1000);
      expect(result.usage.totalCost).toBeGreaterThan(0);
    });
  });

  describe('Configuration Propagation', () => {
    it('passes model config to session', async () => {
      provider = new CodexCLIProvider({
        model: 'gpt-5.2-codex'
      });

      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      await provider.plan('Test', defaultPlanContext);

      const callArgs = mockSession.run.mock.calls[0]!;
      const spawnOptions = callArgs[6]!; // 7th parameter is spawnOptions

      expect(spawnOptions.model).toBe('gpt-5.2-codex');
    });

    it('passes approval policy to session', async () => {
      provider = new CodexCLIProvider({
        approvalPolicy: 'on-failure'
      });

      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      await provider.plan('Test', defaultPlanContext);

      const callArgs = mockSession.run.mock.calls[0]!;
      const spawnOptions = callArgs[6]!;

      expect(spawnOptions.approvalPolicy).toBe('on-failure');
    });

    it('passes sandboxMode to session', async () => {
      provider = new CodexCLIProvider({
        sandboxMode: 'workspace-full'
      });

      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      await provider.plan('Test', defaultPlanContext);

      const callArgs = mockSession.run.mock.calls[0]!;
      const spawnOptions = callArgs[6]!;

      expect(spawnOptions.sandboxMode).toBe('workspace-full');
    });

    it('passes codexHome to session', async () => {
      provider = new CodexCLIProvider({
        codexHome: '/custom/codex-home'
      });

      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      await provider.plan('Test', defaultPlanContext);

      const callArgs = mockSession.run.mock.calls[0]!;
      const spawnOptions = callArgs[6]!;

      expect(spawnOptions.codexHome).toBe('/custom/codex-home');
    });

    it('passes apiKey to session', async () => {
      provider = new CodexCLIProvider({
        apiKey: 'sk-test-key-123'
      });

      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      await provider.plan('Test', defaultPlanContext);

      const callArgs = mockSession.run.mock.calls[0]!;
      const spawnOptions = callArgs[6]!;

      expect(spawnOptions.apiKey).toBe('sk-test-key-123');
    });
  });

  describe('planStream()', () => {
    beforeEach(() => {
      provider = new CodexCLIProvider();
    });

    it('yields plan result as async iterator', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: [],
        tokenUsage: { input: 100, output: 50 }
      };

      mockSession.run.mockResolvedValue(mockResult);

      const stream = provider.planStream('Test', defaultPlanContext);
      const results = [];

      for await (const chunk of stream) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]!.tasks).toBeDefined();
      expect(results[0]!.usage).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      provider = new CodexCLIProvider();
    });

    it('handles empty context files', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: '[]',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      await provider.plan('Test', {
        framework: 'react',
        projectPath: '/tmp/project',
        existingFiles: []
      });

      const callArgs = mockSession.run.mock.calls[0]!;
      const prompt = callArgs[0];

      expect(prompt).toContain('none');
    });

    it('handles missing context in transform', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: 'code',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      const input: TransformInput = {
        type: 'code_gen',
        input: 'Create function'
        // No context
      };

      await expect(provider.transform(input)).resolves.toBeDefined();
    });

    it('handles undefined projectPath in transform', async () => {
      const mockResult: CodexSessionResult = {
        success: true,
        result: 'code',
        messages: []
      };

      mockSession.run.mockResolvedValue(mockResult);

      const input: TransformInput = {
        type: 'code_gen',
        input: 'Test',
        context: { framework: 'react' }
      };

      await provider.transform(input);

      // Should fall back to process.cwd()
      expect(mockSession.run).toHaveBeenCalled();
    });
  });
});
