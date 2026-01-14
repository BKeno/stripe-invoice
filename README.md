# Stripe Invoice Automation

Automated invoice generation for Stripe Paylink payments → Számlázz.hu → Google Sheets sync.

## Features

- ✅ Real-time Stripe webhook processing (payment + refund)
- ✅ Automatic Számlázz.hu invoice generation (standard + storno)
- ✅ Smart payment filtering (skip non-invoice integrations like SevenRooms)
- ✅ Google Sheets sync with multi-product line items
- ✅ Multi-event support (separate Sheet tabs per product)
- ✅ 3-layer idempotency protection (prevents duplicate invoices)
- ✅ Modular architecture (scalable for proforma, advance invoices)
- ✅ TypeScript + Express 5 with native async error handling

## Tech Stack

- **Backend:** Node.js, Express 5, TypeScript
- **APIs:** Stripe, Számlázz.hu Agent XML, Google Sheets API v4
- **Deployment:** Railway (recommended), Render, or VPS
- **Security:** Webhook signature verification, environment variables

## Quick Start

### 1. Install

```bash
npm install
cp .env.example .env
```

### 2. Configure Environment

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Számlázz.hu
SZAMLAZZ_API_KEY=...
SZAMLAZZ_E_INVOICE=true
SZAMLAZZ_ISSUER_NAME=Your Company
SZAMLAZZ_BANK=UniCredit Bank Zrt.; BACX HU HB
SZAMLAZZ_BANK_ACCOUNT=HU72...

# Google Sheets
GOOGLE_SHEETS_ID=1abc...xyz
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Server
PORT=3000
NODE_ENV=production
```

### 3. Stripe Payment Link Setup

**Required Custom Fields** (Billing address - add to ALL invoice-enabled payment links):

| Field        | Key        | Type    | Label               | Required |
| ------------ | ---------- | ------- | ------------------- | -------- |
| Irányítószám | `irnytszm` | Numeric | Irányítószám        | ✅       |
| Város        | `vros`     | Text    | Város               | ✅       |
| Cím          | `cm`       | Text    | Cím (utca, házszám) | ✅       |

**Product Metadata** (Add to each Stripe product):

- `vat_rate`: `5`, `18`, or `27` **(required)**
- `sheet_name`: Custom Sheet tab (optional, default: `Sheet1`)

Example:

```json
{
  "vat_rate": "27",
  "sheet_name": "Event_Jan_2026"
}
```

**Important:** Payment links WITHOUT `irnytszm` custom field will be **automatically skipped** (e.g., SevenRooms integrations).

### 4. Google Sheets Setup

1. Create Sheet with headers:
   ```
   Dátum | Vásárló neve | Email | Összeg | Termék | Darabszám | ÁFA | Cím | Számla szám | Számla státusz | Stripe Payment ID
   ```
2. Create GCP service account with Sheets API access
3. Share Sheet with service account email (Editor role)
4. Add credentials JSON to `.env`

### 5. Stripe Webhook

1. Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://your-domain.com/webhook/stripe`
3. Events: `payment_intent.succeeded`, `charge.refunded`
4. Copy signing secret to `.env`

### 6. Deploy

**Railway (recommended):**

```bash
# Push to GitHub
git push origin main

# Railway Dashboard:
# - New Project → Deploy from GitHub
# - Add environment variables
# - Auto-deploy on push
```

**Local dev:**

```bash
npm run dev

# Test webhooks with Stripe CLI:
stripe listen --forward-to localhost:3000/webhook/stripe
```

## Deployment Environments

### Production (Live)

- **URL:** `https://your-app.up.railway.app`
- **Stripe:** Live mode keys (`sk_live_...`)
- **Számlázz.hu:** Live API key
- **Branch:** `main`

### Staging (Test) - Recommended Setup

Create a separate Railway project for testing:

1. **New Railway project:** `stripe-invoice-staging`
2. **Connect same GitHub repo** → Deploy `main` branch
3. **Environment variables (TEST keys):**
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_... (from staging webhook)
   SZAMLAZZ_API_KEY=<test-agent-key>
   GOOGLE_SHEETS_ID=<test-sheet-id>
   # ... (same structure, test values)
   ```
4. **Stripe webhook endpoint:** `https://your-app-staging.up.railway.app/webhook/stripe`
5. **Test safely** without affecting live invoices

**Benefits:**

- ✅ Test invoice generation with real API calls
- ✅ No risk to production data
- ✅ Same codebase, isolated environment
- ✅ Quick toggle between staging/production

## Architecture

```
src/
├── config/
│   └── stripe.ts              # Stripe client initialization
├── controllers/
│   └── webhookController.ts   # Webhook entry point
├── services/
│   ├── webhookService.ts      # Main payment/refund logic
│   ├── szamlazz/              # Modular Számlázz.hu service
│   │   ├── config.ts          # Configuration + XML settings
│   │   ├── xml.ts             # XML builders (invoice + storno)
│   │   └── index.ts           # Public API + HTTP client
│   └── sheetsService.ts       # Google Sheets sync
├── middlewares/
│   ├── verifyWebhook.ts       # Stripe signature verification
│   └── errorHandler.ts        # Express 5 error handling
├── utils/
│   ├── addressMapper.ts       # Custom fields → billing address
│   └── errors.ts              # Custom error classes
└── types/
    └── index.ts               # TypeScript interfaces
```

