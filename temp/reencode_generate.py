from pathlib import Path
path = Path('src/app/api/scripts/generate/route.ts')
data = path.read_bytes()
text = data.decode('latin-1')
path.write_text(text, encoding='utf-8')
