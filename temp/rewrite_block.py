from pathlib import Path
path = Path("src/app/api/scripts/generate/route.ts")
text = path.read_text(encoding="utf-8")
start = text.index("        addLog(taskId, `📂")
end = text.index("\n\n        // SORA2", start)
replacement = "        addLog(taskId, `Checking response directory: ${backendPath}`)\n\n        let scriptContent = '';\n        if (aiResponseFiles.length > 0) {\n          addLog(taskId, `Response file found: ${aiResponseFiles[0].name}`);\n          const fullContent = fs.readFileSync(aiResponseFiles[0].path, 'utf-8');\n\n          const sectionRegex = new RegExp(`--- ${modelDisplay} ---\\s+([\\s\\S]*?)(?=\\n-{80}|\\n--- |$)`);\n          const modelResponseMatch = fullContent.match(sectionRegex);\n          if (modelResponseMatch && modelResponseMatch[1]) {\n            scriptContent = modelResponseMatch[1].trim();\n            addLog(taskId, `${modelDisplay} section extracted (${scriptContent.length} chars)`);\n          } else {\n            scriptContent = fullContent;\n            addLog(taskId, `Falling back to full response (${scriptContent.length} chars)`);\n          }\n        } else {\n          addLog(taskId, 'Warning: response file not found.');\n        }\n"
new_text = text[:start] + replacement + text[end:]
path.write_text(new_text, encoding="utf-8")
