# Code Viewer V2 Architecture Plan

## Executive Summary

This plan addresses the core performance bottleneck: **rendering scales with file size, not viewport**. The solution is virtualization + deferred highlighting, implemented incrementally without breaking existing functionality.

**Key Insight**: The expert's proposal is architecturally sound but includes some overengineering. This plan extracts the high-ROI changes while deferring complexity that isn't needed yet.

---

## Implementation Status (January 2026)

### Completed

| Phase | Feature | Status | Files Created/Modified |
|-------|---------|--------|------------------------|
| 1 | Virtualization Foundation | **DONE** | `virtualized-code-view.tsx`, `use-line-index.ts` |
| 1 | Line Index Hook | **DONE** | `src/hooks/use-line-index.ts` |
| 1 | Threshold switching | **DONE** | `code-content.tsx` (500 line threshold) |
| 2 | RAF-based streaming buffer | **DONE** | `src/lib/streaming-buffer.ts` |
| 2 | Streaming optimization | **DONE** | `use-code-stream.ts` |
| 3 | Idle highlighting | **DONE** | `src/hooks/use-idle-highlight.ts` |
| 4 | Binary search for search | **DONE** | `code-search.tsx` |
| 5 | Diff virtualization | DEFERRED | Not yet needed |

### Key Implementation Discoveries

1. **react-window v2 API**: The project uses react-window v2.2.4 which has a completely different API from v1:
   - `List` instead of `FixedSizeList`
   - `rowComponent` prop instead of children render pattern
   - `useListRef` hook for imperative API
   - `onRowsRendered` callback for tracking visible range

2. **Prism tokenization**: Using prismjs directly for line-by-line tokenization works well. Language imports must be done manually. Note: Line-by-line tokenization won't correctly color multi-line constructs (template literals, block comments) - this is a known limitation.

3. **Streaming buffer optimization**: The RAF-based buffer significantly reduces store updates during streaming (from dozens/sec to max 60/sec).

4. **Size calculation**: Deferred Blob-based size calculation to only run when streaming ends. During streaming, uses string length as approximation.

### Bug Fixes (Post-Review, January 2026)

| Bug | Root Cause | Fix |
|-----|------------|-----|
| Small files UI freezing during streaming | Content was debounced along with highlighting | Content now updates immediately; only highlighting flag is debounced |
| Idle highlight thrashing on scroll | visibleRange in effect deps caused restart + Map cloning was O(n²) | Tokens preserved on scroll; incremental Map updates |
| Only last file gets accurate size | `endStreaming()` only recalculated last file | `setFileStatus()` now recalculates size when transitioning from 'streaming' |
| All streamed files marked as 'new' | `file_end` handler set status to 'new' unconditionally | `setFileStatus()` now auto-computes correct status (new/modified/idle) when transitioning from streaming |
| O(n) lineStarts rebuild on every chunk | `useLineIndex` rebuilt entire array on content change | Now detects appends and uses `updateLineStartsIncremental()` for O(chunk) updates |
| Scroll math mismatch | Non-virtualized mode used 24px line height, virtualized used 21px | Unified `LINE_HEIGHT` constant (21px) in shared types |
| Type drift risk | `SearchMatch` defined in 3 files | Created shared `types.ts` with base types; search extends base |
| NodeJS.Timeout in client code | Used `NodeJS.Timeout` which doesn't exist in browser | Changed to `ReturnType<typeof setTimeout>` |
| O(n) array copy on append | `useLineIndex` cloned 100k+ lineStarts array every chunk | Now mutates in place (content changes trigger re-render via useMemo deps) |
| countLines called twice per render | Both `useStreamingHighlight` and `CodeContent` called O(n) countLines | Memoized once in CodeContent, passed as `isLargeFile` flag to hook |
| split('\n') in useIdleHighlight | Allocated massive array for large files | Now accepts `getLine`/`lineCount` from useLineIndex; caps background work at 20k lines |
| Column indexing mismatch | types.ts said 0-indexed, code computed 1-indexed | Aligned to 1-indexed for human-readability (matches line) |
| Follow mode yanks user away | Any streaming file grabbed focus, even if user reading another file | Now only focuses if no active file or active file IS the streaming file |
| Cache invalidation after append | Captured firstAffectedLine AFTER mutation, missing old last line | Capture oldLineCount BEFORE mutation for correct invalidation |
| Missing aria attributes | react-window v2 ariaAttributes not spread on row element | Spread `{...ariaAttributes}` for accessibility semantics |
| Token type duplication | Token defined in both types.ts and use-idle-highlight.ts | Single source in types.ts; re-exported from hook |

