from pathlib import Path
path = Path("src/app/api/scripts/generate/route.ts")
text = path.read_text(encoding="utf-8")
old = "} catch (error: any) {\\r\\n    console.error('Error creating script task:', error);\\r\\n    try {\\r\\n      const fs = await import('fs');\\r\\n      fs.appendFileSync('debug-api.log', []  + '\\n');\\r\\n    } catch (logError) {\\r\\n      console.error('Failed to write debug log:', logError);\\r\\n    }\\r\\n    return NextResponse.json(\\r\\n      { error: error.message || 'Failed to create script task' },\\r\\n      { status: 500 }\\r\\n    );\\r\\n  }"
if old not in text:
    raise SystemExit('old block not found')
new = """} catch (error: any) {\n    console.error('Error creating script task:', error);\n    try {\n      const logLine = `[${new Date().toISOString()}] ${error?.stack || error}`;\n      await fs.appendFile('debug-api.log', `${logLine}\n`);\n    } catch (logError) {\n      console.error('Failed to write debug log:', logError);\n    }\n    return NextResponse.json(\n      { error: error.message || 'Failed to create script task' },\n      { status: 500 }\n    );\n  }"""
text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
