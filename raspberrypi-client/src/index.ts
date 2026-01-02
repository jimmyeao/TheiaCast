#!/usr/bin/env node

import { config, configManager } from './config';
import { logger } from './logger';
import { websocketClient, DeviceStatusValues } from './websocket';
import { displayController } from './display';
import { healthMonitor } from './health';
import { screenshotManager } from './screenshot';
import { playlistExecutor } from './playlist-executor';

class KioskClient {
  private isShuttingDown = false;

  public async start(): Promise<void> {
    try {
      logger.info('===========================================');
      logger.info('  Kiosk Digital Signage Client Starting');
      logger.info('===========================================');
      logger.info(`Server URL: ${config.serverUrl}`);
      logger.info(`Display: ${config.displayWidth}x${config.displayHeight}`);
      logger.info(`Kiosk Mode: ${config.kioskMode ? 'Enabled' : 'Disabled'}`);
      logger.info('===========================================');

      // Setup signal handlers for graceful shutdown
      this.setupSignalHandlers();

      // Setup WebSocket handlers before connecting
      this.setupWebSocketHandlers();

      // Initialize display controller with current config
      // (Config updates from server will trigger display restart if needed)
      await displayController.initialize();

      // Connect to backend via WebSocket
      // This will trigger device registration and receive playlist + config
      websocketClient.connect();

      // Start health monitoring
      healthMonitor.start();

      // NOTE: Screenshot manager is started by playlist executor based on playlist type
      // - Single-item playlists: periodic screenshots every 30s
      // - Multi-item playlists: screenshots on each rotation only

      logger.info('✅ Kiosk client started successfully');
      logger.info('Waiting for playlist from server...');
    } catch (error: any) {
      logger.error('Failed to start kiosk client:', error.message);
      logger.error(error.stack);
      process.exit(1);
    }
  }

  private setupWebSocketHandlers(): void {
    // Content update handler
    websocketClient.onContentUpdate(async (payload) => {
      logger.info(`Received content update with ${payload.items.length} items`);
      await playlistExecutor.loadPlaylist(payload.items);
      playlistExecutor.start();
    });

    // Playlist control handlers
    websocketClient.onPlaylistPause(() => {
      logger.info('Playlist pause requested');
      playlistExecutor.pause();
    });

    websocketClient.onPlaylistResume(() => {
      logger.info('Playlist resume requested');
      playlistExecutor.resume();
    });

    websocketClient.onPlaylistNext((payload) => {
      logger.info('Playlist next requested');
      playlistExecutor.next(payload.respectConstraints !== false);
    });

    websocketClient.onPlaylistPrevious((payload) => {
      logger.info('Playlist previous requested');
      playlistExecutor.previous(payload.respectConstraints !== false);
    });

    websocketClient.onPlaylistBroadcastStart((payload) => {
      logger.info(`>>> Received playlist:broadcast:start event`);
      if (payload.type === 'url' && payload.url) {
        logger.info(`Playlist broadcast start (URL): ${payload.url} for ${payload.duration || 0}ms`);
        playlistExecutor.startBroadcast(payload.type, payload.url, undefined, payload.duration || 0);
      } else if (payload.type === 'message' && payload.message) {
        logger.info(`Playlist broadcast start (Message): ${payload.message} for ${payload.duration || 0}ms, Background: ${payload.background?.length || 0} chars, Logo: ${payload.logo?.length || 0} chars, Position: ${payload.logoPosition}`);
        playlistExecutor.startBroadcast(payload.type, undefined, payload.message, payload.duration || 0, payload.background, payload.logo, payload.logoPosition);
      } else if ((payload.type === 'image' || payload.type === 'video') && payload.mediaData) {
        logger.info(`Playlist broadcast start (${payload.type}): Media size ${payload.mediaData.length} chars for ${payload.duration || 0}ms`);
        playlistExecutor.startBroadcast(payload.type, undefined, undefined, payload.duration || 0, undefined, undefined, undefined, payload.mediaData);
      } else {
        logger.error('Invalid broadcast payload:', payload);
      }
    });

    websocketClient.onPlaylistBroadcastEnd(() => {
      logger.info('Playlist broadcast end requested');
      playlistExecutor.endBroadcast();
    });

    // Display navigate handler
    websocketClient.onDisplayNavigate((payload) => {
      logger.info(`Navigating to: ${payload.url}`);
      displayController.navigateTo(payload.url, payload.duration);
    });

    // Screenshot request handler
    websocketClient.onScreenshotRequest((payload) => {
      logger.info('Screenshot requested by server');
      screenshotManager.captureOnDemand();
    });

    // Server-controlled stream start/stop
    websocketClient.onStreamStart(async () => {
      logger.info('Stream start requested by server');
      await displayController.startScreencast();
    });
    websocketClient.onStreamStop(async () => {
      logger.info('Stream stop requested by server');
      await displayController.stopScreencast();
    });

    // Config update handler
    websocketClient.onConfigUpdate(async (payload) => {
      logger.info('Configuration update received', payload);

      // Track if display config changed (requires restart)
      let displayConfigChanged = false;

      // Update config with new values
      if (payload.screenshotInterval) {
        configManager.update({ screenshotInterval: payload.screenshotInterval });
        // Restart screenshot manager only if it's currently running
        // (Single-item playlists use periodic screenshots, multi-item don't)
        const wasRunning = screenshotManager.isCurrentlyRunning();
        if (wasRunning) {
          screenshotManager.stop();
          screenshotManager.start();
        }
      }

      if (payload.healthCheckInterval) {
        configManager.update({ healthCheckInterval: payload.healthCheckInterval });
        healthMonitor.stop();
        healthMonitor.start();
      }

      // Handle display configuration updates
      const currentConfig = configManager.get();

      if (payload.displayWidth !== undefined && payload.displayWidth !== currentConfig.displayWidth) {
        configManager.update({ displayWidth: payload.displayWidth });
        displayConfigChanged = true;
      }

      if (payload.displayHeight !== undefined && payload.displayHeight !== currentConfig.displayHeight) {
        configManager.update({ displayHeight: payload.displayHeight });
        displayConfigChanged = true;
      }

      if (payload.kioskMode !== undefined && payload.kioskMode !== currentConfig.kioskMode) {
        configManager.update({ kioskMode: payload.kioskMode });
        displayConfigChanged = true;
      }

      // Restart display if display config changed
      if (displayConfigChanged) {
        logger.info('Display configuration changed, restarting display...');
        await displayController.restart();
        logger.info('Display restarted with new configuration');
      }
    });

    // Device restart handler
    websocketClient.onDeviceRestart((payload) => {
      logger.warn('Device restart requested by server', payload);
      this.restart();
    });

    // Display refresh handler
    websocketClient.onDisplayRefresh((payload) => {
      logger.info('Display refresh requested', payload);
      displayController.refresh(payload.force);
    });

    // Remote control handlers
    websocketClient.onRemoteClick((payload) => {
      logger.info(`Remote click at (${payload.x}, ${payload.y})`);
      displayController.remoteClick(payload.x, payload.y, payload.button);
    });

    websocketClient.onRemoteType((payload) => {
      logger.info(`Remote type: ${payload.text.substring(0, 20)}...`);
      displayController.remoteType(payload.text, payload.selector);
    });

    websocketClient.onRemoteKey((payload) => {
      logger.info(`Remote key: ${payload.key}`);
      displayController.remoteKey(payload.key, payload.modifiers);
    });

    websocketClient.onRemoteScroll((payload) => {
      logger.info('Remote scroll requested');
      displayController.remoteScroll(payload.x, payload.y, payload.deltaX, payload.deltaY);
    });

    // Screencast control handlers
    websocketClient.onScreencastStart(() => {
      logger.info('Admin requested screencast start');
      displayController.startScreencast();
    });

    websocketClient.onScreencastStop(() => {
      logger.info('Admin requested screencast stop');
      displayController.stopScreencast();
    });
  }

  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

