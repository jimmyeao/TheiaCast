import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'commerce',
  user: 'commerce_app',
  password: process.env.DB_PASSWORD || 'generate_secure_password_here',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function getCustomerByEmail(email: string) {
  const result = await pool.query(
    'SELECT * FROM "Customers" WHERE "Email" = $1',
    [email]
  );
  return result.rows[0] || null;
}

export async function createCustomer(stripeCustomerId: string, email: string, name: string | null, installationKey: string) {
  const result = await pool.query(
    `INSERT INTO "Customers" ("StripeCustomerId", "Email", "Name", "InstallationKey", "CreatedAt", "UpdatedAt")
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING *`,
    [stripeCustomerId, email, name, installationKey]
  );
  return result.rows[0];
}

export async function savePurchasedLicense(
  customerId: number,
  licenseKey: string,
  tier: string,
  maxDevices: number,
  stripePaymentIntentId: string | null,
  stripeSessionId: string,
  amountPaid: number,
  currency: string,
  expiresAt: Date | null
) {
  const result = await pool.query(
    `INSERT INTO "PurchasedLicenses" (
      "CustomerId", "LicenseKey", "Tier", "MaxDevices",
      "StripePaymentIntentId", "StripeSessionId", "AmountPaid", "Currency",
      "ExpiresAt", "PurchasedAt", "EmailSent"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, false)
    RETURNING *`,
    [customerId, licenseKey, tier, maxDevices, stripePaymentIntentId, stripeSessionId, amountPaid, currency, expiresAt]
  );
  return result.rows[0];
}

export async function markLicenseEmailSent(licenseId: number) {
  await pool.query(
    'UPDATE "PurchasedLicenses" SET "EmailSent" = true, "DeliveredAt" = CURRENT_TIMESTAMP WHERE "Id" = $1',
    [licenseId]
  );
}

export async function checkWebhookProcessed(stripeEventId: string) {
  const result = await pool.query(
    'SELECT * FROM "WebhookEvents" WHERE "StripeEventId" = $1',
    [stripeEventId]
  );
  return result.rows.length > 0;
}

export async function saveWebhookEvent(stripeEventId: string, eventType: string, payload: any) {
  await pool.query(
    'INSERT INTO "WebhookEvents" ("StripeEventId", "EventType", "Payload", "ProcessedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
    [stripeEventId, eventType, JSON.stringify(payload)]
  );
}

export async function validateLicense(licenseKey: string) {
  const result = await pool.query(
    `SELECT pl.*, c."Email", c."Name" as "CompanyName"
     FROM "PurchasedLicenses" pl
     LEFT JOIN "Customers" c ON pl."CustomerId" = c."Id"
     WHERE pl."LicenseKey" = $1`,
    [licenseKey]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const license = result.rows[0];

  // Update last validated timestamp
  await pool.query(
    'UPDATE "PurchasedLicenses" SET "LastValidatedAt" = CURRENT_TIMESTAMP WHERE "LicenseKey" = $1',
    [licenseKey]
  );

  return license;
}

export default pool;
