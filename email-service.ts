import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

interface EmailConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderEmail: string;
}

interface SendLicenseEmailParams {
  recipientEmail: string;
  recipientName?: string;
  licenseKey: string;
  tier: string;
  maxDevices: number;
  expiresAt?: Date;
}

export class EmailService {
  private client: Client;
  private senderEmail: string;

  constructor(config: EmailConfig) {
    // Create credential using client secret
    const credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret
    );

    // Create authentication provider
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default']
    });

    // Initialize Graph client
    this.client = Client.initWithMiddleware({ authProvider });
    this.senderEmail = config.senderEmail;
  }

  async sendLicenseEmail(params: SendLicenseEmailParams): Promise<void> {
    const {
      recipientEmail,
      recipientName,
      licenseKey,
      tier,
      maxDevices,
      expiresAt
    } = params;

    const expiryText = expiresAt
      ? `Valid until: ${expiresAt.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`
      : 'Perpetual license (no expiry)';

    const message = {
      message: {
        subject: 'Your TheiaCast License Key',
        body: {
          contentType: 'HTML',
          content: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #ea580c 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .license-box { background: white; border: 2px solid #ea580c; border-radius: 8px; padding: 20px; margin: 20px 0; font-family: 'Courier New', monospace; word-break: break-all; }
    .license-key { font-size: 14px; color: #ea580c; font-weight: bold; }
    .info-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #ea580c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
    .stats { display: flex; justify-content: space-around; margin: 20px 0; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #ea580c; }
    .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🎉 Welcome to TheiaCast!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for your purchase</p>
    </div>

    <div class="content">
      <p>Hi${recipientName ? ` ${recipientName}` : ''},</p>

      <p>Thank you for purchasing TheiaCast! Your license has been generated and is ready to activate.</p>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${tier}</div>
          <div class="stat-label">License Tier</div>
        </div>
        <div class="stat">
          <div class="stat-value">${maxDevices}</div>
          <div class="stat-label">Max Devices</div>
        </div>
      </div>

      <h2 style="color: #ea580c; margin-top: 30px;">Your License Key</h2>
      <div class="license-box">
        <div class="license-key">${licenseKey}</div>
      </div>

      <div class="info-box">
        <strong>📅 License Validity:</strong><br>
        ${expiryText}
      </div>

      <h3>How to Activate Your License</h3>
      <ol>
        <li>Log in to your TheiaCast admin dashboard</li>
        <li>Navigate to <strong>Settings → License</strong></li>
        <li>Click <strong>"Activate License"</strong></li>
        <li>Paste your license key (above) and click <strong>"Activate"</strong></li>
        <li>Your devices will be unlocked immediately!</li>
      </ol>

      <div style="text-align: center;">
        <a href="https://theiacast.com/docs/getting-started" class="button">View Documentation</a>
      </div>

      <h3>Need Help?</h3>
      <p>If you have any questions or need assistance, our support team is here to help:</p>
      <ul>
        <li>📧 Email: <a href="mailto:support@theiacast.com">support@theiacast.com</a></li>
        <li>📞 Phone: <a href="tel:+441522716476">+44 1522 716476</a></li>
        <li>🌐 Website: <a href="https://theiacast.com/contact">theiacast.com/contact</a></li>
      </ul>

      <div class="footer">
        <p><strong>TheiaCast Digital Signage</strong><br>
        Professional digital signage made simple</p>
        <p style="margin-top: 10px;">This email was sent to ${recipientEmail} because you purchased a TheiaCast license.<br>
        Please keep this email safe for your records.</p>
      </div>
    </div>
  </div>
</body>
</html>
          `
        },
        toRecipients: [
          {
            emailAddress: {
              address: recipientEmail,
              name: recipientName || recipientEmail
            }
          }
        ],
        from: {
          emailAddress: {
            address: this.senderEmail,
            name: 'TheiaCast Orders'
          }
        }
      },
      saveToSentItems: true
    };

    try {
      // Send email using the shared mailbox
      await this.client
        .api(`/users/${this.senderEmail}/sendMail`)
        .post(message);

      console.log(`License email sent successfully to ${recipientEmail}`);
    } catch (error: any) {
      console.error('Error sending email via Graph API:', error.message);
      if (error.statusCode) {
        console.error(`Status code: ${error.statusCode}`);
      }
      if (error.body) {
        console.error(`Error details: ${JSON.stringify(error.body, null, 2)}`);
      }
      throw error;
    }
  }
}
