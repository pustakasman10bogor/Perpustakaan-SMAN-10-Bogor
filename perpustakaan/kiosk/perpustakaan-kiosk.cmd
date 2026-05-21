@echo off
setlocal

set "BASE_URL=https://perpustakaan-sman-10-bogor.vercel.app/"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME%" (
  set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)

if not exist "%CHROME%" (
  set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

if not exist "%CHROME%" (
  echo Google Chrome tidak ditemukan.
  echo Install Google Chrome atau sesuaikan path CHROME di file ini.
  pause
  exit /b 1
)

start "" "%CHROME%" ^
  --kiosk ^
  --new-window ^
  --no-first-run ^
  --disable-session-crashed-bubble ^
  --user-data-dir="%LocalAppData%\PerpustakaanKiosk\App" ^
  "%BASE_URL%/"

endlocal
