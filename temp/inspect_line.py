from pathlib import Path
lines = Path('src/app/api/scripts/generate/route.ts').read_text(encoding='utf-8').splitlines()
print(repr(lines[591]))
