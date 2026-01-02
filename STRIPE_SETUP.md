# Stripe Product Setup Instructions

## Status Summary

### ✅ Completed
1. **Pricing Page** - Updated with monthly/yearly toggle and new £1.99/screen pricing
2. **Checkout Form** - Added billing cycle selection and installation key validation
3. **Checkout API** - Updated to support subscriptions and billing cycles
4. **Website Deployment** - All changes deployed to Azure and website rebuilt

### ⏳ Remaining Manual Steps
1. **Create Stripe Products** - Set up 8 price IDs in Stripe Dashboard (monthly + yearly for each tier)
2. **Update Environment Variables** - Add new Stripe price IDs to .env.local
3. **Update Webhook Handler** - Modify to handle billing cycles and subscription renewals
4. **Rebuild Webhook Service** - Apply changes and restart service

---

## Overview
The checkout system has been updated to support monthly and yearly subscription billing at £1.99 per screen per month with a 10% discount on yearly plans.

All code changes are complete and deployed. The remaining steps require manual configuration in the Stripe Dashboard and updating the webhook handler on the Azure server.

## Required Changes

### 1. Create Stripe Products in Dashboard

Log in to https://dashboard.stripe.com/products and create the following products:

#### PRO-10 (10 devices)
- **Product Name**: TheiaCast PRO-10
- **Description**: 10 device licenses
- **Create TWO prices for this product**:

  **Monthly Plan**:
  - Billing period: Monthly
  - Price: £19.00 GBP
  - Recurring: Every month
  - Copy the Price ID (starts with `price_`) → Use as `STRIPE_PRICE_PRO_10_MONTHLY`

  **Yearly Plan**:
  - Billing period: Yearly
  - Price: £215.00 GBP
  - Recurring: Every year
  - Copy the Price ID → Use as `STRIPE_PRICE_PRO_10_YEARLY`

#### PRO-20 (20 devices)
- **Product Name**: TheiaCast PRO-20
- **Description**: 20 device licenses
- **Create TWO prices**:

  **Monthly**: £40.00 GBP/month → `STRIPE_PRICE_PRO_20_MONTHLY`
  **Yearly**: £430.00 GBP/year → `STRIPE_PRICE_PRO_20_YEARLY`

#### PRO-50 (50 devices)
- **Product Name**: TheiaCast PRO-50
- **Description**: 50 device licenses
- **Create TWO prices**:

  **Monthly**: £100.00 GBP/month → `STRIPE_PRICE_PRO_50_MONTHLY`
  **Yearly**: £1,075.00 GBP/year → `STRIPE_PRICE_PRO_50_YEARLY`

#### PRO-100 (100 devices)
- **Product Name**: TheiaCast PRO-100
- **Description**: 100 device licenses
- **Create TWO prices**:

  **Monthly**: £199.00 GBP/month → `STRIPE_PRICE_PRO_100_MONTHLY`
  **Yearly**: £2,149.00 GBP/year → `STRIPE_PRICE_PRO_100_YEARLY`

---

### 2. Update .env.local File

After creating all products and prices in Stripe, update the `.env.local` file on the Azure server:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_test_key_here

# PRO-10 (10 devices)
STRIPE_PRICE_PRO_10_MONTHLY=price_xxxxxxxxxxxxx  # £19/month
STRIPE_PRICE_PRO_10_YEARLY=price_xxxxxxxxxxxxx   # £215/year

# PRO-20 (20 devices)
STRIPE_PRICE_PRO_20_MONTHLY=price_xxxxxxxxxxxxx  # £40/month
STRIPE_PRICE_PRO_20_YEARLY=price_xxxxxxxxxxxxx   # £430/year

# PRO-50 (50 devices)
STRIPE_PRICE_PRO_50_MONTHLY=price_xxxxxxxxxxxxx  # £100/month
STRIPE_PRICE_PRO_50_YEARLY=price_xxxxxxxxxxxxx   # £1,075/year

# PRO-100 (100 devices)
STRIPE_PRICE_PRO_100_MONTHLY=price_xxxxxxxxxxxxx # £199/month
STRIPE_PRICE_PRO_100_YEARLY=price_xxxxxxxxxxxxx  # £2,149/year

