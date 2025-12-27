#!/bin/bash
# Deployment script for license validation endpoint fix
# Run this on the Azure server

set -e  # Exit on error

echo "🚀 Deploying license validation endpoint fix..."

# Navigate to webhook directory
cd /opt/theiacast-webhook/src

# Backup current files
echo "📦 Backing up current files..."
sudo cp index.ts index.ts.backup.$(date +%Y%m%d_%H%M%S)
sudo cp database.ts database.ts.backup.$(date +%Y%m%d_%H%M%S)

# Update database.ts - add validateLicense function
echo "📝 Updating database.ts..."
sudo tee -a database.ts > /dev/null << 'EOF'

export async function validateLicense(licenseKey: string) {
  const result = await pool.query(
    `SELECT pl.*, c."Email", c."CompanyName"
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
EOF

# Update index.ts imports
echo "📝 Updating index.ts imports..."
sudo sed -i '/saveWebhookEvent$/s/$/,\n  validateLicense/' index.ts

# Update the validation endpoint
echo "📝 Updating validation endpoint logic..."
# This is complex, so we'll create a patch file
sudo cat > /tmp/validation-endpoint.patch << 'PATCHEOF'
--- a/index.ts
+++ b/index.ts
@@ -40,72 +40,48 @@
 // License validation endpoint (for customer TheiaCast backends)
 app.post('/api/license/validate', express.json(), async (req, res) => {
   try {
     const { licenseKey, installationKey, deviceId } = req.body;

     if (!licenseKey || !installationKey) {
       return res.json({
         valid: false,
         reason: 'Missing required fields: licenseKey and installationKey'
       });
     }

-    // Decode and verify license key
-    const { Pool } = require('pg');
-    const pool = new Pool({
-      host: 'localhost',
-      port: 5432,
-      database: 'commerce',
-      user: 'postgres',
-      password: process.env.DB_PASSWORD || 'Cc061mjw0!'
-    });
-
-    // Find license in database
-    const result = await pool.query(
-      `SELECT pl.*, c."Email", c."CompanyName"
-       FROM "PurchasedLicenses" pl
-       LEFT JOIN "Customers" c ON pl."CustomerId" = c."Id"
-       WHERE pl."LicenseKey" = $1`,
-      [licenseKey]
-    );
+    // Use database helper to validate license
+    const license = await validateLicense(licenseKey);

-    if (result.rows.length === 0) {
-      await pool.end();
+    if (!license) {
       return res.json({
         valid: false,
         reason: 'License key not found'
       });
     }

-    const license = result.rows[0];
-
     // Check if revoked
     if (license.IsRevoked) {
-      await pool.end();
       return res.json({
         valid: false,
         reason: `License revoked: ${license.RevocationReason || 'Unknown reason'}`,
         revokedAt: license.RevokedAt,
         contactSupport: 'support@theiacast.com'
       });
     }

     // Check expiry
     if (license.ExpiresAt) {
       const expiryDate = new Date(license.ExpiresAt);
       if (expiryDate < new Date()) {
-        await pool.end();
         return res.json({
           valid: false,
           reason: 'License has expired',
           expiredAt: license.ExpiresAt,
           contactSupport: 'support@theiacast.com'
         });
       }
     }

-    // Update last validated timestamp
-    await pool.query(
-      `UPDATE "PurchasedLicenses"
-       SET "LastValidatedAt" = NOW()
-       WHERE "LicenseKey" = $1`,
-      [licenseKey]
-    );
-
-    await pool.end();
-
     // Return valid response
     return res.json({
       valid: true,
PATCHEOF

echo "🔧 Building TypeScript..."
cd /opt/theiacast-webhook
npm run build

echo "🔄 Restarting webhook service..."
sudo systemctl restart theiacast-webhook

echo "⏳ Waiting for service to start..."
sleep 3

echo "✅ Checking service status..."
sudo systemctl status theiacast-webhook --no-pager -l

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 To test the endpoint, run:"
echo "   curl -X POST http://localhost:5001/api/license/validate \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"licenseKey\":\"YOUR_KEY\",\"installationKey\":\"test\"}'"
echo ""
