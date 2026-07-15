@echo off
setlocal EnableExtensions
cd /d "%~dp0"

git rev-parse --is-inside-work-tree >nul 2>&1 || (
  echo This script must run inside a Git repository.
  goto :error
)

for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"
if not defined BRANCH (
  echo Cannot commit from a detached HEAD state.
  goto :error
)

git remote get-url origin >nul 2>&1 || (
  echo The origin remote is not configured.
  goto :error
)

git status --short
git status --porcelain | findstr . >nul || (
  echo.
  echo Nothing to commit.
  goto :done
)

echo.
set "COMMIT_MESSAGE="
set /p "COMMIT_MESSAGE=Commit message [Update site]: "
if not defined COMMIT_MESSAGE set "COMMIT_MESSAGE=Update site"

git add -A || goto :error
git commit -m "%COMMIT_MESSAGE%" || goto :error
git push -u origin "%BRANCH%" || goto :error

echo.
echo Published %BRANCH% to origin.
goto :done

:error
echo.
echo Publish failed. Resolve the error above and run this script again.
pause
exit /b 1

:done
pause
