$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Wait-ForApp {
  param([string]$Url)
  for ($i = 0; $i -lt 30; $i += 1) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

function Test-Url {
  param([string]$Url)
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  [System.Windows.Forms.MessageBox]::Show(
    'Node.js was not found. Please install Node.js 22 or later, then try again.',
    'Manual Library'
  ) | Out-Null
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) {
  npm install
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'dist\index.html'))) {
  npm run build
}

$logDir = Join-Path $root '.manual-library\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$outLog = Join-Path $logDir 'app.out.log'
$errLog = Join-Path $logDir 'app.err.log'

$healthUrl = 'http://localhost:5174/api/health'
$productionUrl = 'http://localhost:5174'
$devUrl = 'http://localhost:5173'

$alreadyRunning = Test-Url $healthUrl
if (-not $alreadyRunning) {
  Start-Process -FilePath 'node.exe' `
    -ArgumentList 'scripts/start-production.js' `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog

  if (-not (Wait-ForApp $healthUrl)) {
    [System.Windows.Forms.MessageBox]::Show(
      "Manual Library could not start. Please check the log.`n$errLog",
      'Manual Library'
    ) | Out-Null
    exit 1
  }
}

if (Wait-ForApp $healthUrl) {
  Start-Process $productionUrl
} elseif (Test-Url $devUrl) {
  Start-Process $devUrl
} else {
  [System.Windows.Forms.MessageBox]::Show(
    "Manual Library could not open in the browser. Please check the log.`n$errLog",
    'Manual Library'
  ) | Out-Null
  exit 1
}
