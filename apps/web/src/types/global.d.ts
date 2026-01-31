// Global type declarations

declare global {
  interface Window {
    updateUndoRedoButtons?: (
      sectionType: string,
      sectionId: string,
      canUndo: boolean,
      canRedo: boolean
    ) => void;
  }
}

// Custom test matchers
declare module 'vitest' {
  interface Assertion {
    toBeOneOf(expected: any[]): void
  }
}

export {};