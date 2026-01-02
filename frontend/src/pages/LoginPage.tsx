import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showMfa, setShowMfa] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login({ username, password, mfaCode: showMfa ? mfaCode : undefined });
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Login failed';
      if (msg === 'MFA_REQUIRED') {
        setShowMfa(true);
        clearError();
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-orange-400 via-brand-orange-500 to-orange-600 dark:from-brand-orange-700 dark:via-brand-orange-800 dark:to-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <img
                src="/logo.png"
                alt="TheiaCast"
                className="h-20 w-20 drop-shadow-2xl"
              />
              <div className="absolute inset-0 bg-brand-orange-500/20 blur-xl rounded-full animate-pulse"></div>
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-brand-orange-500 via-brand-orange-600 to-orange-600 bg-clip-text text-transparent mb-2">
            TheiaCast
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Digital Signage Administration
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {!showMfa ? (
            <>
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input"
                  placeholder="Enter your username"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-700 mb-2">
                Two-Factor Authentication Code
              </label>
              <input
                id="mfaCode"
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="input text-center tracking-widest text-lg"
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
              />
              <p className="mt-2 text-sm text-gray-500 text-center">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing in...' : (showMfa ? 'Verify' : 'Sign In')}
          </button>
          
          {showMfa && (
            <button
              type="button"
              onClick={() => { setShowMfa(false); setMfaCode(''); }}
              className="w-full text-sm text-gray-600 hover:text-gray-900"
            >
              Back to Login
            </button>
          )}
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Default credentials:</p>
          <p className="font-mono">admin / admin123</p>
        </div>
      </div>
    </div>
  );
};
