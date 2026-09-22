$ErrorActionPreference = 'Stop'

$projectDirectory = 'C:\Users\Arcade\xstream-player'
$npmCommand = 'C:\Program Files\nodejs\npm.cmd'
$logDirectory = Join-Path $projectDirectory 'data'
$logFile = Join-Path $logDirectory 'server.log'
$eventServerScript = Join-Path $projectDirectory 'scripts\kodi-event-server.mjs'
$nodeCommand = 'C:\Program Files\nodejs\node.exe'

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Set-Location -LiteralPath $projectDirectory
$env:XSTREAM_CATEGORY_PREFIXES = 'NL,EN,UK,US,USA,BE,ALL'

# Yatse uses Kodi's separate UDP EventServer for its remote-control buttons.
# Stop the previous helper first so a scheduled-task restart cannot leave port 9777 occupied.
Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -like '*kodi-event-server.mjs*'
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process -FilePath $nodeCommand -ArgumentList $eventServerScript -WorkingDirectory $projectDirectory -WindowStyle Hidden

"`r`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting xstream-player" |
    Out-File -LiteralPath $logFile -Append -Encoding utf8

& $npmCommand start -- --hostname 0.0.0.0 --port 3000 *>> $logFile
exit $LASTEXITCODE
