Param()

Write-Host "Stopping NestJS backend on port 3000 if running..."
try {
  $pid = (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
  if ($pid) { Write-Host "Killing process $pid on port 3000..."; Stop-Process -Id $pid -Force }
} catch {}

Write-Host "Starting ASP.NET Core backend (TheiaCast.Api) on port 5001..."
Push-Location "$(Join-Path $PSScriptRoot 'src\TheiaCast.Api')"
dotnet restore
dotnet build

# Set URLs to http://localhost:5001
Write-Host "Launching..."
$env:ASPNETCORE_URLS = "http://localhost:5001"
dotnet run
Pop-Location