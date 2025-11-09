from pathlib import Path
text = Path('src/app/page.tsx').read_text(encoding='utf-8')
for i in range(11,16):
    line = text.splitlines()[i]
    print(i+1, repr(line))
