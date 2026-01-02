Write-Host "Checking for Google Chrome..." -ForegroundColor Cyan

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$chromePathx86 = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if ((Test-Path $chromePath) -or (Test-Path $chromePathx86)) {
    Write-Host "Found Google Chrome." -ForegroundColor Green
    return
}

Write-Host "Google Chrome is required for the Kiosk Client but not found." -ForegroundColor Yellow
$install = Read-Host "Do you want to install Google Chrome using Winget? (Y/N)"

if ($install -eq 'Y' -or $install -eq 'y') {
    Write-Host "Installing Google Chrome..." -ForegroundColor Cyan
    winget install Google.Chrome
    Write-Host "Chrome installed." -ForegroundColor Green
}
else {
    Write-Host "Please install Google Chrome manually." -ForegroundColor Red
    # We don't exit here strictly, as maybe they have it in a weird path, but warn them.
}
