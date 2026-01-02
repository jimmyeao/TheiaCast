import * as si from 'systeminformation';
import { config } from './config';
import { logger } from './logger';
import { websocketClient } from './websocket';
import type { HealthReportPayload } from '@theiacast/shared';

class HealthMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  public start(): void {
    if (this.isRunning) {
      logger.warn('Health monitor already running');
      return;
    }

    logger.info(`Starting health monitor (interval: ${config.healthCheckInterval}ms)`);
    this.isRunning = true;

    // Send initial health report
    this.collectAndSendHealthReport();

    // Schedule periodic health reports
    this.intervalId = setInterval(() => {
      this.collectAndSendHealthReport();
    }, config.healthCheckInterval);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      logger.info('Health monitor stopped');
    }
  }

  private async collectAndSendHealthReport(): Promise<void> {
    try {
      const health = await this.collectHealthMetrics();
      websocketClient.sendHealthReport(health);
      logger.debug('Health report collected and sent', health);
    } catch (error: any) {
      logger.error('Failed to collect health metrics:', error.message);
    }
  }

  private async collectHealthMetrics(): Promise<HealthReportPayload> {
    const [mem, currentLoad, disk, time] = await Promise.all([
      si.mem(),
      si.currentLoad(),
      si.fsSize(),
      si.time(),
    ]);

    // Calculate disk usage (use first filesystem)
    const diskUsage = disk.length > 0 ? disk[0].use : 0;

    return {
      deviceId: 'unknown', // Set by backend from authenticated WebSocket connection
      cpuUsage: currentLoad.currentLoad,
      memoryUsage: (mem.used / mem.total) * 100,
      diskUsage,
      uptime: time.uptime,
      currentUrl: 'N/A', // Will be updated by display controller
      browserStatus: 'running',
      timestamp: new Date(),
    };
  }

  public async getHealthSnapshot(): Promise<HealthReportPayload> {
    return this.collectHealthMetrics();
  }
}

export const healthMonitor = new HealthMonitor();
