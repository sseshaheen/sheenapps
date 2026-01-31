# Prompt-to-Code Implementation Plan

## Implementation Status

### ✅ Phase 1: Iframe Preview System (Complete)
- Created all core iframe components and services
- Integrated with builder store
- Added feature flags

### ✅ Phase 2: Component Index & AST Analysis (Complete)
- Created Auto-Binding Service for prop extraction
- Built Component Index Service with caching
- Implemented AST Analyzer with modification support
- Integrated with existing builder store

### ✅ Phase 3: Intent Parser & Patch Generation (Complete)
- Created Intent Parser with pattern matching
- Built Patch Generator for Tier 1-3 changes
- Integrated diff generation
- Added Tailwind class modifications

### ✅ Phase 4: Validation & Security Layer (Complete)
- Created Code Validator with multi-level checks
- Implemented security scanning for banned APIs
- Added incremental compiler for performance
- Integrated with bundle caching

### ✅ Phase 5: Prompt Editing UI (Complete)
- Created PromptEditor component with AI integration
- Built CodeDiffViewer for visual change tracking
- Added PromptEditorModal for workspace integration
- Implemented undo/redo functionality

### ✅ Phase 6: Integration & Testing (Complete)
- Created CodeEditOrchestrator for unified processing
- Built integration tests
- Added usePromptEditor hook
- Implemented performance tracking

## Overview

This plan outlines a lean, code-first approach for implementing natural language editing of React components in SheenApps. Users can modify templates through prompts without needing a props abstraction layer. The system directly patches component code based on user intent.

## Architecture Principles

1. **Code as Source of Truth**: No intermediate props layer - direct code modifications
2. **Progressive Enhancement**: Start with simple string replacements, add complexity as needed
3. **Leverage Existing Infrastructure**: Build on our compiler service, preview system, and AI integration
4. **Security First**: All code changes validated before execution
5. **Immediate Visual Feedback**: Sub-second preview updates after each change

## System Architecture

```
User Prompt → Intent Parser → Code Patcher → Validator → Compiler → Preview
     ↓             ↓              ↓            ↓           ↓          ↓
  History      Component      AST/String    Security   Builder    Iframe
   Stack        Index         Transform     Check      Store     Preview
```

## Implementation Phases

### Phase 1: Component Index & Analysis (Day 1)

#### 1.1 Component Index Service
```typescript
// src/services/code-editing/component-index.ts
interface ComponentIndexEntry {
  id: string;                    // Stable internal ID
  sectionId: string;             // Builder store section reference
  componentName: string;         // e.g., "Hero", "Features"
  filePath: string;              // Virtual path in template
  source: string;                // Current TSX source
  sourceHash: string;            // For change detection
  metadata: {
    strings: Array<{             // Extracted string literals
      value: string;
      location: { line: number; column: number };
      context: string;           // e.g., "heading", "button", "description"
    }>;
    classes: Array<{             // Tailwind classes
      value: string;
      location: { line: number; column: number };
      element: string;           // e.g., "h1", "button", "div"
    }>;
    structure: {                 // Component structure summary
      hasHero: boolean;
      hasButtons: boolean;
      hasImages: boolean;
      elementCount: number;
    };
  };
  lastAnalyzed: number;
  lastModified: number;
}
```

#### 1.2 AST Analysis Service
```typescript
// src/services/code-editing/ast-analyzer.ts
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

export class ASTAnalyzer {
  // Extract all string literals with context
  extractStrings(source: string): ExtractedString[] {
    const ast = this.parseComponent(source);
    const strings: ExtractedString[] = [];
    
    traverse(ast, {
      StringLiteral(path) {
        // Get parent JSX context
        const jsxElement = path.findParent(p => t.isJSXElement(p.node));
        const context = this.inferStringContext(path, jsxElement);
        
        strings.push({
          value: path.node.value,
          location: path.node.loc,
          context,
          path: path
        });
      }
    });
    
    return strings;
  }

  // Extract Tailwind classes
  extractTailwindClasses(source: string): ExtractedClass[] {
    const ast = this.parseComponent(source);
    const classes: ExtractedClass[] = [];
    
    traverse(ast, {
      JSXAttribute(path) {
        if (path.node.name.name === 'className') {
          // Handle string literals and template literals
          const value = this.extractClassValue(path.node.value);
          if (value) {
            classes.push({
              value,
              location: path.node.loc,
              element: this.getElementName(path)
            });
          }
        }
      }
    });
    
    return classes;
  }
}
```

