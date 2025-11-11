# -*- coding: utf-8 -*-
from pathlib import Path
path = Path('src/app/api/scripts/generate/route.ts')
text = path.read_text(encoding='utf-8')
lines = text.splitlines()
start = None
end = None
for idx, line in enumerate(lines):
    if "let scriptContent = ''" in line:
        start = idx
        break
if start is None:
    raise SystemExit('start not found')
for idx in range(start+1, len(lines)):
    if 'SORA2' in lines[idx] and 'JSON' in lines[idx]:
        end = idx
        break
if end is None:
    raise SystemExit('end not found')
replacement = [
"        let scriptContent = '';",
"        if (aiResponseFiles.length > 0) {",
"          addLog(taskId, \\u2705 \\uc751\\ub2f5 \\ud30c\\uc77c \\ubc1c\\uacac: );",
"          const fullContent = fs.readFileSync(aiResponseFiles[0].path, 'utf-8');",
"",
"          const sectionRegex = new RegExp(---  ---\\s+([\\s\\S]*?)(?=\\n-{80}|\\n--- |$));",
"          const modelResponseMatch = fullContent.match(sectionRegex);",
"          if (modelResponseMatch && modelResponseMatch[1]) {",
"            scriptContent = modelResponseMatch[1].trim();",
"            addLog(taskId, \\u2705  \\ub300\\ub2f5 \\ucd94\\ucd9c \\uc644\\ub8cc ( \\uae00\\uc790));",
"          } else {",
"            scriptContent = fullContent;",
"            addLog(taskId, \\ud83d\\udcc4 \\uc804\\uccb4 \\uc751\\ub2f5 \\ub0b4\\uc6a9\\uc744 \\uc0ac\\uc6a9\\ud569\\ub2c8\\ub2e4 ( \\uae00\\uc790));",
"          }",
"        } else {",
"          addLog(taskId, '\\u26a0\\ufe0f \\uacbd\\uace0: \\uc751\\ub2f5 \\ud30c\\uc77c\\uc744 \\ucc3e\\uc744 \\uc218 \\uc5c6\\uc2b5\\ub2c8\\ub2e4.');",
"        }"
]
new_lines = lines[:start] + replacement + lines[end:]
path.write_text('\n'.join(new_lines) + '\n', encoding='utf-8')
