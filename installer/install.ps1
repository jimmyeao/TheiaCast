# PDS Automated Installer for Windows

$ErrorActionPreference = "Stop"
$ScriptRoot = $PSScriptRoot
$ProjectRoot = Resolve-Path "$PSScriptRoot\.."

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   PDS Kiosk System - Automated Installer  " -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Prerequisites
Write-Host "--- Step 1: Checking Prerequisites ---" -ForegroundColor Yellow
& "$ScriptRoot\prerequisites\check-dotnet.ps1"
& "$ScriptRoot\prerequisites\check-node.ps1"
& "$ScriptRoot\prerequisites\install-chrome.ps1"
Write-Host "Prerequisites check complete.`n" -ForegroundColor Green

# 2. Install Backend Dependencies
Write-Host "--- Step 2: Installing Backend Dependencies ---" -ForegroundColor Yellow
$BackendPath = "$ProjectRoot\src\PDS.Api"
if (Test-Path $BackendPath) {
    Write-Host "Restoring .NET packages in $BackendPath..."
    Push-Location $BackendPath
    try {
        dotnet restore
        Write-Host "Backend dependencies installed." -ForegroundColor Green
    }
    catch {
        Write-Host "Failed to restore backend dependencies." -ForegroundColor Red
        exit 1
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "Backend directory not found at $BackendPath" -ForegroundColor Red
}
Write-Host ""

# 3. Install Frontend Dependencies
Write-Host "--- Step 3: Installing Frontend Dependencies ---" -ForegroundColor Yellow
$FrontendPath = "$ProjectRoot\frontend"
if (Test-Path $FrontendPath) {
    Write-Host "Installing NPM packages in $FrontendPath..."
    Push-Location $FrontendPath
    try {
        npm install
        Write-Host "Frontend dependencies installed." -ForegroundColor Green
    }
    catch {
        Write-Host "Failed to install frontend dependencies." -ForegroundColor Red
        exit 1
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "Frontend directory not found at $FrontendPath" -ForegroundColor Red
}
Write-Host ""

# 4. Install Client Dependencies
Write-Host "--- Step 4: Installing Client Dependencies ---" -ForegroundColor Yellow
$ClientPath = "$ProjectRoot\client"
if (Test-Path $ClientPath) {
    Write-Host "Installing NPM packages in $ClientPath..."
    Push-Location $ClientPath
    try {
        npm install
        Write-Host "Client dependencies installed." -ForegroundColor Green
    }
    catch {
        Write-Host "Failed to install client dependencies." -ForegroundColor Red
        exit 1
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "Client directory not found at $ClientPath" -ForegroundColor Red
}
Write-Host ""

Write-Host "===========================================" -ForegroundColor Green
Write-Host "   Installation Complete!                  " -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host "You can now run 'start-everything.ps1' in the root folder to start the system." -ForegroundColor White
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
