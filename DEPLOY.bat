@echo off
REM Deploy chat-tag web and bot only

setlocal enabledelayedexpansion

echo Deploying chat-tag to Fly.io...
echo.

where flyctl >nul 2>&1
if errorlevel 1 (
    echo ERROR: Fly CLI not found
    pause
    exit /b 1
)

cd /d "c:\Users\mtman\Desktop\finished\chat-tag"

echo [1/2] Deploying chat-tag-new (web @ 3000)...
call fly deploy -c fly.toml -a chat-tag-new
if errorlevel 1 (
    echo ERROR: chat-tag-new failed
    pause
    exit /b 1
)

echo.
echo [2/2] Deploying chat-tag-bot-new (bot @ 8091)...
call fly deploy -c fly-bot.toml -a chat-tag-bot-new
if errorlevel 1 (
    echo ERROR: chat-tag-bot-new failed
    pause
    exit /b 1
)

echo.
echo ✓ chat-tag deployed successfully!
echo   Web: https://chat-tag-new.fly.dev
echo   Bot: Running (connect to Discord)
pause
