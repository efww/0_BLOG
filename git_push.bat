@echo off
:: 현재 날짜와 시간을 YYYY-MM-DD HH:MM:SS 형식으로 포맷
for /f "tokens=1-4 delims=/ " %%a in ("%date%") do (
    set yyyy=%%c
    set mm=%%a
    set dd=%%b
)

for /f "tokens=1-2 delims=: " %%a in ("%time%") do (
    set hh=%%a
    set min=%%b
)

:: 앞에 0 붙이기
if 1%mm% LSS 110 set mm=0%mm%
if 1%dd% LSS 110 set dd=0%dd%
if 1%hh% LSS 110 set hh=0%hh%
if 1%min% LSS 110 set min=0%min%

set commitmsg=%yyyy%-%mm%-%dd% %hh%:%min%

echo 커밋 메시지: %commitmsg%

git add .
git commit -m "%commitmsg%"
git push

pause
