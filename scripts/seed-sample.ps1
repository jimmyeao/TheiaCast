param(
	[string]$BaseUrl = "http://localhost:5000"
)

# Seed sample data into the PDS API for local testing
# Requires API running and accessible at $BaseUrl

$ErrorActionPreference = "Stop"

$baseUrl = $BaseUrl

Write-Host "Registering user and obtaining JWT..."
$registerBody = @{ Username = "admin"; Password = "admin" } | ConvertTo-Json
$register = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/register" -ContentType "application/json" -Body $registerBody
$token = $register.accessToken
if (-not $token) { throw "Failed to get access token" }
$headers = @{ Authorization = "Bearer $token" }

Write-Host "Creating device dev-001..."
$deviceBody = @{ deviceId = "dev-001"; name = "Lobby Screen" } | ConvertTo-Json
$device = Invoke-RestMethod -Method Post -Uri "$baseUrl/devices" -Headers $headers -ContentType "application/json" -Body $deviceBody
$deviceId = $device.id
Write-Host "Device created with id: $deviceId"

Write-Host "Creating playlist Demo..."
$playlistBody = @{ name = "Demo" } | ConvertTo-Json
$playlist = Invoke-RestMethod -Method Post -Uri "$baseUrl/playlists" -Headers $headers -ContentType "application/json" -Body $playlistBody
$playlistId = $playlist.id
Write-Host "Playlist id: $playlistId"

Write-Host "Adding playlist item..."
$itemBody = @{ playlistId = $playlistId; url = "https://example.org" } | ConvertTo-Json
$item = Invoke-RestMethod -Method Post -Uri "$baseUrl/playlists/items" -Headers $headers -ContentType "application/json" -Body $itemBody
Write-Host "Item id: $($item.id)"

Write-Host "Assigning playlist to device..."
$assignBody = @{ deviceId = $deviceId; playlistId = $playlistId } | ConvertTo-Json
$assign = Invoke-RestMethod -Method Post -Uri "$baseUrl/playlists/assign" -Headers $headers -ContentType "application/json" -Body $assignBody
Write-Host "Assigned playlist $playlistId to device $deviceId"

Write-Host "Done. Client connected as dev-001 should receive content:update."