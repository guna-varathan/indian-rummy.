@echo off
setlocal
set "IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  if not defined IP set "IP=%%a"
)
set "IP=%IP: =%"
echo ====================================================
echo Starting Indian Rummy Accessible Web Server
echo ====================================================
echo PC URL:     http://localhost:8000
echo Mobile URL: http://%IP%:8000  (phone must be on the same Wi-Fi)
echo ====================================================
echo Opening http://localhost:8000 in your browser...
start http://localhost:8000
python server.py
pause