**Code changes for bug fixes:**
- `code-content.tsx`: `useStreamingHighlight` now returns raw content immediately; uses shared `LINE_HEIGHT`; memoized lineCount
- `use-idle-highlight.ts`: Tokens persist across scroll; uses `tokensRef` for incremental updates; accepts getLine/lineCount; caps background work; imports Token from types.ts
- `code-viewer-store.ts`: `setFileStatus` recalculates size AND auto-computes status when exiting streaming; follow mode doesn't yank away
- `use-line-index.ts`: Detects appends and mutates lineStarts in place (no clone); captures oldLineCount before mutation for correct cache invalidation
- `use-code-stream.ts`: `file_end` handler passes 'idle' (status computed by store)
- `types.ts`: Single source of truth for `SearchMatch`, `Token`, and `LINE_HEIGHT`; column documented as 1-indexed
- `virtualized-code-view.tsx`: Passes getLine/lineCount to useIdleHighlight; spreads ariaAttributes for accessibility

### Files Changed

**New files:**
- `src/hooks/use-line-index.ts` - Line index with O(log n) offset-to-line
- `src/hooks/use-idle-highlight.ts` - requestIdleCallback-based syntax highlighting
- `src/lib/streaming-buffer.ts` - RAF-based chunk buffering
- `src/components/builder/code-viewer/virtualized-code-view.tsx` - react-window based view
- `src/components/builder/code-viewer/types.ts` - Shared types (SearchMatch, Token, LINE_HEIGHT)

**Modified files:**
- `src/components/builder/code-viewer/code-content.tsx` - Added threshold switching; uses shared types
- `src/components/builder/code-viewer/code-search.tsx` - Binary search optimization; extends shared SearchMatch
- `src/hooks/use-code-stream.ts` - Integrated streaming buffer; fixed file_end status
- `src/store/code-viewer-store.ts` - Optimized size calculation; auto-computes status on streaming exit

---

## Problem Analysis

### Current Pain Points

| Issue | Root Cause | Impact |
|-------|------------|--------|
| Large files lag | Rendering all lines as DOM nodes | High |
| Streaming jank | Re-highlighting on every chunk | High |
| Search slow on big files | O(n) split per match | Medium |
| Memory on closed tabs | Content cleared, can't ZIP | Low |

### What's Already Good

- Trailing debounce for streaming (just fixed in Phase 1)
- `useDeferredValue` for search (just added in Phase 2)
- Follow mode toggle working
- RTL handling correct (`dir="ltr"` + `unicode-bidi: isolate`)

---

## V2 Architecture

### Core Principles

1. **Viewport-based rendering** - Only render visible lines (react-window)
2. **Plain text during streaming** - Never tokenize while chunks arrive
3. **Highlight on idle** - Background tokenization after streaming ends
4. **Indexed line lookup** - O(log n) offset→line via `lineStarts` array

### Data Model

```typescript
interface FileModelV2 {
  path: string
  language: string

  // Authoritative content (never split for rendering)
  text: string

  // Line index for O(1) line access, O(log n) offset→line
  lineStarts: number[]  // Start offset of each line
  lineCount: number

  // Streaming state
  isStreaming: boolean

  // Highlighting (only for visible + cached lines)
  highlightState: 'plain' | 'pending' | 'ready'
  tokensByLine: Map<number, Token[]>  // Sparse cache

  // Search
  matches: SearchMatch[]
  currentMatchIndex: number
}
```

**Key insight**: `lineStarts` is the backbone. Built once, updated incrementally during streaming, enables:
- O(1) line content access: `text.slice(lineStarts[i], lineStarts[i+1] - 1)`
- O(log n) offset→line: binary search
- Exact scroll positioning (no `lineHeight * 24` guessing)

---

## Implementation Phases

### Phase 1: Virtualization Foundation (Highest Impact)

**Goal**: Replace DOM-heavy rendering with react-window

**Changes**:

1. **New `VirtualizedCodeView` component**
   ```typescript
   // Uses react-window FixedSizeList
   // Renders only visible lines + small buffer
   // Fixed row height (no wrapping) - horizontal scroll for long lines
   ```

2. **`useLineIndex` hook**
   ```typescript
   // Builds and maintains lineStarts array
   // Provides getLine(index), getLineCount(), offsetToLine(offset)
   // Updates incrementally during streaming
   ```

3. **`LineRow` component (memoized)**
   ```typescript
   // Renders: line number + line content
   // Plain text by default
   // Accepts optional tokens for highlighted rendering
   ```

**Files to create**:
- `src/components/builder/code-viewer/virtualized-code-view.tsx`
- `src/hooks/use-line-index.ts`

**Migration**:
- Keep existing `CodeContent` for small files (<500 lines)
- Use `VirtualizedCodeView` for large files
- Feature flag: `ENABLE_VIRTUALIZED_CODE_VIEW`

**Expected impact**: 10x+ improvement for files >1000 lines

---

### Phase 2: Streaming Optimization

