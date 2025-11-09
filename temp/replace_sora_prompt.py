from pathlib import Path
path = Path("src/app/api/scripts/generate/route.ts")
text = path.read_text(encoding="utf-8")
marker = "console.warn('⚠️ SORA2 프롬프트 파일을 찾을 수 없어 기본 프롬프트 사용');"
marker_index = text.index(marker)
ret_start = text.index('return `', marker_index)
ret_end = text.index('`;', ret_start) + 2
replacement = "return `You are a SORA2 video prompt specialist.\n\nPlease craft a cinematic prompt for the following title:\nTitle: {title}\n\nGuidelines:\n1. Describe the scene, lighting, colors, and key details vividly.\n2. Keep it as one smooth 8-second shot.\n3. Write in English with a cinematic tone.\n4. Mention camera movement and atmosphere clearly.\n5. Limit the prompt to roughly 120-150 words.\n\nExample format:\n\"A cinematic shot of [subject], [visual detail], [lighting and color], [camera move], [mood and emotion].\"\n\nReturn only the final SORA2 prompt.`;"
text = text[:ret_start] + replacement + text[ret_end:]
path.write_text(text, encoding="utf-8")
