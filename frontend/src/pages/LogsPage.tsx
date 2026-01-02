import { useEffect, useState } from 'react';
import { DocumentTextIcon, FunnelIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

interface Log {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  deviceId?: string;
  source?: string;
  stackTrace?: string;
  additionalData?: string;
  // Audit fields
  userId?: number;
  username?: string;
  action?: string;
  entityType?: string;
  entityId?: number;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface Device {
  id: number;
  deviceId: string;
  name: string;
}

export const LogsPage = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<'system' | 'audit'>('system');

  // Filters
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('');
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchDevices();
    fetchLogs();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [viewMode]);

  const fetchDevices = async () => {
    try {
      const response = await api.get<Device[]>('/devices');
      setDevices(response.data);
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: any = { limit };
      if (selectedDevice) params.deviceId = selectedDevice;
      if (selectedLevel) params.level = selectedLevel;
      if (selectedAction) params.action = selectedAction;
      if (selectedEntityType) params.entityType = selectedEntityType;
      if (selectedUsername) params.username = selectedUsername;
      if (startDate) params.startDate = new Date(startDate).toISOString();
      if (endDate) params.endDate = new Date(endDate).toISOString();

      // In audit view, only show logs with action field
      if (viewMode === 'audit') {
        params.auditOnly = true;
      }

      const response = await api.get<Log[]>('/logs', { params });
      setLogs(response.data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    fetchLogs();
  };

  const handleClearFilters = () => {
    setSelectedDevice('');
    setSelectedLevel('');
    setSelectedAction('');
    setSelectedEntityType('');
    setSelectedUsername('');
    setStartDate('');
    setEndDate('');
    setLimit(100);
    setTimeout(() => fetchLogs(), 100);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Error': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      case 'Warning': return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'Info': return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const handleExportCSV = () => {
    const headers = viewMode === 'audit'
      ? ['Timestamp', 'Username', 'Action', 'Entity Type', 'Entity ID', 'IP Address', 'Details']
      : ['Timestamp', 'Level', 'Device', 'Source', 'Message'];

    const rows = logs.map(log => {
      if (viewMode === 'audit') {
        return [
          formatTimestamp(log.timestamp),
          log.username || '',
          log.action || '',
          log.entityType || '',
          log.entityId?.toString() || '',
          log.ipAddress || '',
          log.message
        ];
      } else {
        return [
          formatTimestamp(log.timestamp),
          log.level,
          log.deviceId || '',
          log.source || '',
          log.message
        ];
      }
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${viewMode}-logs-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportJSON = () => {
    const exportData = logs.map(log => {
      if (viewMode === 'audit') {
        return {
          timestamp: log.timestamp,
          username: log.username,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          message: log.message,
          oldValue: log.oldValue,
          newValue: log.newValue
        };
      } else {
        return {
          timestamp: log.timestamp,
          level: log.level,
          deviceId: log.deviceId,
          source: log.source,
          message: log.message,
          stackTrace: log.stackTrace,
          additionalData: log.additionalData
        };
      }
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${viewMode}-logs-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {viewMode === 'system' ? 'System Logs' : 'Audit Trail'}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">
            {viewMode === 'system' ? 'View and filter application logs' : 'Track user actions and changes'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-1 bg-white dark:bg-gray-800">
            <button
              onClick={() => setViewMode('system')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                viewMode === 'system'
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              System Logs
            </button>
            <button
              onClick={() => setViewMode('audit')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                viewMode === 'audit'
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Audit Trail
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              disabled={logs.length === 0}
              className="btn-secondary flex items-center gap-2 min-h-[44px] flex-1 sm:flex-initial justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export to CSV"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={handleExportJSON}
              disabled={logs.length === 0}
              className="btn-secondary flex items-center gap-2 min-h-[44px] flex-1 sm:flex-initial justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export to JSON"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              <span className="hidden sm:inline">JSON</span>
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="btn-secondary flex items-center gap-2 min-h-[44px] flex-1 sm:flex-initial justify-center"
            >
              <FunnelIcon className="w-5 h-5" />
              <span className="hidden sm:inline">{showFilters ? 'Hide' : 'Show'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Filters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Audit-specific filters */}
            {viewMode === 'audit' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={selectedUsername}
                    onChange={(e) => setSelectedUsername(e.target.value)}
                    placeholder="Filter by username"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Action
                  </label>
                  <select
                    value={selectedAction}
                    onChange={(e) => setSelectedAction(e.target.value)}
                    className="input"
                  >
                    <option value="">All Actions</option>
                    <option value="auth.login">Login</option>
                    <option value="auth.login.failed">Login Failed</option>
                    <option value="auth.mfa.enabled">MFA Enabled</option>
                    <option value="auth.mfa.disabled">MFA Disabled</option>
                    <option value="user.password.change">Password Change</option>
                    <option value="device.create">Device Created</option>
                    <option value="device.update">Device Updated</option>
                    <option value="device.delete">Device Deleted</option>
                    <option value="playlist.create">Playlist Created</option>
                    <option value="playlist.update">Playlist Updated</option>
                    <option value="playlist.delete">Playlist Deleted</option>
                    <option value="content.create">Content Created</option>
                    <option value="content.update">Content Updated</option>
                    <option value="content.delete">Content Deleted</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Entity Type
                  </label>
                  <select
                    value={selectedEntityType}
                    onChange={(e) => setSelectedEntityType(e.target.value)}
                    className="input"
                  >
                    <option value="">All Types</option>
                    <option value="User">User</option>
                    <option value="Device">Device</option>
                    <option value="Playlist">Playlist</option>
                    <option value="Content">Content</option>
                  </select>
                </div>
              </>
            )}

            {/* System log filters */}
            {viewMode === 'system' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Device
                  </label>
                  <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className="input"
                  >
                    <option value="">All Devices</option>
                    {devices.map((device) => (
                      <option key={device.id} value={device.deviceId}>
                        {device.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Level
                  </label>
                  <select
                    value={selectedLevel}
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    className="input"
                  >
                    <option value="">All Levels</option>
                    <option value="Info">Info</option>
                    <option value="Warning">Warning</option>
                    <option value="Error">Error</option>
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Start Date
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                End Date
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Limit
              </label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                min="10"
                max="1000"
                className="input"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <button onClick={handleApplyFilters} className="btn-primary min-h-[44px] flex-1 sm:flex-initial">
              Apply Filters
            </button>
            <button onClick={handleClearFilters} className="btn-secondary min-h-[44px] flex-1 sm:flex-initial">
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Mobile warning */}
        <div className="sm:hidden p-3 bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-800 dark:text-blue-200">
          Swipe horizontally to view all columns →
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                  Timestamp
                </th>
                {viewMode === 'audit' ? (
                  <>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      Username
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      Action
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      Entity
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      IP Address
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Details
                    </th>
                  </>
                ) : (
                  <>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      Level
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      Device
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      Source
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Message
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    Loading logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400">No logs found</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-gray-300">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    {viewMode === 'audit' ? (
                      <>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                          {log.username || '-'}
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            {log.action || '-'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {log.entityType && log.entityId ? `${log.entityType} #${log.entityId}` : '-'}
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {log.ipAddress || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300">
                          <div className="max-w-md truncate" title={log.message}>
                            {log.message}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getLevelColor(log.level)}`}>
                            {log.level}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {log.deviceId || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {log.source || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300">
                          <div className="max-w-md truncate" title={log.message}>
                            {log.message}
                          </div>
                          {log.stackTrace && (
                            <details className="mt-2">
                              <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                                Stack Trace
                              </summary>
                              <pre className="mt-2 text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                                {log.stackTrace}
                              </pre>
                            </details>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
