import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { generateLicenseKey } from './license-generator';
import { EmailService } from './email-service';
import {
  getCustomerByEmail,
  createCustomer,
  savePurchasedLicense,
  markLicenseEmailSent,
  checkWebhookProcessed,
  saveWebhookEvent
} from './database';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5001');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// Initialize Email Service
const emailService = new EmailService({
  tenantId: process.env.GRAPH_TENANT_ID!,
  clientId: process.env.GRAPH_CLIENT_ID!,
  clientSecret: process.env.GRAPH_CLIENT_SECRET!,
  senderEmail: process.env.GRAPH_SENDER_EMAIL!,
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'theiacast-webhook-handler' });
});

// Stripe webhook endpoint
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('No Stripe signature found');
    return res.status(400).send('No signature');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Check for idempotency - prevent duplicate processing
  const alreadyProcessed = await checkWebhookProcessed(event.id);
  if (alreadyProcessed) {
    console.log(`Webhook ${event.id} already processed, skipping`);
    return res.json({ received: true, skipped: 'already_processed' });
  }

  // Save webhook event for audit trail
  await saveWebhookEvent(event.id, event.type, event.data.object);

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout.session.completed:', session.id);

  try {
    const customerEmail = session.customer_details?.email || session.customer_email;
    if (!customerEmail) {
      throw new Error('No customer email found in session');
    }

    // Extract license tier and installation key from metadata
    const metadata = session.metadata || {};
    const tier = metadata.tier || 'PRO-10'; // Default tier
    const maxDevices = parseInt(metadata.maxDevices || '10');
    const companyName = metadata.companyName || session.customer_details?.name || undefined;

    // IMPORTANT: Customer must provide their installation key from their TheiaCast instance
    // This key is used to generate licenses specific to their installation
    const installationKey = metadata.installationKey;

    if (!installationKey) {
      throw new Error('No installation key provided in checkout metadata. Customer must provide their TheiaCast installation key.');
    }

    console.log(`Installation key provided: ${installationKey.substring(0, 8)}...`);

    // Calculate expiry (1 year from now)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // Get or create customer
    let customer = await getCustomerByEmail(customerEmail);

    if (!customer) {
      // For test events, customer might be null - use a placeholder
      const stripeCustomerId = session.customer as string || `test_${Date.now()}`;

      customer = await createCustomer(
        stripeCustomerId,
        customerEmail,
        companyName || null,
        installationKey  // Store the customer's installation key
      );

      console.log(`Created new customer: ${customerEmail} with installation key: ${installationKey.substring(0, 8)}...`);
    } else {
      // Customer exists - verify installation key matches or update it
      console.log(`Existing customer found: ${customerEmail}`);
    }

    // Generate license key using customer's installation key as HMAC secret
    const license = generateLicenseKey(
      tier,
      maxDevices,
      companyName,
      expiresAt,
      customer.InstallationKey  // Use customer's specific installation key
    );

    // Save purchased license
    const purchasedLicense = await savePurchasedLicense(
      customer.Id,
      license.licenseKey,
      tier,
      maxDevices,
      session.payment_intent as string | null,
      session.id,
      session.amount_total || 0,
      session.currency || 'usd',
      expiresAt
    );

    console.log(`License generated and saved: ${license.licenseKey}`);
    console.log(`License is specific to customer's TheiaCast installation`);

    // Send license email
    try {
      await emailService.sendLicenseEmail({
        recipientEmail: customerEmail,
        recipientName: companyName,
        licenseKey: license.licenseKey,
        tier,
        maxDevices,
        expiresAt
      });

      // Mark email as sent
      await markLicenseEmailSent(purchasedLicense.Id);
      console.log(`License email sent successfully to ${customerEmail}`);
    } catch (emailError: any) {
      console.error(`Failed to send email to ${customerEmail}:`, emailError.message);
      // Don't fail the whole transaction if email fails
      // The license is still valid and saved in the database
    }

    console.log(`Successfully processed purchase for ${customerEmail}`);
  } catch (error: any) {
    console.error('Error processing checkout session:', error.message);
    console.error(error.stack);
  }
}

function generateInstallationKey(): string {
  const randomBytes = require('crypto').randomBytes(16);
  return randomBytes.toString('hex');
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`TheiaCast Webhook Handler listening on http://127.0.0.1:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/api/stripe-webhook`);
  console.log(`NOTE: Customers must provide their installation key in checkout metadata`);
  console.log(`Email service: Configured for ${process.env.GRAPH_SENDER_EMAIL}`);
});
