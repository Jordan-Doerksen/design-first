@echo off
REM Doctor.bat - shim. Finds the design-first kit through the pointer and runs its Doctor.
REM Nothing presses this for you: no scheduled task, no login entry, no timer.
REM Exit codes:  0 GREEN   1 RED   2 COULD-NOT-LOOK (that is NOT a pass)
REM Pauses only when run with no arguments (a double-click), so scripts can call it.
REM Any argument is passed through: -Kit, -Json, -Quiet, -ConfigPath, -ClaimsPath.
setlocal
set "POINTER=%USERPROFILE%\.claude\design-first.json"
if defined DF_POINTER_PATH set "POINTER=%DF_POINTER_PATH%"
set "CODE=2"

where pwsh >nul 2>&1
if errorlevel 1 (
  echo.
  echo   pwsh ^(PowerShell 7^) is not on PATH. Install it: winget install Microsoft.PowerShell
  goto :done
)
if not exist "%POINTER%" (
  echo.
  echo   No pointer at "%POINTER%". Run /design-first:adopt in a Claude Code session first.
  goto :done
)
REM The pointer is JSON; PowerShell reads it so this file never parses JSON by hand.
for /f "usebackq delims=" %%P in (`pwsh -NoProfile -Command "(Get-Content -LiteralPath $env:POINTER -Raw | ConvertFrom-Json).pluginRoot"`) do set "PLUGIN_ROOT=%%P"
if not defined PLUGIN_ROOT (
  echo.
  echo   The pointer has no pluginRoot: "%POINTER%"
  goto :done
)
set "SCRIPT=%PLUGIN_ROOT%\tools\doctor\doctor.ps1"
if not exist "%SCRIPT%" (
  echo.
  echo   Doctor is missing at "%SCRIPT%". The pointer's pluginRoot is stale; start a session so entry.ps1 refreshes it.
  goto :done
)

pwsh -NoProfile -File "%SCRIPT%" %*
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
