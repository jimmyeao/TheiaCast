# TheiaCast Setup Guide

## Licensing & Distribution Models

TheiaCast uses a licensing system to manage device limits. The system automatically generates a unique installation key when you first start the backend, making setup simple and secure.

---

## 🏢 Option 1: SaaS Model (Recommended - Most Secure)

**You host TheiaCast, customers access via browser.**

### Pros
✅ HMAC secret never exposed to customers
✅ Centralized license management
✅ Easy updates and patches
✅ Most secure option

### Setup
1. Deploy TheiaCast to your server (AWS, Azure, DigitalOcean, etc.)
2. Start the backend - it will automatically generate a unique installation key
3. Customers access via `https://your-theiacast-domain.com`
4. Generate licenses using your private `theiacast-license-generator` tool
5. Add licenses directly to your database

**The installation key stays on your server only - never exposed to customers.**

---

## 🏠 Option 2: Self-Hosted (Auto-Generated Keys)

**Customers host TheiaCast on their own infrastructure with auto-generated installation keys.**

### How it works:
1. Customer downloads TheiaCast from GitHub
2. Customer starts the backend - **installation key is automatically generated and stored in database**
3. Customer views their installation key in the License page (UI)
4. When purchasing a license, customer copies and sends you their installation key
5. You generate licenses using **their installation key** in your generator tool
6. Customer enters the license key in their installation

### Pros
✅ **No manual secret generation required** - fully automated
✅ Each customer has a unique installation key
✅ Compromising one key doesn't affect others
✅ Simple setup process - just start the backend
✅ Installation key visible in UI for easy copying

### Cons
❌ Customer must provide installation key when purchasing licenses

### Setup Process (No Scripts Needed!)

**For Customers:**
1. Download TheiaCast from GitHub
2. Configure database connection in `appsettings.json`
3. Start the backend: `dotnet run`
4. The installation key is **automatically generated** on first startup
5. Login to the admin UI and navigate to the License page
6. Copy the installation key displayed at the top
7. Contact vendor to purchase a license and provide the installation key
8. Receive license key from vendor and activate it

---

## 🔧 Configuration Setup

### Step 1: Copy Example Config

```bash
cd src/TheiaCast.Api
cp appsettings.example.json appsettings.json
```

### Step 2: Configure Basic Settings

The installation key (HMAC secret) is **automatically generated** when you first start the backend. You only need to configure:

```json
{
  "Jwt": {
    "Secret": "your-jwt-secret-min-32-chars",
    "Issuer": "theiacast",
    "Audience": "theiacast-clients"
  },
  "License": {
    "EnableValidation": true,
    "GracePeriodDays": 7
  },
  "ConnectionStrings": {
    "Default": "Host=localhost;Port=5432;Database=theiacast;Username=postgres;Password=your-password"
  }
}
```

**Note:** The `License.Secret` field in `appsettings.json` is **no longer used**. The installation key is generated automatically and stored in the database on first startup.

---

## 🔐 Security Best Practices

### DO:
✅ Keep `appsettings.json` in `.gitignore` (already configured)
✅ Use HTTPS in production
✅ Keep the license generator in a private repository
✅ Secure database backups (installation key is stored in database)
✅ Use strong JWT secrets (32+ characters)

### DO NOT:
❌ Commit `appsettings.json` to public Git
❌ Share your installation key publicly
❌ Expose the database to unauthorized access

---

## 📦 Distribution Workflow

### For SaaS Model:
1. Deploy to your server
2. Backend automatically generates installation key on first startup
3. Customers sign up and access your hosted instance
4. Generate licenses using your private tool
5. Add licenses to your database
6. Customers see licenses in their account

### For Self-Hosted (Auto-Generated Keys):
1. Customer downloads TheiaCast from GitHub
2. Customer configures database connection in `appsettings.json`
3. Customer starts backend - **installation key auto-generated**
4. Customer logs into admin UI and navigates to License page
5. Customer copies their installation key from the UI
6. Customer contacts you to purchase a license and provides installation key
7. You generate license using **their installation key** in your generator:
   ```bash
   cd theiacast-license-generator
   dotnet run -- --customer-secret "THEIR_INSTALLATION_KEY" --batch PRO-20 "Company" 2026-12-31
   ```
8. Send license key to customer
9. Customer activates license in their TheiaCast UI

---

## 🚀 Getting Started

1. **Choose your model** (SaaS recommended)
2. **Set up database** (PostgreSQL)
3. **Configure settings** in `appsettings.json` (JWT secret and database connection)
4. **Build and run**:
   ```bash
   cd src/TheiaCast.Api
   dotnet run
   ```
   Installation key will be automatically generated on first startup!
5. **Access frontend**: http://localhost:5173
6. **Login**: username: `admin`, password: `admin` (change immediately!)
7. **View installation key**: Navigate to License page in the UI

---

## 📝 License Tiers

| Tier | Devices | Suggested Price |
|------|---------|-----------------|
| Free | 3 | $0 |
| Pro-10 | 10 | $499/year |
| Pro-20 | 20 | $899/year |
| Pro-50 | 50 | $1,999/year |
| Pro-100 | 100 | $3,499/year |
| Enterprise | Custom | Custom |

---

## 🆘 Support

For questions about setup, licensing, or deployment:
- Open an issue on GitHub
- Contact: [Your support email]

---

## ⚠️ Important Notes

- The free tier (3 devices) works immediately without any license
- **Installation key is automatically generated** on first backend startup and stored in database
- Customers can view their installation key in the License page UI
- Paid licenses must be generated using the private `theiacast-license-generator` tool
- The license generator is **NOT** distributed with TheiaCast (keep it in a private repository)
- Each installation has a unique installation key for security
- Keep your installation key secure - it's used to validate licenses
