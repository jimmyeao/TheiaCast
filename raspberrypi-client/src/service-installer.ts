#!/usr/bin/env ts-node
/**
 * Service Installer Script
 *
 * This script generates a Windows service wrapper for the Kiosk client using node-windows.
 * The generated service executable will be used by the WiX installer.
 *
 * Usage:
 *   npm run build:service
 *
 * Output:
 *   installer/service/ - Contains generated service wrapper files
 */

import * as fs from 'fs';
import * as path from 'path';

// Note: node-windows requires admin privileges to install services
// This script only generates the service configuration for packaging
const Service = require('node-windows').Service;

const ROOT_DIR = path.join(__dirname, '..');
const INSTALLER_DIR = path.join(ROOT_DIR, 'installer');
const SERVICE_DIR = path.join(INSTALLER_DIR, 'service');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Service configuration
const SERVICE_CONFIG = {
  name: 'KioskClient',
  displayName: 'Kiosk Digital Signage Client',
  description: 'Manages digital signage display, playlist execution, and remote control for kiosk devices',
  script: path.join(DIST_DIR, 'index.js'),
  nodeOptions: [
    '--max_old_space_size=2048'
  ],
  env: [
    {
      name: 'NODE_ENV',
      value: 'production'
    }
  ],
  // Service will restart automatically on failure
  maxRetries: 3,
  maxRestarts: 10,
  // Wait 60 seconds before restarting
  wait: 60,
  // Grow wait time by 25% on each restart
  grow: 0.25,
  // Log stdout and stderr to files
  logpath: path.join(ROOT_DIR, 'logs'),
  // Run as Local System account (can be changed to custom account)
  account: undefined, // undefined = Local System
  password: undefined
};

/**
 * Generate service configuration file for WiX installer
 */
