import { useEffect, useState, useRef } from 'react';
import { websocketService } from '../services/websocket.service';
import { deviceService } from '../services/device.service';

interface LiveRemoteControlProps {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}

export const LiveRemoteControl = ({ deviceId, deviceName, onClose }: LiveRemoteControlProps) => {
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1280, height: 720 });
  const [isCanvasFocused, setIsCanvasFocused] = useState(false);

  // FPS counter
  const lastFpsUpdateRef = useRef(Date.now());
  const lastFrameAtRef = useRef<number>(0);
  const lastResizeRef = useRef<{w:number;h:number}>({ w: 1280, h: 720 });

  // Start/stop screencast when component mounts/unmounts
  useEffect(() => {
    // Start screencast when admin opens live remote (use HTTP endpoint like working version)
    deviceService.startScreencast(deviceId).catch(err => {
      console.error('Failed to start screencast:', err);
      setMessage('Failed to start screencast. Please try again.');
    });

    return () => {
      // Stop screencast when admin closes live remote
      deviceService.stopScreencast(deviceId).catch(err => {
        console.error('Failed to stop screencast:', err);
      });
    };
  }, [deviceId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameCount = 0;
    let pendingFrames = 0;

    // Helper function to convert base64 to Blob
    const base64ToBlob = (base64: string, mimeType: string): Blob => {
      const byteString = atob(base64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeType });
    };

    let receivedFrameCount = 0;
    const handleFrame = (payload: any) => {
      receivedFrameCount++;
      if (receivedFrameCount % 30 === 0) {
        console.log(`[LiveRemoteControl] Received frame #${receivedFrameCount} for device ${payload.deviceId}`);
      }

      if (payload.deviceId !== deviceId) return;

      try {
        // Update dimensions if they changed
        const metadata = payload.metadata;
        if (metadata) {
          const newW = metadata.width || 1280;
          const newH = metadata.height || 720;
          if (newW !== lastResizeRef.current.w || newH !== lastResizeRef.current.h) {
            lastResizeRef.current = { w: newW, h: newH };
            setDimensions({ width: newW, height: newH });
            canvas.width = newW;
            canvas.height = newH;
          }
        }

        // Drop frame if we're too far behind (more than 30 pending frames)
        if (pendingFrames > 30) {
          console.warn(`Dropping frame - too many pending (${pendingFrames})`);
          return;
        }

        pendingFrames++;

        // Async decode using createImageBitmap (2-3x faster than new Image())
        const blob = base64ToBlob(payload.data, 'image/jpeg');

        // Feature detect createImageBitmap (fallback for older browsers)
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(blob)
            .then(bitmap => {
              pendingFrames--;
              ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              bitmap.close();

              // Update FPS counter
              frameCount++;
              const now = Date.now();
              if (now - lastFpsUpdateRef.current >= 1000) {
                setFps(frameCount);
                frameCount = 0;
                lastFpsUpdateRef.current = now;
              }
            })
            .catch(err => {
              pendingFrames--;
              console.error('Failed to decode frame:', err);
            });
        } else {
          // Fallback for browsers without createImageBitmap
          const img = new Image();
          img.onload = () => {
            pendingFrames--;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            frameCount++;
            const now = Date.now();
            if (now - lastFpsUpdateRef.current >= 1000) {
              setFps(frameCount);
              frameCount = 0;
              lastFpsUpdateRef.current = now;
            }
          };
          img.onerror = () => {
            pendingFrames--;
            console.error('Failed to load frame');
          };
          img.src = `data:image/jpeg;base64,${payload.data}`;
        }

        if (!isConnected) {
          setIsConnected(true);
        }
        setMessage('');
        lastFrameAtRef.current = Date.now();
      } catch (error) {
        pendingFrames--;
        console.error('Error rendering frame:', error);
      }
    };

    // SINGLE listener registration (was duplicated at line 106!)
    websocketService.onScreencastFrame(handleFrame);
    setMessage(isConnected ? '' : 'Connecting to live stream...');

    const timeout = setTimeout(() => {
      if (!isConnected && (Date.now() - lastFrameAtRef.current > 4500)) {
        setMessage('No live stream received. Make sure the device is running.');
      }
    }, 5000);

    return () => {
      websocketService.offScreencastFrame(handleFrame);
      clearTimeout(timeout);
    };
  }, [deviceId, isConnected]);

  // Handle keyboard input directly on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      // Prevent ALL default browser behaviors to keep focus on canvas
      e.preventDefault();
      e.stopPropagation();

      try {
        // Handle printable characters
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          await deviceService.remoteType(deviceId, e.key);
        }
        // Handle special keys
        else {
          const modifiers: string[] = [];
          if (e.ctrlKey) modifiers.push('Control');
          if (e.shiftKey) modifiers.push('Shift');
          if (e.altKey) modifiers.push('Alt');
          if (e.metaKey) modifiers.push('Meta');

          await deviceService.remoteKey(deviceId, e.key, modifiers.length > 0 ? modifiers : undefined);
        }
      } catch (error) {
        console.error('Error sending keystroke:', error);
      }
    };

    const handleFocus = () => setIsCanvasFocused(true);
    const handleBlur = () => setIsCanvasFocused(false);

    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('focus', handleFocus);
    canvas.addEventListener('blur', handleBlur);

    return () => {
      canvas.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('focus', handleFocus);
      canvas.removeEventListener('blur', handleBlur);
    };
  }, [deviceId]);

  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    try {
      await deviceService.remoteClick(deviceId, x, y);
    } catch (error) {
      console.error('Error: Failed to send click', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="card-glass w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              🔴 Live Remote Control: {deviceName}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {isConnected ? (
                <span className="text-green-600 dark:text-green-400">● Live • {fps} FPS</span>
              ) : (
                <span className="text-yellow-600 dark:text-yellow-400">● Connecting...</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Message: only for connection status */}
        {message && (
          <div className="mx-4 mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200">{message}</p>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex">
          {/* Live Stream Display */}
          <div className="flex-1 overflow-auto p-4 bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
            <div className="relative inline-block">
              <canvas
                ref={canvasRef}
                width={dimensions.width}
                height={dimensions.height}
                onClick={handleCanvasClick}
                tabIndex={0}
                className={`max-w-full h-auto rounded shadow-2xl cursor-crosshair border-2 ${
                  isCanvasFocused
                    ? 'border-brand-orange-500 dark:border-brand-orange-400 ring-4 ring-brand-orange-500/50'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
                style={{ imageRendering: 'auto', outline: 'none' }}
                title="Click to focus, then type directly"
              />
              {/* Red LIVE badge removed - was obscuring clickable areas */}
              {!isConnected && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded">
                  <div className="text-white text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    <p>Waiting for stream...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Control Panel Sidebar removed as typing is supported directly */}
        </div>
      </div>
    </div>
  );
};
