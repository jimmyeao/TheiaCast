# Build Backend Only
# Usage: .\build-backend.ps1

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Building TheiaCast Backend" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Ensure we're in the repository root
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

Write-Host "`n[1/3] Building Docker image..." -ForegroundColor Yellow
docker build -t theiacast-backend:local -f src/TheiaCast.Api/Dockerfile .

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nBuild failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/3] Stopping backend container..." -ForegroundColor Yellow
docker-compose stop backend

Write-Host "`n[3/3] Starting backend container..." -ForegroundColor Yellow
docker-compose rm -f backend
docker-compose up -d backend

Write-Host "`n================================" -ForegroundColor Green
Write-Host "Backend build complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host "`nTip: Run 'docker-compose logs -f backend' to watch logs" -ForegroundColor Gray
