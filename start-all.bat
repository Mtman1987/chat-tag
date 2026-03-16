@echo off
echo Starting Chat-Tag Services...
echo.

start "Chat-Tag Dev Server" cmd /k "npm run dev"
echo Waiting for dev server to start...
timeout /t 10 /nobreak >nul

start "Chat-Tag Bot" cmd /k "npm run bot"
timeout /t 2 /nobreak >nul

start "Chat-Tag WebSocket" cmd /k "npm run ws"

echo.
echo All services started in separate windows!
echo Close this window or press any key to exit...
pause >nul
