from pathlib import Path
path = Path('src/app/page.tsx')
data = path.read_bytes()
print('len', len(data))
print(data[:20])
print(data[420:460])
