#!/bin/bash

echo "Cleaning up existing Chromium processes and profile..."

# Kill all Chromium processes
pkill -9 chromium-browser 2>/dev/null
pkill -9 chromium 2>/dev/null

# Wait a moment for processes to die
sleep 1

# Remove profile lock files (but keep cookies/session data)
rm -f /tmp/kiosk-browser-profile/SingletonLock 2>/dev/null
rm -f /tmp/kiosk-browser-profile/SingletonCookie 2>/dev/null
rm -f /tmp/kiosk-browser-profile/SingletonSocket 2>/dev/null

# Optional: Uncomment to completely reset the profile (will lose sessions)
# rm -rf /tmp/kiosk-browser-profile

echo "Cleanup complete. Starting kiosk client..."
npm start
