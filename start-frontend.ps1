# Stop any existing frontend processes
Write-Host "Stopping any existing frontend processes..." -ForegroundColor Yellow

# Kill processes on port 5173 (Vite default)
$processesOnPort5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($processesOnPort5173) {
    foreach ($processId in $processesOnPort5173) {
        Write-Host "Killing process $processId on port 5173..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

# Start the frontend
Write-Host "Starting frontend..." -ForegroundColor Green
Set-Location "$PSScriptRoot\frontend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"

Write-Host "Frontend started!" -ForegroundColor Green
Write-Host "Frontend running at http://localhost:5173" -ForegroundColor Cyan
