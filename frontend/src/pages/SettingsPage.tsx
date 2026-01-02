import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

export const SettingsPage = () => {
  const { user, initialize } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // MFA State
  const [mfaQrCode, setMfaQrCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showMfaSetup, setShowMfaSetup] = useState(false);

  // Log Retention State
  const [logRetentionDays, setLogRetentionDays] = useState<string>('7');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logSuccess, setLogSuccess] = useState('');

  // Branding State
  const [brandLogo, setBrandLogo] = useState<string>('');
  const [primaryColor, setPrimaryColor] = useState<string>('#ea580c'); // Default orange
  const [loadingBranding, setLoadingBranding] = useState(false);
  const [brandingSuccess, setBrandingSuccess] = useState('');

  // License State
  const [hasValidLicense, setHasValidLicense] = useState<boolean>(false);

  // SSL Certificate State
  const [sslStatus, setSslStatus] = useState<any>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
  const [loadingSSL, setLoadingSSL] = useState(false);
  const [sslSuccess, setSslSuccess] = useState('');
  const [sslError, setSslError] = useState('');

  useEffect(() => {
    // Fetch current settings
    const fetchSettings = async () => {
      try {
        // Log retention
        const logResponse = await api.get('/settings/LogRetentionDays');
        setLogRetentionDays(logResponse.data.value);

        // License status - branding requires paid tier (not free)
        const licenseResponse = await api.get('/license/status').catch(() => ({ data: { isValid: false, tier: 'free' } }));
        const tier = licenseResponse.data.tier || 'free';
        const isPaidTier = tier !== 'free' && licenseResponse.data.isValid;
        setHasValidLicense(isPaidTier);

        // Branding (only fetch if paid tier)
        if (isPaidTier) {
          const logoResponse = await api.get('/settings/branding.logo').catch(() => ({ data: { value: '' } }));
          setBrandLogo(logoResponse.data.value || '');

          const colorResponse = await api.get('/settings/branding.primaryColor').catch(() => ({ data: { value: '#ea580c' } }));
          setPrimaryColor(colorResponse.data.value || '#ea580c');
        }

        // SSL Certificate Status
        const sslResponse = await api.get('/ssl/status').catch(() => ({ data: { configured: false } }));
        setSslStatus(sslResponse.data);
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };
    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupMfa = async () => {
    try {
      setError('');
      const res = await authService.setupMfa();
      setMfaQrCode(res.qrCodeUri);
      setShowMfaSetup(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to setup MFA');
    }
  };

  const handleEnableMfa = async () => {
    try {
      setError('');
      await authService.enableMfa(mfaCode);
      setSuccess('MFA enabled successfully');
      setShowMfaSetup(false);
      setMfaCode('');
      setMfaQrCode('');
      initialize(); // Refresh user data
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to enable MFA');
    }
  };

  const handleDisableMfa = async () => {
    if (!confirm('Are you sure you want to disable MFA?')) return;
    try {
      setError('');
      await authService.disableMfa();
      setSuccess('MFA disabled successfully');
      initialize(); // Refresh user data
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to disable MFA');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 2MB for logo)
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo file too large. Maximum size is 2MB.');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setBrandLogo(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBranding = async () => {
    setLoadingBranding(true);
    setBrandingSuccess('');
    setError('');
    try {
      await Promise.all([
        api.put('/settings/branding.logo', { value: brandLogo }),
        api.put('/settings/branding.primaryColor', { value: primaryColor }),
      ]);
      setBrandingSuccess('Branding updated successfully! Refresh the page to see changes.');
    } catch (err: any) {
      setError('Failed to update branding settings');
    } finally {
      setLoadingBranding(false);
    }
  };

  const handleClearLogo = async () => {
    setBrandLogo('');
    try {
      await api.put('/settings/branding.logo', { value: '' });
      setBrandingSuccess('Logo cleared successfully');
    } catch (err: any) {
      setError('Failed to clear logo');
    }
  };

  const handleUploadSSL = async () => {
    if (!certificateFile || !privateKeyFile) {
      setSslError('Please select both certificate and private key files');
      return;
    }

    setLoadingSSL(true);
    setSslSuccess('');
    setSslError('');

    try {
      const formData = new FormData();
      formData.append('certificate', certificateFile);
      formData.append('privateKey', privateKeyFile);

      const response = await api.post('/ssl/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSslSuccess(response.data.message || 'SSL certificates uploaded successfully!');
      setCertificateFile(null);
      setPrivateKeyFile(null);

      // Refresh SSL status
      const sslResponse = await api.get('/ssl/status');
      setSslStatus(sslResponse.data);
    } catch (err: any) {
      setSslError(err.response?.data?.error || 'Failed to upload SSL certificates');
    } finally {
      setLoadingSSL(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
          {success}
        </div>
      )}

      {/* MFA Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Two-Factor Authentication</h2>
        
        {user?.isMfaEnabled ? (
          <div>
            <div className="flex items-center text-green-600 dark:text-green-400 mb-4">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              MFA is currently enabled
            </div>
            <button onClick={handleDisableMfa} className="btn-secondary text-red-600 hover:text-red-700 min-h-[44px] w-full sm:w-auto">
              Disable MFA
            </button>
          </div>
        ) : (
          <div>
            {!showMfaSetup ? (
              <div>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Add an extra layer of security to your account by enabling Two-Factor Authentication.
                </p>
                <button onClick={handleSetupMfa} className="btn-primary min-h-[44px] w-full sm:w-auto">
                  Setup MFA
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-gray-200">
                  <QRCodeSVG value={mfaQrCode} size={200} />
                  <p className="mt-4 text-sm text-gray-500 text-center">
                    Scan this QR code with your authenticator app (e.g. Google Authenticator)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Verification Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      className="input flex-1"
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                    />
                    <button onClick={handleEnableMfa} className="btn-primary">
                      Verify & Enable
                    </button>
                  </div>
                </div>
                
                <button 
                  onClick={() => setShowMfaSetup(false)} 
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Password Change Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Change Password</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input w-full"
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Changing Password...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Log Retention Settings */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Log Retention</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configure how long system logs and audit trails are kept before automatic cleanup
        </p>

        {logSuccess && (
          <div className="mb-4 p-4 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-400 rounded">
            {logSuccess}
          </div>
        )}

        <form onSubmit={async (e) => {
          e.preventDefault();
          setLogSuccess('');
          setLoadingLogs(true);
          try {
            await api.put('/settings/LogRetentionDays', { value: logRetentionDays });
            setLogSuccess('Log retention period updated successfully');
          } catch (err) {
            setError('Failed to update log retention setting');
          } finally {
            setLoadingLogs(false);
          }
        }}>
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Retention Period
            </label>
            <select
              value={logRetentionDays}
              onChange={(e) => setLogRetentionDays(e.target.value)}
              className="input w-full"
            >
              <option value="1">1 Day</option>
              <option value="7">7 Days (1 Week)</option>
              <option value="30">30 Days (1 Month)</option>
              <option value="90">90 Days (3 Months)</option>
              <option value="365">365 Days (1 Year)</option>
            </select>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Logs older than this period will be automatically deleted
            </p>
          </div>

          <div className="flex justify-end mt-4">
            <button
              type="submit"
              disabled={loadingLogs}
              className="btn-primary"
            >
              {loadingLogs ? 'Saving...' : 'Save Retention Period'}
            </button>
          </div>
        </form>
      </div>

      {/* Branding Settings */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Branding</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Customize the appearance of the application with your own logo and colors
        </p>

        {!hasValidLicense ? (
          <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                  License Required
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-3">
                  Custom branding is a premium feature. Activate a valid license to unlock logo customization and color theming.
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-500">
                  Contact your administrator or visit the Licensing page to activate a license.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {brandingSuccess && (
              <div className="mb-4 p-4 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-400 rounded">
                {brandingSuccess}
              </div>
            )}

            <div className="space-y-6">
          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Custom Logo
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Upload your logo to replace the default TheiaCast logo in the navigation. Recommended: PNG or SVG, max 2MB.
            </p>

            {brandLogo && (
              <div className="mb-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Preview:</p>
                <img
                  src={brandLogo}
                  alt="Brand logo preview"
                  className="h-12 object-contain"
                />
              </div>
            )}

            <div className="flex gap-2">
              <label className="btn-primary cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                {brandLogo ? 'Change Logo' : 'Upload Logo'}
              </label>
              {brandLogo && (
                <button
                  onClick={handleClearLogo}
                  className="btn-secondary text-red-600 hover:text-red-700"
                >
                  Clear Logo
                </button>
              )}
            </div>
          </div>

          {/* Primary Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Primary Color
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Choose a primary color that matches your brand. This will be applied to buttons, links, and highlights.
            </p>
            <div className="flex items-center gap-4">
              <div className="relative">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-16 h-16 rounded-lg border-2 border-gray-300 dark:border-gray-600 cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="input w-full"
                  placeholder="#ea580c"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Enter a hex color code (e.g., #ea580c for orange)
                </p>
              </div>
              <button
                onClick={() => setPrimaryColor('#ea580c')}
                className="btn-secondary"
              >
                Reset
              </button>
            </div>

            {/* Color Preview */}
            <div className="mt-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Preview:</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  className="px-4 py-2 rounded-lg text-white font-medium"
                  style={{ backgroundColor: primaryColor }}
                >
                  Primary Button
                </button>
                <a
                  className="px-4 py-2 font-medium"
                  style={{ color: primaryColor }}
                >
                  Link Text
                </a>
                <div
                  className="px-4 py-2 rounded-lg border-2"
                  style={{ borderColor: primaryColor, color: primaryColor }}
                >
                  Highlighted Item
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSaveBranding}
              disabled={loadingBranding}
              className="btn-primary"
            >
              {loadingBranding ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        </div>
          </>
        )}
      </div>

      {/* SSL Certificate Upload */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">SSL Certificate</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Upload SSL certificates to enable HTTPS for secure connections
        </p>

        {sslSuccess && (
          <div className="mb-4 p-4 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-400 rounded">
            {sslSuccess}
          </div>
        )}

        {sslError && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded">
            {sslError}
          </div>
        )}

        {/* Current Status */}
        {sslStatus && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Current Status</h3>
            {sslStatus.configured ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">SSL Configured</span>
                </div>
                {sslStatus.subject && (
                  <div className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Subject:</span> {sslStatus.subject}
                  </div>
                )}
                {sslStatus.issuer && (
                  <div className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Issuer:</span> {sslStatus.issuer}
                  </div>
                )}
                {sslStatus.notAfter && (
                  <div className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Expires:</span> {new Date(sslStatus.notAfter).toLocaleDateString()}
                    {sslStatus.daysUntilExpiry && (
                      <span className={`ml-2 ${sslStatus.daysUntilExpiry < 30 ? 'text-red-600 dark:text-red-400' : ''}`}>
                        ({sslStatus.daysUntilExpiry} days remaining)
                      </span>
                    )}
                  </div>
                )}
                {sslStatus.isExpired && (
                  <div className="text-red-600 dark:text-red-400 font-medium">
                    ⚠️ Certificate is expired!
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>No SSL certificates configured (using self-signed)</span>
              </div>
            )}
          </div>
        )}

        {/* Upload Form */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Certificate File (cert.pem)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Upload your SSL certificate in PEM format
            </p>
            <input
              type="file"
              accept=".pem,.crt,.cer"
              onChange={(e) => setCertificateFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-700 focus:outline-none"
            />
            {certificateFile && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Selected: {certificateFile.name}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Private Key File (key.pem)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Upload your private key in PEM format (will be stored securely)
            </p>
            <input
              type="file"
              accept=".pem,.key"
              onChange={(e) => setPrivateKeyFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-700 focus:outline-none"
            />
            {privateKeyFile && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Selected: {privateKeyFile.name}
              </p>
            )}
          </div>

          {/* Upload Button */}
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleUploadSSL}
              disabled={loadingSSL || !certificateFile || !privateKeyFile}
              className="btn-primary"
            >
              {loadingSSL ? 'Uploading...' : 'Upload SSL Certificates'}
            </button>
          </div>

          {/* Info Note */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              <strong>Note:</strong> After uploading new certificates, you'll need to restart the frontend container for the changes to take effect.
              Use the command: <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs">docker compose restart frontend</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
