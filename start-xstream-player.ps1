$ErrorActionPreference = 'Stop'

$projectDirectory = 'C:\Users\Arcade\xstream-player'
$npmCommand = 'C:\Program Files\nodejs\npm.cmd'
$logDirectory = Join-Path $projectDirectory 'data'
$logFile = Join-Path $logDirectory 'server.log'

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Set-Location -LiteralPath $projectDirectory
$env:XSTREAM_CATEGORY_PREFIXES = 'NL,EN,UK,US,USA,BE,ALL'

"`r`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting xstream-player" |
    Out-File -LiteralPath $logFile -Append -Encoding utf8

& $npmCommand start -- --hostname 127.0.0.1 --port 3000 *>> $logFile
exit $LASTEXITCODE
