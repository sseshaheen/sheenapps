# Arabic Optimization Plan

## Overview

This document tracks Arabic-specific optimizations across the SheenApps platform. Arabic is a first-class language in our system (alongside English), representing a significant portion of our user base across Egypt, Saudi Arabia, and UAE.

**Status**: Living document - updated as optimizations are identified and implemented.

---

## Current State

### ✅ Implemented

- **RTL Layout Support**: Full RTL support in Next.js frontend with proper directionality
- **Locale System**: BCP-47 format with regional variants (ar-EG, ar-SA, ar-AE)
- **i18n Architecture**: 9-locale system with Arabic as core language
- **Font Rendering**: Cairo font family optimized for Arabic text
- **Input/Output**: Full Arabic text support in chat, code generation, and UI

### ⚠️ Known Limitations

#### 1. Full-Text Search (FTS) Quality

**Current Implementation** (as of Round 18):
```sql
-- Location: src/services/enhancedChatService.ts (search function)
SELECT
  pcl.id,
  pcl.seq,
  pcl.message_text,
  pcl.actor_type,
  pcl.mode,
  pcl.created_at,
  ts_rank(
    to_tsvector('simple', unaccent(pcl.message_text)),
    plainto_tsquery('simple', unaccent($1))
  ) as rank
FROM project_chat_log_minimal pcl
WHERE
  pcl.project_id = $2
  AND to_tsvector('simple', unaccent(pcl.message_text)) @@ plainto_tsquery('simple', unaccent($1))
ORDER BY rank DESC, pcl.seq DESC
LIMIT $3;
```

**Expert Assessment** (2026-01-13):
> "This is okay for Latin-ish languages, but Arabic FTS with simple is usually mediocre (tokenization/stemming issues). Not a blocker, but don't expect magic search relevance for Arabic without extra work (trigram + normalization, or a dedicated Arabic config, or external search)."

**Why This Matters**:
- **Tokenization**: Arabic words change form based on grammar (الكتاب، كتاب، كتابي)
- **Stemming**: Root-based language requires proper stemming (كَتَبَ → ك-ت-ب)
- **Diacritics**: Harakat marks affect meaning but often omitted in casual text
- **Search Expectations**: Users expect Google-quality Arabic search

**Impact**:
- ✅ Search works for exact/near-exact matches
- ⚠️ Poor relevance ranking for morphological variants
- ⚠️ Misses related words with same root
- ⚠️ Diacritic handling inconsistent

---

## Optimization Roadmap

### Phase 1: Low-Hanging Fruit (1-2 weeks effort)

#### 1.1 PostgreSQL Trigram Extension
**Effort**: Low | **Impact**: Medium

```sql
-- Enable pg_trgm for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index for trigram search
CREATE INDEX idx_chat_messages_trgm
ON project_chat_log_minimal
USING gin (message_text gin_trgm_ops);

-- Updated search query with trigram fallback
SELECT
  pcl.*,
  GREATEST(
    ts_rank(to_tsvector('simple', unaccent(pcl.message_text)),
            plainto_tsquery('simple', unaccent($1))),
    similarity(pcl.message_text, $1)
  ) as rank
FROM project_chat_log_minimal pcl
WHERE
  pcl.project_id = $2
  AND (
    to_tsvector('simple', unaccent(pcl.message_text)) @@ plainto_tsquery('simple', unaccent($1))
    OR pcl.message_text % $1  -- Trigram similarity operator
  )
ORDER BY rank DESC, pcl.seq DESC;
```

**Benefits**:
- Handles typos and morphological variations better
- Works for short queries (trigrams excel at 3+ char substrings)
- No external dependencies

**Limitations**:
- Still doesn't understand Arabic roots
- Higher index size (~2-3x larger)
- Slower on very large datasets

---

#### 1.2 Arabic Text Normalization Layer
**Effort**: Medium | **Impact**: Medium