### Phase 2: Intent Parser & Patch Generation (Day 2)

#### 2.1 Intent Recognition Service
```typescript
// src/services/code-editing/intent-parser.ts
interface ParsedIntent {
  target: {
    type: 'component' | 'element' | 'text' | 'style';
    identifier: string;        // What to modify
    confidence: number;
  };
  action: {
    type: 'replace' | 'add' | 'remove' | 'modify';
    details: Record<string, any>;
  };
  scope: 'string' | 'class' | 'structure';
  tier: 1 | 2 | 3 | 4;        // Complexity tier
}

export class IntentParser {
  private patterns = {
    // Tier 1: Direct string replacement
    stringReplace: /change\s+(?:the\s+)?(.+?)\s+to\s+"([^"]+)"/i,
    
    // Tier 2: Style modifications
    makeSize: /make\s+(?:the\s+)?(.+?)\s+(bigger|smaller|larger|tiny|huge)/i,
    changeColor: /(?:make|change)\s+(?:the\s+)?(.+?)\s+(?:to\s+)?(\w+)(?:\s+color)?/i,
    
    // Tier 3: Structural changes
    addElement: /add\s+(?:a|an)?\s*(.+?)\s+(?:to|in|after|before)\s+(.+)/i,
    removeElement: /remove\s+(?:the\s+)?(.+)/i
  };

  async parseIntent(prompt: string, context: ComponentContext): Promise<ParsedIntent> {
    // Try pattern matching first
    const patternResult = this.matchPatterns(prompt);
    if (patternResult.confidence > 0.8) {
      return patternResult;
    }

    // Fall back to AI if patterns don't match
    if (FEATURE_FLAGS.ENABLE_AI_INTENT_PARSING) {
      return this.parseWithAI(prompt, context);
    }

    return this.fuzzyMatch(prompt, context);
  }
}
```

#### 2.2 Patch Generation Service
```typescript
// src/services/code-editing/patch-generator.ts
interface CodePatch {
  id: string;
  type: 'ast' | 'string' | 'regex';
  description: string;
  diff: string;                 // Unified diff format
  oldContent: string;
  newContent: string;
  affectedLines: number[];
  tier: number;
  validation: {
    syntaxValid: boolean;
    typesValid: boolean;
    securitySafe: boolean;
  };
}

export class PatchGenerator {
  // Tier 1: String literal replacement
  async generateStringPatch(
    source: string,
    target: string,
    newValue: string
  ): Promise<CodePatch> {
    const analyzer = new ASTAnalyzer();
    const strings = analyzer.extractStrings(source);
    
    // Find best match
    const match = this.findBestStringMatch(strings, target);
    if (!match) throw new Error('Target string not found');
    
    // Generate AST-based replacement
    const newSource = this.replaceStringLiteral(source, match, newValue);
    
    return this.createPatch(source, newSource, 'String replacement', 1);
  }

  // Tier 2: Tailwind class modification
  async generateClassPatch(
    source: string,
    target: string,
    modification: ClassModification
  ): Promise<CodePatch> {
    const analyzer = new ASTAnalyzer();
    const classes = analyzer.extractTailwindClasses(source);
    
    // Find target element
    const match = this.findBestClassMatch(classes, target);
    if (!match) throw new Error('Target element not found');
    
    // Modify classes
    const newClasses = this.modifyTailwindClasses(
      match.value,
      modification
    );
    
    const newSource = this.replaceClassName(source, match, newClasses);
    
    return this.createPatch(source, newSource, 'Style modification', 2);
  }

  // Tier 3: Structural changes (AI-powered)
  async generateStructuralPatch(
    source: string,
    intent: ParsedIntent,
    context: ComponentContext
  ): Promise<CodePatch> {
    // Use AI service to generate the patch
    const aiService = getAIService();
    const result = await aiService.modifyComponentStructure({
      source,
      intent,
      context,
      constraints: {
        preserveProps: true,
        maintainTypes: true,
        maxDiffSize: 1000
      }
    });
    
    return this.createPatch(
      source,
      result.modifiedSource,
      result.description,
      3
    );
  }
}
```

### Phase 3: Validation & Security (Day 2-3)

