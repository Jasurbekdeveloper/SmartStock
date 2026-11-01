@echo off
rem MarketHisob - REGOS VCR koprigi. VCR API manzilini pastda yozing (VCR sozlamalaridan).
set VCR_URL=http://127.0.0.1:5005
node "%~dp0vcr-bridge.mjs" %VCR_URL%
pause
