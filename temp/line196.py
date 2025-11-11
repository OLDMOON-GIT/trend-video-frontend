from pathlib import Path
text = Path('src/app/page.tsx').read_text(encoding='utf-8')
line = text.splitlines()[196]
print(line)
