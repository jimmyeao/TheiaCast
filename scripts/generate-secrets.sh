#!/bin/bash
# TheiaCast Secret Generator
# Generates random secrets for JWT and HMAC license validation

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         TheiaCast Secret Generator                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Generate JWT Secret (32 characters)
JWT_SECRET=$(openssl rand -base64 32 | tr -d '\n' | head -c 32)

# Generate HMAC License Secret (64 characters)
HMAC_SECRET=$(openssl rand -base64 64 | tr -d '\n' | head -c 64)

echo "Generated Secrets:"
echo ""
echo "JWT Secret (32 chars):"
echo "$JWT_SECRET"
echo ""
echo "HMAC License Secret (64 chars):"
echo "$HMAC_SECRET"
echo ""

# Ask if user wants to update appsettings.json
read -p "Do you want to update appsettings.json with these secrets? (y/n): " response

if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
    APPSETTINGS_PATH="src/TheiaCast.Api/appsettings.json"

    if [ -f "$APPSETTINGS_PATH" ]; then
        # Update secrets using jq (if available)
        if command -v jq &> /dev/null; then
            jq --arg jwt "$JWT_SECRET" --arg hmac "$HMAC_SECRET" \
               '.Jwt.Secret = $jwt | .License.Secret = $hmac' \
               "$APPSETTINGS_PATH" > tmp.$$.json && mv tmp.$$.json "$APPSETTINGS_PATH"
            echo ""
            echo "✓ Updated $APPSETTINGS_PATH with new secrets"
        else
            echo ""
            echo "⚠ jq not found. Please install jq or update manually:"
            echo "  Jwt.Secret = $JWT_SECRET"
            echo "  License.Secret = $HMAC_SECRET"
        fi
    else
        echo ""
        echo "⚠ File not found: $APPSETTINGS_PATH"
        echo "Please copy appsettings.example.json to appsettings.json first"
    fi
else
    echo ""
    echo "Secrets generated but not saved. Copy them manually to appsettings.json"
fi

echo ""
echo "⚠ IMPORTANT:"
echo "  - Keep these secrets secure"
echo "  - Do NOT commit appsettings.json to Git"
echo "  - The HMAC secret is used for license generation and validation"
echo ""
