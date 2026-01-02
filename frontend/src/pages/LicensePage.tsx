import { useState, useEffect } from 'react';
import { licenseService } from '../services/license.service';
import type { License, LicenseStatus, InstallationKeyResponse, DecodedLicenseResponse } from '@theiacast/shared';
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';

export const LicensePage = () => {
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [installationKey, setInstallationKey] = useState<InstallationKeyResponse | null>(null);
  const [decodedLicense, setDecodedLicense] = useState<DecodedLicenseResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingLicenses, setLoadingLicenses] = useState(false);
  const [loadingInstallationKey, setLoadingInstallationKey] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);

  const fetchLicenseStatus = async () => {
    setLoadingStatus(true);
    try {
      const status = await licenseService.getStatus();
      setLicenseStatus(status);
      setError('');
    } catch (err: any) {
      console.error('Failed to fetch license status:', err);
      setError('Failed to load license status');
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchLicenses = async () => {
    setLoadingLicenses(true);
    try {
      const fetchedLicenses = await licenseService.getAll();
      setLicenses(fetchedLicenses);
      setError('');
    } catch (err: any) {
      console.error('Failed to fetch licenses:', err);
      setError('Failed to load licenses');
    } finally {
      setLoadingLicenses(false);
    }
  };

  const fetchInstallationKey = async () => {
    setLoadingInstallationKey(true);
    try {
      const key = await licenseService.getInstallationKey();
      setInstallationKey(key);
      setError('');
    } catch (err: any) {
      console.error('Failed to fetch installation key:', err);
      setError('Failed to load installation key');
    } finally {
      setLoadingInstallationKey(false);
    }
  };

  const fetchDecodedLicense = async () => {
    try {
      const decoded = await licenseService.getDecoded();
      setDecodedLicense(decoded);
    } catch (err: any) {
      console.error('Failed to fetch decoded license:', err);
    }
  };

  const handleCopyInstallationKey = async () => {
    if (installationKey) {
      try {
        await navigator.clipboard.writeText(installationKey.installationKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleRevokeLicense = async (id: number) => {
    if (!confirm('Are you sure you want to revoke this license?')) return;

    try {
      await licenseService.revoke(id);
      setSuccess('License revoked successfully');
      fetchLicenses();
      fetchLicenseStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to revoke license');
    }
  };

  const handleActivateLicense = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activationKey.trim()) {
      setError('Please enter a license key');
      return;
    }

    setActivating(true);
    setError('');
    setSuccess('');

    try {
      await licenseService.activateGlobal(activationKey.trim());
      setSuccess('License activated successfully! Your installation has been upgraded.');
      setActivationKey('');
      fetchLicenseStatus();
      fetchLicenses();
      fetchDecodedLicense();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to activate license. Please check the license key and try again.');
    } finally {
      setActivating(false);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
    fetchLicenses();
    fetchInstallationKey();
    fetchDecodedLicense();
  }, []);

  const getStatusColor = () => {
    if (!licenseStatus) return 'gray';
    if (!licenseStatus.isValid && !licenseStatus.isInGracePeriod) return 'red';
    if (licenseStatus.isInGracePeriod) return 'yellow';
    if (licenseStatus.currentDevices >= licenseStatus.maxDevices * 0.8) return 'yellow';
    return 'green';
  };

  const getStatusBadge = () => {
    const color = getStatusColor();
    const bgColors = {
      green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      gray: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };

    return bgColors[color as keyof typeof bgColors];
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">License Management</h1>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
        </div>
      )}

      {/* Installation Key Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg shadow-md p-4 sm:p-6 border-2 border-blue-200 dark:border-blue-800">
        <div className="flex items-start justify-between mb-3 sm:mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-2">Your Installation Key</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This is your unique installation key. Provide this to the vendor when purchasing a license.
            </p>
          </div>
        </div>

        {loadingInstallationKey ? (
          <div className="text-center py-4">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading key...</p>
          </div>
        ) : installationKey ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
              <code className="flex-1 text-xs sm:text-sm font-mono text-gray-900 dark:text-white break-all">
                {installationKey.installationKey}
              </code>
              <button
                onClick={handleCopyInstallationKey}
                className="flex-shrink-0 p-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors min-h-[44px] flex items-center justify-center"
                title="Copy to clipboard"
              >
                {copied ? (
                  <CheckIcon className="h-5 w-5" />
                ) : (
                  <ClipboardDocumentIcon className="h-5 w-5" />
                )}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Generated: {new Date(installationKey.generatedAt).toLocaleString()}</span>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>How to purchase a license:</strong>
              </p>
              <ol className="mt-2 ml-4 text-sm text-blue-700 dark:text-blue-300 list-decimal space-y-1">
                <li>Copy your installation key using the button above</li>
                <li>Contact the vendor to purchase a license</li>
                <li>Provide your installation key when requesting the license</li>
                <li>The vendor will generate a license key specifically for your installation</li>
                <li>Enter the license key in the device activation section</li>
              </ol>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No installation key available</p>
        )}
      </div>

      {/* License Activation Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Activate License Key</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enter the license key provided by the vendor to upgrade your installation.
        </p>

        <form onSubmit={handleActivateLicense} className="space-y-4">
          <div>
            <label htmlFor="licenseKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              License Key
            </label>
            <input
              id="licenseKey"
              type="text"
              value={activationKey}
              onChange={(e) => setActivationKey(e.target.value)}
              placeholder="LK-1-PRO-20-xY9mKp3rT4u-BC8F"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={activating}
            />
          </div>

          <button
            type="submit"
            disabled={activating || !activationKey.trim()}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            {activating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></div>
                Activating...
              </span>
            ) : (
              'Activate License'
            )}
          </button>
        </form>
      </div>

      {/* Current License Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Current License Status</h2>

        {loadingStatus ? (
          <div className="text-center py-8">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Loading status...</p>
          </div>
        ) : licenseStatus ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Tier</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{licenseStatus.tier}</p>
                {licenseStatus.activeLicenseCount && licenseStatus.activeLicenseCount > 1 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    🎫 {licenseStatus.activeLicenseCount} active licenses (additive)
                  </p>
                )}
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge()}`}>
                {licenseStatus.isValid ? 'Active' : licenseStatus.isInGracePeriod ? 'Grace Period' : 'Exceeded'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Devices Used</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {licenseStatus.currentDevices} / {licenseStatus.maxDevices}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Available</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {Math.max(0, licenseStatus.maxDevices - licenseStatus.currentDevices)}
                </p>
              </div>
              {licenseStatus.expiresAt && (
                <div className="col-span-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">License Expires</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-white">
                    {new Date(licenseStatus.expiresAt).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full ${
                  getStatusColor() === 'green'
                    ? 'bg-green-600'
                    : getStatusColor() === 'yellow'
                    ? 'bg-yellow-500'
                    : 'bg-red-600'
                }`}
                style={{ width: `${(licenseStatus.currentDevices / licenseStatus.maxDevices) * 100}%` }}
              ></div>
            </div>

            {licenseStatus.isInGracePeriod && licenseStatus.gracePeriodEndsAt && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Warning:</strong> You have exceeded your device limit. Grace period ends on{' '}
                  {new Date(licenseStatus.gracePeriodEndsAt).toLocaleString()}. Please upgrade your license to avoid service interruption.
                </p>
              </div>
            )}

            {!licenseStatus.isValid && !licenseStatus.isInGracePeriod && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>License Limit Exceeded:</strong> {licenseStatus.reason || 'Cannot add more devices.'}
                </p>
              </div>
            )}

            {/* Decoded License Information (Supports Multiple Licenses) */}
            {decodedLicense?.hasLicense && decodedLicense.licenses && decodedLicense.licenses.length > 0 && (
              <div className="space-y-3">
                {/* Overall Summary */}
                <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                      📜 License Summary
                    </h4>
                    <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                      {decodedLicense.activeLicenseCount} {decodedLicense.activeLicenseCount === 1 ? 'License' : 'Licenses'} Active
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-purple-600 dark:text-purple-400 font-medium">Total Device Allowance</p>
                      <p className="text-2xl font-bold text-purple-900 dark:text-white">{decodedLicense.totalMaxDevices}</p>
                    </div>
                    <div>
                      <p className="text-purple-600 dark:text-purple-400 font-medium">Devices In Use</p>
                      <p className="text-2xl font-bold text-purple-900 dark:text-white">{decodedLicense.currentDevices}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-700">
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      💡 All active licenses are additive - total device count is the sum of all licenses.
                    </p>
                  </div>
                </div>

                {/* Individual License Cards */}
                {decodedLicense.licenses.map((license, index) => (
                  <div
                    key={license.id}
                    className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h5 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                        🎫 License {index + 1} - {license.tier}
                      </h5>
                      {license.isPerpetual ? (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
                          ♾️ PERPETUAL
                        </span>
                      ) : license.isExpired ? (
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded">
                          ❌ EXPIRED
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                          ✅ ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {license.companyName && (
                        <div>
                          <p className="text-blue-600 dark:text-blue-400 font-medium">Licensed To</p>
                          <p className="text-gray-900 dark:text-white">{license.companyName}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-blue-600 dark:text-blue-400 font-medium">Device Allowance</p>
                        <p className="text-gray-900 dark:text-white">
                          {license.currentDevices} / {license.maxDevices} devices
                        </p>
                      </div>
                      {license.issuedAt && (
                        <div>
                          <p className="text-blue-600 dark:text-blue-400 font-medium">Issued Date</p>
                          <p className="text-gray-900 dark:text-white">{license.issuedAt}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-blue-600 dark:text-blue-400 font-medium">License Type</p>
                        <p className="text-gray-900 dark:text-white">
                          {license.isPerpetual ? 'Perpetual' : 'Subscription'}
                        </p>
                      </div>
                      {!license.isPerpetual && license.expiresAt && (
                        <div>
                          <p className="text-blue-600 dark:text-blue-400 font-medium">Expires On</p>
                          <p className={`font-semibold ${license.isExpired ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                            {license.expiresAt}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-blue-600 dark:text-blue-400 font-medium">Version</p>
                        <p className="text-gray-900 dark:text-white">
                          V{license.version} {license.version === 2 ? '(Encoded)' : '(Legacy)'}
                        </p>
                      </div>
                    </div>
                    {license.message && (
                      <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                        ℹ️ {license.message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Renewal Link for Paid Licenses */}
            {licenseStatus.tier !== 'free' && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                      {licenseStatus.expiresAt && new Date(licenseStatus.expiresAt).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
                        ? '⚠️ License Expiring Soon'
                        : '💎 Premium License Active'}
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {licenseStatus.expiresAt && new Date(licenseStatus.expiresAt).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
                        ? 'Your license is expiring soon. Renew now to continue enjoying premium features.'
                        : 'Need more devices or want to extend your license? Visit our renewal page.'}
                    </p>
                  </div>
                  <a
                    href="https://theiacast.com/renew"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                  >
                    Renew License
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No license information available</p>
        )}
      </div>

      {/* All Licenses Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">All Licenses</h2>

          {loadingLicenses ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
              <p className="mt-2 text-gray-600 dark:text-gray-400">Loading licenses...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      License Key
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Tier
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Devices
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {licenses.map((license) => (
                    <tr key={license.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-gray-900 dark:text-white">{license.key}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-white capitalize">{license.tier}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-white">
                          {license.currentDeviceCount} / {license.maxDevices}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-500 dark:text-gray-400">{license.companyName || '-'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {license.isActive ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {license.tier !== 'free' && (
                          <button
                            onClick={() => handleRevokeLicense(license.id)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {licenses.length === 0 && !loadingLicenses && (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400">No licenses found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