# Site Configuration
NEXT_PUBLIC_SITE_URL=https://theiacast.com
```

Replace `price_xxxxxxxxxxxxx` with the actual Price IDs from Stripe.

---

### 3. Update .env.local on Azure Server

SSH into the server and update the file:

```bash
ssh -i "theiaweb_key.pem" azurenoroot@40.81.144.252
nano /home/azurenoroot/theiacast-site/.env.local
# Paste the updated configuration
# Save with Ctrl+X, Y, Enter
```

---

### 4. Rebuild and Restart

After updating the environment variables:

```bash
cd /home/azurenoroot/theiacast-site
npm run build
sudo systemctl restart theiacast-web
```

---

## What Changed

1. **Checkout API** (`/api/create-checkout-session`):
   - Now accepts `billingCycle` parameter ('monthly' or 'yearly')
   - Maps tier + billing cycle to correct Stripe price ID
   - Changed from one-time payment to subscription mode
   - Stores billing cycle in session metadata

2. **Checkout Form** (`/checkout`):
   - Added billing cycle selection (radio buttons)
   - Shows dynamic pricing based on selected cycle
   - Validates installation key format
   - Passes billing cycle to API

3. **Pricing Page** (`/pricing`):
   - Monthly/yearly toggle with visual "Save 10%" badge
   - Dynamic price display
   - All prices in GBP (£)

---

### 5. Update Webhook Handler for Subscriptions

The webhook handler needs to be updated to:
1. Extract billingCycle from checkout session metadata
2. Calculate license expiry based on billing cycle (1 month for monthly, 1 year for yearly)
3. Handle subscription renewal events

**File to Update**: `/opt/theiacast-webhook/src/index.ts` on Azure server

**Key Changes Needed**:

1. In `handleCheckoutSessionCompleted` function, add billingCycle extraction:
```typescript
const billingCycle = metadata.billingCycle || 'yearly'; // 'monthly' or 'yearly'
console.log(`Billing cycle: ${billingCycle}`);
```

2. Update expiry calculation:
```typescript
// Calculate expiry based on billing cycle
const expiresAt = new Date();
if (billingCycle === 'monthly') {
  // Monthly subscription: expires in 1 month
  expiresAt.setMonth(expiresAt.getMonth() + 1);
} else {
  // Yearly subscription: expires in 1 year
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
}
```

3. Change default currency to GBP:
```typescript
session.currency || 'gbp',  // Changed from 'usd' to 'gbp'
```

4. Add subscription renewal handler in event switch:
```typescript
switch (event.type) {
  case 'checkout.session.completed':
    await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
    break;
  case 'invoice.payment_succeeded':
    // Handle subscription renewals
    await handleSubscriptionRenewal(event.data.object as Stripe.Invoice);
    break;
  default:
    console.log(`Unhandled event type: ${event.type}`);
}
```

5. Implement `handleSubscriptionRenewal` function:
```typescript
async function handleSubscriptionRenewal(invoice: Stripe.Invoice) {
  console.log('Processing subscription renewal:', invoice.id);

  // Get subscription details to extract metadata (tier, billingCycle, installationKey)
  const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
  const metadata = subscription.metadata || {};

  // Generate new license with updated expiry
  // Send renewal email to customer
}
```

**Steps to Update**:
```bash
ssh -i "theiaweb_key.pem" azurenoroot@40.81.144.252
cd /opt/theiacast-webhook/src
nano index.ts
# Make the changes listed above
# Save with Ctrl+X, Y, Enter

# Rebuild and restart webhook service
cd /opt/theiacast-webhook
npm run build
sudo systemctl restart theiacast-webhook

# Verify service is running
sudo systemctl status theiacast-webhook
```

A backup of the original file has been created at `/opt/theiacast-webhook/src/index.ts.backup`

---

## Testing

After setup, test the checkout flow:

1. Go to https://theiacast.com/checkout
2. Fill in installation key (minimum 32 characters, base64 format)
3. Enter email and company name
4. Select billing cycle (monthly/yearly)
5. Choose a tier (PRO-10, PRO-20, PRO-50, or PRO-100)
6. Click "Proceed to Payment"
7. Should redirect to Stripe checkout with correct pricing
8. Complete test payment in Stripe test mode
9. Verify webhook receives subscription metadata

---

## Pricing Breakdown

| Tier | Devices | Monthly Price | Yearly Price | Savings |
|------|---------|---------------|--------------|---------|
| PRO-10 | 10 | £19 | £215 | £13 (10%) |
| PRO-20 | 20 | £40 | £430 | £50 (10%) |
| PRO-50 | 50 | £100 | £1,075 | £125 (10%) |
| PRO-100 | 100 | £199 | £2,149 | £239 (10%) |

All based on £1.99 per screen per month (yearly = £1.79 per screen per month with 10% discount).
