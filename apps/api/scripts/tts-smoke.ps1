$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\\..\\..")
$DataDir = Join-Path $RepoRoot "data\\smoke-tts"
$VoicesDir = Join-Path $DataDir "tts-voices"

Push-Location $RepoRoot
try {
  if (Test-Path $DataDir) {
    Remove-Item -Recurse -Force $DataDir
  }

  $env:DATA_DIR = $DataDir
  $env:PIPER_VOICES_DIR = $VoicesDir
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

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $loginBody = @{ email = "admin@example.com"; password = "admin-pass" } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -WebSession $session | Out-Null

  $voices = Invoke-RestMethod -Uri "http://localhost:8080/api/tts/voices" -WebSession $session
  Write-Host "Voices:" ($voices | ConvertTo-Json -Depth 4)

  $offlineVoice = "en_US-lessac-medium"
  $installBody = @{ voice = $offlineVoice } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:8080/api/tts/offline/install-voice" -Method Post -Body $installBody -ContentType "application/json" -WebSession $session | Out-Null

  $offlineBody = @{ mode = "offline"; voice = $offlineVoice; rate = 1; text = "hello world" } | ConvertTo-Json
  $offlineOut = Join-Path $DataDir "hello-offline.wav"
  Invoke-WebRequest -Uri "http://localhost:8080/api/tts/speak" -Method Post -Body $offlineBody -ContentType "application/json" -WebSession $session -OutFile $offlineOut | Out-Null

  if ($env:OPENAI_API_KEY) {
    $onlineVoice = "alloy"
    $onlineBody = @{ mode = "online"; voice = $onlineVoice; rate = 1; text = "hello world" } | ConvertTo-Json
    $onlineOut = Join-Path $DataDir "hello-online.mp3"
    Invoke-WebRequest -Uri "http://localhost:8080/api/tts/speak" -Method Post -Body $onlineBody -ContentType "application/json" -WebSession $session -OutFile $onlineOut | Out-Null
  } else {
    Write-Host "OPENAI_API_KEY not set; skipping online TTS."
  }

  Write-Host "TTS smoke check passed."
} finally {
  if ($apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id
  }
  Pop-Location
}
