from pathlib import Path
path = Path('src/app/page.tsx')
text = path.read_text(encoding='utf-8')
needle = "  const [scriptConfirmData, setScriptConfirmData] = useState<{cost: number; currentCredits: number; title: string; mode: 'generate' | 'generate-api'} | null>(null);"
replacement = "  const [scriptConfirmData, setScriptConfirmData] = useState<{cost: number; currentCredits: number; title: string; mode: 'generate' | 'generate-api'} | null>(null);"
if needle not in text:
    raise SystemExit('needle not found')
text = text.replace(needle, replacement, 1)
path.write_text(text, encoding='utf-8')
