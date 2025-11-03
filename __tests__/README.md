# Regression Tests for Trend Video Frontend

## Overview

Frontend regression tests verify critical business logic:
- **File Sorting Logic**: Image and video sequence detection and ordering
- **JSON Title Extraction**: Parse and sanitize video titles from JSON/TXT files

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

## When to Update Tests

From `DEVELOPMENT_GUIDE.md`:

> **Frontend regression tests should be updated when:**
> 1. File sorting logic changes
> 2. Title extraction/sanitization logic changes
> 3. New sequence number patterns are added
> 4. Critical bugs are fixed (add test to prevent regression)

**DO NOT** update tests for:
- UI/styling changes
- Non-logic code refactoring
- API endpoint URL changes (unless logic changes)

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
