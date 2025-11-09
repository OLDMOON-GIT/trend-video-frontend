from pathlib import Path
text = Path('src/app/page.tsx').read_text(encoding='utf-8')
line = text.splitlines()[11]
print(line.encode('unicode_escape').decode())
