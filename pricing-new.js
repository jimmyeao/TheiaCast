import { useState } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import Link from 'next/link';

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('yearly'); // 'monthly' or 'yearly'

  const pricingData = {
    'PRO-10': {
      devices: 10,
      monthly: 19,
      yearly: 215,
      perDeviceMonthly: 1.90
    },
    'PRO-20': {
      devices: 20,
      monthly: 40,
      yearly: 430,
      perDeviceMonthly: 2.00
    },
    'PRO-50': {
      devices: 50,
      monthly: 100,
      yearly: 1075,
      perDeviceMonthly: 2.00
    },
    'PRO-100': {
      devices: 100,
      monthly: 199,
      yearly: 2149,
      perDeviceMonthly: 1.99
    }
  };

  return (
    <>
      <Head>
        <title>Pricing - TheiaCast Digital Signage Software</title>
        <meta name="description" content="TheiaCast offers a free tier for up to 3 devices, with flexible monthly and annual licensing starting at £1.99 per screen per month." />
        <meta name="keywords" content="digital signage pricing, freemium signage software, monthly license, annual license, affordable digital signage" />
        <link rel="canonical" href="https://theiacast.com/pricing" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://theiacast.com/pricing" />
        <meta property="og:title" content="Pricing - TheiaCast Digital Signage Software" />
        <meta property="og:description" content="TheiaCast offers a free tier for up to 3 devices, with flexible monthly and annual licensing starting at £1.99 per screen per month." />
        <meta property="og:image" content="https://theiacast.com/logo.png" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://theiacast.com/pricing" />
        <meta name="twitter:title" content="Pricing - TheiaCast Digital Signage Software" />
        <meta name="twitter:description" content="TheiaCast offers a free tier for up to 3 devices, with flexible monthly and annual licensing starting at £1.99 per screen per month." />
        <meta name="twitter:image" content="https://theiacast.com/logo.png" />
      </Head>

      <Layout>
        <section className="bg-gradient-to-br from-orange-900 via-orange-800 to-red-800 dark:from-gray-900 dark:to-gray-800 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-5xl font-bold text-white mb-6">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-gray-200 dark:text-gray-300 max-w-3xl mx-auto">
              Start free with up to 3 devices. £1.99 per screen per month for larger deployments.
            </p>
          </div>
        </section>

        <section className="py-20 bg-white dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            {/* Billing Cycle Toggle */}
            <div className="flex justify-center mb-12">
              <div className="inline-flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                    billingCycle === 'monthly'
                      ? 'bg-orange-600 text-white shadow-lg'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('yearly')}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all relative ${
                    billingCycle === 'yearly'
                      ? 'bg-orange-600 text-white shadow-lg'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Yearly
                  <span className="absolute -top-3 -right-3 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                    Save 10%
                  </span>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">

              {/* Free Tier */}
              <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Free</h3>
                  <div className="flex items-baseline justify-center mb-4">
                    <span className="text-5xl font-bold text-gray-900 dark:text-white">£0</span>
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
                    <span className="text-gray-600 dark:text-gray-300">Live monitoring</span>
                  </li>
                  <li className="flex items-start text-sm">
                    <span className="text-green-500 mr-2 text-lg">✓</span>
                    <span className="text-gray-600 dark:text-gray-300">Community support</span>
                  </li>
                </ul>

                <Link href="/download" className="block w-full text-center bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors">
                  Get Started Free
                </Link>
              </div>

              {/* PRO-10 */}
              <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">PRO-10</h3>
                  <div className="flex items-baseline justify-center mb-1">
                    <span className="text-5xl font-bold text-gray-900 dark:text-white">
                      £{billingCycle === 'yearly' ? pricingData['PRO-10'].yearly : pricingData['PRO-10'].monthly}
                    </span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">/{billingCycle === 'yearly' ? 'year' : 'month'}</p>
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
                    <span className="text-gray-600 dark:text-gray-300">£1.90/device/month</span>
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
                    <span className="text-5xl font-bold text-gray-900 dark:text-white">
                      £{billingCycle === 'yearly' ? pricingData['PRO-20'].yearly : pricingData['PRO-20'].monthly}
                    </span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">/{billingCycle === 'yearly' ? 'year' : 'month'}</p>
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
                    <span className="text-gray-600 dark:text-gray-300">£2.00/device/month</span>
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
                    <span className="text-5xl font-bold text-gray-900 dark:text-white">
                      £{billingCycle === 'yearly' ? pricingData['PRO-50'].yearly : pricingData['PRO-50'].monthly}
                    </span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">/{billingCycle === 'yearly' ? 'year' : 'month'}</p>
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
                    <span className="text-gray-600 dark:text-gray-300">£2.00/device/month</span>
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
                      <li>✓ £1.99/device/month</li>
                    </ul>
                  </div>
                  <div className="text-center">
                    <div className="flex items-baseline justify-center mb-4">
                      <span className="text-5xl font-bold text-gray-900 dark:text-white">
                        £{billingCycle === 'yearly' ? pricingData['PRO-100'].yearly : pricingData['PRO-100'].monthly}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 ml-2">/{billingCycle === 'yearly' ? 'year' : 'month'}</span>
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
                  <div className="mb-6 md:mb-0">
                    <h3 className="text-3xl font-bold mb-2">Enterprise</h3>
                    <p className="text-gray-300">For organizations with 100+ devices</p>
                    <ul className="text-sm space-y-1 text-gray-300 mt-4">
                      <li>✓ Unlimited devices</li>
                      <li>✓ Custom SLA</li>
                      <li>✓ Dedicated account manager</li>
                      <li>✓ On-premise deployment options</li>
                    </ul>
                  </div>
                  <div className="text-center">
                    <Link href="/contact" className="inline-block bg-white text-gray-900 font-semibold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors">
                      Contact Sales
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* FAQ Section */}
            <div className="mt-20 max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
                Frequently Asked Questions
              </h2>
              <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Can I switch between monthly and yearly billing?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Yes! You can upgrade to yearly billing at any time to save 10%. Contact us to switch plans.
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    What happens when I exceed my device limit?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    You'll have a 7-day grace period to upgrade your plan. After that, you won't be able to add new devices until you upgrade.
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Do you offer refunds?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Yes, we offer a 30-day money-back guarantee on all paid plans. No questions asked.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </Layout>
    </>
  );
}