function generateServiceConfig() {
  console.log('🔧 Generating Windows service configuration...\n');

  // Ensure directories exist
  if (!fs.existsSync(INSTALLER_DIR)) {
    fs.mkdirSync(INSTALLER_DIR, { recursive: true });
    console.log(`✓ Created installer directory: ${INSTALLER_DIR}`);
  }

  if (!fs.existsSync(SERVICE_DIR)) {
    fs.mkdirSync(SERVICE_DIR, { recursive: true });
    console.log(`✓ Created service directory: ${SERVICE_DIR}`);
  }

  // Check if dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`❌ Error: dist/ directory not found. Please run 'npm run build' first.`);
    process.exit(1);
  }

  // Check if index.js exists
  if (!fs.existsSync(SERVICE_CONFIG.script)) {
    console.error(`❌ Error: ${SERVICE_CONFIG.script} not found. Please run 'npm run build' first.`);
    process.exit(1);
  }

  console.log('\n📋 Service Configuration:');
  console.log(`   Name: ${SERVICE_CONFIG.name}`);
  console.log(`   Display Name: ${SERVICE_CONFIG.displayName}`);
  console.log(`   Description: ${SERVICE_CONFIG.description}`);
  console.log(`   Script: ${SERVICE_CONFIG.script}`);
  console.log(`   Account: ${SERVICE_CONFIG.account || 'Local System'}`);
  console.log(`   Max Retries: ${SERVICE_CONFIG.maxRetries}`);
  console.log(`   Restart Wait: ${SERVICE_CONFIG.wait}s`);

  // Generate XML configuration for WiX
  const serviceXmlPath = path.join(SERVICE_DIR, 'service-config.xml');
  const serviceXml = `<?xml version="1.0" encoding="utf-8"?>
<ServiceConfig>
  <ServiceName>${SERVICE_CONFIG.name}</ServiceName>
  <DisplayName>${SERVICE_CONFIG.displayName}</DisplayName>
  <Description>${SERVICE_CONFIG.description}</Description>
  <ScriptPath>${SERVICE_CONFIG.script}</ScriptPath>
  <NodePath>[INSTALLDIR]nodejs\\node.exe</NodePath>
  <WorkingDirectory>[INSTALLDIR]app</WorkingDirectory>
  <LogPath>[INSTALLDIR]logs</LogPath>
  <MaxRetries>${SERVICE_CONFIG.maxRetries}</MaxRetries>
  <MaxRestarts>${SERVICE_CONFIG.maxRestarts}</MaxRestarts>
  <RestartWait>${SERVICE_CONFIG.wait}</RestartWait>
  <Account>${SERVICE_CONFIG.account || 'LocalSystem'}</Account>
</ServiceConfig>`;

  fs.writeFileSync(serviceXmlPath, serviceXml, 'utf8');
  console.log(`\n✓ Service configuration written to: ${serviceXmlPath}`);

  // Generate batch script for manual service installation (for testing)
  const installScriptPath = path.join(SERVICE_DIR, 'install-service.bat');
  const installScript = `@echo off
REM Manual service installation script for testing
REM Run with Administrator privileges

echo Installing Kiosk Client Windows Service...

set NODE_PATH=%~dp0..\\..\\..\\nodejs\\node.exe
set SCRIPT_PATH=%~dp0..\\..\\dist\\index.js
set WORKING_DIR=%~dp0..\\..

REM Install using node-windows (requires node-windows to be installed globally or in project)
node -e "var Service = require('node-windows').Service; var svc = new Service({name: '${SERVICE_CONFIG.name}', displayName: '${SERVICE_CONFIG.displayName}', description: '${SERVICE_CONFIG.description}', script: '%SCRIPT_PATH%', nodeOptions: ['--max_old_space_size=2048'], env: [{name: 'NODE_ENV', value: 'production'}], maxRetries: ${SERVICE_CONFIG.maxRetries}, maxRestarts: ${SERVICE_CONFIG.maxRestarts}, wait: ${SERVICE_CONFIG.wait}, grow: ${SERVICE_CONFIG.grow}}); svc.on('install', function() {console.log('Service installed successfully!'); svc.start();}); svc.on('alreadyinstalled', function() {console.log('Service already installed.');}); svc.on('error', function(err) {console.error('Error:', err);}); svc.install();"

echo Done!
pause
`;

  fs.writeFileSync(installScriptPath, installScript, 'utf8');
  console.log(`✓ Manual install script written to: ${installScriptPath}`);

  // Generate uninstall script
  const uninstallScriptPath = path.join(SERVICE_DIR, 'uninstall-service.bat');
  const uninstallScript = `@echo off
REM Manual service uninstallation script for testing
REM Run with Administrator privileges

echo Uninstalling Kiosk Client Windows Service...

set SCRIPT_PATH=%~dp0..\\..\\dist\\index.js

node -e "var Service = require('node-windows').Service; var svc = new Service({name: '${SERVICE_CONFIG.name}', script: '%SCRIPT_PATH%'}); svc.on('uninstall', function() {console.log('Service uninstalled successfully!');}); svc.on('alreadyuninstalled', function() {console.log('Service not installed.');}); svc.on('error', function(err) {console.error('Error:', err);}); svc.uninstall();"

echo Done!
pause
`;

  fs.writeFileSync(uninstallScriptPath, uninstallScript, 'utf8');
  console.log(`✓ Manual uninstall script written to: ${uninstallScriptPath}`);

  // Generate README for service directory
  const readmePath = path.join(SERVICE_DIR, 'README.md');
  const readme = `# Windows Service Configuration

This directory contains the generated Windows service configuration for the Kiosk client.

## Files

- **service-config.xml** - Service configuration for WiX installer
- **install-service.bat** - Manual service installation script (for testing)
- **uninstall-service.bat** - Manual service uninstallation script (for testing)

## Service Details

- **Service Name:** ${SERVICE_CONFIG.name}
- **Display Name:** ${SERVICE_CONFIG.displayName}
- **Description:** ${SERVICE_CONFIG.description}
- **Start Type:** Automatic (Delayed Start)
- **Account:** Local System

## Manual Testing

To manually test the service installation (requires Administrator privileges):

1. Build the client: \`npm run build\`
2. Run \`install-service.bat\` as Administrator
3. Check service status: \`sc query KioskClient\`
4. Start service: \`sc start KioskClient\`
5. Stop service: \`sc stop KioskClient\`
6. Uninstall: Run \`uninstall-service.bat\` as Administrator

## WiX Integration

The WiX installer will:
1. Copy client files to Program Files
2. Install Node.js runtime
3. Create the Windows service using ServiceInstall element
4. Configure service to start automatically
5. Start the service after installation

## Recovery Configuration

The service is configured with automatic recovery:
- **First failure:** Restart service after 60 seconds
- **Second failure:** Restart service after 90 seconds (60s + 25% growth)
- **Subsequent failures:** Restart service with growing wait time
- **Max retries:** ${SERVICE_CONFIG.maxRetries} immediate retries
- **Max restarts:** ${SERVICE_CONFIG.maxRestarts} total restarts

## Logs

Service logs are written to:
- **Windows Event Viewer:** Application log (source: ${SERVICE_CONFIG.name})
- **File logs:** [INSTALLDIR]logs/ directory

## Notes

- The service runs as Local System by default
- For network access, consider using a domain account or Network Service
- Service requires .NET Framework or Node.js to be installed
- WiX installer bundles Node.js runtime to eliminate external dependencies
`;

  fs.writeFileSync(readmePath, readme, 'utf8');
  console.log(`✓ README written to: ${readmePath}`);

  console.log('\n✅ Service configuration generation complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Create WiX source files (Product.wxs, ConfigDialog.wxs)');
  console.log('   2. Run build.bat to generate installer MSI');
  console.log('   3. Test MSI installation on Windows');
  console.log('   4. Deploy via Intune\n');
}

// Run the generator
try {
  generateServiceConfig();
  process.exit(0);
} catch (error) {
  console.error('\n❌ Error generating service configuration:', error);
  process.exit(1);
}
