import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from working directory (not relative to __dirname which changes after compilation)
// This allows the .env file to be in /opt/theiacast-client/ when running as a service
dotenv.config({ path: path.join(process.cwd(), '.env') });

export interface ClientConfig {
  // Server
  serverUrl: string;

  // Device
  deviceToken: string; // Token contains all device identity info

  // Display
  displayWidth: number;
  displayHeight: number;
  kioskMode: boolean;
  puppeteerExecutablePath?: string;

  // Monitoring
  healthCheckInterval: number;
  screenshotInterval: number;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

class ConfigManager {
  private config: ClientConfig;

  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  private loadConfig(): ClientConfig {
    return {
      serverUrl: process.env.SERVER_URL || 'http://localhost:5000',
      deviceToken: process.env.DEVICE_TOKEN || '',
      displayWidth: parseInt(process.env.DISPLAY_WIDTH || '1920', 10),
      displayHeight: parseInt(process.env.DISPLAY_HEIGHT || '1080', 10),
      kioskMode: process.env.KIOSK_MODE === 'true',
      puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000', 10),
      // Default to 30s to match UI expectations and backend sampling
      // Enforce a minimum cadence to prevent excessive screenshots
      screenshotInterval: Math.max(parseInt(process.env.SCREENSHOT_INTERVAL || '30000', 10), 30000),
      logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
    };
  }

  private validateConfig(): void {
    const errors: string[] = [];

    if (!this.config.deviceToken) {
      errors.push('DEVICE_TOKEN is required');
    }

    if (!this.config.serverUrl) {
      errors.push('SERVER_URL is required');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  public get(): ClientConfig {
    return { ...this.config };
  }

  public update(updates: Partial<ClientConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

export const configManager = new ConfigManager();
export const config = configManager.get();
