$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\\..\\..")
$DataDir = Join-Path $RepoRoot "data\\smoke-scope"

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
  pnpm -w --filter @booktainer/api build

  Write-Host "Starting API..."
  $apiProcess = Start-Process -FilePath "node" -ArgumentList "apps/api/dist/index.js" -WorkingDirectory $RepoRoot -PassThru

  $healthUrl = "http://localhost:8080/api/health"
  $maxAttempts = 20
  $sleepSeconds = 1
  $ok = $false

  for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 3 -UseBasicParsing
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

  $adminSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $loginBody = @{ email = "admin@example.com"; password = "admin-pass" } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -WebSession $adminSession | Out-Null

  $createA = @{ email = "usera@example.com"; password = "user-pass"; isAdmin = $false } | ConvertTo-Json
  $createB = @{ email = "userb@example.com"; password = "user-pass"; isAdmin = $false } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:8080/api/admin/users" -Method Post -Body $createA -ContentType "application/json" -WebSession $adminSession | Out-Null
  Invoke-RestMethod -Uri "http://localhost:8080/api/admin/users" -Method Post -Body $createB -ContentType "application/json" -WebSession $adminSession | Out-Null

  $userASession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $userBSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $loginA = @{ email = "usera@example.com"; password = "user-pass" } | ConvertTo-Json
  $loginB = @{ email = "userb@example.com"; password = "user-pass" } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method Post -Body $loginA -ContentType "application/json" -WebSession $userASession | Out-Null
  Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method Post -Body $loginB -ContentType "application/json" -WebSession $userBSession | Out-Null

  $samplePath = Join-Path $DataDir "sample.txt"
  "Hello from user A" | Set-Content -Path $samplePath
  $form = @{ file = Get-Item $samplePath }
  $book = Invoke-RestMethod -Uri "http://localhost:8080/api/books/upload" -Method Post -Form $form -WebSession $userASession
  if (-not $book.id) {
    throw "Upload did not return a book id."
  }

  $listA = Invoke-RestMethod -Uri "http://localhost:8080/api/books?sort=dateAdded&q=" -WebSession $userASession
  if ($listA.items.Count -ne 1) {
    throw "Expected user A to see 1 book."
  }

  $listB = Invoke-RestMethod -Uri "http://localhost:8080/api/books?sort=dateAdded&q=" -WebSession $userBSession
  if ($listB.items.Count -ne 0) {
    throw "Expected user B to see 0 books."
  }

  try {
    Invoke-RestMethod -Uri "http://localhost:8080/api/books/$($book.id)" -WebSession $userBSession -ErrorAction Stop | Out-Null
    throw "Expected 404 for user B direct access."
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.Value__ -ne 404) {
      throw $_
    }
  }

  $progressBody = @{ location = @{ chapter = 1 } } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:8080/api/books/$($book.id)/progress" -Method Post -Body $progressBody -ContentType "application/json" -WebSession $userASession | Out-Null

  try {
    Invoke-RestMethod -Uri "http://localhost:8080/api/books/$($book.id)/progress" -WebSession $userBSession -ErrorAction Stop | Out-Null
    throw "Expected 404 for user B progress."
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.Value__ -ne 404) {
      throw $_
    }
  }

  Write-Host "User scoping smoke check passed."
} finally {
  if ($apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id
  }
  Pop-Location
}