    signals.forEach((signal) => {
      process.on(signal, () => {
        logger.info(`\nReceived ${signal}, shutting down gracefully...`);
        this.shutdown();
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error.message);
      logger.error(error.stack || '');
      websocketClient.sendErrorReport(
        'Uncaught exception',
        error.stack,
        { message: error.message }
      );
    });

    process.on('unhandledRejection', (reason: any) => {
      logger.error('Unhandled rejection:', reason);
      websocketClient.sendErrorReport(
        'Unhandled rejection',
        reason?.stack,
        { reason: String(reason) }
      );
    });
  }

  private async restart(): Promise<void> {
    try {
      logger.warn('Restarting kiosk client...');

      // Stop all services
      playlistExecutor.stop();
      screenshotManager.stop();
      healthMonitor.stop();

      // Restart display
      await displayController.restart();

      // Restart services
      healthMonitor.start();

      // Restart playlist executor if it has a playlist
      // (Playlist executor will start screenshot manager based on playlist type)
      if (playlistExecutor.hasPlaylist()) {
        playlistExecutor.start();
      }

      logger.info('✅ Kiosk client restarted successfully');
    } catch (error: any) {
      logger.error('Failed to restart:', error.message);
      websocketClient.sendErrorReport('Restart failed', error.stack);
    }
  }

  private async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    logger.info('Shutting down kiosk client...');

    // Send offline status
    websocketClient.sendDeviceStatus(DeviceStatusValues.OFFLINE, 'Client shutting down');

    // Stop all services
    playlistExecutor.stop();
    screenshotManager.stop();
    healthMonitor.stop();

    // Disconnect WebSocket
    websocketClient.disconnect();

    // Shutdown display
    await displayController.shutdown();

    logger.info('✅ Kiosk client shut down successfully');
    process.exit(0);
  }
}

// Start the client
const client = new KioskClient();
client.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