#### 3.1 Code Validator Service
```typescript
// src/services/code-editing/code-validator.ts
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  security: SecurityCheckResult;
}

export class CodeValidator {
  private bannedAPIs = [
    'eval', 'Function', 'setTimeout', 'setInterval',
    'document.write', 'innerHTML', 'outerHTML',
    '__dangerouslySetInnerHTML'
  ];

  async validatePatch(
    originalSource: string,
    patchedSource: string,
    patch: CodePatch
  ): Promise<ValidationResult> {
    const checks = await Promise.all([
      this.checkSyntax(patchedSource),
      this.checkTypes(patchedSource),
      this.checkSecurity(patchedSource),
      this.checkDiffScope(originalSource, patchedSource, patch)
    ]);

    return {
      valid: checks.every(c => c.valid),
      errors: checks.flatMap(c => c.errors || []),
      warnings: checks.flatMap(c => c.warnings || []),
      security: checks.find(c => c.type === 'security')
    };
  }

  private async checkSyntax(source: string) {
    try {
      parse(source, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });
      return { valid: true, type: 'syntax' };
    } catch (error) {
      return {
        valid: false,
        type: 'syntax',
        errors: [{
          message: error.message,
          line: error.loc?.line,
          column: error.loc?.column
        }]
      };
    }
  }

  private async checkSecurity(source: string) {
    const ast = parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript']
    });

    const violations: SecurityViolation[] = [];

    traverse(ast, {
      Identifier: (path) => {
        if (this.bannedAPIs.includes(path.node.name)) {
          violations.push({
            type: 'banned-api',
            api: path.node.name,
            location: path.node.loc
          });
        }
      },
      CallExpression: (path) => {
        // Check for dynamic imports, fetch, etc.
        this.checkCallExpression(path, violations);
      }
    });

    return {
      valid: violations.length === 0,
      type: 'security',
      violations
    };
  }
}
```

### Phase 4: Integration with Existing Systems (Day 3)

#### 4.1 Builder Store Integration
```typescript
// Extend src/store/builder-store.ts
interface BuilderState {
  // ... existing state ...
  
  // Code editing state
  codeEditHistory: Record<string, PatchRecord[]>;
  activeCodeEdit: {
    sectionId: string;
    originalSource: string;
    currentSource: string;
    patches: PatchRecord[];
  } | null;

  // Actions
  startCodeEdit: (sectionId: string) => void;
  applyCodePatch: (sectionId: string, patch: CodePatch) => Promise<void>;
  revertCodeEdit: (sectionId: string, steps?: number) => void;
  commitCodeEdit: (sectionId: string) => void;
}

// Implementation
const codeEditingSlice = {
  startCodeEdit: (sectionId: string) => {
    const section = get().sections[sectionId];
    if (!section?.componentSource) return;

    set({
      activeCodeEdit: {
        sectionId,
        originalSource: section.componentSource,
        currentSource: section.componentSource,
        patches: []
      }
    });
  },

  applyCodePatch: async (sectionId: string, patch: CodePatch) => {
    const state = get();
    const activeEdit = state.activeCodeEdit;
    if (!activeEdit || activeEdit.sectionId !== sectionId) return;

    // Apply patch
    const newSource = patch.newContent;

    // Update section with new source
    set(produce((draft) => {
      draft.sections[sectionId].componentSource = newSource;
      draft.activeCodeEdit.currentSource = newSource;
      draft.activeCodeEdit.patches.push({
        ...patch,
        timestamp: Date.now()
      });
    }));

    // Trigger recompilation
    await compilerService.compileComponent({
      name: `Section_${sectionId}`,
      source: newSource
    });
  }
};
```

#### 4.2 UI Integration
```typescript
// src/components/builder/code-edit/prompt-editor.tsx
export function PromptEditor({ sectionId }: { sectionId: string }) {
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { applyCodePatch } = useBuilderStore();

  const handleSubmit = async () => {
    setIsProcessing(true);
    try {
      // Get current component state
      const section = useBuilderStore.getState().sections[sectionId];
      const componentIndex = await componentIndexService.getOrCreate(sectionId);

      // Parse intent
      const intent = await intentParser.parseIntent(prompt, {
        component: componentIndex,
        section
      });

      // Generate patch based on tier
      const patch = await patchGenerator.generatePatch(
        section.componentSource,
        intent
      );

      // Validate patch
      const validation = await codeValidator.validatePatch(
        section.componentSource,
        patch.newContent,
        patch
      );

      if (!validation.valid) {
        toast.error('Invalid code change', {
          description: validation.errors[0]?.message
        });
        return;
      }

      // Apply patch
      await applyCodePatch(sectionId, patch);

      // Clear prompt on success
      setPrompt('');
      toast.success('Applied changes');
    } catch (error) {
      toast.error('Failed to apply changes', {
        description: error.message
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="prompt-editor">
      <div className="prompt-input-wrapper">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to change..."
          className="prompt-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.metaKey) {
              handleSubmit();
            }
          }}
        />
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isProcessing}
          loading={isProcessing}
        >
          Apply Changes
        </Button>
      </div>
      <div className="prompt-hints">
        <span>Try: "Change the headline to 'Welcome to Our Store'"</span>
        <span>Or: "Make the button bigger and blue"</span>
      </div>
    </div>
  );
}
```

