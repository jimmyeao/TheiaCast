# License Validation & Subscription Tracking Plan

## Overview
Implement daily license validation from TheiaCast clients and automatic license revocation based on Stripe subscription status.

---

## Part 1: Daily License Validation (Client → Server)

### 1.1 Database Schema Updates

**Update `Licenses` table:**
```sql
ALTER TABLE "Licenses" ADD COLUMN IF NOT EXISTS "IsRevoked" BOOLEAN DEFAULT false;
ALTER TABLE "Licenses" ADD COLUMN IF NOT EXISTS "RevokedAt" TIMESTAMP;
ALTER TABLE "Licenses" ADD COLUMN IF NOT EXISTS "RevocationReason" TEXT;
ALTER TABLE "Licenses" ADD COLUMN IF NOT EXISTS "LastValidatedAt" TIMESTAMP;
```

**Update `PurchasedLicenses` table:**
```sql
ALTER TABLE "PurchasedLicenses" ADD COLUMN IF NOT EXISTS "StripeSubscriptionId" TEXT;
ALTER TABLE "PurchasedLicenses" ADD COLUMN IF NOT EXISTS "SubscriptionStatus" TEXT;
ALTER TABLE "PurchasedLicenses" ADD COLUMN IF NOT EXISTS "PaymentFailureCount" INT DEFAULT 0;
ALTER TABLE "PurchasedLicenses" ADD COLUMN IF NOT EXISTS "LastPaymentFailedAt" TIMESTAMP;
```

### 1.2 New API Endpoint: License Validation

**Endpoint:** `POST /api/license/validate`

**Request:**
```json
{
  "licenseKey": "LK-2-H4sIAAAA...",
  "installationKey": "customer-installation-key-hash",
  "deviceId": "optional-device-identifier"
}
```

**Response (Valid):**
```json
{
  "valid": true,
  "expiresAt": "2026-12-27T00:00:00Z",
  "tier": "PRO-20",
  "maxDevices": 20,
  "currentDevices": 15,
  "subscriptionStatus": "active"
}
```

**Response (Invalid):**
```json
{
  "valid": false,
  "reason": "License revoked: Subscription cancelled",
  "revokedAt": "2025-12-20T10:30:00Z",
  "contactSupport": "support@theiacast.com"
}
```

**Validation Logic:**
1. Decode license key using installation key
2. Check license exists in database
3. Check `IsActive = true`
4. Check `IsRevoked = false`
5. Check `ExpiresAt > now` (or null for perpetual)
6. Update `LastValidatedAt` timestamp
7. Return validation result

**Implementation File:** `src/TheiaCast.Api/Program.cs`

```csharp
app.MapPost("/api/license/validate", async ([FromBody] ValidateLicenseDto dto,
    ILicenseService licenseService, PdsDbContext db) =>
{
    try
    {
        // Decode license key
        var payload = await licenseService.DecodeLicenseKeyAsync(dto.LicenseKey);
        if (payload == null)
        {
            return Results.Ok(new { valid = false, reason = "Invalid license key format" });
        }

        // Find license in database
        var license = await db.Licenses
            .FirstOrDefaultAsync(l => l.Key == dto.LicenseKey);

        if (license == null)
        {
            return Results.Ok(new { valid = false, reason = "License not found" });
        }

        // Check revocation
        if (license.IsRevoked)
        {
            return Results.Ok(new
            {
                valid = false,
                reason = $"License revoked: {license.RevocationReason}",
                revokedAt = license.RevokedAt,
                contactSupport = "support@theiacast.com"
            });
        }

        // Check active status
        if (!license.IsActive)
        {
            return Results.Ok(new { valid = false, reason = "License is not active" });
        }

        // Check expiry
        if (license.ExpiresAt.HasValue && license.ExpiresAt.Value < DateTime.UtcNow)
        {
            return Results.Ok(new
            {
                valid = false,
                reason = "License has expired",
                expiredAt = license.ExpiresAt
            });
        }

        // Update last validated timestamp
        license.LastValidatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Return valid response
        return Results.Ok(new
        {
            valid = true,
            expiresAt = license.ExpiresAt,
            tier = license.Tier,
            maxDevices = license.MaxDevices,
            currentDeviceCount = license.CurrentDeviceCount,
            subscriptionStatus = "active" // TODO: Get from PurchasedLicenses
        });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { valid = false, reason = "Validation error occurred" });
    }
});

public record ValidateLicenseDto(string LicenseKey, string InstallationKey, string? DeviceId);
```

