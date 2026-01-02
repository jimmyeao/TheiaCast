import type { PlaybackStateUpdatePayload } from '@theiacast/shared';
import {
  PlayIcon,
  PauseIcon,
  BackwardIcon,
  ForwardIcon,
} from '@heroicons/react/24/solid';

interface PlaybackControlsProps {
  deviceId: string;
  playbackState?: PlaybackStateUpdatePayload;
  onPause: (deviceId: string) => void;
  onResume: (deviceId: string) => void;
  onNext: (deviceId: string) => void;
  onPrevious: (deviceId: string) => void;
}

export function PlaybackControls({
  deviceId,
  playbackState,
  onPause,
  onResume,
  onNext,
  onPrevious,
}: PlaybackControlsProps) {
  if (!playbackState) {
    return (
      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
        <p className="text-sm text-gray-500 text-center">No playback state</p>
      </div>
    );
  }

  const {
    isPlaying,
    isPaused,
    isBroadcasting,
    currentItemIndex,
    totalItems,
    currentUrl,
    timeRemaining,
  } = playbackState;

  // Determine status
  let statusText = 'Stopped';
  let statusColor = 'text-gray-600';

  if (isBroadcasting) {
    statusText = 'Broadcasting';
    statusColor = 'text-purple-600';
  } else if (isPaused) {
    statusText = 'Paused';
    statusColor = 'text-yellow-600';
  } else if (isPlaying) {
    statusText = 'Playing';
    statusColor = 'text-green-600';
  }

  // Disable controls when only 1 item or broadcasting
  const disableNavigation = totalItems <= 1 || isBroadcasting;
  const disablePauseResume = isBroadcasting;

  // Format time remaining
  const formatTime = (ms: number | null) => {
    if (ms === null) return 'Static';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Truncate URL
  const truncateUrl = (url: string | null, maxLength: number = 40) => {
    if (!url) return 'N/A';
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + '...';
  };

  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2">
      {/* Status Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            isBroadcasting ? 'bg-purple-500' :
            isPaused ? 'bg-yellow-500' :
            isPlaying ? 'bg-green-500' :
            'bg-gray-400'
          }`}></div>
          <span className={`text-sm font-medium ${statusColor}`}>{statusText}</span>
        </div>

        <div className="text-xs text-gray-600">
          Item {currentItemIndex + 1} / {totalItems}
        </div>
      </div>

      {/* Current URL */}
      <div className="text-xs text-gray-500 truncate" title={currentUrl || ''}>
        {truncateUrl(currentUrl)}
      </div>

      {/* Time Remaining */}
      {timeRemaining !== null && timeRemaining !== undefined && (
        <div className="text-xs text-gray-600">
          Time: {formatTime(timeRemaining)}
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex items-center justify-center space-x-2 pt-1">
        <button
          onClick={() => onPrevious(deviceId)}
          disabled={disableNavigation}
          className={`p-2 rounded-lg transition-colors ${
            disableNavigation
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 hover:border-gray-400'
          }`}
          title="Previous"
        >
          <BackwardIcon className="w-4 h-4" />
        </button>

        {isPaused || !isPlaying ? (
          <button
            onClick={() => onResume(deviceId)}
            disabled={disablePauseResume}
            className={`p-2 rounded-lg transition-colors ${
              disablePauseResume
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
            title="Resume"
          >
            <PlayIcon className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => onPause(deviceId)}
            disabled={disablePauseResume}
            className={`p-2 rounded-lg transition-colors ${
              disablePauseResume
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-yellow-500 hover:bg-yellow-600 text-white'
            }`}
            title="Pause"
          >
            <PauseIcon className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => onNext(deviceId)}
          disabled={disableNavigation}
          className={`p-2 rounded-lg transition-colors ${
            disableNavigation
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 hover:border-gray-400'
          }`}
          title="Next"
        >
          <ForwardIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
