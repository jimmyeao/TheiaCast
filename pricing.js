import Head from 'next/head';
import Layout from '../components/Layout';
import Link from 'next/link';

export default function Pricing() {
  return (
    <>
      <Head>
        <title>Pricing - TheiaCast Digital Signage Software</title>
        <meta name="description" content="TheiaCast offers a free tier for up to 3 devices, with affordable annual licensing for larger deployments. No hidden costs." />
        <meta name="keywords" content="digital signage pricing, freemium signage software, annual license, affordable digital signage" />
        <link rel="canonical" href="https://theiacast.com/pricing" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://theiacast.com/pricing" />
        <meta property="og:title" content="Pricing - TheiaCast Digital Signage Software" />
        <meta property="og:description" content="TheiaCast offers a free tier for up to 3 devices, with affordable annual licensing for larger deployments. No hidden costs." />
        <meta property="og:image" content="https://theiacast.com/logo.png" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://theiacast.com/pricing" />
        <meta name="twitter:title" content="Pricing - TheiaCast Digital Signage Software" />
        <meta name="twitter:description" content="TheiaCast offers a free tier for up to 3 devices, with affordable annual licensing for larger deployments. No hidden costs." />
        <meta name="twitter:image" content="https://theiacast.com/logo.png" />
      </Head>

<Layout>
      <section className="bg-gradient-to-br from-orange-900 via-orange-800 to-red-800 dark:from-gray-900 dark:to-gray-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-bold text-white mb-6">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-200 dark:text-gray-300 max-w-3xl mx-auto">
            Start free with up to 3 devices. Scale with affordable annual licensing.
          </p>
        </div>
      </section>

      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">

            {/* Free Tier */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Free</h3>
                <div className="flex items-baseline justify-center mb-4">
                  <span className="text-5xl font-bold text-gray-900 dark:text-white">$0</span>
                </div>
                <p className="text-gray-600 dark:text-gray-300">Up to 3 devices</p>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start text-sm">
                  <span className="text-green-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300"><strong className="text-gray-900 dark:text-white">3 devices</strong></span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-green-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">Unlimited playlists</span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-green-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">Remote control</span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-green-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">Community support</span>
                </li>
              </ul>

              <Link href="/download" className="block w-full text-center bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold py-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                Get Started Free
              </Link>
            </div>

            {/* PRO-10 */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">PRO-10</h3>
                <div className="flex items-baseline justify-center mb-1">
                  <span className="text-5xl font-bold text-gray-900 dark:text-white">$499</span>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">/year</p>
                <p className="text-gray-600 dark:text-gray-300">Up to 10 devices</p>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">Everything in Free</span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300"><strong className="text-gray-900 dark:text-white">10 devices</strong></span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">Priority support</span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">$4.16/device/month</span>
                </li>
              </ul>

              <Link href="/checkout" className="block w-full text-center bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg transition-colors">
                Buy Now
              </Link>
            </div>

            {/* PRO-20 (Most Popular) */}
            <div className="bg-white dark:bg-gray-800 border-4 border-orange-600 rounded-xl p-6 shadow-xl transform scale-105 relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-gradient-to-r from-orange-600 to-orange-500 text-white px-4 py-1 rounded-full text-xs font-semibold">
                  Most Popular
                </span>
              </div>

              <div className="text-center mb-6 mt-2">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">PRO-20</h3>
                <div className="flex items-baseline justify-center mb-1">
                  <span className="text-5xl font-bold text-gray-900 dark:text-white">$899</span>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">/year</p>
                <p className="text-gray-600 dark:text-gray-300">Up to 20 devices</p>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">Everything in Free</span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300"><strong className="text-gray-900 dark:text-white">20 devices</strong></span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">Priority support</span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">$3.75/device/month</span>
                </li>
              </ul>

              <Link href="/checkout" className="block w-full text-center bg-gradient-to-r from-orange-600 to-orange-500 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-all">
                Buy Now
              </Link>
            </div>

            {/* PRO-50 */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">PRO-50</h3>
                <div className="flex items-baseline justify-center mb-1">
                  <span className="text-5xl font-bold text-gray-900 dark:text-white">$1,999</span>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">/year</p>
                <p className="text-gray-600 dark:text-gray-300">Up to 50 devices</p>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">Everything in Free</span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300"><strong className="text-gray-900 dark:text-white">50 devices</strong></span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">Priority support</span>
                </li>
                <li className="flex items-start text-sm">
                  <span className="text-orange-500 mr-2 text-lg">✓</span>
                  <span className="text-gray-600 dark:text-gray-300">$3.33/device/month</span>
                </li>
              </ul>

              <Link href="/checkout" className="block w-full text-center bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg transition-colors">
                Buy Now
              </Link>
            </div>
          </div>

          {/* PRO-100 - Full Width Below */}
          <div className="mt-8 max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-8">
              <div className="flex flex-col md:flex-row items-center justify-between">
                <div className="text-center md:text-left mb-6 md:mb-0">
                  <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">PRO-100</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-2">Up to 100 devices</p>
                  <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-300">
                    <li>✓ Everything in PRO tiers</li>
                    <li>✓ Dedicated support</li>
                    <li>✓ $2.92/device/month</li>
                  </ul>
                </div>
                <div className="text-center">
                  <div className="flex items-baseline justify-center mb-4">
                    <span className="text-5xl font-bold text-gray-900 dark:text-white">$3,499</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2">/year</span>
                  </div>
                  <Link href="/checkout" className="inline-block bg-gradient-to-r from-orange-600 to-orange-500 text-white font-semibold px-10 py-3 rounded-lg hover:shadow-lg transition-all">
                    Buy Now
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Enterprise */}
          <div className="mt-8 max-w-2xl mx-auto">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 dark:from-gray-800 dark:to-gray-900 rounded-xl p-8 text-white">
              <div className="flex flex-col md:flex-row items-center justify-between">
                <div className="text-center md:text-left mb-6 md:mb-0">
                  <h3 className="text-3xl font-bold mb-2">Enterprise</h3>
                  <p className="text-gray-300 mb-2">100+ devices</p>
                  <ul className="text-sm space-y-1 text-gray-300">
                    <li>✓ Custom volume pricing</li>
                    <li>✓ SLA guarantee</li>
                    <li>✓ Dedicated account manager</li>
                  </ul>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold mb-4">Custom</div>
                  <Link href="/contact" className="inline-block bg-white text-gray-900 font-semibold px-10 py-3 rounded-lg hover:bg-gray-100 transition-colors">
                    Contact Sales
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">Frequently Asked Questions</h2>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Is the free tier really free forever?</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Yes! You can use up to 3 devices completely free with no time limit and access to all core features.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">How does licensing work?</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Licenses are annual subscriptions. You purchase a tier based on the number of devices you need, and the license is valid for one year from activation.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">What if I need more than 100 devices?</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Contact our sales team for enterprise pricing. We offer custom volume discounts for large deployments.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Can I upgrade or downgrade my plan?</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Yes! Contact support to upgrade to a higher tier at any time. Downgrades can be processed at your next renewal.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">What payment methods do you accept?</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We accept all major credit cards via Stripe. For enterprise accounts, we also offer invoicing and wire transfer options.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-r from-orange-600 to-orange-500 text-white">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-xl mb-8 text-orange-100">
            Start free with up to 3 devices. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/download" className="inline-block bg-white text-orange-600 font-semibold px-8 py-4 rounded-lg hover:bg-gray-100 transition-colors duration-200 shadow-lg">
              Download Free
            </Link>
            <Link href="/checkout" className="inline-block bg-orange-800 hover:bg-orange-900 text-white font-semibold px-8 py-4 rounded-lg transition-colors duration-200 shadow-lg">
              Purchase License
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  </>
  );
}
