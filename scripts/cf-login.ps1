$ErrorActionPreference = "Stop"

function Stop-PortListener([int]$Port) {
  $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    if ($connection.OwningProcess -and $connection.OwningProcess -ne 0) {
      Write-Host "Stopping process on localhost:$Port (PID $($connection.OwningProcess))"
      Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
}

Stop-PortListener 8976
Stop-PortListener 8977

Write-Host ""
Write-Host "Opening browser for Cloudflare OAuth. Click Allow to finish login."
Write-Host ""

npx wrangler login
if ($LASTEXITCODE -ne 0) {
  Write-Host "Login failed. Close other wrangler processes and retry: npm run cf:login"
  exit $LASTEXITCODE
}

npx wrangler whoami
