import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

type ScriptModel = 'claude' | 'gpt' | 'gemini';

const MODEL_AGENT_MAP: Record<ScriptModel, { agent: string; label: string }> = {
  claude: { agent: 'claude', label: 'Claude.ai' },
  gpt: { agent: 'chatgpt', label: 'ChatGPT' },
  gemini: { agent: 'gemini', label: 'Gemini' },
};

export async function POST(request: NextRequest) {
  try {
    const { prompt, model } = await request.json();

    console.log('🚀 [AI Auto-Open] 요청 받음');
    console.log('  📝 프롬프트 길이:', prompt?.length || 0, '글자');
    console.log('  🤖 요청된 모델:', model);

    if (!prompt || typeof prompt !== 'string') {
      console.error('❌ 프롬프트가 비어 있습니다');
      return NextResponse.json({ success: false, error: '프롬프트가 비어 있습니다.' }, { status: 400 });
    }

    const normalizedModel: ScriptModel = model && typeof model === 'string'
      ? (['claude', 'gpt', 'gemini'].includes(model) ? model as ScriptModel : 'claude')
      : 'claude';

    console.log('  ✅ 정규화된 모델:', normalizedModel);

    const agentConfig = MODEL_AGENT_MAP[normalizedModel] ?? MODEL_AGENT_MAP['claude'];

    console.log('  📌 Agent 설정:', agentConfig);

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const promptFileName = `prompt_${Date.now()}.txt`;
    const promptFilePath = path.join(backendPath, promptFileName);

    await fs.writeFile(promptFilePath, prompt, 'utf-8');
    console.log('  💾 프롬프트 파일 저장:', promptFilePath);

    const command = `python -m ai_aggregator.main -f ${promptFileName} -a ${agentConfig.agent} --auto-close`;
    console.log('  🐍 Python 명령어:', command);
    console.log('  📂 작업 디렉토리:', backendPath);
    console.log('  🏷️  Agent 파라미터:', agentConfig.agent);

    const startCmd = `start "${agentConfig.label} 자동 실행" cmd /k "cd /d ${backendPath} && ${command}"`;

    const child = spawn('cmd', ['/c', startCmd], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
      shell: true,
    });
    child.unref();

    console.log('  ✅ 프로세스 시작 완료');

    return NextResponse.json({ success: true, message: `${agentConfig.label} 자동 실행을 시작했습니다.` });
  } catch (error: any) {
    console.error('❌ [AI auto-open] error:', error);
    return NextResponse.json({ success: false, error: error?.message || '자동 실행에 실패했습니다.' }, { status: 500 });
  }
}
