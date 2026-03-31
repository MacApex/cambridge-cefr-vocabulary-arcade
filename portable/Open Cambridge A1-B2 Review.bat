@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
  py -3 portable_server.py
  goto :eof
)

where python >nul 2>nul
if not errorlevel 1 (
  python portable_server.py
  goto :eof
)

echo Python 3 was not found on this computer.
echo Opening the HTML file directly instead.
echo If progress does not persist, install Python 3 and run this launcher again.
start "" "cambridge-a1-b2-review.html"
pause
