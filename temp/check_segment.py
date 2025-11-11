from pathlib import Path
text = Path('src/app/page.tsx').read_text(encoding='utf-8')
segment = text.splitlines()[196]
print(segment)
print('> | null' in segment)
print('| null>(' in segment)
