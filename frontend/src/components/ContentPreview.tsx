import { useState, useEffect } from 'react';
import { XMarkIcon, EyeIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

interface ContentPreviewProps {
  url: string;
  onClose: () => void;
  onAddToLibrary?: (url: string, name: string) => void;
}

export const ContentPreview = ({ url, onClose, onAddToLibrary }: ContentPreviewProps) => {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [contentName, setContentName] = useState('');

  // Fetch screenshot from backend Puppeteer
  useEffect(() => {
    setLoading(true);
    api.get('/content/screenshot', {
      params: { url }
    })
    .then(response => {
      if (response.data?.screenshot) {
        setScreenshot(response.data.screenshot);
      } else {
        setError(true);
      }
    })
    .catch(err => {
      console.error('Failed to fetch preview screenshot:', err);
      setError(true);
    })
    .finally(() => {
      setLoading(false);
    });
  }, [url]);

  const handleAddToLibrary = () => {
    if (onAddToLibrary && contentName.trim()) {
      onAddToLibrary(url, contentName);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <EyeIcon className="w-6 h-6 text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">Content Preview</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate" title={url}>{url}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0 ml-4"
            title="Close preview"
          >
            <XMarkIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Preview Area */}
        <div className="flex-1 relative overflow-hidden bg-gray-50 dark:bg-gray-900/50">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading preview...</p>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Preview Failed
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Unable to generate preview for this URL.
                </p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 btn-primary"
                >
                  <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                  Open in New Tab
                </a>
              </div>
            </div>
          ) : screenshot ? (
            <img
              src={screenshot}
              alt="Content preview"
              className="w-full h-full object-contain"
            />
          ) : null}
        </div>

        {/* Footer - Add to Library */}
        {onAddToLibrary && (
          <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Content Name
                </label>
                <input
                  type="text"
                  value={contentName}
                  onChange={(e) => setContentName(e.target.value)}
                  placeholder="e.g., Company Dashboard"
                  className="input w-full"
                  autoFocus
                />
              </div>
              <button
                onClick={handleAddToLibrary}
                disabled={!contentName.trim()}
                className="btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add to Library
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
