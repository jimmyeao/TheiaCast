#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Converts PowerPoint presentations to MP4 videos for kiosk display.

.DESCRIPTION
    Batch converts all PowerPoint files in a folder to MP4 videos,
    preserving transitions and animations. Videos can then be added
    to the kiosk content playlist.

.PARAMETER InputFolder
    Folder containing PowerPoint files (.pptx, .ppt)

.PARAMETER OutputFolder
    Folder to save MP4 videos (default: same as input)

.PARAMETER Quality
    Video quality: 1=HD720p, 2=HD1080p, 3=UHD4K (default: 2)

.PARAMETER SecondsPerSlide
    Seconds to display each slide (default: 5)

.PARAMETER FrameRate
    Video frame rate (default: 30)

.EXAMPLE
    .\Convert-PowerPointToVideo.ps1 -InputFolder "C:\Presentations" -Quality 2 -SecondsPerSlide 10
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$InputFolder,

    [string]$OutputFolder = "",

    [ValidateSet(1, 2, 3)]
    [int]$Quality = 2,  # 1=720p, 2=1080p, 3=4K

    [int]$SecondsPerSlide = 5,

    [int]$FrameRate = 30
)

$ErrorActionPreference = "Stop"

# Set output folder to input folder if not specified
if ([string]::IsNullOrWhiteSpace($OutputFolder)) {
    $OutputFolder = $InputFolder
}

# Validate folders
if (-not (Test-Path $InputFolder)) {
    Write-Host "[ERROR] Input folder not found: $InputFolder" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $OutputFolder)) {
    New-Item -ItemType Directory -Path $OutputFolder -Force | Out-Null
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PowerPoint to Video Converter" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Input Folder:       $InputFolder" -ForegroundColor White
Write-Host "Output Folder:      $OutputFolder" -ForegroundColor White
Write-Host "Quality:            $(switch($Quality){1{'720p'}2{'1080p'}3{'4K'}default{'Unknown'}})" -ForegroundColor White
Write-Host "Seconds per Slide:  $SecondsPerSlide" -ForegroundColor White
Write-Host "Frame Rate:         $FrameRate fps" -ForegroundColor White
Write-Host ""

# Find PowerPoint files
$pptFiles = Get-ChildItem $InputFolder -Include "*.pptx","*.ppt" -Recurse
if ($pptFiles.Count -eq 0) {
    Write-Host "[ERROR] No PowerPoint files found in $InputFolder" -ForegroundColor Red
    exit 1
}

Write-Host "Found $($pptFiles.Count) PowerPoint file(s)" -ForegroundColor Green
Write-Host ""

# Create PowerPoint COM object
try {
    Write-Host "Starting PowerPoint..." -ForegroundColor Yellow
    $powerpoint = New-Object -ComObject PowerPoint.Application
    $powerpoint.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
    Write-Host "  [OK] PowerPoint started" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERROR] Failed to start PowerPoint: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure Microsoft PowerPoint is installed" -ForegroundColor Yellow
    exit 1
}

$successCount = 0
$failCount = 0

# Convert each presentation
foreach ($file in $pptFiles) {
    try {
        Write-Host "Converting: $($file.Name)" -ForegroundColor Cyan

        # Open presentation
        $presentation = $powerpoint.Presentations.Open($file.FullName, $false, $false, $false)
        Write-Host "  [1/3] Opened presentation ($($presentation.Slides.Count) slides)" -ForegroundColor White

        # Determine output path
        $outputPath = Join-Path $OutputFolder "$($file.BaseName).mp4"

        # Create video
        Write-Host "  [2/3] Creating video (this may take several minutes)..." -ForegroundColor Yellow

        # CreateVideo parameters:
        # - FileName: Output path
        # - UseTimingsAndNarrations: $false = use default timing
        # - VertResolution: 1=720p, 2=1080p, 3=4K
        # - FramesPerSecond: 30, 60, etc.
        # - Quality: 1-100 (default 85)
        $presentation.CreateVideo($outputPath, $false, $Quality, $FrameRate, $SecondsPerSlide, 85)

        # Wait for conversion to complete
        $lastStatus = -1
        while ($presentation.CreateVideoStatus -eq 0) {
            Start-Sleep -Milliseconds 500

            # Show progress if available
            # Note: CreateVideoStatus returns: 0=InProgress, 1=Done, 2=Failed
        }

        if ($presentation.CreateVideoStatus -eq 1) {
            $fileSize = (Get-Item $outputPath).Length / 1MB
            Write-Host "  [3/3] Conversion complete! ($([math]::Round($fileSize, 2)) MB)" -ForegroundColor Green
            Write-Host "        Output: $outputPath" -ForegroundColor Gray
            $successCount++
        } else {
            Write-Host "  [!] Conversion failed" -ForegroundColor Red
            $failCount++
        }

        # Close presentation
        $presentation.Close()
        Write-Host ""

    } catch {
        Write-Host "  [ERROR] $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        $failCount++
    }
}

# Cleanup
try {
    $powerpoint.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($powerpoint) | Out-Null
} catch {
    # Ignore cleanup errors
}

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Conversion Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Success: $successCount file(s)" -ForegroundColor Green
Write-Host "Failed:  $failCount file(s)" -ForegroundColor $(if($failCount -gt 0){'Red'}else{'Gray'})
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Copy MP4 files to your backend server (e.g., wwwroot/videos/)" -ForegroundColor White
Write-Host "  2. Add video URLs to kiosk content in admin dashboard" -ForegroundColor White
Write-Host "  3. Example URL: http://your-server:5001/videos/presentation.mp4" -ForegroundColor White
Write-Host ""

exit 0
