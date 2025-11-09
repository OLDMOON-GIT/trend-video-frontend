from pathlib import Path
path = Path('src/app/api/scripts/generate/route.ts')
data = path.read_bytes()
try:
    data.decode('utf-8')
    print('utf-8 ok')
except UnicodeDecodeError as e:
    print('Decode error:', e)
