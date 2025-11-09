@echo off
chcp 65001 > nul
echo ===================================
echo 트렌드 비디오 서버 시작
echo ===================================
echo.

echo [1/2] AI 로그인 설정 실행 중...
cd /d "C:\Users\oldmoon\workspace\trend-video-backend\src"
python ai_aggregator\setup_login.py -a chatgpt,gemini,claude

echo.
echo [2/2] Next.js 개발 서버 시작 중...
cd /d "C:\Users\oldmoon\workspace\trend-video-frontend"
npm run dev
pause
