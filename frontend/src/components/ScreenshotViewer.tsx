import React, { useEffect, useState } from 'react';
import type { Screenshot, AdminScreenshotReceivedPayload } from '@theiacast/shared';
import { screenshotService } from '../services/screenshot.service';
import { websocketService } from '../services/websocket.service';

interface ScreenshotViewerProps {
  deviceId: string;
  onClose: () => void;
}

export const ScreenshotViewer: React.FC<ScreenshotViewerProps> = ({ deviceId, onClose }) => {
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLatestScreenshot();

    // Listen for new screenshots
    const handleScreenshot = (payload: AdminScreenshotReceivedPayload) => {
      if (payload.deviceId === deviceId) {
        loadLatestScreenshot();
      }
    };

    websocketService.onScreenshotReceived(handleScreenshot);

    return () => {
      websocketService.offScreenshotReceived(handleScreenshot);
    };
  }, [deviceId]);

  const loadLatestScreenshot = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await screenshotService.getLatestByDevice(deviceId);
      setScreenshot(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load screenshot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Live Screenshot - {deviceId}
            </h2>
            {screenshot && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Captured: {new Date(screenshot.capturedAt).toLocaleString()}
                {screenshot.url ? ` • URL: ${screenshot.url}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-auto" style={{ maxHeight: 'calc(90vh - 100px)' }}>
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {!loading && !error && !screenshot && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No screenshots available yet. Screenshots are captured automatically every 30 seconds.
            </div>
          )}

          {!loading && screenshot && (
            <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-2">
              {screenshot.imageData ? (
                <img
                  src={screenshot.imageData.startsWith('data:') ? screenshot.imageData : `data:image/jpeg;base64,${screenshot.imageData}`}
                  alt={`Screenshot from ${deviceId}`}
                  className="w-full h-auto rounded shadow-lg"
                />
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  Screenshot data is unavailable. Waiting for next capture...
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t dark:border-gray-700 flex justify-between items-center">
          <button
            onClick={loadLatestScreenshot}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
