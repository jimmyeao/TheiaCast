import { useState, useEffect } from 'react';
import { SpeakerWaveIcon, XMarkIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import type { Tag, Device } from '@theiacast/shared';
import api from '../services/api';
import { BroadcastSettingsModal } from './BroadcastSettingsModal';

interface ActiveBroadcast {
  id: number;
  type: 'url' | 'message' | 'image' | 'video';
  url?: string;
  message?: string;
  createdAt: string;
}

export const BroadcastControl = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [broadcastType, setBroadcastType] = useState<'url' | 'message' | 'image' | 'video'>('message');
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState<ActiveBroadcast | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [targetDeviceCount, setTargetDeviceCount] = useState<number>(0);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [fileError, setFileError] = useState<string>('');
  const [broadcastError, setError] = useState<string>('');
  const [maxFileSizeMB, setMaxFileSizeMB] = useState<number>(50);
  const [maxFileSizeBytes, setMaxFileSizeBytes] = useState<number>(50 * 1024 * 1024);

  useEffect(() => {
    checkActiveBroadcast();
    const interval = setInterval(checkActiveBroadcast, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadTags();
    loadDevices();
    loadBroadcastConfig();
  }, []);

  useEffect(() => {
    calculateTargetDeviceCount();
  }, [selectedTagIds, allDevices]);

  const checkActiveBroadcast = async () => {
    try {
      const response = await api.get('/broadcast/active');
      setActiveBroadcast(response.data);
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error('Failed to check active broadcast:', err);
      } else {
        setActiveBroadcast(null);
      }
    }
  };

  const loadTags = async () => {
    try {
      const response = await api.get('/tags');
      setTags(response.data || []);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const loadDevices = async () => {
    try {
      const response = await api.get('/devices');
      setAllDevices(response.data || []);
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  };

  const loadBroadcastConfig = async () => {
    try {
      const response = await api.get('/broadcast/config');
      if (response.data) {
        setMaxFileSizeMB(response.data.maxFileSizeMB || 50);
        setMaxFileSizeBytes(response.data.maxFileSizeBytes || 50 * 1024 * 1024);
      }
    } catch (err) {
      console.error('Failed to load broadcast config:', err);
    }
  };

  const calculateTargetDeviceCount = () => {
    if (selectedTagIds.length === 0) {
      setTargetDeviceCount(allDevices.length);
    } else {
      const count = allDevices.filter((device) =>
        device.tags?.some((tag) => selectedTagIds.includes(tag.id))
      ).length;
      setTargetDeviceCount(count);
    }
  };

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleBroadcastTypeChange = (type: 'url' | 'message' | 'image' | 'video') => {
    setBroadcastType(type);
    setFile(null);
    setFilePreview('');
    setFileError('');
    setError('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Clear previous error
    setFileError('');

    // Validate file type
    if (broadcastType === 'image' && !selectedFile.type.startsWith('image/')) {
      setFileError('Please select an image file');
      return;
    }
    if (broadcastType === 'video' && !selectedFile.type.startsWith('video/')) {
      setFileError('Please select a video file');
      return;
    }

    // Validate file size
    if (selectedFile.size > maxFileSizeBytes) {
      setFileError(`File too large. Maximum size is ${maxFileSizeMB}MB.`);
      return;
    }

    setFile(selectedFile);

    // Create preview for images
    if (broadcastType === 'image') {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setFilePreview('');
    }
  };

  const handleStartBroadcast = async () => {
    // Clear previous errors
    setError('');
    setFileError('');

    // Validation
    if (broadcastType === 'url' && !url.trim()) {
      setError('Please enter a URL');
      return;
    }
    if (broadcastType === 'message' && !message.trim()) {
      setError('Please enter a message');
      return;
    }
    if ((broadcastType === 'image' || broadcastType === 'video') && !file) {
      setFileError(`Please select a ${broadcastType} file`);
      return;
    }

    setIsLoading(true);
    try {
      if (broadcastType === 'image' || broadcastType === 'video') {
        // Upload file first
        const formData = new FormData();
        formData.append('file', file!);
        formData.append('type', broadcastType);
        if (selectedTagIds.length > 0) {
          formData.append('tagIds', JSON.stringify(selectedTagIds));
        }

        await api.post('/broadcast/start-media', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000, // 2 minutes for large files
        });
      } else {
        await api.post('/broadcast/start', {
          type: broadcastType,
          url: broadcastType === 'url' ? url : undefined,
          message: broadcastType === 'message' ? message : undefined,
          tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        });
      }
      setIsOpen(false);
      setUrl('');
      setMessage('');
      setFile(null);
      setFilePreview('');
      setSelectedTagIds([]);
      await checkActiveBroadcast();
    } catch (err: any) {
      console.error('Failed to start broadcast:', err);
      const errorMessage = err.response?.data?.error || 'Failed to start broadcast. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndBroadcast = async () => {
    if (!confirm('Are you sure you want to end the active broadcast?')) return;

    setIsLoading(true);
    try {
      await api.post('/broadcast/end');
      await checkActiveBroadcast();
    } catch (err) {
      console.error('Failed to end broadcast:', err);
      alert('Failed to end broadcast. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-6">
      {/* Active Broadcast Banner */}
      {activeBroadcast && (
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-4 rounded-lg mb-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <SpeakerWaveIcon className="w-6 h-6 animate-pulse" />
            <div>
              <p className="font-bold">Active Broadcast</p>
              <p className="text-sm opacity-90">
                {activeBroadcast.type === 'url' ? `URL: ${activeBroadcast.url}` : `Message: "${activeBroadcast.message}"`}
              </p>
            </div>
          </div>
          <button
            onClick={handleEndBroadcast}
            disabled={isLoading}
            className="btn-secondary bg-white/20 hover:bg-white/30 text-white border-white/30"
          >
            {isLoading ? 'Ending...' : 'End Broadcast'}
          </button>
        </div>
      )}

      {/* Broadcast Control Button */}
      {!activeBroadcast && (
        <div className="flex gap-3">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex-1 btn-primary bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 flex items-center justify-center gap-2 text-lg py-4 shadow-lg"
          >
            <SpeakerWaveIcon className="w-6 h-6" />
            Start Broadcast to All Devices
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="btn-secondary px-6 py-4 shadow-lg flex items-center gap-2"
            title="Broadcast Settings"
          >
            <Cog6ToothIcon className="w-6 h-6" />
            <span className="text-sm">Settings</span>
          </button>
        </div>
      )}

      {/* Broadcast Form Modal */}
      {isOpen && !activeBroadcast && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Start Broadcast</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Error Display */}
              {broadcastError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
                  {broadcastError}
                </div>
              )}

              {/* Broadcast Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Broadcast Type
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button
                    onClick={() => handleBroadcastTypeChange('message')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      broadcastType === 'message'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-purple-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 dark:text-white">Message</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Text message</div>
                  </button>
                  <button
                    onClick={() => handleBroadcastTypeChange('url')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      broadcastType === 'url'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-purple-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 dark:text-white">URL</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Website</div>
                  </button>
                  <button
                    onClick={() => handleBroadcastTypeChange('image')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      broadcastType === 'image'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-purple-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 dark:text-white">Image</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Photo/graphic</div>
                  </button>
                  <button
                    onClick={() => handleBroadcastTypeChange('video')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      broadcastType === 'video'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-purple-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 dark:text-white">Video</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Video file</div>
                  </button>
                </div>
              </div>

              {/* Message Input */}
              {broadcastType === 'message' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Broadcast Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="input w-full h-32 resize-none"
                    placeholder="Enter your message here..."
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    This message will be displayed on all connected devices
                  </p>
                </div>
              )}

              {/* URL Input */}
              {broadcastType === 'url' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    URL
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="input w-full"
                    placeholder="https://example.com"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    All devices will navigate to this URL
                  </p>
                </div>
              )}

              {/* Image Upload */}
              {broadcastType === 'image' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Image File
                  </label>
                  {fileError && (
                    <div className="mb-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded text-sm">
                      {fileError}
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-900 dark:text-gray-100
                              border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer
                              bg-white dark:bg-gray-700
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-l-lg file:border-0
                              file:text-sm file:font-semibold
                              file:bg-purple-50 file:text-purple-700
                              hover:file:bg-purple-100
                              dark:file:bg-purple-900/30 dark:file:text-purple-400"
                  />
                  {file && (
                    <div className="mt-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Selected: <span className="font-medium">{file.name}</span> ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                      {filePreview && (
                        <div className="mt-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                          <img
                            src={filePreview}
                            alt="Preview"
                            className="w-full h-auto max-h-64 object-contain bg-gray-100 dark:bg-gray-800"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Maximum file size: 50MB
                  </p>
                </div>
              )}

              {/* Video Upload */}
              {broadcastType === 'video' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Video File
                  </label>
                  {fileError && (
                    <div className="mb-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded text-sm">
                      {fileError}
                    </div>
                  )}
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-900 dark:text-gray-100
                              border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer
                              bg-white dark:bg-gray-700
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-l-lg file:border-0
                              file:text-sm file:font-semibold
                              file:bg-purple-50 file:text-purple-700
                              hover:file:bg-purple-100
                              dark:file:bg-purple-900/30 dark:file:text-purple-400"
                  />
                  {file && (
                    <div className="mt-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Selected: <span className="font-medium">{file.name}</span> ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    </div>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Maximum file size: 50MB. Supported formats: MP4, WebM, etc.
                  </p>
                </div>
              )}

              {/* Tag Filtering */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Target Devices (Optional)
                </label>
                {tags.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {tags.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => toggleTag(tag.id)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                            selectedTagIds.includes(tag.id)
                              ? 'bg-brand-orange-500 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                          }`}
                          style={
                            selectedTagIds.includes(tag.id) && tag.color
                              ? { backgroundColor: tag.color, borderColor: tag.color }
                              : {}
                          }
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedTagIds.length === 0 ? (
                        <>Broadcasting to <span className="font-semibold">all {targetDeviceCount} device(s)</span></>
                      ) : (
                        <>Broadcasting to <span className="font-semibold">{targetDeviceCount} device(s)</span> with selected tags</>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No tags available. All devices will receive the broadcast.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t dark:border-gray-700">
                <button
                  onClick={() => setIsOpen(false)}
                  className="btn-secondary"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartBroadcast}
                  disabled={isLoading}
                  className="btn-primary bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                >
                  {isLoading ? 'Starting...' : 'Start Broadcast'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Settings Modal */}
      <BroadcastSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
