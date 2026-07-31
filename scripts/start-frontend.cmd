@echo off
setlocal
set "NODE_ROOT=%LOCALAPPDATA%\nodejs-24.18.0\node-v24.18.0-win-x64"
set "NG_CLI_ANALYTICS=false"
if exist "%NODE_ROOT%\node.exe" (
  set "PATH=%NODE_ROOT%;%PATH%"
)
"%NODE_ROOT%\node.exe" "%~dp0..\node_modules\@angular\cli\bin\ng.js" serve --proxy-config proxy.conf.json