**Problem**: Arabic text variations reduce search accuracy
- Hamza variants: أ، إ، آ → ا
- Alef Maqsura: ى → ي
- Teh Marbuta: ة → ه
- Remove diacritics: مَكْتُوب → مكتوب

**Implementation**:
```typescript
// src/utils/arabicNormalization.ts
export function normalizeArabicText(text: string): string {
  return text
    // Remove diacritics (harakat)
    .replace(/[\u064B-\u0652]/g, '')
    // Normalize Hamza
    .replace(/[أإآ]/g, 'ا')
    // Normalize Yeh
    .replace(/ى/g, 'ي')
    // Normalize Teh Marbuta (context-dependent)
    .replace(/ة/g, 'ه');
}

// Apply at ingestion and search time
const normalizedMessage = normalizeArabicText(message.text);
const normalizedQuery = normalizeArabicText(searchQuery);
```

**Benefits**:
- Unifies common Arabic spelling variations
- Works with existing FTS infrastructure
- Minimal performance impact

**Integration Points**:
- `enhancedChatService.ts`: Normalize at insert and search
- `unifiedChatService.ts`: Normalize plan/build messages
- Frontend: Optional display of original vs normalized

---

### Phase 2: Medium-Effort Wins (2-4 weeks)

#### 2.1 PostgreSQL Arabic Text Search Configuration
**Effort**: Medium | **Impact**: High

```sql
-- Create custom Arabic text search configuration
CREATE TEXT SEARCH CONFIGURATION arabic_simple (COPY = simple);

-- Or use built-in Arabic config (if available in your PG version)
-- Postgres 12+ includes basic Arabic support
CREATE TEXT SEARCH CONFIGURATION arabic_standard (COPY = arabic);

-- Test different configs
SELECT to_tsvector('arabic_standard', 'الكتاب المفتوح');
-- Output: 'الكتاب':1 'المفتوح':2 (with some stemming)
```

**Research Needed**:
- [ ] Audit PostgreSQL version across environments
- [ ] Test built-in Arabic config quality
- [ ] Benchmark performance vs simple config
- [ ] Evaluate false positive rate

**Migration Strategy**:
1. Add new index with Arabic config alongside existing
2. A/B test search quality (log relevance feedback)
3. Gradual rollout with feature flag
4. Remove old index after validation

---

#### 2.2 Arabic-Specific Search UI Improvements
**Effort**: Medium | **Impact**: Medium (UX)

**Enhancements**:
- **Search suggestions**: Show common completions for Arabic queries
- **Did you mean?**: Suggest normalized variants
- **Filter by diacritics**: Toggle "exact match" vs "fuzzy"
- **Root-based grouping**: "Show all messages with root ك-ت-ب"

**Implementation**:
```typescript
// Frontend: SearchBar component with Arabic awareness
interface SearchOptions {
  normalize: boolean;      // Apply normalization
  includeDiacritics: boolean; // Exact diacritic matching
  rootBased: boolean;      // Experimental: root search
}
```

---

### Phase 3: Advanced Solutions (4-8 weeks)

#### 3.1 External Search Engine Integration
**Effort**: High | **Impact**: Very High

**Options Evaluated**:

**Option A: Elasticsearch with Arabic Analyzer**
```json
{
  "settings": {
    "analysis": {
      "analyzer": {
        "arabic_analyzer": {
          "type": "arabic",
          "stopwords": "_arabic_"
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "message_text": {
        "type": "text",
        "analyzer": "arabic_analyzer",
        "fields": {
          "exact": { "type": "keyword" }
        }
      }
    }
  }
}
```

**Pros**:
- Industry-standard Arabic stemming/tokenization
- Handles morphology and roots
- Sub-100ms search latency
- Rich query DSL

**Cons**:
- Additional infrastructure (cost, ops complexity)
- Sync lag between Postgres and ES
- Need to maintain index consistency

---