### 1.3 TheiaCast Client Changes

**New File:** `raspberrypi-client/src/license-validator.ts`

```typescript
export class LicenseValidator {
  private validationInterval: NodeJS.Timeout | null = null;
  private readonly VALIDATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly GRACE_PERIOD_DAYS = 7;
  private lastValidationSuccess: Date | null = null;
  private consecutiveFailures = 0;

  constructor(
    private licenseKey: string,
    private installationKey: string,
    private apiUrl: string
  ) {}

  start() {
    // Validate immediately on start
    this.validateLicense();

    // Schedule daily validation
    this.validationInterval = setInterval(() => {
      this.validateLicense();
    }, this.VALIDATION_INTERVAL);
  }

  stop() {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = null;
    }
  }

  async validateLicense(): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/license/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: this.licenseKey,
          installationKey: this.installationKey,
          deviceId: os.hostname()
        })
      });

      const result = await response.json();

      if (result.valid) {
        console.log('✓ License validation successful');
        this.lastValidationSuccess = new Date();
        this.consecutiveFailures = 0;
      } else {
        console.error(`✗ License validation failed: ${result.reason}`);
        this.handleValidationFailure(result);
      }
    } catch (error) {
      console.error('License validation network error:', error);
      this.handleNetworkError();
    }
  }

  private handleValidationFailure(result: any) {
    this.consecutiveFailures++;

    // If license is revoked, enforce immediately
    if (result.reason?.includes('revoked')) {
      console.error('LICENSE REVOKED - TheiaCast will stop functioning');
      this.enforceLicenseRevocation(result.reason);
      return;
    }

    // Check if we're past grace period
    const daysSinceLastSuccess = this.getDaysSinceLastValidation();
    if (daysSinceLastSuccess > this.GRACE_PERIOD_DAYS) {
      console.error(`Grace period expired (${this.GRACE_PERIOD_DAYS} days) - enforcing license check`);
      this.enforceLicenseRevocation('License validation failed for too long');
    } else {
      console.warn(`License validation failed. Grace period: ${this.GRACE_PERIOD_DAYS - daysSinceLastSuccess} days remaining`);
    }
  }

  private handleNetworkError() {
    this.consecutiveFailures++;

    // Be lenient with network errors - only enforce after grace period
    const daysSinceLastSuccess = this.getDaysSinceLastValidation();
    if (daysSinceLastSuccess > this.GRACE_PERIOD_DAYS) {
      console.error('Unable to validate license for too long - enforcing check');
      this.enforceLicenseRevocation('Unable to contact license server');
    } else {
      console.warn(`Network error during license validation. Grace period: ${this.GRACE_PERIOD_DAYS - daysSinceLastSuccess} days remaining`);
    }
  }

  private getDaysSinceLastValidation(): number {
    if (!this.lastValidationSuccess) {
      return 0; // First run, no validation yet
    }
    const now = new Date();
    const diffMs = now.getTime() - this.lastValidationSuccess.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  }

  private enforceLicenseRevocation(reason: string) {
    // Show error overlay on all displays
    // Stop playlist execution
    // Log the revocation
    console.error('====================================');
    console.error('LICENSE REVOCATION ENFORCED');
    console.error(`Reason: ${reason}`);
    console.error('Contact support@theiacast.com');
    console.error('====================================');

    // Emit event for main app to handle
    process.emit('license:revoked', reason);
  }
}
```

**Update:** `raspberrypi-client/src/index.ts`

```typescript
import { LicenseValidator } from './license-validator';

class KioskClient {
  private licenseValidator: LicenseValidator | null = null;

  async initialize() {
    // ... existing initialization ...

    // Start license validator
    if (this.config.licenseKey && this.config.installationKey) {
      this.licenseValidator = new LicenseValidator(
        this.config.licenseKey,
        this.config.installationKey,
        this.config.serverUrl
      );
      this.licenseValidator.start();

      // Listen for revocation events
      process.on('license:revoked', (reason) => {
        console.error('License revoked, stopping TheiaCast');
        this.handleLicenseRevocation(reason);
      });
    }
  }

  private handleLicenseRevocation(reason: string) {
    // Stop playlist
    this.playlistExecutor?.stop();

    // Show error message on display
    this.displayController?.showErrorPage({
      title: 'License Revoked',
      message: reason,
      contact: 'support@theiacast.com'
    });

    // Stop accepting WebSocket commands (except license update)
  }
}
```

