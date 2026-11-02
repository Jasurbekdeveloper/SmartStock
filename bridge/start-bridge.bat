@echo off
rem MarketHisob - REGOS VCR koprigi. VCR API manzilini pastda yozing (VCR sozlamalaridan).
set VCR_URL=https://vcr-test.regos.uz
node "%~dp0vcr-bridge.mjs" %VCR_URL%
pause
