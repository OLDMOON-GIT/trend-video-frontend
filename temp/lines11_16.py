from pathlib import Path
text = Path('src/app/page.tsx').read_text(encoding='utf-8')
for i in range(11,17):
    print(text.splitlines()[i].encode('unicode_escape').decode())
