@echo off
cd /d "C:\Users\aryal\OneDrive\Desktop\Playbook\backend"
:restart
echo [%time%] Starting prisma dev...
npx prisma dev
echo [%time%] Prisma dev exited, restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto restart
