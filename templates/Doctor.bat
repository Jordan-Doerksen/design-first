@echo off
REM Doctor.bat - shim. Finds the design-first kit through the pointer and runs its Doctor.
REM Nothing presses this for you: no scheduled task, no login entry, no timer.
REM Exit codes:  0 GREEN   1 RED   2 COULD-NOT-LOOK (that is NOT a pass)
REM Pauses only when run with no arguments (a double-click), so scripts can call it.
REM Any argument is passed through: -Kit, -Json, -Quiet, -ConfigPath, -ClaimsPath.
REM The pointer is %USERPROFILE%\.claude\design-first.json, or DF_POINTER_PATH. Node reads it, so
REM this file never parses JSON by hand. On Linux and macOS the same shim is doctor.sh.
setlocal
set "CODE=2"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   node ^(Node.js 18 or newer^) is not on PATH. Install it: winget install OpenJS.NodeJS.LTS
  goto :done
)
node -e "const fs=require('fs'),path=require('path'),os=require('os'),url=require('url');const stop=(m)=>{console.log('');console.log('  '+m);process.exit(2)};const p=process.env.DF_POINTER_PATH||path.join(os.homedir(),'.claude','design-first.json');if(!fs.existsSync(p))stop('No pointer at '+p+'. Run /design-first:adopt in a Claude Code session first.');let kit='';try{kit=String(JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')).pluginRoot??'')}catch(e){stop('The pointer could not be read: '+p+' ('+e.message+')')}if(!kit)stop('The pointer has no pluginRoot: '+p);const s=path.join(kit,'tools','doctor','doctor.mjs');if(!fs.existsSync(s))stop('Doctor is missing at '+s+'. The pointer pluginRoot is stale; start a session so hooks/entry.mjs refreshes it.');process.argv=[process.execPath,s,...process.argv.slice(1)];import(url.pathToFileURL(s).href)" -- %*
set "CODE=%ERRORLEVEL%"

:done
REM With arguments (a script, or -Json) print nothing extra and never pause.
if not "%~1"=="" exit /b %CODE%
echo.
if "%CODE%"=="0" echo   GREEN - nothing to do.
if "%CODE%"=="1" echo   RED - findings above. Every finding is explained in the kit's tools\MANUAL.md.
if "%CODE%"=="2" echo   COULD NOT LOOK - the Doctor could not check something. That is NOT a pass.
echo.
pause
exit /b %CODE%
