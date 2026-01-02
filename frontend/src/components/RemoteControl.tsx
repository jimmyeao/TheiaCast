import { useState } from 'react';
import { deviceService } from '../services/device.service';

interface RemoteControlProps {
  deviceId: string;
  deviceName: string;
}

export const RemoteControl = ({ deviceId, deviceName }: RemoteControlProps) => {
  const [text, setText] = useState('');
  const [selector, setSelector] = useState('');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleType = async () => {
    if (!text) return;

    setIsLoading(true);
    try {
      await deviceService.remoteType(deviceId, text, selector || undefined);
      showMessage(`Typed: "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}"`);
      setText('');
    } catch (error) {
      showMessage('Error: Failed to send type command');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKey = async (key: string, modifiers?: string[]) => {
    setIsLoading(true);
    try {
      await deviceService.remoteKey(deviceId, key, modifiers);
      showMessage(`Pressed: ${key}${modifiers ? ` (${modifiers.join('+')})` : ''}`);
    } catch (error) {
      showMessage('Error: Failed to send key command');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = async () => {
    const xVal = parseInt(x);
    const yVal = parseInt(y);

    if (isNaN(xVal) || isNaN(yVal)) {
      showMessage('Error: Invalid coordinates');
      return;
    }

    setIsLoading(true);
    try {
      await deviceService.remoteClick(deviceId, xVal, yVal);
      showMessage(`Clicked at (${xVal}, ${yVal})`);
    } catch (error) {
      showMessage('Error: Failed to send click command');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScroll = async (deltaY: number) => {
    setIsLoading(true);
    try {
      await deviceService.remoteScroll(deviceId, undefined, undefined, undefined, deltaY);
      showMessage(`Scrolled ${deltaY > 0 ? 'down' : 'up'}`);
    } catch (error) {
      showMessage('Error: Failed to send scroll command');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Remote Control: {deviceName}
      </h3>

      {/* Status Message */}
      {message && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-200">{message}</p>
        </div>
      )}

      {/* Keyboard Input Section */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Keyboard Input
        </h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Text to type
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleType()}
              placeholder="Type text..."
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              CSS Selector (optional)
            </label>
            <input
              type="text"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder="#username, input[name=email], etc."
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
          </div>
          <button
            onClick={handleType}
            disabled={!text || isLoading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Sending...' : 'Type Text'}
          </button>
        </div>
      </div>

      {/* Special Keys */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Special Keys
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleKey('Enter')}
            disabled={isLoading}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-sm transition-colors"
          >
            Enter
          </button>
          <button
            onClick={() => handleKey('Tab')}
            disabled={isLoading}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-sm transition-colors"
          >
            Tab
          </button>
          <button
            onClick={() => handleKey('Escape')}
            disabled={isLoading}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-sm transition-colors"
          >
            ESC
          </button>
          <button
            onClick={() => handleKey('Backspace')}
            disabled={isLoading}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-sm transition-colors"
          >
            Backspace
          </button>
          <button
            onClick={() => handleKey('Delete')}
            disabled={isLoading}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-sm transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => handleKey('KeyA', ['Control'])}
            disabled={isLoading}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-sm transition-colors"
          >
            Ctrl+A
          </button>
        </div>
      </div>

      {/* Click Control */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Click at Coordinates
        </h4>
        <div className="flex gap-2">
          <input
            type="number"
            value={x}
            onChange={(e) => setX(e.target.value)}
            placeholder="X"
            disabled={isLoading}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <input
            type="number"
            value={y}
            onChange={(e) => setY(e.target.value)}
            placeholder="Y"
            disabled={isLoading}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={handleClick}
            disabled={!x || !y || isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Click
          </button>
        </div>
      </div>

      {/* Scroll Control */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Scroll Page
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleScroll(-300)}
            disabled={isLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            ↑ Scroll Up
          </button>
          <button
            onClick={() => handleScroll(300)}
            disabled={isLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            ↓ Scroll Down
          </button>
        </div>
      </div>

      {/* Quick Login Helper */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Quick Actions
        </h4>
        <div className="space-y-2">
          <button
            onClick={async () => {
              setIsLoading(true);
              try {
                await deviceService.remoteKey(deviceId, 'F5');
                showMessage('Page refreshed');
              } catch (error) {
                showMessage('Error refreshing page');
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 text-sm transition-colors"
          >
            Refresh Page (F5)
          </button>
        </div>
      </div>
    </div>
  );
};
