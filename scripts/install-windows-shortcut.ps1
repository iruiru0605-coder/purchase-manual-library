$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $root 'scripts\start-windows.ps1'
$launcherPath = Join-Path $root 'scripts\launch-windows.vbs'
$iconPath = Join-Path $root 'assets\app-icon.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutName = (-join ([char[]](21462, 35500, 12521, 12452, 12502, 12521, 12522))) + '.lnk'
$shortcutPath = Join-Path $desktop $shortcutName

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Start script was not found: $scriptPath"
}

if (-not (Test-Path -LiteralPath $launcherPath)) {
  throw "Launcher script was not found: $launcherPath"
}

if (-not (Test-Path -LiteralPath $iconPath)) {
  throw "Icon was not found: $iconPath"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'wscript.exe'
$shortcut.Arguments = "`"$launcherPath`""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = $iconPath
$shortcut.Description = 'Start Manual Library'
$shortcut.Save()

Write-Host "Created desktop shortcut: $shortcutPath"
