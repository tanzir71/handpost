@echo off
rem Starts Handpost in development mode, driving Microsoft Edge (its own Handpost profile, not your everyday one).
title Handpost (Edge)
cd /d "%~dp0..\.."
where node >nul 2>nul || (echo Node.js 22 or newer is required: https://nodejs.org & pause & exit /b 1)
if not exist node_modules\electron (
  echo Installing dependencies - first run only, this takes a few minutes...
  call npm ci || (echo npm ci failed & pause & exit /b 1)
)
call npm run dev:edge
pause
