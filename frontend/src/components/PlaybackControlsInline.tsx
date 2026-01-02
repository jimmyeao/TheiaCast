import type { PlaybackStateUpdatePayload } from '@theiacast/shared';
import {
  PlayIcon,
  PauseIcon,
  BackwardIcon,
  ForwardIcon,
} from '@heroicons/react/24/solid';

interface PlaybackControlsInlineProps {
  deviceId: string;
  playbackState?: PlaybackStateUpdatePayload;
  onPause: (deviceId: string) => void;
  onResume: (deviceId: string) => void;
  onNext: (deviceId: string) => void;
  onPrevious: (deviceId: string) => void;
}

export function PlaybackControlsInline({
  deviceId,
  playbackState,
  onPause,
  onResume,
  onNext,
  onPrevious,
}: PlaybackControlsInlineProps) {
  if (!playbackState) {
    return null;
  }

  const {
    isPlaying,
    isPaused,
    isBroadcasting,
    currentItemIndex,
    totalItems,
  } = playbackState;

  // Disable controls when only 1 item or broadcasting
  const disableNavigation = totalItems <= 1 || isBroadcasting;
  const disablePauseResume = isBroadcasting;

  // Determine status color
  let statusColor = 'bg-gray-400';
  if (isBroadcasting) {
    statusColor = 'bg-purple-500';
  } else if (isPaused) {
    statusColor = 'bg-yellow-500';
  } else if (isPlaying) {
    statusColor = 'bg-green-500';
  }

  return (
    <div className="flex items-center gap-2">
      {/* Status indicator */}
      <div className={`w-2 h-2 rounded-full ${statusColor}`} title={
        isBroadcasting ? 'Broadcasting' :
        isPaused ? 'Paused' :
        isPlaying ? 'Playing' :
        'Stopped'
      }></div>

      {/* Item counter */}
      <span className="text-xs text-gray-600 dark:text-gray-400">
        {currentItemIndex + 1}/{totalItems}
      </span>

      {/* Control buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPrevious(deviceId)}
          disabled={disableNavigation}
          className={`p-1 rounded transition-colors ${
            disableNavigation
              ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
          title="Previous"
        >
          <BackwardIcon className="w-4 h-4" />
        </button>

        {isPaused || !isPlaying ? (
          <button
            onClick={() => onResume(deviceId)}
            disabled={disablePauseResume}
            className={`p-1 rounded transition-colors ${
              disablePauseResume
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300'
            }`}
            title="Resume"
          >
            <PlayIcon className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => onPause(deviceId)}
            disabled={disablePauseResume}
            className={`p-1 rounded transition-colors ${
              disablePauseResume
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300'
            }`}
            title="Pause"
          >
            <PauseIcon className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => onNext(deviceId)}
          disabled={disableNavigation}
          className={`p-1 rounded transition-colors ${
            disableNavigation
              ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
          title="Next"
        >
          <ForwardIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
