# -*- coding: utf-8 -*-
from pathlib import Path
path = Path('src/app/api/scripts/generate/route.ts')
text = path.read_text(encoding='utf-8')
replacements = {
"          addLog(taskId, \\u2705 \\uc751\\ub2f5 \\ud30c\\uc77c \\ubc1c\\uacac: );": "          addLog(taskId, ? 응답 파일 발견: );",
"          const sectionRegex = new RegExp(---  ---\\s+([\\s\\S]*?)(?=\\n-{80}|\\n--- |$));": "          const sectionRegex = new RegExp(---  ---\\s+([\\s\\S]*?)(?=\\n-{80}|\\n--- |$));",
"            addLog(taskId, \\u2705  \\ub300\\ub2f5 \\ucd94\\ucd9c \\uc644\\ub8cc ( \\uae00\\uc790));": "            addLog(taskId, ?  대답 추출 완료 ( 글자));",
"            addLog(taskId, \\ud83d\\udcc4 \\uc804\\uccb4 \\uc751\\ub2f5 \\ub0b4\\uc6a9\\uc744 \\uc0ac\\uc6a9\\ud569\\ub2c8\\ub2e4 ( \\uae00\\uc790));": "            addLog(taskId, ?? 전체 응답 내용을 사용합니다 ( 글자));"
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'pattern not found: {old}')
    text = text.replace(old, new)
path.write_text(text, encoding='utf-8')
