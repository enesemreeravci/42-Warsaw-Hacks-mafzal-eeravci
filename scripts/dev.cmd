@echo off
setlocal enabledelayedexpansion
set "NODE_ROOT=%LOCALAPPDATA%\nodejs-24.18.0\node-v24.18.0-win-x64"
if exist "%NODE_ROOT%\node.exe" (
  set "PATH=%NODE_ROOT%;%PATH%"
)

call :kill_port 3000
call :kill_port 4200

concurrently -n backend,frontend -c blue,magenta "^"%NODE_ROOT%\npm.cmd^" run dev --workspace backend" "^"%NODE_ROOT%\npm.cmd^" run start --workspace frontend"
exit /b %ERRORLEVEL%

:kill_port
set "PORT=%~1"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:"LISTENING" ^| findstr /C:":%PORT% "') do (
  echo Port %PORT% is in use by PID %%P - stopping it...
  taskkill /F /PID %%P >nul 2>&1
)
goto :eof