**Goal**: Never block UI during code generation

**Changes**:

1. **Chunk buffering with RAF flush**
   ```typescript
   function appendChunk(chunk: string) {
     buffer += chunk
     if (!flushScheduled) {
       flushScheduled = true
       requestAnimationFrame(flushBuffer)
     }
   }

   function flushBuffer() {
     // Append buffer to text
     // Update lineStarts incrementally (scan only new content)
     // Never split full text
     flushScheduled = false
   }
   ```

2. **Incremental `lineStarts` update**
   ```typescript
   // Only scan the new chunk for newlines
   // Push new line start offsets
   // O(chunk.length), not O(text.length)
   ```

3. **Follow mode with virtualization**
   ```typescript
   // listRef.current.scrollToItem(lineCount - 1)
   // Exact positioning, no guessing
   ```

**Files to modify**:
- `src/hooks/use-line-index.ts` (add incremental update)
- `src/store/code-viewer-store.ts` (new streaming model)

---

### Phase 3: Idle Highlighting

**Goal**: Syntax highlighting without blocking

**Strategy**:
- **During streaming**: Always plain text
- **After streaming ends**: Queue highlighting
- **Priority**: Visible lines first, then buffer, then rest
- **Cancellation**: New edits/streaming cancels pending highlight

**Changes**:

1. **`useIdleHighlight` hook**
   ```typescript
   // Triggers after streaming ends + idle time
   // Uses requestIdleCallback (with setTimeout fallback)
   // Tokenizes visible range first
   // Caches results in tokensByLine Map
   ```

2. **Prism tokenization (keep existing)**
   ```typescript
   // Don't need Shiki - Prism is fast enough for line-by-line
   // Tokenize one line at a time, not whole file
   // Can move to worker later if needed (Phase 4)
   ```

3. **Token rendering in `LineRow`**
   ```typescript
   // If tokens exist for line: render spans
   // Else: render plain text
   // Seamless visual transition
   ```

**Files to create**:
- `src/hooks/use-idle-highlight.ts`

**Files to modify**:
- `src/components/builder/code-viewer/virtualized-code-view.tsx`

---

### Phase 4: Search Optimization

**Goal**: Fast search even on large files

**Changes**:

1. **Binary search for offset→line**
   ```typescript
   function offsetToLine(lineStarts: number[], offset: number): number {
     // Binary search - O(log n) instead of O(n)
     let lo = 0, hi = lineStarts.length - 1
     while (lo < hi) {
       const mid = (lo + hi + 1) >> 1
       if (lineStarts[mid] <= offset) lo = mid
       else hi = mid - 1
     }
     return lo
   }
   ```

2. **Streaming search results**
   ```typescript
   // Find matches in chunks, yield to UI between chunks
   // Don't compute all matches upfront for huge files
   // "Find next" is often enough
   ```

3. **Worker search (optional, for very large files)**
   ```typescript
   // Only if we see issues with files >50k lines
   // Move regex exec to worker
   // Return match offsets, convert to line/col on main thread
   ```

**Files to modify**:
- `src/components/builder/code-viewer/code-search.tsx`
- `src/hooks/use-line-index.ts` (add offsetToLine)

---

### Phase 5: Diff Virtualization (If Needed)

**Goal**: Handle large diffs without freezing

**Only implement if we see performance issues with diffs >10k lines**

**Changes**:
- Virtualize diff view using same react-window pattern
- Consider worker for diff computation on very large inputs

**Deferred because**: Current diff implementation is adequate for typical use cases

---

## What We're NOT Doing (Intentional)

| Suggestion | Why Skip |
|------------|----------|
| Shiki instead of Prism | Adds complexity, Prism is sufficient |
| FlexSearch / trigram indexing | Overkill, binary search is enough |
| Full worker-based highlighting | Premature, try idle callback first |
| LRU cache with size limits | Start simple, optimize if needed |
| VariableSizeList for wrapping | Too complex, horizontal scroll is fine for code |
| Server-side ZIP endpoint | Out of scope, current client-side is adequate |
| File prefetch on hover | Nice-to-have, not core architecture |

---

## Component Architecture

```
GeneratedCodeViewer
├── FileTreePanel (unchanged)
├── CodeDisplayPanel
│   ├── CodeToolbar (copy, download, search, view mode)
│   ├── CodeSearchBar (with binary search optimization)
│   ├── FileTabs (unchanged)
│   └── CodeViewport (NEW - switching component)
│       ├── CodeContent (existing, for small files <500 lines)
│       └── VirtualizedCodeView (NEW, for large files)
│           └── LineRow (memoized, plain or tokenized)
└── DiffViewport (virtualized if needed)
```

---

## Migration Strategy

### Step 1: Add without breaking
- Create new components alongside existing
- Feature flag controls which renders
- Test with real files of various sizes

