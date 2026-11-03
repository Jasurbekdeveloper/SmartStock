# Installs or updates the MarketHisob fiscal agent as a Windows service.
# Run as administrator, next to FiscalAgent.exe:
#   .\install.ps1 -VcrUrl http://127.0.0.1:<VCR API port> -Login <login>
# On an update the settings are kept unless -VcrUrl and -Login are given again.
param(
  [string]$VcrUrl,
  [string]$Login
)
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$serviceName = 'MarketHisobFiscalAgent'
$installDir = Join-Path $env:ProgramFiles 'MarketHisob\FiscalAgent'
$dataDir = Join-Path $env:ProgramData 'MarketHisob\FiscalAgent'
$source = Join-Path $PSScriptRoot 'FiscalAgent.exe'
$exe = Join-Path $installDir 'FiscalAgent.exe'

if (-not (Test-Path $source)) { throw "FiscalAgent.exe topilmadi: $source" }

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing -and $existing.Status -ne 'Stopped') { Stop-Service -Name $serviceName }

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Path $source -Destination $exe -Force

# The settings hold the encrypted VCR password: SYSTEM and administrators only.
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
& icacls $dataDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Papka huquqlarini o''rnatib bo''lmadi' }

if ($VcrUrl -and $Login) {
  & $exe configure --url $VcrUrl --login $Login
  if ($LASTEXITCODE -ne 0) { throw 'Sozlamani saqlab bo''lmadi' }
}

if (-not $existing) {
  New-Service -Name $serviceName -BinaryPathName "`"$exe`"" -DisplayName 'MarketHisob Fiscal Agent' -StartupType Automatic | Out-Null
  # Comes back by itself if it ever crashes.
  & sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/5000/restart/30000 | Out-Null
}
Start-Service -Name $serviceName

Write-Host "Tayyor. Tekshirish: http://127.0.0.1:18348/v1/status"
