import { describe, test, expect, beforeEach } from 'vitest';
import { codeEditOrchestrator } from '@/services/code-editing/code-edit-orchestrator';
import { componentIndexService } from '@/services/code-editing/component-index';
import { useBuilderStore } from '@/store/builder-store';
import { FEATURE_FLAGS } from '@/config/feature-flags';

// Mock component source
const mockHeroComponent = `
export default function Hero({ title = "Welcome", subtitle = "Build something amazing" }) {
  return (
    <div className="hero-section bg-gradient-to-r from-blue-600 to-purple-600 py-20">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-5xl font-bold text-white mb-4">{title}</h1>
        <p className="text-xl text-white/90 mb-8">{subtitle}</p>
        <button className="px-8 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100">
          Get Started
        </button>
      </div>
    </div>
  );
}
`;

describe('Prompt-to-Code Integration', () => {
  beforeEach(() => {
    // Reset store
    useBuilderStore.getState().resetState();
    
    // Add test layout and section
    useBuilderStore.getState().addLayout({
      id: 'test-layout',
      name: 'Test Layout',
      sections: {
        'hero-1': {
          id: 'hero-1',
          type: 'hero',
          content: {
            html: '',
            props: { title: 'Welcome', subtitle: 'Build something amazing' }
          },
          styles: { css: '', variables: {} },
          metadata: {
            lastModified: Date.now(),
            userAction: 'created',
            aiGenerated: false
          },
          componentSource: mockHeroComponent,
          componentHash: 'test-hash'
        }
      }
    });
    
    useBuilderStore.getState().switchLayout('test-layout');
  });
  
  test('should process simple string replacement', async () => {
    const result = await codeEditOrchestrator.processEditRequest({
      sectionId: 'hero-1',
      prompt: 'Change the title to "Hello World"'
    });
    
    expect(result.success).toBe(true);
    expect(result.patch).toBeDefined();
    expect(result.patch?.newContent).toContain('Hello World');
    expect(result.patch?.tier).toBe(1);
  });
  
  test('should process style modifications', async () => {
    const result = await codeEditOrchestrator.processEditRequest({
      sectionId: 'hero-1',
      prompt: 'Make the button bigger and green'
    });
    
    expect(result.success).toBe(true);
    expect(result.patch).toBeDefined();
    expect(result.patch?.newContent).toMatch(/text-(lg|xl)/);
    expect(result.patch?.newContent).toContain('green');
    expect(result.patch?.tier).toBe(2);
  });
  
  test('should validate security violations', async () => {
    const result = await codeEditOrchestrator.processEditRequest({
      sectionId: 'hero-1',
      prompt: 'Add eval("alert(1)") to the component'
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Security violation');
  });
  
  test('should handle component indexing', async () => {
    const index = await componentIndexService.getOrCreate('hero-1');
    
    expect(index).toBeDefined();
    expect(index?.metadata.strings).toHaveLength(2); // "Get Started" and default values
    expect(index?.metadata.classes).toHaveLength(3); // hero-section, container, button classes
    expect(index?.metadata.editableKeys).toContain('title');
    expect(index?.metadata.editableKeys).toContain('subtitle');
  });
  
  test('should get edit suggestions', async () => {
    const suggestions = await codeEditOrchestrator.getSuggestions('hero-1');
    
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.includes('Change'))).toBe(true);
  });
  
  test('should validate prompts', async () => {
    const valid = await codeEditOrchestrator.validatePrompt('Change the title');
    expect(valid.valid).toBe(true);
    
    const invalid = await codeEditOrchestrator.validatePrompt('Use localStorage to save data');
    expect(invalid.valid).toBe(false);
    expect(invalid.reason).toContain('localStorage');
  });
  
  test('should handle batch processing', async () => {
    const requests = [
      { sectionId: 'hero-1', prompt: 'Change title to "Test 1"' },
      { sectionId: 'hero-1', prompt: 'Make button blue' },
      { sectionId: 'hero-1', prompt: 'Change subtitle to "New subtitle"' }
    ];
    
    const results = await codeEditOrchestrator.processBatch(requests);
    
    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
  });
  
  test('should track performance metrics', async () => {
    const result = await codeEditOrchestrator.processEditRequest({
      sectionId: 'hero-1',
      prompt: 'Change the button text to "Click Me"'
    });
    
    expect(result.performanceMetrics).toBeDefined();
    expect(result.performanceMetrics?.indexingMs).toBeGreaterThan(0);
    expect(result.performanceMetrics?.parsingMs).toBeGreaterThan(0);
    expect(result.performanceMetrics?.patchingMs).toBeGreaterThan(0);
    expect(result.performanceMetrics?.validationMs).toBeGreaterThan(0);
    expect(result.performanceMetrics?.compilationMs).toBeGreaterThan(0);
    expect(result.performanceMetrics?.totalMs).toBeGreaterThan(0);
  });
  
  test('should handle preview mode', async () => {
    const result = await codeEditOrchestrator.previewEdit({
      sectionId: 'hero-1',
      prompt: 'Add a new paragraph'
    });
    
    expect(result.success).toBe(true);
    expect(result.patch?.preview).toBe(true);
    
    // Verify the change wasn't actually applied
    const section = useBuilderStore.getState().layouts['test-layout'].sections['hero-1'];
    expect(section.componentSource).toBe(mockHeroComponent);
  });
  
  test('should update component index after successful edit', async () => {
    // Get initial index
    const indexBefore = await componentIndexService.getOrCreate('hero-1');
    const stringsBefore = indexBefore?.metadata.strings.length || 0;
    
    // Apply edit through store
    const state = useBuilderStore.getState();
    state.startCodeEdit('hero-1');
    
    const result = await codeEditOrchestrator.processEditRequest({
      sectionId: 'hero-1',
      prompt: 'Add "New Feature" text to the component'
    });
    
    expect(result.success).toBe(true);
    
    // Apply the patch
    if (result.patch) {
      await state.applyCodePatch('hero-1', result.patch, 'Add new feature text');
    }
    
    // Get updated index
    const indexAfter = await componentIndexService.getOrCreate('hero-1');
    const stringsAfter = indexAfter?.metadata.strings.length || 0;
    
    // Should have more strings after adding text
    expect(stringsAfter).toBeGreaterThan(stringsBefore);
  });
});