**Key Design Decisions:**

- **Modular Számlázz.hu service:** Separated config, XML builders, and API calls for future invoice types (proforma, advance)
- **Express 5 error handling:** No try-catch in controllers, central error handler
- **3-layer idempotency:** Fresh metadata check + invoice_number + Sheet duplicate check
- **Smart payment filtering:** Skip non-invoice payments (missing `irnytszm` field)

## Workflow

### Payment

1. Customer pays via Stripe Paylink
2. Webhook: `payment_intent.succeeded`
3. **Filter:** Check if `irnytszm` custom field exists → skip if not (SevenRooms, etc.)
4. **Idempotency check:** Fetch fresh PaymentIntent, check if `invoice_number` exists → skip if duplicate
5. Add rows to Sheets (one per product, status: "Függőben")
6. Generate invoice (Számlázz.hu XML API)
7. Update Sheets with invoice number (status: "Kiállítva")
8. Store `invoice_number` in Stripe metadata

### Refund

1. Refund issued in Stripe
2. Webhook: `charge.refunded`
3. **Filter:** Check if original `invoice_number` exists in metadata → skip if not (no invoice to cancel)
4. **Idempotency check:** Check if `refund_invoice_number` exists → skip if duplicate
5. Generate storno invoice using `xmlszamlast` namespace (references original invoice)
6. Update Sheets (status: "Sztornózva")
7. Store `refund_invoice_number` in metadata

## Security & Reliability

### 3-Layer Idempotency Protection

Prevents duplicate invoices during webhook retries:

1. **Fresh PaymentIntent check:** Fetch current metadata (webhook payload may be stale)
2. **Invoice number check:** Skip if `invoice_number` already exists in metadata
3. **Sheets duplicate check:** Verify Payment ID doesn't exist before creating rows

**Result:** Safe webhook retries, no duplicate invoices. Simplified from 4-layer (removed redundant `processing` flag).

### Számlázz.hu Invoice Features

**Standard Invoice (xmlszamla):**

- **Paid invoices:** `<fizetve>true</fizetve>` (no payment reminder emails)
- **Auto email:** `<sendEmail>true</sendEmail>` (e-invoice sent by Számlázz.hu)
- **Tax subject:** `<adoalany>-1</adoalany>` (private person, non-tax-subject)
- **Multi-line items:** Each product as separate `<tetel>` in XML
- **Response version:** `<valaszVerzio>1</valaszVerzio>` (ensures header-based response parsing)

**Storno Invoice (xmlszamlast):**

- **Different namespace:** Uses `xmlszamlast` with simplified structure
- **No line items needed:** Számlázz.hu automatically copies from original invoice
- **Form field:** `action-szamla_agent_st` (not `action-xmlagentxmlfile`)
- **Type:** `<tipus>SS</tipus>` (storno számla)

## Troubleshooting

| Issue                       | Solution                                                                      |
| --------------------------- | ----------------------------------------------------------------------------- |
| Duplicate invoices          | Check Railway logs for idempotency layer failures                             |
| Invoice not generated       | Verify Számlázz.hu API key, product metadata `vat_rate`, payment link fields  |
| Payment skipped             | Ensure payment link has `irnytszm` custom field (required for invoice)        |
| Refund skipped              | Original payment must have `invoice_number` in metadata                       |
| Sheets not updating         | Service account needs Editor access to Sheet                                  |
| Webhook signature error     | Update `STRIPE_WEBHOOK_SECRET` from Dashboard                                 |
| Storno XML error            | Check original invoice number format, verify `action-szamla_agent_st` is used |
| SevenRooms creating invoice | Correct - SevenRooms payments should NOT have `irnytszm` field                |

## Development

```bash
# Dev server (auto-reload)
npm run dev

# Type check
npm run typecheck

# Build
npm run build

# Production
npm start

```

## Fejlesztés staging branch-en

```bash

git checkout staging

# ... kód módosítások ...

git add .
git commit -m "Feature: xyz"
git push origin staging

# → Staging Railway auto-deploy

# 2. Tesztelés staging-en

# Ellenőrizd, hogy minden működik

# 3. Merge staging → main (production)

git checkout main
git merge staging
git push origin main

# → Production Railway auto-deploy
```

## Support

- **User guide:** [STRIPE_SETUP.md](./STRIPE_SETUP.md)
- **Stripe docs:** https://stripe.com/docs/webhooks
- **Számlázz.hu API:** https://docs.szamlazz.hu/hu/agent
- **Google Sheets API:** https://developers.google.com/sheets/api
