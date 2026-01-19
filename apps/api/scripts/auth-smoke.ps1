$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\\..\\..")
$DataDir = Join-Path $RepoRoot "data\\smoke-auth"

Push-Location $RepoRoot
try {
  if (Test-Path $DataDir) {
    Remove-Item -Recurse -Force $DataDir
  }

  $env:DATA_DIR = $DataDir
  $env:SESSION_SECRET = "smoke-secret"
  $env:SESSION_TTL_DAYS = "1"
  $env:ADMIN_EMAIL = "admin@example.com"
  $env:ADMIN_PASSWORD = "admin-pass"

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

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $loginBody = @{ email = "admin@example.com"; password = "admin-pass" } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -WebSession $session | Out-Null

  $cookie = $session.Cookies.GetCookies("http://localhost:8080")["booktainer_session"]
  if (-not $cookie) {
    throw "Expected booktainer_session cookie."
  }

  Invoke-RestMethod -Uri "http://localhost:8080/api/auth/me" -WebSession $session | Out-Null

  Stop-Process -Id $apiProcess.Id
  $apiProcess = Start-Process -FilePath "node" -ArgumentList "apps/api/dist/index.js" -WorkingDirectory $RepoRoot -PassThru
  Start-Sleep -Seconds 1
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -WebSession $session | Out-Null

  $createBody = @{ email = "user@example.com"; password = "user-pass"; isAdmin = $false } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:8080/api/admin/users" -Method Post -Body $createBody -ContentType "application/json" -WebSession $session | Out-Null

  $session2 = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $loginUserBody = @{ email = "user@example.com"; password = "user-pass" } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method Post -Body $loginUserBody -ContentType "application/json" -WebSession $session2 | Out-Null

  try {
    Invoke-RestMethod -Uri "http://localhost:8080/api/admin/users" -Method Post -Body $createBody -ContentType "application/json" -WebSession $session2 -ErrorAction Stop | Out-Null
    throw "Expected forbidden response for non-admin user."
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.Value__ -ne 403) {
      throw $_
    }
  }

  Write-Host "Auth smoke check passed."
} finally {
  if ($apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id
  }
  Pop-Location
}
