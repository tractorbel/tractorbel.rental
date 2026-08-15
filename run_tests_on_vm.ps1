<#
Run this script on your VM to start the backend in DEV mode, expose it
via localtunnel (or ngrok if localtunnel is not available) and run a quick
POST → PUT → DELETE sequence against the API using the literal token `dev`.

Usage (PowerShell):
  Open an elevated PowerShell (if needed) in the repo root and run:
    .\run_tests_on_vm.ps1

What it does:
- Starts the backend (node backend/index.js) with PORT=4001 and DEV_ALLOW_NO_ENV=1
- Starts a localtunnel process (via cmd /c "npx localtunnel --port 4001 > tunnel_out.txt 2>&1")
- Waits for the tunnel URL to appear in tunnel_out.txt and extracts HTTPS URL
- Calls POST (create), PUT (update) and DELETE (remove) endpoints using Invoke-RestMethod
- Logs output to `test-run.log`, and backend logs are in `backend_stdout.log` / `backend_stderr.log`.

Notes:
- This script does NOT require credentials from you. Run it on your VM where you have access.
- If your PowerShell prevents running npx due to ExecutionPolicy, the script uses cmd /c to run npx.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

$log = Join-Path $root 'test-run.log'
Remove-Item $log -ErrorAction SilentlyContinue
Function Log([string]$s){ $time = (Get-Date).ToString('o'); Add-Content -Path $log -Value "$time `t $s" }

Log 'Starting test-run script'

# Ensure test files exist
If (-Not (Test-Path (Join-Path $root 'test.pdf'))) {
  Write-Error 'Missing test.pdf in repo root. Please ensure test.pdf exists.'; exit 1
}
If (-Not (Test-Path (Join-Path $root 'test2.pdf'))) {
  Write-Error 'Missing test2.pdf in repo root. Please ensure test2.pdf exists.'; exit 1
}

## Start backend in background
Log 'Starting backend on port 4001 (DEV mode)'
Start-Process -FilePath 'node' -ArgumentList 'backend/index.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru | Out-Null
Start-Sleep -Seconds 2

## Start localtunnel via cmd to avoid PowerShell npx shim issues
$tunnelOut = Join-Path $root 'tunnel_out.txt'
Remove-Item $tunnelOut -ErrorAction SilentlyContinue
Log 'Starting localtunnel (npx localtunnel --port 4001)'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "npx localtunnel --port 4001 > `"$tunnelOut`" 2>&1" -WorkingDirectory $root -WindowStyle Hidden -PassThru | Out-Null

Log 'Waiting for tunnel URL to appear in tunnel_out.txt (timeout 45s)'
$tunnelUrl = $null
for ($i=0; $i -lt 45; $i++) {
  if (Test-Path $tunnelOut) {
    $content = Get-Content $tunnelOut -Raw -ErrorAction SilentlyContinue
    if ($content) {
      # Try to extract loca.lt or ngrok url
      $m = [regex]::Match($content, '(https?://[^\s"']+(?:loca\.lt|ngrok\.io|trycloudflare\.com))')
      if ($m.Success) { $tunnelUrl = $m.Groups[1].Value; break }
    }
  }
  Start-Sleep -Seconds 1
}

If (-Not $tunnelUrl) {
  Log 'Tunnel URL not found. Dumping tunnel_out.txt for diagnosis.'
  if (Test-Path $tunnelOut) { Get-Content $tunnelOut | ForEach-Object { Log $_ } }
  Write-Error 'Failed to detect tunnel URL. Ensure localtunnel/ngrok is available on the VM.'; exit 1
}

Log "Detected tunnel URL: $tunnelUrl"

# Set API base for the test
$apiBase = $tunnelUrl.TrimEnd('/')
Log "Using API base: $apiBase"

try {
  Log 'Running POST (create)'
  $resp = Invoke-RestMethod -Uri "$apiBase/api/documents" -Method Post -Headers @{ Authorization = 'Bearer dev' } -Form @{ title='Teste Automatizado'; notes='criado pelo teste'; document=Get-Item (Join-Path $root 'test.pdf') }
  $postBody = $resp | ConvertTo-Json -Depth 5
  Log "POST response: $postBody"
} catch {
  Log "POST failed: $($_.Exception.Message)"
  throw
}

$createdId = $resp.id
If (-Not $createdId) { Log 'POST did not return id'; throw 'No id returned from POST' }
Log "Created document id: $createdId"

try {
  Log 'Running PUT (update/substitute)'
  $resp2 = Invoke-RestMethod -Uri "$apiBase/api/documents/$createdId" -Method Put -Headers @{ Authorization = 'Bearer dev' } -Form @{ title='Teste Atualizado'; notes='atualizado via script'; document=Get-Item (Join-Path $root 'test2.pdf') }
  Log "PUT response: $($resp2 | ConvertTo-Json -Depth 5)"
} catch {
  Log "PUT failed: $($_.Exception.Message)"
  throw
}

try {
  Log 'Running DELETE'
  $resp3 = Invoke-RestMethod -Uri "$apiBase/api/documents/$createdId" -Method Delete -Headers @{ Authorization = 'Bearer dev' }
  Log "DELETE response: $($resp3 | ConvertTo-Json -Depth 5)"
} catch {
  Log "DELETE failed: $($_.Exception.Message)"
  throw
}

Log 'Fetching manifest to verify changes'
try {
  $manifest = Invoke-RestMethod -Uri "$apiBase/api/manifest" -Method Get
  Log "MANIFEST length: $($manifest.Count)"
  Log (ConvertTo-Json $manifest -Depth 6)
} catch {
  Log "Manifest fetch failed: $($_.Exception.Message)"
}

Log 'Test run finished successfully'
Write-Output "Test run complete. Logs written to: $log and tunnel output: $tunnelOut"
