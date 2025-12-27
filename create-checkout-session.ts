import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, installationKey, companyName, tier, billingCycle } = req.body;

    // Validate required fields
    if (!email || !installationKey || !tier || !billingCycle) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate billing cycle
    if (billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return res.status(400).json({ error: 'Invalid billing cycle' });
    }

    // Map tier + billing cycle to price ID and max devices
    const tierConfig: Record<string, { monthly: string; yearly: string; maxDevices: number }> = {
      'PRO-10': {
        monthly: process.env.STRIPE_PRICE_PRO_10_MONTHLY!,
        yearly: process.env.STRIPE_PRICE_PRO_10_YEARLY!,
        maxDevices: 10,
      },
      'PRO-20': {
        monthly: process.env.STRIPE_PRICE_PRO_20_MONTHLY!,
        yearly: process.env.STRIPE_PRICE_PRO_20_YEARLY!,
        maxDevices: 20,
      },
      'PRO-50': {
        monthly: process.env.STRIPE_PRICE_PRO_50_MONTHLY!,
        yearly: process.env.STRIPE_PRICE_PRO_50_YEARLY!,
        maxDevices: 50,
      },
      'PRO-100': {
        monthly: process.env.STRIPE_PRICE_PRO_100_MONTHLY!,
        yearly: process.env.STRIPE_PRICE_PRO_100_YEARLY!,
        maxDevices: 100,
      },
    };

    const config = tierConfig[tier];
    if (!config) {
      return res.status(400).json({ error: 'Invalid tier selected' });
    }

    // Select the correct price ID based on billing cycle
    const priceId = billingCycle === 'monthly' ? config.monthly : config.yearly;

    // Create Stripe checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        tier,
        maxDevices: config.maxDevices.toString(),
        installationKey,
        companyName: companyName || '',
        billingCycle,
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
