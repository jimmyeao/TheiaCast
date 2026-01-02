# Simple test script to verify PowerShell syntax
Write-Host "Testing PowerShell syntax..." -ForegroundColor Green

# Test if-else block
$testVar = $true
if ($testVar) {
    Write-Host "  ✓ If block works" -ForegroundColor Green
}
else {
    Write-Host "  ✗ Else block" -ForegroundColor Red
}

# Test try-catch block
try {
    Write-Host "  ✓ Try block works" -ForegroundColor Green
    $result = 1 + 1
    if ($result -eq 2) {
        Write-Host "  ✓ Math still works: 1+1=$result" -ForegroundColor Green
    }
}
catch {
    Write-Host "  ✗ Something went wrong: $_" -ForegroundColor Red
}

Write-Host "Syntax test completed successfully!" -ForegroundColor Cyan
