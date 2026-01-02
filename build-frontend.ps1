# Build Frontend Only
# Usage: .\build-frontend.ps1

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Building TheiaCast Frontend" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Ensure we're in the repository root
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

Write-Host "`n[1/3] Building Docker image..." -ForegroundColor Yellow
docker build -t theiacast-frontend:local -f frontend/Dockerfile .

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nBuild failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/3] Stopping frontend container..." -ForegroundColor Yellow
docker-compose stop frontend

Write-Host "`n[3/3] Starting frontend container..." -ForegroundColor Yellow
docker-compose rm -f frontend
docker-compose up -d frontend

Write-Host "`n================================" -ForegroundColor Green
Write-Host "Frontend build complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host "`nTip: Run 'docker-compose logs -f frontend' to watch logs" -ForegroundColor Gray
