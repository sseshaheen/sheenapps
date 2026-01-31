import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;       // first line summary
  context: string[];     // subsequent indented or code-frame lines
}

/**
 * Parse TypeScript compiler output into structured error blocks,
 * capturing header + any indented context lines.
 */
function parseTypeScriptErrorBlocks(output: string): TypeScriptError[] {
  // Normalize CRLF and split
  const lines = output.replace(/\r\n/g, '\n').split('\n');
  const errors: TypeScriptError[] = [];
  let current: TypeScriptError | null = null;

  // Matches: src/App.tsx:11:10: error TS6133: 'App' is declared but its value is never read.
  const headerRe = /^(.+?):(\d+):(\d+):\s*error\s+(TS\d+):\s*(.+)$/;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const headerMatch = line.match(headerRe);

    if (headerMatch) {
      // start a new block
      if (current) errors.push(current);
      // Use ?? for noUncheckedIndexedAccess safety
      current = {
        file:   headerMatch[1] ?? '',
        line:   parseInt(headerMatch[2] ?? '0', 10),
        column: parseInt(headerMatch[3] ?? '0', 10),
        code:   headerMatch[4] ?? '',
        message: headerMatch[5] ?? '',
        context: []
      };
    } else if (current && /^\s+/.test(raw)) {
      // indented → add to context
      current.context.push(raw);
    } else {
      // non-header, non-indented → close current
      if (current) errors.push(current);
      current = null;
    }
  }

  if (current) errors.push(current);
  return errors;
}

/**
 * Remove unused imports only (safe operation).
 * Does NOT remove variable/function declarations as they may have side effects.
 */
async function removeUnusedVariables(filePath: string, unusedVars: string[]): Promise<boolean> {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    const original = content;

    for (const varName of unusedVars) {
      // Only remove from named imports - this is safe
      // Match: import { foo, bar, baz } from 'module'
      content = content.replace(
        new RegExp(`import\\s*{([^}]*\\b${varName}\\b[^}]*)}\\s*from\\s*(['"][^'"]+['"])\\s*;?`, 'g'),
        (match, importList, fromPath) => {
          if (!importList) return match;

          // Parse the import list, handling aliases like "foo as bar"
          const items = importList
            .split(',')
            .map((s: string) => s.trim())
            .filter((item: string) => {
              // Handle "foo as bar" - check if varName matches either side
              const parts = item.split(/\s+as\s+/);
              const importedName = parts[0]?.trim();
              const aliasName = parts[1]?.trim() || importedName;
              return aliasName !== varName && importedName !== varName;
            });

          if (items.length === 0) {
            // All imports removed, remove the entire import statement
            return '';
          }

          return `import { ${items.join(', ')} } from ${fromPath}`;
        }
      );

      // Remove standalone default imports if unused
      // Match: import Foo from 'module'
      content = content.replace(
        new RegExp(`import\\s+${varName}\\s+from\\s+['"][^'"]+['"]\\s*;?\\s*\\n?`, 'g'),
        ''
      );

      // Remove namespace imports if unused
      // Match: import * as Foo from 'module'
      content = content.replace(
        new RegExp(`import\\s+\\*\\s+as\\s+${varName}\\s+from\\s+['"][^'"]+['"]\\s*;?\\s*\\n?`, 'g'),
        ''
      );
    }

    // Clean up any resulting empty lines (multiple consecutive newlines)
    content = content.replace(/\n{3,}/g, '\n\n');

    if (content !== original) {
      await fs.writeFile(filePath, content);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`removeUnusedVariables failed for ${filePath}:`, err);
    return false;
  }
}

/**
 * Fix default vs named export mismatches.
 * Strategy: Only fix the import side (safer). Don't modify the module's exports.
 */
