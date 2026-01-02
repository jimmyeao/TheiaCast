# PDS Digital Signage - Start Development Environment
# This script starts backend and frontend for development

Write-Host "===========================================  " -ForegroundColor Cyan
Write-Host "  PDS Digital Signage - Starting Dev Env  " -ForegroundColor Cyan
Write-Host "=========================================== `n" -ForegroundColor Cyan

# 1. Start Backend
Write-Host "[1/2] Starting backend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\src\PDS.Api'; dotnet run" -WindowStyle Normal

Write-Host "Waiting for backend to start..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# 2. Start Frontend
Write-Host "`n[2/2] Starting frontend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev" -WindowStyle Normal

Write-Host "Waiting for frontend to start..." -ForegroundColor Gray
Start-Sleep -Seconds 3

Write-Host "`n========================================== " -ForegroundColor Green
Write-Host "  Development environment started!         " -ForegroundColor Green
Write-Host "=========================================== `n" -ForegroundColor Green

Write-Host "Backend:  http://localhost:5001" -ForegroundColor White
Write-Host "Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "Swagger:  http://localhost:5001/swagger`n" -ForegroundColor White

Write-Host "Login credentials:" -ForegroundColor Cyan
Write-Host "  Username: admin" -ForegroundColor White
Write-Host "  Password: admin123`n" -ForegroundColor White

Write-Host "Note: Client applications (Windows or Raspberry Pi) should be" -ForegroundColor Yellow
Write-Host "      started separately as services or standalone processes.`n" -ForegroundColor Yellow

Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
