# Stop all backend and frontend processes
Write-Host "Stopping all development servers..." -ForegroundColor Yellow

# Kill processes on port 5001 (.NET backend)
Write-Host "Stopping .NET backend (port 5001)..." -ForegroundColor Yellow
$processesOnPort5001 = Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($processesOnPort5001) {
    foreach ($processId in $processesOnPort5001) {
        Write-Host "  Killing process $processId" -ForegroundColor Gray
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "  No backend processes found" -ForegroundColor Gray
}

# Kill processes on port 5173 (frontend)
Write-Host "Stopping frontend (port 5173)..." -ForegroundColor Yellow
$processesOnPort5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($processesOnPort5173) {
    foreach ($processId in $processesOnPort5173) {
        Write-Host "  Killing process $processId" -ForegroundColor Gray
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "  No frontend processes found" -ForegroundColor Gray
}

Write-Host "`nAll development servers stopped!" -ForegroundColor Green
