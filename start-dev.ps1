# Start both .NET backend and React frontend development servers
Write-Host "Starting PDS Digital Signage - Development Environment" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# Stop any existing processes first
Write-Host "Stopping any existing processes..." -ForegroundColor Yellow
& "$PSScriptRoot\stop-all.ps1"
Write-Host ""

# Wait a moment for processes to fully stop
Start-Sleep -Seconds 2

# Start .NET backend
Write-Host "Starting .NET backend..." -ForegroundColor Green
Set-Location "$PSScriptRoot\src\TheiaCast.Api"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'ASP.NET Core Backend' -ForegroundColor Cyan; Write-Host '====================' -ForegroundColor Cyan; dotnet run --urls http://0.0.0.0:5001"

# Wait a moment before starting frontend
Start-Sleep -Seconds 3

# Start frontend
Write-Host "Starting frontend..." -ForegroundColor Green
Set-Location "$PSScriptRoot\frontend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'React Frontend' -ForegroundColor Cyan; Write-Host '===============' -ForegroundColor Cyan; npm run dev"

Write-Host ""
Write-Host "Development servers started!" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:5001" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "Swagger:  http://localhost:5001/swagger" -ForegroundColor Yellow
Write-Host ""
Write-Host "To stop all servers, run: .\stop-all.ps1" -ForegroundColor Gray
