<#
.SYNOPSIS
    Builds the TheiaCast Kiosk Client installer

.DESCRIPTION
    Publishes the .NET project, installs Playwright browsers, and compiles the Inno Setup installer.
    Requires Inno Setup to be installed.

.EXAMPLE
    .\BuildInstaller.ps1
#>

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "TheiaCast Kiosk Client Installer Builder" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $ScriptDir "KioskClient.Service"
$PublishDir = Join-Path $ScriptDir "publish"
$SetupScript = Join-Path $ScriptDir "Setup.iss"

# Check for Inno Setup
Write-Host "[1/5] Checking for Inno Setup..." -ForegroundColor Yellow
$InnoSetupPaths = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 5\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 5\ISCC.exe"
)

$ISCC = $null
foreach ($path in $InnoSetupPaths) {
    if (Test-Path $path) {
        $ISCC = $path
        break
    }
}

if (-not $ISCC) {
    Write-Error @"
Inno Setup not found!

Please install Inno Setup from: https://jrsoftware.org/isdl.php

After installation, run this script again.
"@
    exit 1
}

Write-Host "  ✓ Found Inno Setup: $ISCC" -ForegroundColor Green
Write-Host ""

# Clean previous publish
Write-Host "[2/5] Cleaning previous build..." -ForegroundColor Yellow
if (Test-Path $PublishDir) {
    Remove-Item -Path $PublishDir -Recurse -Force
    Write-Host "  ✓ Cleaned publish directory" -ForegroundColor Green
} else {
    Write-Host "  ✓ No previous build found" -ForegroundColor Green
}
Write-Host ""

# Build and publish
Write-Host "[3/5] Publishing .NET project..." -ForegroundColor Yellow
Push-Location $ProjectDir
try {
    # Publish as framework-dependent (smaller size, requires .NET runtime on target)
    dotnet publish -c Release -o $PublishDir --no-self-contained

    if ($LASTEXITCODE -ne 0) {
        throw "Publish failed with exit code $LASTEXITCODE"
    }
    Write-Host "  ✓ Project published successfully" -ForegroundColor Green
} catch {
    Write-Error "Publish failed: $_"
    Pop-Location
    exit 1
}
Pop-Location
Write-Host ""

# Install Playwright browsers
Write-Host "[4/5] Installing Playwright browsers..." -ForegroundColor Yellow
Push-Location $PublishDir
try {
    # Set PLAYWRIGHT_BROWSERS_PATH so browsers install to publish folder, not user's AppData
    $env:PLAYWRIGHT_BROWSERS_PATH = $PublishDir
    & ".\playwright.ps1" install chromium
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Playwright browsers installed to: $PublishDir\ms-playwright" -ForegroundColor Green
    } else {
        Write-Warning "  Playwright installation completed with warnings (code: $LASTEXITCODE)"
        Write-Host "  Continuing with build..." -ForegroundColor Gray
    }
} catch {
    Write-Warning "Playwright browser installation encountered an issue: $_"
    Write-Host "  Continuing with build..." -ForegroundColor Gray
}
Pop-Location
Write-Host ""

# Create icon file if it doesn't exist
$IconFile = Join-Path $ScriptDir "icon.ico"
if (-not (Test-Path $IconFile)) {
    Write-Host "  Note: No icon.ico found, installer will use default icon" -ForegroundColor Gray
}

# Compile Inno Setup script
Write-Host "[5/5] Compiling Inno Setup installer..." -ForegroundColor Yellow
try {
    & $ISCC $SetupScript

    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup compilation failed with exit code $LASTEXITCODE"
    }

    Write-Host "  ✓ Installer compiled successfully" -ForegroundColor Green
} catch {
    Write-Error "Installer compilation failed: $_"
    exit 1
}
Write-Host ""

# Find the output installer
$InstallerPath = Join-Path $ScriptDir "TheiaCastKioskClient-Setup.exe"
if (Test-Path $InstallerPath) {
    $InstallerSize = (Get-Item $InstallerPath).Length / 1MB

    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Build Complete!" -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Installer created: TheiaCastKioskClient-Setup.exe" -ForegroundColor Green
    Write-Host "Size: $([math]::Round($InstallerSize, 2)) MB" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Usage Examples:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Interactive installation:" -ForegroundColor Gray
    Write-Host "  TheiaCastKioskClient-Setup.exe" -ForegroundColor White
    Write-Host ""
    Write-Host "Silent installation with parameters:" -ForegroundColor Gray
    Write-Host "  TheiaCastKioskClient-Setup.exe /VERYSILENT /ServerUrl=http://server:5001 /DeviceId=kiosk1 /DeviceToken=abc123" -ForegroundColor White
    Write-Host ""
    Write-Host "Remote deployment:" -ForegroundColor Gray
    Write-Host "  Copy-Item TheiaCastKioskClient-Setup.exe \\\\REMOTE-PC\\C`$\\Temp\\" -ForegroundColor White
    Write-Host "  Invoke-Command -ComputerName REMOTE-PC { C:\\Temp\\TheiaCastKioskClient-Setup.exe /VERYSILENT ... }" -ForegroundColor White
    Write-Host ""
} else {
    Write-Error "Installer was not created successfully"
    exit 1
}
