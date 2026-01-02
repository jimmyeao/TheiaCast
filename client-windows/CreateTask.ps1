# Simple script to create the scheduled task
# Run this as Administrator (or with Intune EPM)
# Detects the actual logged-in user, not the elevated user

$TaskName = "TheiaCastKioskClient-AutoStart"
$ExePath = "C:\Program Files\TheiaCast\KioskClient\KioskClient.Service.exe"
$WorkingDir = "C:\Program Files\TheiaCast\KioskClient"

Write-Host "Detecting actual logged-in user..." -ForegroundColor Cyan

# Get the actual logged-in user (not the elevated user)
# We do this by finding the owner of explorer.exe
$explorerProcess = Get-WmiObject Win32_Process -Filter "name = 'explorer.exe'" | Select-Object -First 1
if ($explorerProcess) {
    $owner = $explorerProcess.GetOwner()
    $actualUser = "$($owner.Domain)\$($owner.User)"
    Write-Host "Actual logged-in user: $actualUser" -ForegroundColor Green
} else {
    Write-Error "Could not detect logged-in user (explorer.exe not found)"
    Write-Host "Falling back to environment user: $env:USERDOMAIN\$env:USERNAME" -ForegroundColor Yellow
    $actualUser = "$env:USERDOMAIN\$env:USERNAME"
}

Write-Host ""
Write-Host "Creating scheduled task: $TaskName" -ForegroundColor Cyan
Write-Host "Executable: $ExePath" -ForegroundColor Gray
Write-Host "User: $actualUser" -ForegroundColor Gray
Write-Host ""

if (-not (Test-Path $ExePath)) {
    Write-Error "Executable not found at: $ExePath"
    Write-Host "Make sure the application is installed." -ForegroundColor Red
    exit 1
}

try {
    # Remove existing task if it exists
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "Removing existing task..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    # Create task components
    $action = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory $WorkingDir
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId $actualUser -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

    # Register the task
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Auto-start TheiaCast Kiosk Client on user login" -Force | Out-Null

    Write-Host "Task created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Starting task now..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 2

    # Check if it's running
    $task = Get-ScheduledTask -TaskName $TaskName
    Write-Host "Task state: $($task.State)" -ForegroundColor $(if ($task.State -eq 'Running') { 'Green' } else { 'Yellow' })
    Write-Host ""
    Write-Host "The browser window should now be visible!" -ForegroundColor Green

} catch {
    Write-Error "Failed to create scheduled task: $_"
    Write-Host ""
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
