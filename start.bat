@echo off
title VORTX Launcher
cls
echo ============================================================
echo   VORTX - YouTube ^& Instagram Downloader
echo   Starting Backend ^& Frontend Servers...
echo ============================================================
echo.

:: Start Backend in a new command window
echo [1/2] Launching Backend Server on port 3001...
start "VORTX Backend Server (Port 3001)" cmd /k "cd /d "%~dp0server" && npm run dev"

:: Short delay
timeout /t 2 /nobreak >nul

:: Start Frontend in a new command window
echo [2/2] Launching Frontend App (Vite)...
start "VORTX Frontend (Vite)" cmd /k "cd /d "%~dp0" && npm run dev"

echo.
echo ============================================================
echo   Both servers launched successfully!
echo   - Backend API : http://localhost:3001
echo   - Frontend App: http://localhost:5173
echo ============================================================
echo.
pause
