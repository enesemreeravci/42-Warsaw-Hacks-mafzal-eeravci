@echo off
setlocal
set "NODE_ROOT=%LOCALAPPDATA%\nodejs-24.18.0\node-v24.18.0-win-x64"
if exist "%NODE_ROOT%\node.exe" (
  set "PATH=%NODE_ROOT%;%PATH%"
)
concurrently -n server,frontend -c blue,magenta "^"%NODE_ROOT%\npm.cmd^" run dev --workspace server" "^"%NODE_ROOT%\npm.cmd^" run start --workspace frontend"
