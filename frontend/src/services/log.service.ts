import api from './api';

interface LogEntry {
  level: 'Info' | 'Warning' | 'Error';
  message: string;
  deviceId?: string;
  source?: string;
  stackTrace?: string;
  additionalData?: string;
}

class LogService {
  async log(entry: LogEntry): Promise<void> {
    try {
      await api.post('/logs', entry);
    } catch (error) {
      // Fallback to console if backend logging fails
      console.error('[Log Service Failed]', entry, error);
    }
  }

  async logError(message: string, source?: string, error?: any): Promise<void> {
    const logEntry: LogEntry = {
      level: 'Error',
      message,
      source: source || 'Frontend',
      stackTrace: error?.stack || undefined,
      additionalData: error ? JSON.stringify({
        name: error.name,
        message: error.message,
        response: error.response?.data,
      }) : undefined,
    };

    await this.log(logEntry);
  }

  async logWarning(message: string, source?: string): Promise<void> {
    await this.log({
      level: 'Warning',
      message,
      source: source || 'Frontend',
    });
  }

  async logInfo(message: string, source?: string): Promise<void> {
    await this.log({
      level: 'Info',
      message,
      source: source || 'Frontend',
    });
  }
}

export const logService = new LogService();
