# Chat Streaming i18n Implementation Plan

## Analysis Summary

### Current State
- **Location**: `/src/messages/[locale]/`
- **Structure**: Namespace-based JSON files (auth.json, builder.json, etc.)
- **Hook Usage**: `useTranslations('chat')` expects `chat.json`
- **Locales Found**: 10 total (en, en-XA, ar, ar-eg, ar-sa, ar-ae, fr, fr-ma, es, de)

### Required Template Keys
Based on Worker API v2 streaming events:

#### Connection & Session
- `CHAT_CONNECTION_ESTABLISHED` - When connected to AI
- `CHAT_SESSION_RESUMED` - When resuming previous conversation

#### Tool Usage (Most Important)
- `CHAT_TOOL_READ_FILE` - Reading a file
- `CHAT_TOOL_SEARCH_CODE` - Searching for code patterns
- `CHAT_TOOL_FIND_FILES` - Finding files by pattern
- `CHAT_TOOL_WRITE_FILE` - Writing to a file
- `CHAT_TOOL_EDIT_FILE` - Editing a file
- `CHAT_TOOL_GENERIC` - Generic tool usage

#### Progress Updates
- `CHAT_ANALYZING` - Analyzing request
- `CHAT_PROCESSING` - Processing
- `CHAT_FINALIZING` - Finalizing response

#### Errors
- `CHAT_ERROR_INSUFFICIENT_BALANCE` - Not enough AI time
- `CHAT_ERROR_TIMEOUT` - Request timeout
- `CHAT_ERROR_GENERAL` - General error

#### Completion
- `CHAT_COMPLETE_SUCCESS` - Response complete

## Implementation Strategy

### 1. English (Base)
Create clear, friendly messages with proper parameter placeholders

### 2. Arabic (RTL Languages)
- **ar**: Standard Arabic
- **ar-eg**: Egyptian dialect
- **ar-sa**: Saudi dialect
- **ar-ae**: UAE dialect
Note: Tool names in English, descriptions in Arabic

### 3. French
- **fr**: Standard French
- **fr-ma**: Moroccan French (may include Arabic terms)

### 4. Spanish & German
Standard translations with appropriate formality

### 5. en-XA (Pseudo-locale)
Testing locale with extended characters

## Translation Guidelines

### Parameter Handling
- Always preserve parameter placeholders: `{file}`, `{pattern}`, `{tool}`, etc.
- For numbers: `{required}`, `{available}` should format as appropriate
- RTL languages: Parameters stay LTR

### Tone
- Friendly and helpful
- Technical but accessible
- Clear error messages with actionable next steps

### Tool Usage Messages
Format: "Action {parameter}..."
- Keep consistent ellipsis to show ongoing action
- Tool names can stay in English for technical clarity

## File Creation Order
1. Create English first (reference implementation)
2. Create Arabic variants (most complex due to RTL)
3. Create Romance languages (French, Spanish)
4. Create German
5. Create pseudo-locale (en-XA) for testing

## Validation Checklist
- [ ] All 15 keys present in each locale
- [ ] Parameters correctly placed
- [ ] RTL languages properly formatted
- [ ] Consistent tone across translations
- [ ] No missing translations
- [ ] File encoding is UTF-8