### Phase 5: Performance & UX Optimization (Day 4)

#### 5.1 Incremental Compilation
```typescript
// src/services/code-editing/incremental-compiler.ts
export class IncrementalCompiler {
  private buildContext: esbuild.BuildContext | null = null;
  private lastSuccessfulBuild: CompiledResult | null = null;

  async compilePatch(
    originalSource: string,
    patchedSource: string,
    patch: CodePatch
  ): Promise<CompiledResult> {
    // For small patches, try incremental build
    if (patch.tier <= 2 && this.buildContext) {
      try {
        return await this.incrementalBuild(patchedSource);
      } catch (error) {
        // Fall back to full build
        console.warn('Incremental build failed, doing full rebuild');
      }
    }

    // Full compilation
    return this.fullBuild(patchedSource);
  }
}
```

#### 5.2 Optimistic Updates
```typescript
// Show preview immediately with loading state
const handlePromptSubmit = async (prompt: string) => {
  // 1. Show optimistic preview
  setPreviewState('updating');
  
  // 2. Process in background
  const patch = await generatePatch(prompt);
  
  // 3. Apply patch optimistically
  applyOptimisticPatch(patch);
  
  // 4. Validate and compile
  const validation = await validateAndCompile(patch);
  
  // 5. Revert if invalid
  if (!validation.valid) {
    revertOptimisticPatch(patch);
    showError(validation.error);
  }
};
```

## Security Considerations

1. **Input Sanitization**: All user prompts sanitized before processing
2. **Code Validation**: AST-level validation before execution
3. **Sandboxed Preview**: Components run in iframe with restricted permissions
4. **API Restrictions**: Banned APIs list prevents malicious code
5. **Diff Scope Limits**: Large changes require explicit user confirmation

## Performance Targets

- Intent parsing: < 50ms for pattern matching, < 500ms with AI
- Patch generation: < 100ms for Tier 1-2, < 1s for Tier 3
- Validation: < 50ms for syntax/security checks
- Compilation: < 100ms incremental, < 500ms full rebuild
- End-to-end: < 1s from prompt to preview update

## Implementation Timeline

### Week 1
- Day 1: Component Index & AST Analysis
- Day 2: Intent Parser & Basic Patch Generation (Tier 1-2)
- Day 3: Validation & Security Layer
- Day 4: UI Integration & Testing
- Day 5: Buffer & Polish

### Week 2 (If Needed)
- Advanced patch generation (Tier 3-4)
- Performance optimizations
- Extended testing & edge cases

## Success Metrics

1. **User Engagement**: 80% of users try prompt editing
2. **Success Rate**: 70% of prompts result in successful changes
3. **Performance**: 95% of edits complete in < 1 second
4. **Reliability**: < 1% error rate in production
5. **Security**: Zero security incidents

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex prompts fail | Poor UX | Start with simple patterns, expand gradually |
| Performance degradation | Slow edits | Implement caching, incremental compilation |
| Security vulnerabilities | Code injection | Strict validation, sandboxing, banned APIs |
| Breaking changes | Broken previews | Automatic rollback, validation before apply |

## Future Enhancements

1. **Multi-file Operations**: Edit across multiple components
2. **Semantic Understanding**: Better intent recognition with LLM
3. **Visual Diff**: Show before/after preview side-by-side
4. **Collaborative Editing**: Real-time multi-user code edits
5. **Git Integration**: Direct commit from prompt edits

## Conclusion

This implementation plan provides a pragmatic path to natural language code editing without the complexity of a props abstraction layer. By building on our existing infrastructure and starting with simple transformations, we can deliver value quickly while maintaining the flexibility to add more sophisticated features over time.

The key is to start simple (string replacements), validate everything, and gradually add complexity based on user needs and feedback.