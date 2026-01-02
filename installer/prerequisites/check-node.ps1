Write-Host "Checking for Node.js..." -ForegroundColor Cyan

try {
    $nodeVersion = node -v
    if ($nodeVersion) {
        Write-Host "Found Node.js version $nodeVersion" -ForegroundColor Green
        return
    }
}
catch {
    Write-Host "Node.js not found." -ForegroundColor Yellow
}

Write-Host "Node.js is required but not found." -ForegroundColor Yellow
$install = Read-Host "Do you want to install Node.js (LTS) using Winget? (Y/N)"

if ($install -eq 'Y' -or $install -eq 'y') {
    Write-Host "Installing Node.js LTS..." -ForegroundColor Cyan
    winget install OpenJS.NodeJS.LTS
    
    # Refresh env vars
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host "Please restart your terminal after installation if commands fail." -ForegroundColor Yellow
}
else {
    Write-Host "Please install Node.js manually from https://nodejs.org/" -ForegroundColor Red
    exit 1
}
