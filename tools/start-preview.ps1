$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$previewAddress = 'http://127.0.0.1:8765'

function Test-DeviselecPreview {
    try {
        $health = Invoke-RestMethod -Uri "$previewAddress/preview-health" -TimeoutSec 2
        return $health.app -eq 'deviselec-preview'
    } catch {
        return $false
    }
}

if (-not (Test-DeviselecPreview)) {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $logPath = Join-Path $projectPath 'tmp'
    New-Item -ItemType Directory -Path $logPath -Force | Out-Null
    $serverPath = Join-Path $PSScriptRoot 'preview.cjs'
    $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @('"' + $serverPath + '"') `
        -WorkingDirectory $projectPath -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logPath 'preview.log') `
        -RedirectStandardError (Join-Path $logPath 'preview-error.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-DeviselecPreview) { $ready = $true; break }
        if ($serverProcess.HasExited) { break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $ready) {
        throw "Impossible de demarrer Deviselec. Consulter tmp\preview-error.log. Le port 8765 est peut-etre occupe."
    }
}

Start-Process $previewAddress