---

## Part 2: Subscription Tracking & Auto-Revocation

### 2.1 Stripe Webhook Events

**Events to Handle:**

1. **`customer.subscription.deleted`** - Subscription cancelled
2. **`customer.subscription.updated`** - Status changed (canceled, unpaid, past_due)
3. **`invoice.payment_failed`** - Payment failure (track count)
4. **`invoice.payment_succeeded`** - Already handling for renewals

### 2.2 Webhook Handler Updates

**File:** `/opt/theiacast-webhook/src/index.ts`

**Add to event switch:**
```typescript
switch (event.type) {
  case 'checkout.session.completed':
    await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
    break;
  case 'invoice.payment_succeeded':
    await handleSubscriptionRenewal(event.data.object as Stripe.Invoice);
    break;
  case 'customer.subscription.deleted':
    await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    break;
  case 'customer.subscription.updated':
    await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
    break;
  case 'invoice.payment_failed':
    await handlePaymentFailed(event.data.object as Stripe.Invoice);
    break;
  default:
    console.log(`Unhandled event type: ${event.type}`);
}
```

**New Handler Functions:**

```typescript
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Processing subscription.deleted:', subscription.id);

  try {
    const metadata = subscription.metadata || {};
    const installationKey = metadata.installationKey;

    if (!installationKey) {
      console.error('No installation key in subscription metadata');
      return;
    }

    // Find all licenses for this subscription
    const licenses = await db.query(
      'SELECT * FROM "PurchasedLicenses" WHERE "StripeSubscriptionId" = $1',
      [subscription.id]
    );

    for (const license of licenses.rows) {
      // Revoke the license
      await db.query(
        `UPDATE "Licenses"
         SET "IsActive" = false,
             "IsRevoked" = true,
             "RevokedAt" = NOW(),
             "RevocationReason" = 'Subscription cancelled'
         WHERE "Key" = $1`,
        [license.LicenseKey]
      );

      // Update purchased license status
      await db.query(
        `UPDATE "PurchasedLicenses"
         SET "SubscriptionStatus" = 'canceled'
         WHERE "Id" = $1`,
        [license.Id]
      );

      console.log(`License revoked: ${license.LicenseKey} (subscription cancelled)`);

      // Send notification email
      const customer = await getCustomerById(license.CustomerId);
      if (customer) {
        await emailService.sendLicenseRevokedEmail({
          recipientEmail: customer.Email,
          recipientName: customer.CompanyName,
          licenseKey: license.LicenseKey,
          reason: 'Subscription cancelled',
          revokedAt: new Date()
        });
      }
    }

    console.log(`Successfully processed subscription deletion: ${subscription.id}`);
  } catch (error: any) {
    console.error('Error processing subscription deletion:', error.message);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('Processing subscription.updated:', subscription.id);

  try {
    const status = subscription.status; // active, canceled, unpaid, past_due, etc.

    // Update subscription status in database
    await db.query(
      `UPDATE "PurchasedLicenses"
       SET "SubscriptionStatus" = $1
       WHERE "StripeSubscriptionId" = $2`,
      [status, subscription.id]
    );

    // If subscription became canceled or unpaid, revoke license
    if (status === 'canceled' || status === 'unpaid') {
      const licenses = await db.query(
        'SELECT * FROM "PurchasedLicenses" WHERE "StripeSubscriptionId" = $1',
        [subscription.id]
      );

      for (const license of licenses.rows) {
        await db.query(
          `UPDATE "Licenses"
           SET "IsActive" = false,
               "IsRevoked" = true,
               "RevokedAt" = NOW(),
               "RevocationReason" = $1
           WHERE "Key" = $2`,
          [`Subscription ${status}`, license.LicenseKey]
        );

        console.log(`License revoked: ${license.LicenseKey} (subscription ${status})`);
      }
    }

    console.log(`Subscription status updated: ${subscription.id} → ${status}`);
  } catch (error: any) {
    console.error('Error processing subscription update:', error.message);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Processing payment failure:', invoice.id);

  try {
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) {
      console.log('No subscription ID in invoice');
      return;
    }

    // Increment failure count
    await db.query(
      `UPDATE "PurchasedLicenses"
       SET "PaymentFailureCount" = "PaymentFailureCount" + 1,
           "LastPaymentFailedAt" = NOW()
       WHERE "StripeSubscriptionId" = $1`,
      [subscriptionId]
    );

    // Get current failure count
    const result = await db.query(
      'SELECT "PaymentFailureCount", "CustomerId", "LicenseKey" FROM "PurchasedLicenses" WHERE "StripeSubscriptionId" = $1',
      [subscriptionId]
    );

    if (result.rows.length > 0) {
      const { PaymentFailureCount, CustomerId, LicenseKey } = result.rows[0];

      // Get customer details
      const customer = await getCustomerById(CustomerId);

      if (customer) {
        // Send warning email on 1st and 2nd failures
        if (PaymentFailureCount <= 2) {
          await emailService.sendPaymentFailedWarning({
            recipientEmail: customer.Email,
            recipientName: customer.CompanyName,
            attemptNumber: PaymentFailureCount,
            licenseKey: LicenseKey,
            nextAttemptDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
          });
        }

        console.log(`Payment failure #${PaymentFailureCount} for subscription ${subscriptionId}`);
      }
    }

    // Note: Stripe will auto-cancel subscription after 3-4 failures
    // The subscription.deleted event will then revoke the license
  } catch (error: any) {
    console.error('Error processing payment failure:', error.message);
  }
}
```

### 2.3 Database Helper Functions

Add to `/opt/theiacast-webhook/src/database.ts`:

```typescript
export async function getCustomerById(customerId: number): Promise<any> {
  const result = await pool.query(
    'SELECT * FROM "Customers" WHERE "Id" = $1',
    [customerId]
  );
  return result.rows[0] || null;
}

