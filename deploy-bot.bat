@echo off
echo Deploying chat-tag bot to Fly.io...
fly deploy --config fly-bot.toml --ha=false
if errorlevel 1 (
    echo ERROR: bot deployment failed
    pause
    exit /b 1
)
echo Enforcing exactly one chat-tag bot machine...
fly scale count 1 -a chat-tag-bot-new --yes
if errorlevel 1 (
    echo ERROR: could not scale chat-tag-bot-new to one machine
    pause
    exit /b 1
)
echo.
echo Bot deployment complete!
pause
