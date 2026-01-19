@echo off
echo Starting Chat Tag Game...
echo.

echo [1/2] Starting Next.js development server...
start "Next.js Dev" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Twitch bot...
start "Twitch Bot" cmd /k "npm run bot"

echo.
echo ========================================
echo Chat Tag Game is starting!
echo ========================================
echo.
echo Next.js:     http://localhost:9002
echo Bot:         Running in separate window
echo.
echo Press any key to stop all services...
pause >nul

taskkill /FI "WINDOWTITLE eq Next.js Dev*" /T /F
taskkill /FI "WINDOWTITLE eq Twitch Bot*" /T /F
