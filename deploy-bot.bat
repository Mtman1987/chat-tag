@echo off
echo Deploying chat-tag bot to Fly.io...
fly deploy --config fly-bot.toml
echo.
echo Bot deployment complete!
pause
