from pathlib import Path
path = Path('src/lib/content.ts')
text = path.read_text(encoding='utf-8')
old = ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
new = ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
if old not in text:
    raise SystemExit('pattern not found: values placeholders')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