**Option B: Typesense (Simpler Alternative)**
```javascript
// Typesense collection with Arabic support
{
  name: 'chat_messages',
  fields: [
    { name: 'message_text', type: 'string', locale: 'ar' },
    { name: 'project_id', type: 'string', facet: true }
  ]
}
```

**Pros**:
- Simpler ops than Elasticsearch
- Built-in Arabic locale support
- Typo tolerance out of the box
- Lower resource usage

**Cons**:
- Less mature Arabic support than ES
- Smaller community for Arabic-specific issues

---

**Option C: Hybrid (Postgres + External for Large Projects)**
- Use Postgres FTS for projects <1000 messages
- Promote to external search for high-volume projects
- Best of both worlds (cost vs quality)

---

#### 3.2 Custom Arabic Root Extractor
**Effort**: Very High | **Impact**: High

**Concept**: Pre-compute Arabic roots at ingestion

```typescript
// Hypothetical implementation
import { extractArabicRoot } from 'arabic-nlp-library'; // e.g., farasa, camel-tools

interface Message {
  text: string;
  normalized_text: string;
  roots: string[]; // ['ك-ت-ب', 'ف-ت-ح']
}

// Search by root
SELECT * FROM messages
WHERE project_id = $1
  AND roots && ARRAY[$2]; -- Array overlap operator
```

**Challenges**:
- Root extraction is computationally expensive
- Requires Arabic NLP library (Python or native)
- Ambiguous roots (multiple possible roots per word)
- Storage overhead

**Recommendation**: Only pursue if external search is not viable

---

## Testing & Validation

### Search Quality Metrics

**KPIs to Track**:
- **Mean Reciprocal Rank (MRR)**: Position of first relevant result
- **Precision@5**: Relevant results in top 5
- **User engagement**: Click-through rate on search results
- **Arabic vs English**: Compare quality metrics by language

**Test Corpus**:
```
Arabic test queries:
- "كيف أنشئ صفحة رئيسية" (How do I create homepage)
- "تغيير اللون الأزرق" (Change blue color)
- "خطأ في التحميل" (Loading error)
- "إضافة زر جديد" (Add new button)
```

**Baseline**: Current simple + unaccent (Round 18)
**Target**: 30% improvement in MRR for Arabic queries

---

## Related Optimizations

### Code Generation
- [ ] Audit Claude's Arabic→code quality (comments in Arabic?)
- [ ] Test bilingual projects (Arabic UI, English code)

### Error Messages
- [ ] Ensure build errors properly translated
- [ ] Arabic-friendly stack traces (direction issues?)

### Performance
- [ ] Profile Arabic text rendering in chat
- [ ] Optimize font loading (subset Cairo font)

### Accessibility
- [ ] Screen reader testing with Arabic content
- [ ] RTL keyboard shortcuts

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-13 | Documented current FTS limitations | Expert identified search quality gap; need roadmap |
| TBD | Phase 1 go/no-go | Based on user feedback on search quality |

---

## References

### PostgreSQL FTS
- [PostgreSQL Full Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [pg_trgm Documentation](https://www.postgresql.org/docs/current/pgtrgm.html)
- [Arabic Text Search Configuration](https://www.postgresql.org/docs/current/textsearch-dictionaries.html)

### Arabic NLP
- [Farasa: Arabic NLP Toolkit](http://qatsdemo.cloudapp.net/farasa/)
- [CAMeL Tools: Arabic NLP](https://github.com/CAMeL-Lab/camel_tools)
- [Arabic Root Extraction Algorithms](https://aclanthology.org/W19-4608.pdf)

### Search Engines
- [Elasticsearch Arabic Analyzer](https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis-lang-analyzer.html#arabic-analyzer)
- [Typesense Internationalization](https://typesense.org/docs/0.24.0/api/search.html#locale)

---

*Document created: 2026-01-13*
*Last updated: 2026-01-13*
*Owner: Engineering Team*
*Status: Planning - No active work*
