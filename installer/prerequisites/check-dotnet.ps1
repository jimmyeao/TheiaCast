Write-Host "Checking for .NET 8 SDK..." -ForegroundColor Cyan

try {
    $dotnetVersion = dotnet --version
    if ($dotnetVersion.StartsWith("8.")) {
        Write-Host "Found .NET version $dotnetVersion" -ForegroundColor Green
        return
    }
}
catch {
    Write-Host ".NET SDK not found or error checking version." -ForegroundColor Yellow
}

Write-Host ".NET 8 SDK is required but not found." -ForegroundColor Yellow
$install = Read-Host "Do you want to install .NET 8 SDK using Winget? (Y/N)"

if ($install -eq 'Y' -or $install -eq 'y') {
    Write-Host "Installing .NET 8 SDK..." -ForegroundColor Cyan
    winget install Microsoft.DotNet.SDK.8
    
    # Refresh env vars
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host "Please restart your terminal after installation if commands fail." -ForegroundColor Yellow
}
else {
    Write-Host "Please install .NET 8 SDK manually from https://dotnet.microsoft.com/download/dotnet/8.0" -ForegroundColor Red
    exit 1
}
