# Package PDS Kiosk Client for Intune Win32 Deployment
# This script packages the installer for Intune using Microsoft Win32 Content Prep Tool

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,

    [Parameter(Mandatory=$true)]
    [string]$DeviceToken,

    [string]$IntuneWinAppUtilPath = "C:\IntuneTools\IntuneWinAppUtil.exe",

    [string]$OutputFolder = "C:\IntunePackaging"
)

Write-Host "=== PDS Kiosk Client - Intune Win32 App Packager ===" -ForegroundColor Cyan
Write-Host ""

# Check if installer exists
$installerPath = ".\PDSKioskClient-Setup.exe"
if (-not (Test-Path $installerPath)) {
    Write-Host "ERROR: Installer not found at $installerPath" -ForegroundColor Red
    Write-Host "Please run BuildInstaller.ps1 first to create the installer." -ForegroundColor Yellow
    exit 1
}

# Check if Win32 Content Prep Tool exists
if (-not (Test-Path $IntuneWinAppUtilPath)) {
    Write-Host "Microsoft Win32 Content Prep Tool not found!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Download it from:" -ForegroundColor Cyan
    Write-Host "https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/releases" -ForegroundColor White
    Write-Host ""
    Write-Host "Extract IntuneWinAppUtil.exe to this folder and run again." -ForegroundColor Yellow
    exit 1
}

# Create source folder for packaging
$sourceFolder = ".\IntunePackage"

Write-Host "[1/3] Preparing package folder..." -ForegroundColor Yellow
if (Test-Path $sourceFolder) {
    Remove-Item $sourceFolder -Recurse -Force
}
New-Item -ItemType Directory -Path $sourceFolder | Out-Null

# Copy installer to source folder
Copy-Item $installerPath -Destination $sourceFolder
Write-Host "  Copied installer to package folder" -ForegroundColor Green

# Create output folder if needed
if (-not (Test-Path $OutputFolder)) {
    New-Item -ItemType Directory -Path $OutputFolder | Out-Null
    Write-Host "  Created output folder: $OutputFolder" -ForegroundColor Green
}

# Package using IntuneWinAppUtil
Write-Host ""
Write-Host "[2/3] Creating .intunewin package..." -ForegroundColor Yellow
$setupFile = "PDSKioskClient-Setup.exe"
& $IntuneWinAppUtilPath -c $sourceFolder -s $setupFile -o $OutputFolder -q

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Package created successfully" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Failed to create package" -ForegroundColor Red
    exit 1
}

# Generate deployment info
Write-Host ""
Write-Host "[3/3] Generating deployment information..." -ForegroundColor Yellow

$deploymentInfo = @"
=== INTUNE WIN32 APP DEPLOYMENT INFORMATION ===

Package File: $OutputFolder\PDSKioskClient-Setup.intunewin

INSTALL COMMAND:
PDSKioskClient-Setup.exe /VERYSILENT /ServerUrl=$ServerUrl /DeviceId=%COMPUTERNAME% /DeviceToken=$DeviceToken

UNINSTALL COMMAND:
"C:\Program Files (x86)\PDS\KioskClient\uninstallexe" /VERYSILENT

DETECTION RULES:
Rule Type: File
Path: C:\Program Files (x86)\PDS\KioskClient
File: KioskClient.Service.exe
Detection Method: File or folder exists

REQUIREMENTS:
Operating System: Windows 10 1607+ (64-bit)
Minimum Disk Space: 500 MB
Minimum Memory: 2 GB

NOTES:
- DeviceId defaults to computer name using %COMPUTERNAME%
- ServerUrl: $ServerUrl
- DeviceToken: (hidden for security)
- App will auto-start on user login via Scheduled Task
- Browser window will be visible in user session
- Requires admin/SYSTEM privileges for installation

INTUNE DEPLOYMENT STEPS:
1. Upload PDSKioskClient-Setup.intunewin to Intune
2. Set install/uninstall commands above
3. Configure detection rule (file exists)
4. Set requirements (OS, disk, memory)
5. Assign to device groups
6. Monitor deployment status

TROUBLESHOOTING:
- Event Viewer: Application logs for errors
- Installation log: C:\Windows\Temp\PDSKioskClient-Setup.log
- App logs: C:\Program Files (x86)\PDS\KioskClient\logs
"@

$infoFile = "$OutputFolder\DeploymentInfo.txt"
$deploymentInfo | Out-File -FilePath $infoFile -Encoding UTF8

Write-Host "  Deployment info saved to: $infoFile" -ForegroundColor Green
Write-Host ""
Write-Host "=== PACKAGE COMPLETE ===" -ForegroundColor Green
Write-Host ""
Write-Host "Package location: $OutputFolder\PDSKioskClient-Setup.intunewin" -ForegroundColor Cyan
Write-Host "Deployment info: $infoFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "Install Command:" -ForegroundColor Yellow
Write-Host "PDSKioskClient-Setup.exe /VERYSILENT /ServerUrl=$ServerUrl /DeviceId=%COMPUTERNAME% /DeviceToken=$DeviceToken" -ForegroundColor White
Write-Host ""
Write-Host "Uninstall Command:" -ForegroundColor Yellow
Write-Host '"C:\Program Files (x86)\PDS\KioskClient\uninstallexe" /VERYSILENT' -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open Microsoft Endpoint Manager admin center" -ForegroundColor White
Write-Host "2. Go to Apps > Windows > Add > Windows app (Win32)" -ForegroundColor White
Write-Host "3. Upload the .intunewin package" -ForegroundColor White
Write-Host "4. Configure using the deployment info above" -ForegroundColor White
Write-Host "5. Assign to device groups" -ForegroundColor White