export async function revokeLicense(licenseKey: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE "Licenses"
     SET "IsActive" = false,
         "IsRevoked" = true,
         "RevokedAt" = NOW(),
         "RevocationReason" = $1
     WHERE "Key" = $2`,
    [reason, licenseKey]
  );
}
```

### 2.4 Email Templates

**File:** `/opt/theiacast-webhook/src/email-service.ts`

Add new email templates:

```typescript
async sendLicenseRevokedEmail(params: {
  recipientEmail: string;
  recipientName?: string;
  licenseKey: string;
  reason: string;
  revokedAt: Date;
}) {
  const html = `
    <h2>TheiaCast License Revoked</h2>
    <p>Dear ${params.recipientName || 'Customer'},</p>
    <p>Your TheiaCast license has been revoked:</p>
    <ul>
      <li><strong>License Key:</strong> ${params.licenseKey}</li>
      <li><strong>Reason:</strong> ${params.reason}</li>
      <li><strong>Revoked At:</strong> ${params.revokedAt.toISOString()}</li>
    </ul>
    <p><strong>What this means:</strong></p>
    <ul>
      <li>Your TheiaCast displays will stop functioning within 7 days</li>
      <li>To restore service, please renew your subscription or contact support</li>
    </ul>
    <p>Contact us at support@theiacast.com if you have questions.</p>
  `;

  await this.sendEmail({
    to: params.recipientEmail,
    subject: 'TheiaCast License Revoked',
    html
  });
}

async sendPaymentFailedWarning(params: {
  recipientEmail: string;
  recipientName?: string;
  attemptNumber: number;
  licenseKey: string;
  nextAttemptDate: Date;
}) {
  const html = `
    <h2>Payment Failed - Action Required</h2>
    <p>Dear ${params.recipientName || 'Customer'},</p>
    <p>We were unable to process your TheiaCast subscription payment (Attempt ${params.attemptNumber} of 3).</p>
    <p><strong>License:</strong> ${params.licenseKey}</p>
    <p><strong>Next retry:</strong> ${params.nextAttemptDate.toDateString()}</p>
    <p><strong>Action needed:</strong></p>
    <ul>
      <li>Update your payment method in the Stripe customer portal</li>
      <li>Ensure your card has sufficient funds</li>
      <li>Contact your bank if the issue persists</li>
    </ul>
    <p><strong>Warning:</strong> After 3 failed attempts, your license will be revoked and your displays will stop working.</p>
    <p>Contact support@theiacast.com for assistance.</p>
  `;

  await this.sendEmail({
    to: params.recipientEmail,
    subject: `Payment Failed (Attempt ${params.attemptNumber}/3) - TheiaCast`,
    html
  });
}
```

---

## Part 3: Admin Interface (Future Enhancement)

### License Management Dashboard

**Features:**
- View all licenses with status (active, revoked, expired)
- Search by email, license key, company name
- View subscription status and payment history
- Manually revoke/reactivate licenses
- View validation history (last validated timestamp)
- Filter by tier, status, expiry date

**API Endpoints Needed:**
- `GET /admin/licenses` - List all licenses
- `GET /admin/licenses/:id` - Get license details
- `POST /admin/licenses/:id/revoke` - Manually revoke
- `POST /admin/licenses/:id/reactivate` - Manually reactivate
- `GET /admin/subscriptions` - List subscription statuses

---

## Implementation Timeline

### Phase 1: Database & API (2 hours)
1. Add new columns to Licenses and PurchasedLicenses tables
2. Implement `/api/license/validate` endpoint
3. Test with Postman/curl

### Phase 2: Webhook Handlers (2 hours)
1. Add subscription deleted handler
2. Add subscription updated handler
3. Add payment failed handler
4. Add email templates
5. Test with Stripe CLI webhook forwarding

### Phase 3: Client License Validator (3 hours)
1. Create license-validator.ts
2. Integrate with KioskClient
3. Add error display page
4. Test validation success/failure scenarios
5. Test grace period enforcement

### Phase 4: Testing (2 hours)
1. Test subscription cancellation flow
2. Test payment failure flow
3. Test license validation from client
4. Test grace period expiration
5. Test manual revocation

### Phase 5: Email Notifications (1 hour)
1. Create email templates
2. Test email delivery
3. Verify email content

---

## Security Considerations

1. **Rate Limiting**: Add rate limiting to `/api/license/validate` to prevent abuse
2. **Authentication**: Consider requiring device token for validation requests
3. **Encryption**: License keys are already HMAC-signed, but consider encrypting storage
4. **Audit Trail**: Log all license revocations and validation attempts
5. **Grace Period**: 7-day grace period prevents accidental lockouts from network issues

---

## Testing Checklist

### License Validation
- [ ] Valid license returns success
- [ ] Expired license returns failure
- [ ] Revoked license returns failure with reason
- [ ] Invalid license key returns failure
- [ ] Network error triggers grace period
- [ ] Grace period expiration enforces revocation
- [ ] LastValidatedAt timestamp updates correctly

### Subscription Tracking
- [ ] Subscription cancellation revokes license
- [ ] Subscription status update (canceled) revokes license
- [ ] Payment failure increments counter
- [ ] 1st payment failure sends warning email
- [ ] 2nd payment failure sends warning email
- [ ] 3rd payment failure + subscription deletion revokes license
- [ ] License revocation email sent correctly

### Client Behavior
- [ ] Client validates license on startup
- [ ] Client validates license every 24 hours
- [ ] Client handles network errors gracefully
- [ ] Client enforces revocation after grace period
- [ ] Client shows error overlay when revoked
- [ ] Client stops playlist when revoked

---

## Rollback Plan

If issues arise:
1. Disable license validation in client (config flag)
2. Stop processing subscription webhook events
3. Manually reactivate revoked licenses via database
4. Investigate and fix issues
5. Re-enable gradually with monitoring

---

## Monitoring & Alerts

**Metrics to Track:**
- License validation success/failure rate
- Grace period expirations
- Subscription cancellations
- Payment failures
- Manual revocations

**Alerts:**
- High validation failure rate (network issues?)
- Spike in subscription cancellations
- Payment gateway errors

---

## Next Steps

1. Review this plan and confirm approach
2. Implement Phase 1 (Database & API)
3. Implement Phase 2 (Webhook handlers)
4. Test thoroughly before going live
5. Monitor for 1 week in production before full rollout
