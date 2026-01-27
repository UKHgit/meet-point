@echo off
REM Navigate to your project folder
cd /d "C:\Users\bimsa\වැඩතලය\web"

REM Stage all changes
git add .

REM Commit with a message
git commit -m "Update all local edits"

REM Push to the main branch
git push origin main

pause
