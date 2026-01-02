# Fix browser profile permissions/corruption
# Run as Administrator

Write-Host "Fixing browser profile..." -ForegroundColor Cyan
Write-Host ""

# Stop the task
Write-Host "Stopping scheduled task..." -ForegroundColor Yellow
Stop-ScheduledTask -TaskName "TheiaCastKioskClient-AutoStart" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Kill any running KioskClient processes
Write-Host "Stopping any running KioskClient processes..." -ForegroundColor Yellow
Get-Process -Name "KioskClient.Service" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*TheiaCast*" } | Stop-Process -Force
Start-Sleep -Seconds 2

# Delete the corrupted profile
$profileDir = "C:\ProgramData\TheiaCast\browser-profile"
if (Test-Path $profileDir) {
    Write-Host "Deleting corrupted profile: $profileDir" -ForegroundColor Yellow
    Remove-Item -Path $profileDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  V Profile deleted" -ForegroundColor Green
} else {
    Write-Host "  No existing profile found" -ForegroundColor Gray
}
Write-Host ""

# Recreate the directory with proper permissions
Write-Host "Creating profile directory with proper permissions..." -ForegroundColor Yellow
New-Item -Path $profileDir -ItemType Directory -Force | Out-Null

# Grant full control to Users group
$acl = Get-Acl $profileDir
$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule("Users", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.SetAccessRule($accessRule)
Set-Acl -Path $profileDir -AclObject $acl
Write-Host "  V Permissions set" -ForegroundColor Green
Write-Host ""

# Restart the task
Write-Host "Starting scheduled task..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName "TheiaCastKioskClient-AutoStart"
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Profile fixed! The browser should now start properly." -ForegroundColor Green
Write-Host "Check for the browser window..." -ForegroundColor Gray
