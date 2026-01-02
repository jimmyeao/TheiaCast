# PDS Docker Deployment Script

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   PDS Kiosk System - Docker Deployment    " -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Check for Docker
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Docker Desktop for Windows."
    exit 1
}

# Check for Docker Compose
if (-not (Get-Command "docker-compose" -ErrorAction SilentlyContinue)) {
    # Try 'docker compose' (v2)
    $dockerCompose = docker compose version
    if (-not $?) {
        Write-Host "Error: Docker Compose is not installed." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Choose deployment type:" -ForegroundColor Yellow
Write-Host "1. Build from local source (Development)" -ForegroundColor White
Write-Host "2. Pull from GitHub (Production)" -ForegroundColor White
$choice = Read-Host "Enter choice (1 or 2)"

if ($choice -eq '2') {
    Write-Host "Pulling latest images from GitHub..." -ForegroundColor Cyan
    docker-compose -f docker-compose.prod.yml pull
    Write-Host "Starting services..." -ForegroundColor Cyan
    docker-compose -f docker-compose.prod.yml up -d
}
else {
    Write-Host "Building and starting services from local source..." -ForegroundColor Cyan
    docker-compose up -d --build
}

if ($?) {
    Write-Host ""
    Write-Host "===========================================" -ForegroundColor Green
    Write-Host "   Deployment Successful!                  " -ForegroundColor Green
    Write-Host "===========================================" -ForegroundColor Green
    Write-Host "Backend:  http://localhost:5001" -ForegroundColor White
    Write-Host "Frontend: http://localhost:5173" -ForegroundColor White
    Write-Host "Database: localhost:5432" -ForegroundColor White
    Write-Host ""
    Write-Host "To stop services, run: docker-compose down" -ForegroundColor Gray
}
else {
    Write-Host "Deployment failed." -ForegroundColor Red
}

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
