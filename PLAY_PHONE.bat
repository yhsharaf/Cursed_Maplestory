@echo off
cd /d "%~dp0"
echo Starting Cursed MapleStory for your phone...
python tools\serve.py 8766 --lan
pause
