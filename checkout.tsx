import { useState } from 'react';
import Layout from '../components/Layout';
import Link from 'next/link';

export default function Checkout() {
  const [email, setEmail] = useState('');
  const [installationKey, setInstallationKey] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [tier, setTier] = useState('PRO-10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Create checkout session
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          installationKey,
          companyName,
          tier,
        }),
      });

      const data = await response.json();

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to create checkout session');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Layout>
      <section className="bg-gradient-to-br from-orange-900 via-orange-800 to-red-800 dark:from-gray-900 dark:to-gray-800 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-bold text-white mb-6">
            Purchase License
          </h1>
          <p className="text-xl text-gray-200 dark:text-gray-300">
            Complete the form below to purchase your TheiaCast license
          </p>
        </div>
      </section>

      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <form onSubmit={handleCheckout} className="space-y-6 bg-gray-50 dark:bg-gray-800 p-8 rounded-lg shadow-lg">
            {/* Installation Key Field */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                TheiaCast Installation Key *
              </label>
              <input
                type="text"
                required
                value={installationKey}
                onChange={(e) => setInstallationKey(e.target.value)}
                placeholder="Enter your installation key from TheiaCast"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                📌 Find this in your TheiaCast admin dashboard → License page → "Show Installation Key"
              </p>
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Your license key will be sent to this email
              </p>
            </div>

            {/* Company Name Field */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Company Name (Optional)
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your Company Name"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Tier Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                License Tier *
              </label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="PRO-10">PRO-10 - 10 devices ($499/year)</option>
                <option value="PRO-20">PRO-20 - 20 devices ($899/year)</option>
                <option value="PRO-50">PRO-50 - 50 devices ($1,999/year)</option>
                <option value="PRO-100">PRO-100 - 100 devices ($3,499/year)</option>
              </select>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Select the tier that matches your needs
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded-lg">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold px-6 py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {loading ? 'Processing...' : 'Proceed to Payment →'}
            </button>

            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              Secure payment processed by Stripe
            </p>
          </form>

          {/* Help Section */}
          <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              How to find your Installation Key:
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-300">
              <li>Log in to your TheiaCast admin dashboard</li>
              <li>Navigate to the <strong>License</strong> page</li>
              <li>Click <strong>"Show Installation Key"</strong> or <strong>"Get Installation Key"</strong></li>
              <li>Copy the key and paste it in the form above</li>
            </ol>
            <p className="mt-4 text-sm text-blue-700 dark:text-blue-400">
              💡 <strong>Don't have TheiaCast installed yet?</strong>{' '}
              <Link href="/download" className="underline hover:text-blue-900 dark:hover:text-blue-200">
                Download and install
              </Link>{' '}
              it first to get your installation key.
            </p>
          </div>

          {/* Security Notice */}
          <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              🔒 Your payment information is secured by Stripe. We never store your credit card details.
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
}
