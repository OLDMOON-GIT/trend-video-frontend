# Regression Tests for Trend Video Frontend

## Overview

Frontend regression tests verify critical business logic:
- **File Sorting Logic**: Image and video sequence detection and ordering
- **JSON Title Extraction**: Parse and sanitize video titles from JSON/TXT files
- **Video Format Selection**: Ensure correct format (롱폼/숏폼/SORA2/상품) is transmitted and processed
- **AI Model Selection**: Ensure correct AI model (ChatGPT/Gemini/Claude) is selected and executed

## Test Structure

```
__tests__/
├── api/
│   ├── file-sorting.test.ts          # File sorting algorithms
│   └── json-title-extraction.test.ts # Title parsing and sanitization
├── test_data/                         # Test data files (if needed)
└── README.md                          # This file
```

## Prerequisites

1. **Node.js dependencies**:
   ```bash
   npm install
   ```

2. **Jest** (should already be configured in Next.js)

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific test file
```bash
npm test file-sorting
npm test json-title-extraction
npm test videoFormat
npm test aiModelSelection
```

### Run with coverage
```bash
npm test -- --coverage
```

### Watch mode (for development)
```bash
npm test -- --watch
```

## Test Categories

### 1. File Sorting Logic (`file-sorting.test.ts`)

Tests the sorting algorithms used in API routes:

**Image Sorting** (from `generate-video-upload/route.ts`):
- Sequence number extraction patterns:
  - Start with number: `1.jpg`, `02.png`
  - Underscore pattern: `image_01.jpg`, `scene_123.png`
  - Dash pattern: `image-01.jpg`, `scene-02.png`
  - Parentheses: `Image_fx (47).jpg` (without random IDs)
- Ignores random IDs: `Whisk_2ea51d84...`
- Falls back to `lastModified` when no sequence number

**Video Sorting** (from `video-merge/route.ts`):
- 3-digit sequence patterns: `scene_001.mp4`, `video_002.mp4`
- Dash patterns: `scene-001.mp4`
- Falls back to `lastModified` when no sequence number

**Success Criteria**:
- All sorting tests pass
- Edge cases handled correctly
- No regression in sorting behavior

### 2. JSON Title Extraction (`json-title-extraction.test.ts`)

Tests title parsing from JSON/TXT files:

**Title Extraction**:
- Parse JSON with `title` field
- Handle markdown code blocks (```json```)
- Return null for invalid/missing titles

**Safe Filename Generation**:
- Remove Windows forbidden characters: `< > : " / \ | ? *`
- Trim whitespace
- Limit length to 100 characters
- Preserve Unicode (Korean, Japanese, Spanish, etc.)

**Success Criteria**:
- All title extraction tests pass
- Filenames are Windows-compatible
- No data loss for valid characters

### 3. Video Format Selection (`videoFormat.test.ts`)

Tests video format parameter transmission and processing:

**Format Selection**:
- 🎬 롱폼 (Longform): `type: "longform"`
- 📱 숏폼 (Shortform): `type: "shortform"`
- 🎥 SORA2: `type: "sora2"`
- 🛍️ 상품 (Product): `type: "product"`

**API Request Validation**:
- Frontend sends correct `type` parameter (not `format`)
- Server handles both `type` and `videoFormat` for backward compatibility
- Database stores correct type value

**Prompt File Mapping**:
- Shortform → `prompt_shortform.txt`
- Longform → `prompt_longform.txt`
- SORA2 → `prompt_sora2.txt`

**Success Criteria**:
- All 14 format selection tests pass
- No regression: shortform doesn't save as longform
- Edge cases (undefined, null, invalid) default to longform

### 4. AI Model Selection (`aiModelSelection.test.ts`)

Tests AI model parameter transmission and Python agent selection:

**Model Selection**:
- 💬 ChatGPT: `scriptModel: "gpt"` → Python agent: `chatgpt`
- ✨ Gemini: `scriptModel: "gemini"` → Python agent: `gemini`
- 🤖 Claude: `scriptModel: "claude"` → Python agent: `claude`

**Parameter Flow**:
1. Frontend: User selects model → `scriptModel` parameter
2. API Route: Maps `scriptModel` to agent name using `MODEL_TO_AGENT`
3. Python: Receives `-a [agent]` argument
4. UnifiedAgent: Initializes with correct AI configuration

**Critical Bug Fix**:
- ❌ Previous: Python args hardcoded `-a 'claude'` → Gemini selection opened Claude
- ✅ Fixed: Python args use dynamic `agentName` → Correct AI opens

**Success Criteria**:
- All 27 AI model tests pass
- All 3 API call sites include `scriptModel` parameter
- All format+model combinations (9 total) work correctly
- Edge cases (undefined, invalid) default to claude

## When to Update Tests

From `DEVELOPMENT_GUIDE.md`:

> **Frontend regression tests should be updated when:**
> 1. File sorting logic changes
> 2. Title extraction/sanitization logic changes
> 3. New sequence number patterns are added
> 4. Video format selection logic changes
> 5. AI model selection/mapping logic changes
> 6. Critical bugs are fixed (add test to prevent regression)

**DO NOT** update tests for:
- UI/styling changes
- Non-logic code refactoring
- API endpoint URL changes (unless logic changes)

**CRITICAL**: Always update tests when:
- Adding new video formats (e.g., adding 상품/product format)
- Adding new AI models (e.g., adding Grok or GPT-4)
- Changing parameter names (e.g., `format` → `type`, `model` → `scriptModel`)
- Modifying MODEL_TO_AGENT mapping in `/api/scripts/generate/route.ts`

## Test Data

Test data is embedded in test files as mock objects. No external files needed for unit tests.

For integration tests (if added later):
- Place test files in `__tests__/test_data/`
- Use small files (< 1MB)
- Document expected behavior in test comments

## Debugging Failed Tests

### Check test output
```bash
npm test -- --verbose
```

### Run single test
```bash
npm test -- -t "should extract number from start of filename"
```

### Debug with Node
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Common Issues

1. **Tests fail after sorting logic change**:
   - Review the change in `generate-video-upload/route.ts` or `video-merge/route.ts`
   - Update test expectations if change is intentional
   - Add new test cases for new behavior

2. **Title extraction fails**:
   - Check if JSON format changed
   - Verify forbidden character list is up to date
   - Test with actual user data to find edge cases

3. **Jest configuration issues**:
   - Ensure `jest.config.js` includes `__tests__` directory
   - Check TypeScript configuration for test files

## Coverage Goals

- **File Sorting**: 100% coverage (critical business logic)
- **Title Extraction**: 100% coverage (critical business logic)
- **Overall**: Aim for >90% coverage on logic-heavy code

## Notes

- Tests are fast (unit tests, no I/O)
- Run tests before committing changes
- CI/CD should run these tests automatically
- Keep test data minimal and focused
