import { useEffect, useState } from 'react';
import api from '../services/api';

interface BroadcastSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LOGO_POSITIONS = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-center', label: 'Top Center' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'middle-left', label: 'Middle Left' },
  { value: 'middle-center', label: 'Middle Center' },
  { value: 'middle-right', label: 'Middle Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-center', label: 'Bottom Center' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

export const BroadcastSettingsModal = ({ isOpen, onClose }: BroadcastSettingsModalProps) => {
  const [background, setBackground] = useState<string>('');
  const [logo, setLogo] = useState<string>('');
  const [logoPosition, setLogoPosition] = useState<string>('top-left');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const [bgRes, logoRes, posRes] = await Promise.all([
        api.get('/settings/broadcast.background').catch(() => ({ data: { value: '' } })),
        api.get('/settings/broadcast.logo').catch(() => ({ data: { value: '' } })),
        api.get('/settings/broadcast.logoPosition').catch(() => ({ data: { value: 'top-left' } })),
      ]);
      setBackground(bgRes.data.value || '');
      setLogo(logoRes.data.value || '');
      setLogoPosition(posRes.data.value || 'top-left');
    } catch (error) {
      console.error('Failed to load broadcast settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'background' | 'logo') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large. Maximum size is 5MB.');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (type === 'background') {
        setBackground(base64);
      } else {
        setLogo(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClear = (type: 'background' | 'logo') => {
    if (type === 'background') {
      setBackground('');
    } else {
      setLogo('');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        api.put('/settings/broadcast.background', { value: background }),
        api.put('/settings/broadcast.logo', { value: logo }),
        api.put('/settings/broadcast.logoPosition', { value: logoPosition }),
      ]);
      alert('Broadcast settings saved successfully!');
      onClose();
    } catch (error) {
      console.error('Failed to save broadcast settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card-glass w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Broadcast Settings
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Customize the appearance of MESSAGE broadcasts with a custom background and logo
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-orange-500 mx-auto"></div>
              <p className="text-gray-600 dark:text-gray-400 mt-4">Loading settings...</p>
            </div>
          ) : (
            <>
              {/* Background Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Background Image
                </label>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'background')}
                      className="flex-1 text-sm text-gray-500 dark:text-gray-400
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-brand-orange-50 file:text-brand-orange-700
                        hover:file:bg-brand-orange-100
                        dark:file:bg-brand-orange-900/20 dark:file:text-brand-orange-400"
                    />
                    {background && (
                      <button
                        onClick={() => handleClear('background')}
                        className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {background && (
                    <div className="relative w-full h-32 rounded-lg overflow-hidden border-2 border-gray-300 dark:border-gray-700">
                      <img
                        src={background}
                        alt="Background preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Maximum file size: 5MB. Recommended: 1920x1080px
                  </p>
                </div>
              </div>

              {/* Logo Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Logo Image
                </label>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'logo')}
                      className="flex-1 text-sm text-gray-500 dark:text-gray-400
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-brand-orange-50 file:text-brand-orange-700
                        hover:file:bg-brand-orange-100
                        dark:file:bg-brand-orange-900/20 dark:file:text-brand-orange-400"
                    />
                    {logo && (
                      <button
                        onClick={() => handleClear('logo')}
                        className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {logo && (
                    <div className="relative w-32 h-32 rounded-lg overflow-hidden border-2 border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <img
                        src={logo}
                        alt="Logo preview"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Maximum file size: 5MB. Logo will be displayed at max 200x200px
                  </p>
                </div>
              </div>

              {/* Logo Position */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Logo Position
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {LOGO_POSITIONS.map((pos) => (
                    <button
                      key={pos.value}
                      onClick={() => setLogoPosition(pos.value)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                        logoPosition === pos.value
                          ? 'border-brand-orange-500 bg-brand-orange-50 text-brand-orange-700 dark:bg-brand-orange-900/20 dark:text-brand-orange-400'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-brand-orange-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {(background || logo) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Preview
                  </label>
                  <div
                    className="relative w-full h-64 rounded-lg overflow-hidden border-2 border-gray-300 dark:border-gray-700"
                    style={{
                      background: background
                        ? `url('${background}') center/cover no-repeat`
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    }}
                  >
                    {logo && (
                      <img
                        src={logo}
                        alt="Logo preview"
                        className="absolute max-w-[100px] max-h-[100px] object-contain"
                        style={{
                          ...(logoPosition.includes('top') && { top: '10px' }),
                          ...(logoPosition.includes('middle') && { top: '50%', transform: 'translateY(-50%)' }),
                          ...(logoPosition.includes('bottom') && { bottom: '10px' }),
                          ...(logoPosition.includes('left') && { left: '10px' }),
                          ...(logoPosition.includes('center') && { left: '50%', transform: logoPosition === 'middle-center' ? 'translate(-50%, -50%)' : 'translateX(-50%)' }),
                          ...(logoPosition.includes('right') && { right: '10px' }),
                        }}
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-white rounded-xl p-8 shadow-xl text-center max-w-md">
                        <div className="text-brand-orange-600 text-sm font-semibold uppercase tracking-wide mb-2">
                          Broadcast Message
                        </div>
                        <div className="text-gray-900 text-2xl font-semibold">
                          Sample Message Text
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-6 py-2 text-sm font-medium text-white bg-brand-orange-500 rounded-lg hover:bg-brand-orange-600 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            )}
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
