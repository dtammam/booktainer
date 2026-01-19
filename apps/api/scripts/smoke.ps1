$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\\..\\..")

Push-Location $RepoRoot
try {
  Write-Host "Building API..."
  pnpm --filter ./apps/api build

  Write-Host "Starting API..."
  $apiProcess = Start-Process -FilePath "node" -ArgumentList "apps/api/dist/index.js" -WorkingDirectory $RepoRoot -PassThru

  $healthUrl = "http://localhost:8080/api/health"
  $maxAttempts = 20
  $sleepSeconds = 1
  $ok = $false

  for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 3
      if ($response.StatusCode -eq 200) {
        $ok = $true
        break
      }
    } catch {
      Start-Sleep -Seconds $sleepSeconds
    }
  }

  if (-not $ok) {
    throw "Smoke check failed: $healthUrl did not return 200."
  }

  Write-Host "Smoke check passed."
} finally {
  if ($apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id
  }
  Pop-Location
}
