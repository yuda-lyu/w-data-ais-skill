@echo off
setlocal

rem Sync https://github.com/yuda-lyu/w-data-ais-skill to this machine:
rem   repo skills\*   -> %USERPROFILE%\.claude\skills    (then npm i there)
rem   repo CLAUDE.md  -> %USERPROFILE%\.claude\CLAUDE.md
rem Existing files are overwritten, nothing is deleted; remove obsolete skill folders manually.

set "REPO=https://github.com/yuda-lyu/w-data-ais-skill.git"
set "WORK=%~dp0tmp"
set "SRC=%WORK%\w-data-ais-skill"
set "CLAUDE_HOME=%USERPROFILE%\.claude"
set "DST=%CLAUDE_HOME%\skills"

echo [1/6] create "%WORK%"
if exist "%SRC%" rmdir /s /q "%SRC%"
if not exist "%WORK%" mkdir "%WORK%"

echo [2/6] git clone %REPO%
git clone --depth 1 -c core.autocrlf=false "%REPO%" "%SRC%"
if errorlevel 1 goto :fail

echo [3/6] copy skills to "%DST%"
robocopy "%SRC%\skills" "%DST%" /E /R:2 /W:1 /NFL /NDL /NP /NJH
if errorlevel 8 goto :fail

echo [4/6] copy CLAUDE.md to "%CLAUDE_HOME%\CLAUDE.md"
if not exist "%CLAUDE_HOME%" mkdir "%CLAUDE_HOME%"
copy /Y "%SRC%\CLAUDE.md" "%CLAUDE_HOME%\CLAUDE.md" >nul
if errorlevel 1 goto :fail

echo [5/6] npm i in "%DST%"
pushd "%DST%" || goto :fail
call npm i
set "RC=%errorlevel%"
popd
if not "%RC%"=="0" goto :fail

echo [6/6] delete "%WORK%"
rmdir /s /q "%WORK%"

echo Done. Obsolete skill folders in "%DST%" are NOT removed - delete them manually.
pause
exit /b 0

:fail
rmdir /s /q "%WORK%" 2>nul
echo Failed, see messages above.
pause
exit /b 1
