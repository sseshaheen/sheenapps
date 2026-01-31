# 🔒 CRITICAL: File System Security Containment Plan

**SECURITY ISSUE**: Current system allows file operations outside designated project directories

## 🚨 Vulnerability Analysis

### **Current Risks**
1. **Worker file contamination**: Worker's package.json moved to project directory
2. **Potential path traversal**: No validation of file paths against project boundaries  
3. **Claude CLI freedom**: AI can potentially create files anywhere within spawn directory
4. **No sandboxing**: File operations not constrained to safe zones

### **Attack Scenarios**
- Malicious prompts could attempt `../../../etc/passwd` style attacks
- Accidental file operations in worker root could corrupt system
- Build processes could write to arbitrary locations
- Error recovery could create files outside project scope

## 🛡️ Multi-Layer Security Solution

### **Layer 1: Path Validation Utility** ⭐ CRITICAL
```typescript
class SecurePathValidator {
  static validateProjectPath(filePath: string, projectRoot: string): boolean
  static sanitizePath(path: string): string  
  static isWithinBoundary(path: string, boundary: string): boolean
}
```

### **Layer 2: File Operation Wrapper** ⭐ CRITICAL  
```typescript
class SecureFileOperations {
  static secureRead(path: string, projectRoot: string)
  static secureWrite(path: string, content: string, projectRoot: string)
  static secureMove(from: string, to: string, projectRoot: string)
}
```

### **Layer 3: Claude Process Sandboxing** ⭐ CRITICAL
- Enforce working directory constraints
- Validate all Claude-created file paths
- Block operations outside project boundaries

### **Layer 4: Build Process Isolation** 
- Container-like isolation for build processes
- Strict working directory enforcement
- Output path validation

### **Layer 5: FileLocationValidator Security**
- Immediate fix: Exclude worker files
- Long-term: Use secure path validation

## 🎯 Implementation Priority

### **IMMEDIATE (30 minutes)**
1. Fix FileLocationValidator to exclude worker root
2. Add basic path validation to critical operations

### **URGENT (2 hours)**  
1. Create SecurePathValidator utility
2. Implement SecureFileOperations wrapper
3. Audit all file operation call sites

### **HIGH PRIORITY (4 hours)**
1. Integrate security validation into Claude process
2. Update all file operations to use secure wrappers
3. Add comprehensive logging of file operations

### **VALIDATION (1 hour)**
1. Penetration testing with malicious prompts
2. Boundary testing with edge cases
3. Performance impact assessment

## 🔍 File Operation Audit Points

### **Critical Areas to Secure**:
1. `claudeSession.ts` - Claude CLI spawn and file creation
2. `fileLocationValidator.ts` - File movement operations  
3. `deployWorker.ts` - Build output and deployment files
4. `errorRecoveryWorker.ts` - Error fix file operations
5. All `fs.*` operations throughout codebase

### **Security Requirements**:
- ✅ **NO operations outside `/Users/sh/projects/{userId}/{projectId}/`**
- ✅ **NO operations in worker root `/Users/sh/Sites/sheenapps-claude-worker/`** 
- ✅ **NO operations in system directories**
- ✅ **ALL paths validated before operations**
- ✅ **ALL operations logged for audit**

## 🧪 Security Testing Plan

### **Test Cases**:
1. Prompt with `../../../etc/passwd` - should be blocked
2. Prompt creating files in worker root - should be blocked  
3. Valid project files - should work normally
4. Symlink attacks - should be detected and blocked
5. Null byte injection - should be sanitized

### **Success Criteria**:
- 🎯 **ZERO operations outside project boundaries**
- 🎯 **100% validation coverage on file operations**
- 🎯 **Performance impact < 5ms per operation**
- 🎯 **Complete audit logging**

## ⚡ Emergency Workaround

**IMMEDIATE ACTION**: Add worker root exclusion to FileLocationValidator:

```typescript
// Exclude worker root from any file operations
const FORBIDDEN_PATHS = [
  '/Users/sh/Sites/sheenapps-claude-worker',
  process.cwd(), // Current worker directory
  __dirname     // Any worker source directories
];
```

This plan ensures **ABSOLUTE containment** - no file operations can occur outside designated project directories under any circumstances.