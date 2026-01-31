import { buildRecommendationsPrompt, validateRecommendationsSchema } from '../src/services/recommendationsPrompt';

describe('recommendationsPrompt', () => {
  describe('schema drift prevention', () => {
    it('should round-trip: prompt generates valid schema that passes validation', () => {
      // Generate prompt for initial build
      const initialPrompt = buildRecommendationsPrompt({
        projectType: 'create',
        framework: 'React',
        originalPrompt: 'Create a todo app with dark mode',
        currentVersion: undefined
      });

      // Mock valid AI response that matches our schema
      const mockValidResponse = {
        schemaVersion: 1,
        recommendations: [
          {
            id: 1,
            title: "Add Task Filtering",
            description: "Allow users to filter tasks by status",
            prompt: "Add filter buttons for all/active/completed tasks",
            complexity: "medium",
            impact: "high",
            category: "feature",
            versionHint: "minor"
          },
          {
            id: 2,
            title: "Improve Mobile Layout",
            description: "Optimize the interface for mobile devices",
            prompt: "Make the todo list responsive on small screens",
            complexity: "easy",
            impact: "medium",
            category: "ui",
            versionHint: "patch"
          }
        ],
        project_info: {
          type: "web_app",
          framework: "React",
          version: "1.0.0",
          version_description: "Initial release with core todo functionality",
          change_type: "major",
          breaking_risk: "none"
        }
      };

      // Validation should pass
      expect(validateRecommendationsSchema(mockValidResponse)).toBe(true);
      
      // Ensure prompt contains key instructions
      expect(initialPrompt).toContain('3-7 next-step recommendations');
      expect(initialPrompt).toContain('set "version" to "1.0.0"');
      expect(initialPrompt).toContain('schemaVersion');
      expect(initialPrompt).toContain('project_info');
      
      // Initial build should show 1.0.0 example and major change_type
      expect(initialPrompt).toContain('"version": "1.0.0"');
      expect(initialPrompt).toContain('"change_type": "major"');
      expect(initialPrompt).toContain('"breaking_risk": "none"');
    });

    it('should round-trip: update prompt with previous version context', () => {
      // Generate prompt for update build
      const updatePrompt = buildRecommendationsPrompt({
        projectType: 'update',
        framework: 'Next.js',
        originalPrompt: 'Add user authentication',
        currentVersion: '1.2.0'
      });

      // Mock valid update response
      const mockUpdateResponse = {
        schemaVersion: 1,
        recommendations: [
          {
            id: 1,
            title: "Add Password Reset",
            description: "Users need password recovery option",
            prompt: "Implement password reset flow with email verification",
            complexity: "hard",
            impact: "high",
            category: "feature",
            versionHint: "minor"
          }
        ],
        project_info: {
          type: "web_app",
          framework: "Next.js",
          version: "1.3.0",
          version_description: "Added user authentication system",
          change_type: "minor",
          breaking_risk: "low"
        }
      };

      // Validation should pass
      expect(validateRecommendationsSchema(mockUpdateResponse)).toBe(true);
      
      // Ensure prompt contains update-specific instructions
      expect(updatePrompt).toContain('updated this project');
      expect(updatePrompt).toContain('Current version is 1.2.0');
      expect(updatePrompt).toContain('next semantic version');
      expect(updatePrompt).toContain('Framework: Next.js');
      
      // Update build should show incremented version example and contextual change_type
      expect(updatePrompt).toContain('"version": "1.3.0"'); // incremented from 1.2.0
      expect(updatePrompt).toContain('"change_type": "minor"');
      expect(updatePrompt).toContain('"breaking_risk": "low"');
    });

    it('should fail validation on schema drift', () => {
      // Test various invalid schemas
      const invalidSchemas = [
        // Missing schemaVersion
        {
          recommendations: [],
          project_info: { version: "1.0.0" }
        },
        // Wrong schemaVersion
        {
          schemaVersion: 2,
          recommendations: [],
          project_info: { version: "1.0.0" }
        },
        // Missing recommendations array
        {
          schemaVersion: 1,
          project_info: { version: "1.0.0" }
        },
        // Missing project_info
        {
          schemaVersion: 1,
          recommendations: []
        },
        // Missing version in project_info
        {
          schemaVersion: 1,
          recommendations: [],
          project_info: { framework: "React" }
        },
        // Non-string version
        {
          schemaVersion: 1,
          recommendations: [],
          project_info: { version: 123 }
        }
      ];

      invalidSchemas.forEach((invalidSchema, index) => {
        expect(validateRecommendationsSchema(invalidSchema)).toBe(false);
      });
    });

    it('should handle edge cases in prompt generation', () => {
      // Empty framework should not break
      const noFrameworkPrompt = buildRecommendationsPrompt({
        projectType: 'create',
        framework: '',
        originalPrompt: 'Build a website',
        currentVersion: undefined
      });
      
      expect(noFrameworkPrompt).not.toContain('Framework: .');
      expect(noFrameworkPrompt).toContain('Build a website');

      // Multiline original prompt should be flattened
      const multilinePrompt = buildRecommendationsPrompt({
        projectType: 'update',
        framework: 'Vue',
        originalPrompt: 'Add features:\n- User login\n- Dashboard',
        currentVersion: '2.1.0'
      });
      
      expect(multilinePrompt).toContain('Add features: - User login - Dashboard');
      expect(multilinePrompt).not.toContain('\n- User login');
    });
  });
});