### Step 2: Gradual rollout
- Enable for files >500 lines first
- Monitor performance metrics
- Fix edge cases

### Step 3: Full migration
- Lower threshold or remove flag
- Keep CodeContent for very small files (faster for simple cases)
- Remove deprecated code

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to render 10k line file | ~2000ms | <100ms |
| Streaming frame rate | Varies/janky | Stable 60fps |
| Search on 10k lines | ~500ms | <50ms |
| Memory for closed tabs | 0 (content cleared) | LRU cached |

---

## Scope: Frontend Only

**This plan requires no worker changes.** The performance issues are entirely in frontend rendering, not in code generation or streaming.

The current SSE streaming protocol is adequate:
- Worker sends: `file_start` → `content` (chunks) → `file_end` → `complete`
- Frontend receives chunks and processes them

The v2 optimizations are about **how the frontend handles those chunks**:
- Buffering with RAF flush (not re-rendering per chunk)
- Incremental `lineStarts` update (not splitting full text)
- Virtualized rendering (not creating thousands of DOM nodes)

### Optional Future Worker Optimizations (Not Required)

| Change | Benefit | When to Consider |
|--------|---------|------------------|
| Line-aware chunking | Cleaner line boundary handling | If we see edge cases with partial lines |
| Batch larger chunks | Fewer SSE events | If event overhead becomes measurable |
| Send line count in `file_end` | Immediate total for progress UI | Nice-to-have, not blocking |

---

## Dependencies

```json
{
  "react-window": "^2.2.4"  // Note: v2 has a completely different API from v1
}
```

Already have:
- `prismjs` (transitive dep from react-syntax-highlighter, used directly for line tokenization)
- `react-syntax-highlighter` (for small files, fallback rendering)
- React 18+ (for `useDeferredValue`, `useTransition`)

---

## Timeline Estimate

| Phase | Complexity | Effort |
|-------|------------|--------|
| Phase 1: Virtualization | Medium | Core change |
| Phase 2: Streaming optimization | Low | Builds on Phase 1 |
| Phase 3: Idle highlighting | Medium | New hook + integration |
| Phase 4: Search optimization | Low | Algorithm change |
| Phase 5: Diff virtualization | Medium | Only if needed |

**Recommendation**: Implement Phases 1-3 together for maximum impact. Phase 4 is quick follow-up. Phase 5 deferred.

---

## Open Questions (Resolved)

1. **Line wrapping**: ✅ Decided: Horizontal scroll (code-editor-like). Implemented with `whitespace-pre`.
2. **Minimum file size for virtualization**: ✅ Decided: 500 lines. Below threshold uses traditional SyntaxHighlighter.
3. **Token cache size**: ✅ Implemented: Visible range + 50 line buffer. Prioritizes visible lines.
4. **Worker threshold**: Deferred. Binary search optimization makes this less urgent.

---

## Future Improvements

These are potential enhancements discovered during implementation and expert review:

### High Priority (If Performance Issues Arise)

1. **Chunks array for streaming**: Store chunks array per file during streaming, `.join('')` on file_end. Avoids O(n²) string concatenation for very large outputs.

2. **Full-file tokenization for accuracy**: Line-by-line tokenization breaks multi-line constructs (template literals, block comments). Could tokenize full content once after streaming ends, then slice per-line tokens.

### Medium Priority

3. **~~Incremental lineStarts during streaming~~**: ✅ DONE - `useLineIndex` now detects appends and uses `updateLineStartsIncremental()` for O(chunk) updates.

4. **Search match index clamping**: Instead of resetting to 0 on matches change, clamp to valid range to preserve selection when possible.

5. **~~LINE_HEIGHT validation~~**: ✅ DONE - Unified `LINE_HEIGHT` constant (21px) in shared `types.ts`, used by all components.

6. **Avoid split('\n') in useIdleHighlight**: For very large files (50k-200k lines), `content.split('\n')` allocates a giant array, undermining virtualization wins. Could tokenize using `getLine()` from useLineIndex instead. Currently capped at visible+buffer, so impact is limited.

### Lower Priority

7. **More language support**: The idle highlight hook imports common languages but could dynamically load more as needed.

8. **Line wrapping option**: Some users may prefer wrapped lines. Would need `VariableSizeList` instead of fixed height.

9. **Selection handling**: Multi-line selection across virtualized rows may need special handling.

10. **Minimap**: VS Code-style minimap could use the lineStarts index for efficient rendering.

11. **Highlight status UX**: `highlightStatus` is computed but not exposed to UI. Could show "Highlighting..." indicator.

---

## References

- [react-window documentation](https://react-window.vercel.app/)
- [Virtualization in VS Code](https://code.visualstudio.com/blogs/2017/02/08/syntax-highlighting-optimizations)
- [requestIdleCallback MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
