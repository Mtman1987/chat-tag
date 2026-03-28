@echo off
REM =========================================
REM Deploy All 3 Apps to Fly.io
REM =========================================
REM chat-tag-new (web)
REM chat-tag-bot-new (Discord bot)
REM streamweaver-new
REM discord-stream-hub-new
REM =========================================

setlocal enabledelayedexpansion

echo.
echo =========================================
echo Fly.io Multi-App Deployment Script
echo =========================================
echo.

REM Check if Fly CLI is installed
where flyctl >nul 2>&1
if errorlevel 1 (
    echo ERROR: Fly CLI (flyctl) not found. Install from https://fly.io/docs/getting-started/installing-flyctl/
    pause
    exit /b 1
)

echo [1/4] Deploying chat-tag-new (web)...
cd /d "c:\Users\mtman\Desktop\worksInProgress\chat-tag"
if errorlevel 1 (
    echo ERROR: Cannot change to chat-tag directory
    pause
    exit /b 1
)
fly deploy -c fly.toml -a chat-tag-new
if errorlevel 1 (
    echo ERROR: chat-tag-new deployment failed
    goto :ask_continue
)
echo ✓ chat-tag-new deployed successfully
echo.

echo [2/4] Deploying chat-tag-bot-new (Discord bot)...
cd /d "c:\Users\mtman\Desktop\worksInProgress\chat-tag"
if errorlevel 1 (
    echo ERROR: Cannot change to chat-tag directory
    pause
    exit /b 1
)
fly deploy -c fly-bot.toml -a chat-tag-bot-new
if errorlevel 1 (
    echo ERROR: chat-tag-bot-new deployment failed
    goto :ask_continue
)
echo ✓ chat-tag-bot-new deployed successfully
echo.

echo [3/4] Deploying streamweaver-new...
cd /d "C:\Users\mtman\Desktop\streamweaver-main"
if errorlevel 1 (
    echo ERROR: Cannot change to streamweaver directory
    pause
    exit /b 1
)
fly deploy -c fly.toml -a streamweaver-new
if errorlevel 1 (
    echo ERROR: streamweaver-new deployment failed
    goto :ask_continue
)
echo ✓ streamweaver-new deployed successfully
echo.

echo [4/4] Deploying discord-stream-hub-new...
cd /d "c:\Users\mtman\Desktop\finished\DiscordStreamHub"
if errorlevel 1 (
    echo ERROR: Cannot change to DiscordStreamHub directory
    pause
    exit /b 1
)
fly deploy -c fly.toml -a discord-stream-hub-new
if errorlevel 1 (
    echo ERROR: discord-stream-hub-new deployment failed
    goto :ask_continue
)
echo ✓ discord-stream-hub-new deployed successfully
echo.

echo =========================================
echo ✓ ALL DEPLOYMENTS COMPLETE
echo =========================================
echo.
echo Apps deployed:
echo   • https://chat-tag-new.fly.dev
echo   • https://chat-tag-bot-new.fly.dev (bot - no web UI)
echo   • https://streamweaver-new.fly.dev
echo   • https://discord-stream-hub-new.fly.dev
echo.
echo Next: Run smoke tests
echo.
pause
goto :end

:ask_continue
echo.
set /p continue="Deployment failed. Continue anyway? (y/n): "
if /i "!continue!"=="y" (
    goto :end
) else (
    pause
    exit /b 1
)

:end
endlocal
