from pathlib import Path
path = Path('src/lib/content.ts')
text = path.read_text(encoding='utf-8')
original = text

import_marker = "import db from './sqlite';\n\n"
snippet = "import db from './sqlite';\n\ntry {\n  db.exec(`ALTER TABLE contents ADD COLUMN model TEXT`);\n} catch (error: any) {\n  if (!error?.message?.includes('duplicate column')) {\n    console.error('Failed to ensure contents.model column:', error);\n  }\n}\n\n"
if "ALTER TABLE contents ADD COLUMN model" not in text:
    if import_marker in text:
        text = text.replace(import_marker, snippet, 1)
    else:
        raise SystemExit('import marker not found')

if '  useClaudeLocal?: boolean;  // 로컬 Claude 사용 여부\n\n  // 로그\n' in text and 'model?: string;' not in text:
    text = text.replace(
        "  useClaudeLocal?: boolean;  // 로컬 Claude 사용 여부\n\n  // 로그\n",
        "  useClaudeLocal?: boolean;  // 로컬 Claude 사용 여부\n  model?: string;\n\n  // 로그\n",
        1
    )

old_options = "    isRegenerated?: boolean;   // 재생성 여부\n  }"
if old_options in text:
    text = text.replace(old_options, "    isRegenerated?: boolean;   // 재생성 여부\n    model?: string;\n  }", 1)

old_insert = "      id, user_id, type, format, title, original_title, content,\n      status, progress, input_tokens, output_tokens, use_claude_local,\n      source_content_id, conversion_type, is_regenerated,\n      created_at, updated_at\n    ) VALUES"
new_insert = "      id, user_id, type, format, title, original_title, content,\n      status, progress, input_tokens, output_tokens, use_claude_local, model,\n      source_content_id, conversion_type, is_regenerated,\n      created_at, updated_at\n    ) VALUES"
text = text.replace(old_insert, new_insert, 1)

old_run = "    options?.tokenUsage?.input_tokens || null,\n    options?.tokenUsage?.output_tokens || null,\n    options?.useClaudeLocal ? 1 : 0,\n    options?.sourceContentId || null,\n"
new_run = "    options?.tokenUsage?.input_tokens || null,\n    options?.tokenUsage?.output_tokens || null,\n    options?.useClaudeLocal ? 1 : 0,\n    options?.model || null,\n    options?.sourceContentId || null,\n"
text = text.replace(old_run, new_run, 1)

old_return = "    progress: options?.content ? 100 : 0,\n    tokenUsage: options?.tokenUsage,\n    useClaudeLocal: options?.useClaudeLocal,\n"
new_return = "    progress: options?.content ? 100 : 0,\n    tokenUsage: options?.tokenUsage,\n    useClaudeLocal: options?.useClaudeLocal,\n    model: options?.model,\n"
text = text.replace(old_return, new_return, 1)

old_row = "    tokenUsage: row.input_tokens || row.output_tokens ? {\n      input_tokens: row.input_tokens || 0,\n      output_tokens: row.output_tokens || 0\n    } : undefined,\n    useClaudeLocal: row.use_claude_local === 1,\n"
new_row = "    tokenUsage: row.input_tokens || row.output_tokens ? {\n      input_tokens: row.input_tokens || 0,\n      output_tokens: row.output_tokens || 0\n    } : undefined,\n    useClaudeLocal: row.use_claude_local === 1,\n    model: row.model || undefined,\n"
text = text.replace(old_row, new_row, 1)

old_pick = "  updates: Partial<Pick<Content,\n    'status' | 'progress' | 'error' | 'content' | 'videoPath' |\n    'thumbnailPath' | 'pid' | 'published' | 'publishedAt' | 'tokenUsage'\n  >>\n)"
new_pick = "  updates: Partial<Pick<Content,\n    'status' | 'progress' | 'error' | 'content' | 'videoPath' |\n    'thumbnailPath' | 'pid' | 'published' | 'publishedAt' | 'tokenUsage' | 'model'\n  >>\n)"
text = text.replace(old_pick, new_pick, 1)

old_token_block = "    }\n  }\n\n  fields.push('updated_at = ?');\n"
model_block = "    }\n  }\n  if (updates.model !== undefined) {\n    fields.push('model = ?');\n    values.push(updates.model);\n  }\n\n  fields.push('updated_at = ?');\n"
text = text.replace(old_token_block, model_block, 1)

if text == original:
    raise SystemExit('no changes made')

path.write_text(text, encoding='utf-8')
