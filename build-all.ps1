# Build All Components (Shared + Backend + Frontend)
# Usage: .\build-all.ps1

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Building TheiaCast (Full Build)" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Ensure we're in the repository root
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

Write-Host "`n[1/5] Building shared package..." -ForegroundColor Yellow
Set-Location shared
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nShared package build failed!" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Set-Location ..

Write-Host "`n[2/5] Building backend Docker image..." -ForegroundColor Yellow
docker build -t theiacast-backend:local -f src/TheiaCast.Api/Dockerfile .

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nBackend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[3/5] Building frontend Docker image..." -ForegroundColor Yellow
docker build -t theiacast-frontend:local -f frontend/Dockerfile .

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nFrontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[4/5] Stopping containers..." -ForegroundColor Yellow
docker-compose stop backend frontend

Write-Host "`n[5/5] Starting containers..." -ForegroundColor Yellow
docker-compose rm -f backend frontend
docker-compose up -d backend frontend

Write-Host "`n================================" -ForegroundColor Green
Write-Host "Full build complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host "`nBackend: http://localhost:5001" -ForegroundColor Gray
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Gray
Write-Host "`nTip: Run 'docker-compose logs -f' to watch all logs" -ForegroundColor Gray
