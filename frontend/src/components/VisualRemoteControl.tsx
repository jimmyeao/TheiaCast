import { useEffect, useState, useRef } from 'react';
import type { Screenshot, AdminScreenshotReceivedPayload } from '@theiacast/shared';
import { screenshotService } from '../services/screenshot.service';
import { websocketService } from '../services/websocket.service';
import { deviceService } from '../services/device.service';

interface VisualRemoteControlProps {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}

export const VisualRemoteControl = ({ deviceId, deviceName, onClose }: VisualRemoteControlProps) => {
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [textInput, setTextInput] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Request a fresh screenshot when opening
    requestNewScreenshot();
    loadLatestScreenshot();

    // Listen for new screenshots
    const handleScreenshot = (payload: AdminScreenshotReceivedPayload) => {
      if (payload.deviceId === deviceId) {
        loadLatestScreenshot();
      }
    };

    websocketService.onScreenshotReceived(handleScreenshot);

    // Auto-refresh every 2 seconds if enabled (for near-live view)
    const interval = autoRefresh ? setInterval(() => {
      loadLatestScreenshot();
    }, 2000) : undefined;

    return () => {
      websocketService.offScreenshotReceived(handleScreenshot);
      if (interval) clearInterval(interval);
    };
  }, [deviceId, autoRefresh]);

  const loadLatestScreenshot = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching screenshot for device:', deviceId);
      const data = await screenshotService.getLatestByDevice(deviceId);
      console.log('Screenshot data received:', data ? 'Yes' : 'No/Null');

      if (!data) {
        setError('No screenshots available yet. Make sure the device client is running and capturing screenshots.');
        setScreenshot(null);
      } else {
        setScreenshot(data);
      }
    } catch (err: any) {
      console.error('Screenshot fetch error:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Failed to load screenshot';
      setError(`Error: ${errorMsg}. Make sure the device is connected and capturing screenshots.`);
    } finally {
      setLoading(false);
    }
  };

  const requestNewScreenshot = async () => {
    try {
      await screenshotService.request(deviceId);
    } catch (err) {
      console.error('Failed to request screenshot:', err);
    }
  };

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageRef.current.naturalWidth / rect.width;
    const scaleY = imageRef.current.naturalHeight / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    try {
      await deviceService.remoteClick(deviceId, x, y);
      showMessage(`Clicked at (${x}, ${y})`);

      // Request new screenshot after a short delay to see the result
      setTimeout(() => requestNewScreenshot(), 500);
    } catch (error) {
      showMessage('Error: Failed to send click');
      console.error(error);
    }
  };

  const handleTypeText = async () => {
    if (!textInput) return;

    try {
      await deviceService.remoteType(deviceId, textInput);
      showMessage(`Typed: "${textInput.substring(0, 20)}${textInput.length > 20 ? '...' : ''}"`);
      setTextInput('');

      setTimeout(() => requestNewScreenshot(), 500);
    } catch (error) {
      showMessage('Error: Failed to type text');
      console.error(error);
    }
  };

  const handleKeyPress = async (key: string, modifiers?: string[]) => {
    try {
      await deviceService.remoteKey(deviceId, key, modifiers);
      showMessage(`Pressed: ${key}${modifiers ? ` (${modifiers.join('+')})` : ''}`);

      setTimeout(() => requestNewScreenshot(), 500);
    } catch (error) {
      showMessage('Error: Failed to send key');
      console.error(error);
    }
  };

  const handleScroll = async (deltaY: number) => {
    try {
      await deviceService.remoteScroll(deviceId, undefined, undefined, undefined, deltaY);
      showMessage(`Scrolled ${deltaY > 0 ? 'down' : 'up'}`);

      setTimeout(() => requestNewScreenshot(), 500);
    } catch (error) {
      showMessage('Error: Failed to scroll');
      console.error(error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="card-glass w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Remote Control: {deviceName}
            </h2>
            {screenshot && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {screenshot.url ? `Viewing: ${screenshot.url}` : 'Live View'}
                {' • '}
                <span className="text-xs">
                  Updated: {new Date(screenshot.capturedAt).toLocaleTimeString()}
                </span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="mr-2"
              />
              Live Mode (2s refresh)
            </label>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div className="mx-4 mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200">{message}</p>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex">
          {/* Screenshot Display */}
          <div className="flex-1 overflow-auto p-4 bg-gray-100 dark:bg-gray-900">
            {loading && (
              <div className="flex justify-center items-center h-full">
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
                Loading device screen...
              </div>
            )}

            {!loading && screenshot && (
              <div className="relative inline-block max-w-full">
                <img
                  ref={imageRef}
                  src={screenshot.imageData.startsWith('data:') ? screenshot.imageData : `data:image/jpeg;base64,${screenshot.imageData}`}
                  alt={`Screen from ${deviceName}`}
                  onClick={handleImageClick}
                  className="max-w-full h-auto rounded shadow-2xl cursor-crosshair border-2 border-gray-300 dark:border-gray-700"
                  title="Click anywhere on the screen to interact"
                />
                <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-xs">
                  Click to interact
                </div>
              </div>
            )}
          </div>

          {/* Control Panel Sidebar */}
          <div className="w-80 border-l dark:border-gray-700 bg-white dark:bg-gray-800 overflow-auto">
            <div className="p-4 space-y-4">
              {/* Keyboard Input */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center justify-between">
                  <span>Keyboard</span>
                  <button
                    onClick={() => setShowKeyboard(!showKeyboard)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showKeyboard ? 'Hide' : 'Show'}
                  </button>
                </h3>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTypeText()}
                    placeholder="Type text here..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button
                    onClick={handleTypeText}
                    disabled={!textInput}
                    className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    Type Text
                  </button>
                </div>

                {showKeyboard && (
                  <div className="mt-3 grid grid-cols-3 gap-1">
                    <button onClick={() => handleKeyPress('Enter')} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600">Enter</button>
                    <button onClick={() => handleKeyPress('Tab')} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600">Tab</button>
                    <button onClick={() => handleKeyPress('Escape')} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600">ESC</button>
                    <button onClick={() => handleKeyPress('Backspace')} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600">⌫ Back</button>
                    <button onClick={() => handleKeyPress('Delete')} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600">Delete</button>
                    <button onClick={() => handleKeyPress('KeyA', ['Control'])} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600">Ctrl+A</button>
                    <button onClick={() => handleKeyPress('ArrowUp')} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600">↑</button>
                    <button onClick={() => handleKeyPress('ArrowDown')} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600">↓</button>
                    <button onClick={() => handleKeyPress('ArrowLeft')} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600">←</button>
                  </div>
                )}
              </div>

              {/* Scroll Controls */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Scroll</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleScroll(-300)}
                    className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                  >
                    ↑ Up
                  </button>
                  <button
                    onClick={() => handleScroll(300)}
                    className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                  >
                    ↓ Down
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => handleKeyPress('F5')}
                    className="w-full px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm"
                  >
                    Refresh Page (F5)
                  </button>
                  <button
                    onClick={requestNewScreenshot}
                    className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    Update Screenshot
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">How to use:</h4>
                <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                  <li>• Click on the screen to interact</li>
                  <li>• Type text and press Enter or click "Type Text"</li>
                  <li>• Use keyboard shortcuts for special keys</li>
                  <li>• Live Mode refreshes every 2 seconds</li>
                  <li>• Auto-refreshes after each interaction</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
