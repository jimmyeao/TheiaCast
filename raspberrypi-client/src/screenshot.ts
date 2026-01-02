import { Page } from 'puppeteer';
import { config } from './config';
import { logger } from './logger';
import { websocketClient } from './websocket';

class ScreenshotManager {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private page: Page | null = null;
  private lastUrl: string | null = null;
  private lastSentAt: number = 0;

  public setPage(page: Page): void {
    this.page = page;
    logger.debug('Screenshot manager page reference set');
  }

  public isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  public start(): void {
    if (this.isRunning) {
      return;
    }

    if (!this.page) {
      logger.warn('Cannot start screenshot manager: no page reference set');
      return;
    }

    const interval = config.screenshotInterval || 30000; // Default 30 seconds
    logger.info(`Starting screenshot manager with ${interval}ms interval`);
    this.isRunning = true;

    // Send periodic screenshots for monitoring
    // Especially important for single-item playlists that never change
    this.intervalId = setInterval(() => {
      this.captureAndSendScreenshot();
    }, interval);

    // Send initial screenshot
    this.captureAndSendScreenshot();
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      logger.info('Screenshot manager stopped');
    }
  }

  public async captureAndSendScreenshot(): Promise<void> {
    if (!this.page) {
      logger.warn('Cannot capture screenshot: no page reference');
      return;
    }

    try {
      // Check if page is in a valid state before attempting screenshot
      const currentUrl = this.page.url();

      // Skip if page is closed, about:blank, or in invalid state
      if (!currentUrl || currentUrl === 'about:blank') {
        logger.debug('Skipping screenshot: page not loaded or in about:blank state');
        return;
      }

      // Check if page is still open by trying to access it
      let isPageOpen = false;
      try {
        isPageOpen = !this.page.isClosed();
      } catch (e) {
        logger.warn('Page state check failed, assuming closed');
        return;
      }

      if (!isPageOpen) {
        logger.warn('Skipping screenshot: page is closed');
        return;
      }

      // Change-triggered capture: if URL changed since last capture, send immediately
      const urlChanged = this.lastUrl !== currentUrl;

      // Throttle rapid repeats: avoid >1/sec even on fast changes
      const now = Date.now();
      if (!urlChanged && now - this.lastSentAt < 900) {
        logger.debug('Skipping screenshot: recently sent');
        return;
      }

      logger.debug('Capturing screenshot...');

      const screenshot = await this.page.screenshot({
        encoding: 'base64',
        type: 'jpeg',
        quality: 50, // Reduced quality to save bandwidth
        fullPage: false,
      });

      websocketClient.sendScreenshot(screenshot as string, currentUrl);
      this.lastUrl = currentUrl;
      this.lastSentAt = now;
      logger.info(`Screenshot captured and sent (${urlChanged ? 'url change' : 'periodic'})`);
    } catch (error: any) {
      // Check if it's a "session closed" error - this is expected during navigation
      const isSessionClosed = error.message && (
        error.message.includes('Session closed') ||
        error.message.includes('Target closed') ||
        error.message.includes('Page has been closed')
      );

      if (isSessionClosed) {
        logger.debug('Screenshot skipped: page session closed (likely during navigation)');
        return; // Don't report this as an error - it's expected during transitions
      }

      // For other errors, log and report
      logger.error('Failed to capture screenshot:', error.message);

      try {
        websocketClient.sendErrorReport(
          'Screenshot capture failed',
          error.stack,
          { url: this.page?.url() || 'unknown' }
        );
      } catch (reportError) {
        // Ignore errors when trying to report errors
        logger.warn('Could not send error report:', reportError);
      }
    }
  }

  public async captureOnDemand(): Promise<void> {
    logger.info('On-demand screenshot requested');
    await this.captureAndSendScreenshot();
  }
}

export const screenshotManager = new ScreenshotManager();
