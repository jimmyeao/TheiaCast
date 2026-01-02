import { useState, useEffect } from 'react';
import { GlobeAltIcon, VideoCameraIcon, PresentationChartBarIcon, PhotoIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

interface ContentCardPreviewProps {
  url: string;
  name: string;
  type: 'video' | 'image' | 'presentation' | 'web';
}

export const ContentCardPreview = ({ url, name, type }: ContentCardPreviewProps) => {
  const [showFallback, setShowFallback] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset state when URL or type changes
  useEffect(() => {
    setShowFallback(false);
    setPreviewImage(null);
  }, [url, type]);

  // Fetch previews from backend
  useEffect(() => {
    if (type === 'video') {
      const isVideoFile = url.match(/\.(mp4|webm|mkv|mov|avi)(\?|$)/);

      if (isVideoFile) {
        // Direct video file - FFmpeg thumbnail
        setLoading(true);
        api.get('/content/thumbnail', {
          params: { url },
          timeout: 30000 // 30 second timeout
        })
        .then(response => {
          if (response.data?.thumbnail) {
            setPreviewImage(response.data.thumbnail);
          } else {
            setShowFallback(true);
          }
        })
        .catch(error => {
          console.error('[Preview] Video thumbnail failed:', error.response?.data || error.message);
          setShowFallback(true);
        })
        .finally(() => setLoading(false));
      } else {
        // Video HTML page - Puppeteer screenshot
        setLoading(true);
        // Convert relative URLs to use the API origin (backend), not frontend origin
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        const fullUrl = url.startsWith('/') ? apiUrl + url : url;
        api.get('/content/screenshot', {
          params: { url: fullUrl },
          timeout: 30000
        })
        .then(response => {
          if (response.data?.screenshot) {
            setPreviewImage(response.data.screenshot);
          } else {
            setShowFallback(true);
          }
        })
        .catch(error => {
          console.error('[Preview] Video HTML screenshot failed:', error.response?.data || error.message);
          setShowFallback(true);
        })
        .finally(() => setLoading(false));
      }
    } else if (type === 'presentation') {
      // Presentation content - fetch cached thumbnail
      setLoading(true);
      api.get('/content/screenshot', {
        params: { url },
        timeout: 30000
      })
      .then(response => {
        if (response.data?.screenshot) {
          setPreviewImage(response.data.screenshot);
        } else {
          setShowFallback(true);
        }
      })
      .catch(error => {
        console.error('[Preview] Presentation thumbnail failed:', error.response?.data || error.message);
        setShowFallback(true);
      })
      .finally(() => setLoading(false));
    } else if (type === 'image') {
      // Image content - fetch cached thumbnail from backend
      setLoading(true);
      api.get('/content/screenshot', {
        params: { url },
        timeout: 30000
      })
      .then(response => {
        if (response.data?.screenshot) {
          setPreviewImage(response.data.screenshot);
        } else {
          setShowFallback(true);
        }
      })
      .catch(error => {
        console.error('[Preview] Image thumbnail failed:', error.response?.data || error.message);
        setShowFallback(true);
      })
      .finally(() => setLoading(false));
    } else if (type === 'web') {
      // Web content - Puppeteer screenshot
      setLoading(true);
      api.get('/content/screenshot', {
        params: { url },
        timeout: 30000
      })
      .then(response => {
        if (response.data?.screenshot) {
          setPreviewImage(response.data.screenshot);
        } else {
          setShowFallback(true);
        }
      })
      .catch(error => {
        console.error('[Preview] Web screenshot failed:', error.response?.data || error.message);
        setShowFallback(true);
      })
      .finally(() => setLoading(false));
    }
  }, [type, url]);

  // Video content - show FFmpeg-generated thumbnail or screenshot
  if (type === 'video') {
    return (
      <div className="relative w-full bg-black rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700" style={{ aspectRatio: '16/9' }}>
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900 dark:to-purple-800">
            <VideoCameraIcon className="w-12 h-12 text-purple-500 dark:text-purple-400 mb-2 animate-pulse" />
            <p className="text-xs text-purple-700 dark:text-purple-300 text-center px-4">
              Loading preview...
            </p>
          </div>
        ) : previewImage && !showFallback ? (
          <img
            src={previewImage}
            alt={`Preview of ${name}`}
            className="w-full h-full object-contain"
            onError={() => setShowFallback(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900 dark:to-purple-800">
            <VideoCameraIcon className="w-12 h-12 text-purple-500 dark:text-purple-400 mb-2" />
            <p className="text-xs text-purple-700 dark:text-purple-300 text-center px-4">
              Video content
            </p>
          </div>
        )}
      </div>
    );
  }

  // Presentation content - fetch thumbnail from backend
  if (type === 'presentation') {
    return (
      <div className="relative w-full bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700" style={{ aspectRatio: '16/9' }}>
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800">
            <PresentationChartBarIcon className="w-12 h-12 text-orange-500 dark:text-orange-400 mb-2 animate-pulse" />
            <p className="text-xs text-orange-700 dark:text-orange-300 text-center px-4">
              Loading preview...
            </p>
          </div>
        ) : previewImage && !showFallback ? (
          <img
            src={previewImage}
            alt={`Preview of ${name}`}
            className="w-full h-full object-contain"
            onError={() => setShowFallback(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800">
            <PresentationChartBarIcon className="w-12 h-12 text-orange-500 dark:text-orange-400 mb-2" />
            <p className="text-xs text-orange-700 dark:text-orange-300 text-center px-4">
              Presentation
            </p>
          </div>
        )}
      </div>
    );
  }

  // Image content - show cached thumbnail
  if (type === 'image') {
    return (
      <div className="relative w-full bg-black rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700" style={{ aspectRatio: '16/9' }}>
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-800">
            <PhotoIcon className="w-12 h-12 text-green-500 dark:text-green-400 mb-2 animate-pulse" />
            <p className="text-xs text-green-700 dark:text-green-300 text-center px-4">
              Loading preview...
            </p>
          </div>
        ) : previewImage && !showFallback ? (
          <img
            src={previewImage}
            alt={`Preview of ${name}`}
            className="w-full h-full object-contain"
            onError={() => setShowFallback(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-800">
            <PhotoIcon className="w-12 h-12 text-green-500 dark:text-green-400 mb-2" />
            <p className="text-xs text-green-700 dark:text-green-300 text-center px-4">
              Image content
            </p>
          </div>
        )}
      </div>
    );
  }

  // Web content - show Puppeteer screenshot
  return (
    <div className="relative w-full bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700" style={{ aspectRatio: '16/9' }}>
      {loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800">
          <GlobeAltIcon className="w-12 h-12 text-blue-500 dark:text-blue-400 mb-2 animate-pulse" />
          <p className="text-xs text-blue-700 dark:text-blue-300 text-center px-4">
            Loading preview...
          </p>
        </div>
      ) : previewImage && !showFallback ? (
        <img
          src={previewImage}
          alt={`Screenshot of ${name}`}
          className="w-full h-full object-contain"
          onError={() => setShowFallback(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800">
          <GlobeAltIcon className="w-12 h-12 text-blue-500 dark:text-blue-400 mb-2" />
          <p className="text-xs text-blue-700 dark:text-blue-300 text-center px-4">
            Web content
          </p>
        </div>
      )}
    </div>
  );
};
