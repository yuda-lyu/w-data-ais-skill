@echo off
setlocal

rem Copy skills from https://github.com/yuda-lyu/w-data-ais-skill to %USERPROFILE%\.claude\skills, then npm i.
rem Existing files are overwritten, nothing is deleted; remove obsolete skill folders manually.

set "REPO=https://github.com/yuda-lyu/w-data-ais-skill.git"
set "WORK=%~dp0tmp"
set "SRC=%WORK%\w-data-ais-skill"
set "DST=%USERPROFILE%\.claude\skills"

echo [1/5] create "%WORK%"
if exist "%SRC%" rmdir /s /q "%SRC%"
if not exist "%WORK%" mkdir "%WORK%"

echo [2/5] git clone %REPO%
git clone --depth 1 -c core.autocrlf=false "%REPO%" "%SRC%"
if errorlevel 1 goto :fail

echo [3/5] copy skills to "%DST%"
robocopy "%SRC%\skills" "%DST%" /E /R:2 /W:1 /NFL /NDL /NP /NJH
if errorlevel 8 goto :fail

echo [4/5] npm i in "%DST%"
pushd "%DST%" || goto :fail
call npm i
set "RC=%errorlevel%"
popd
if not "%RC%"=="0" goto :fail

echo [5/5] delete "%WORK%"
rmdir /s /q "%WORK%"

echo Done. Obsolete skill folders in "%DST%" are NOT removed - delete them manually.
pause
exit /b 0

:fail
rmdir /s /q "%WORK%" 2>nul
echo Failed, see messages above.
pause
exit /b 1
