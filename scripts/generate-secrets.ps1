# TheiaCast Secret Generator
# Generates random secrets for JWT and HMAC license validation

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         TheiaCast Secret Generator                       ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Generate JWT Secret (32 characters)
$jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})

# Generate HMAC License Secret (64 characters)
$hmacSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})

Write-Host "Generated Secrets:" -ForegroundColor Green
Write-Host ""
Write-Host "JWT Secret (32 chars):" -ForegroundColor Yellow
Write-Host $jwtSecret -ForegroundColor White
Write-Host ""
Write-Host "HMAC License Secret (64 chars):" -ForegroundColor Yellow
Write-Host $hmacSecret -ForegroundColor White
Write-Host ""

# Ask if user wants to update appsettings.json
Write-Host "Do you want to update appsettings.json with these secrets? (y/n): " -NoNewline
$response = Read-Host

if ($response -eq 'y' -or $response -eq 'Y') {
    $appsettingsPath = "src\TheiaCast.Api\appsettings.json"

    if (Test-Path $appsettingsPath) {
        # Read current appsettings.json
        $json = Get-Content $appsettingsPath -Raw | ConvertFrom-Json

        # Update secrets
        $json.Jwt.Secret = $jwtSecret
        $json.License.Secret = $hmacSecret

        # Save updated file
        $json | ConvertTo-Json -Depth 10 | Set-Content $appsettingsPath

        Write-Host ""
        Write-Host "✓ Updated $appsettingsPath with new secrets" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "⚠ File not found: $appsettingsPath" -ForegroundColor Yellow
        Write-Host "Please copy appsettings.example.json to appsettings.json first" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "Secrets generated but not saved. Copy them manually to appsettings.json" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "⚠ IMPORTANT:" -ForegroundColor Red
Write-Host "  - Keep these secrets secure" -ForegroundColor Yellow
Write-Host "  - Do NOT commit appsettings.json to Git" -ForegroundColor Yellow
Write-Host "  - The HMAC secret is used for license generation and validation" -ForegroundColor Yellow
Write-Host ""