async function fixExportMismatch(error: TypeScriptError): Promise<boolean> {
  try {
    const importingFile = error.file;
    const content = await fs.readFile(importingFile, 'utf8');
    const moduleMatch = error.message.match(/Module ['"](.+)['"]/);
    if (!moduleMatch || !moduleMatch[1]) return false;

    const modulePath = moduleMatch[1].replace(/['"]/g, '');

    // Resolve module path relative to the importing file, not cwd
    const importingDir = path.dirname(importingFile);
    const resolvedBase = path.resolve(importingDir, modulePath);

    // Try different extensions to find the actual file
    const extensions = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
    let moduleFile: string | null = null;
    let moduleContent: string | null = null;

    for (const ext of extensions) {
      const candidate = resolvedBase + ext;
      try {
        moduleContent = await fs.readFile(candidate, 'utf8');
        moduleFile = candidate;
        break;
      } catch {
        // Try next extension
      }
    }

    if (!moduleFile || !moduleContent) {
      console.log(`fixExportMismatch: Could not find module file for ${modulePath}`);
      return false;
    }

    // If there's no default export but we have a named export matching the file
    if (!/export\s+default\b/.test(moduleContent)) {
      const fileName = path.basename(moduleFile, path.extname(moduleFile));
      // Handle index files: use parent directory name
      const effectiveName = fileName === 'index'
        ? path.basename(path.dirname(moduleFile))
        : fileName;

      const namedRe = new RegExp(`export\\s+(const|function|class)\\s+${effectiveName}\\b`);
      if (namedRe.test(moduleContent)) {
        // Switch the import to named import (safer than modifying the module)
        const importRe = new RegExp(`import\\s+${effectiveName}\\s+from\\s+['"]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
        const patched = content.replace(importRe, `import { ${effectiveName} } from '${modulePath}'`);
        if (patched !== content) {
          await fs.writeFile(importingFile, patched);
          return true;
        }
      }
    }
    return false;
  } catch (err) {
    console.error('fixExportMismatch error:', err);
    return false;
  }
}

/**
 * Remove duplicate JSX attributes on a given line.
 */
async function removeDuplicateJSXAttributes(filePath: string, lineNum: number): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    if (lineNum < 1 || lineNum > lines.length) return false;

    const line = lines[lineNum - 1];
    if (!line) return false; // Guard for noUncheckedIndexedAccess
    const attrRe = /(\w+)=/g;
    const seen = new Map<string, number>();
    let match: RegExpExecArray | null;

    while ((match = attrRe.exec(line))) {
      const name = match[1] ?? '';
      if (seen.has(name)) {
        const start = match.index;
        // capture value (="..." or ={...})
        const rest = line.slice(start);
        const valMatch = rest.match(/^(=["'][^"']*["']|=[{][^}]*[}])/);
        if (valMatch) {
          const end = start + valMatch[0].length;
          lines[lineNum - 1] = line.slice(0, start) + line.slice(end);
          await fs.writeFile(filePath, lines.join('\n'));
          return true;
        }
      } else {
        seen.set(name, match.index);
      }
    }
    return false;
  } catch (err) {
    console.error('removeDuplicateJSXAttributes error:', err);
    return false;
  }
}

/**
 * Main auto-fix runner: tries each known fix by TS code.
 */
export async function autoFixTypeScriptErrors(projectPath: string, errorOutput: string): Promise<boolean> {
  const errors = parseTypeScriptErrorBlocks(errorOutput);
  let anyFixed = false;

  for (const err of errors) {
    const filePath = path.join(projectPath, err.file);
    try {
      switch (err.code) {
        case 'TS6133': {// Variable is declared but never read
          const varName = err.message.match(/'([^']+)'/)?.[1];
          if (varName && await removeUnusedVariables(filePath, [varName])) {
            console.log(`Removed unused variable ${varName} in ${err.file}`);
            anyFixed = true;
          }
          break;
        }
        case 'TS1192': {
          if (await fixExportMismatch(err)) {
            console.log(`Fixed export mismatch in ${err.file}`);
            anyFixed = true;
          }
          break;
        }
        case 'TS17001': {
          if (await removeDuplicateJSXAttributes(filePath, err.line)) {
            console.log(`Removed duplicate JSX attr in ${err.file}:${err.line}`);
            anyFixed = true;
          }
          break;
        }
        default:
          console.log(`No auto-fix for ${err.code} at ${err.file}:${err.line}`);
      }
    } catch (fixErr) {
      console.error(`Error fixing ${err.code} in ${err.file}:`, fixErr);
    }
  }

  return anyFixed;
}

/**
 * Run `tsc --noEmit` to detect errors, returning parsed blocks instead of throwing.
 */
export async function checkTypeScriptErrors(projectPath: string): Promise<TypeScriptError[]> {
  try {
    execSync('npx tsc --noEmit', { cwd: projectPath, encoding: 'utf8' });
    return [];
  } catch (err: any) {
    const output = (err.stdout || err.stderr || '') as string;
    return parseTypeScriptErrorBlocks(output);
  }
}
