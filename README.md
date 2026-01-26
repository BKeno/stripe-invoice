# Déryné Stripe Invoice — Integration service

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
```

### 2. Configure Environment (Railway)

All environment variables are managed through Railway dashboard. Required variables:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Számlázz.hu
SZAMLAZZ_API_KEY=...
SZAMLAZZ_API_URL=https://www.szamlazz.hu/szamla/
SZAMLAZZ_E_INVOICE=true
SZAMLAZZ_ISSUER_NAME=Your Company
SZAMLAZZ_BANK=UniCredit Bank Zrt.; BACX HU HB
SZAMLAZZ_BANK_ACCOUNT=HU72...

# Google Sheets
GOOGLE_SHEETS_ID=1abc...xyz
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Server
PORT=8080
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
- `service_fee_percentage`: Service fee % (optional, e.g., `15`)
  - If set, product price **includes** the fee
  - Invoice: 2 line items (Product + Service Fee)
  - **Automatically issued as advance invoice** (`<elolegszamla>true</elolegszamla>`)
  - Invoice number stored in Stripe PaymentIntent metadata (`invoice_number` field)
  - Sheet: Full amount (not split)

Example without service fee:

```json
{
  "vat_rate": "27",
  "sheet_name": "Event_Jan_2026"
}
```

Example with service fee (15%):

```json
{
  "vat_rate": "27",
  "sheet_name": "Event_Jan_2026",
  "service_fee_percentage": "15"
}
```

**How service fees work:**

- Product price: 11,500 HUF with `service_fee_percentage: 15`
- Invoice type: **Advance invoice** (előlegszámla)
- Invoice line items:
  1. "Ticket" - 10,000 HUF (ÁFA: 27%)
  2. "Szervizdíj 27% ÁFA" - 1,500 HUF (ÁFA: 27%)
- Sheet entry: "Ticket" - 11,500 HUF (full amount)
- Stripe metadata: `invoice_number` = "ABC-2025-123" (automatically stored)

**Important:** Payment links WITHOUT `irnytszm` custom field will be **automatically skipped** (e.g., SevenRooms integrations).

### 4. Google Sheets Setup

1. Create Sheet with headers:
   ```
   Dátum | Vásárló neve | Email | Összeg | Termék | Darabszám | ÁFA | Cím | Számla szám | Számla státusz | Stripe Payment ID
   ```
2. Create GCP service account with Sheets API access
3. Share Sheet with service account email (Editor role)

### 5. Stripe Webhook

1. Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://your-domain.com/webhook/stripe`
3. Events: `payment_intent.succeeded`, `charge.refunded`
4. Copy signing secret to Railway environment variables

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

## Local Development with Railway CLI

Uses Railway CLI to inject environment variables from your Railway projects. **No local .env files needed.**

### Setup (one-time)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login
```

### Two-Terminal Workflow (Recommended)

Keep two terminal tabs open - one for each environment:

**Terminal 1: Staging**

```bash
cd stripe-invoice
railway link    # Select STAGING project
railway run npm run dev

# Webhook testing:
stripe listen --forward-to localhost:8080/webhook/stripe
```

**Terminal 2: Production (scripts only)**

```bash
cd stripe-invoice
railway link    # Select PRODUCTION project

# Process old payments
railway run npm run process-payment pi_xxx

# Audit payments
railway run npm run audit-payments 2026-01-01
```

### Available Scripts

```bash
# Development server (use with: railway run)
npm run dev

# Process old payments (use with: railway run)
npm run process-payment pi_xxx pi_yyy pi_zzz

# Audit payments for missing invoices (use with: railway run)
npm run audit-payments 2026-01-01
npm run audit-payments 2026-01-01 2026-01-31  # date range

# Type check
npm run typecheck

# Build for production
npm run build

# Production server (Railway runs this automatically)
npm start
```

### Quick Environment Switch

```bash
# Check which project is linked
railway status

# Switch to different project
railway link
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
- ✅ Quick toggle between staging/production via `railway link`

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
2. Webhook: `payment_intent.succeeded` (note: This event doesnt contain all the data. it has to be retrieved from charge.succeeded)
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

**Error recovery:** If Sheet row exists but invoice failed, the system retries invoice generation without creating duplicate rows.

**Result:** Safe webhook retries, no duplicate invoices.

### Stripe Metadata Storage

Invoice numbers are stored in Stripe PaymentIntent metadata for tracking and idempotency:

**After successful invoice generation:**

```json
{
  "invoice_number": "ABC-2025-123"
}
```

**After successful refund:**

```json
{
  "invoice_number": "ABC-2025-123",
  "refund_invoice_number": "ABC-2025-124"
}
```

This allows:

- ✅ Idempotency protection (duplicate prevention)
- ✅ Easy lookup of invoice numbers from Stripe Dashboard
- ✅ Refund processing (requires original `invoice_number` to create storno)
- ✅ Audit trail for invoice generation

### Számlázz.hu Invoice Features

**Standard Invoice (xmlszamla):**

- **Paid invoices:** `<fizetve>true</fizetve>` (no payment reminder emails)
- **Auto email:** `<sendEmail>true</sendEmail>` (e-invoice sent by Számlázz.hu)
- **Tax subject:** `<adoalany>-1</adoalany>` (private person, non-tax-subject)
- **Multi-line items:** Each product as separate `<tetel>` in XML
- **Response version:** `<valaszVerzio>1</valaszVerzio>` (txt response)
- **Advance invoice:** `<elolegszamla>true</elolegszamla>` (automatically set if product has `service_fee_percentage`)
- **Invoice dates:** `teljesítésDátum` and `fizetésiHataridő` use Stripe payment.created timestamp

**Storno Invoice (xmlszamlast):**

- **Different namespace:** Uses `xmlszamlast` with simplified structure
- **No line items needed:** Számlázz.hu automatically copies from original invoice
- **Form field:** `action-szamla_agent_st` (not `action-xmlagentxmlfile`)
- **Type:** `<tipus>SS</tipus>` (storno számla)

## Manual Payment Processing

For processing old payments that occurred **before the webhook was configured**.

### Usage

```bash
# Link to production project
railway link    # Select PRODUCTION

# Single payment
railway run npm run process-payment pi_1234567890

# Multiple payments
railway run npm run process-payment pi_xxx pi_yyy pi_zzz
```

### Output

```
Processing 1 payment(s)...

[pi_1234567890] Starting...
Processing payment: pi_1234567890
[Sheet] 1 row(s) created with status: Függőben
[Számlázz.hu] Invoice created: E-PR-2026-24
[Sheet] Updated status: Kiállítva
✓ Complete: E-PR-2026-24 | pi_1234567890
[pi_1234567890] ✅ Success

Done!
```

### Notes

- ✅ Safe to retry - 3-layer idempotency protection prevents duplicate invoices
- ✅ Only processes payments from invoice-enabled payment links (with `irnytszm` field)
- ✅ Skips payments already processed (checks metadata + Sheet)
- ⚠️ Always test on staging first before running on production

## Payments Audit

Export Stripe payments to identify missing invoices.

### Usage

```bash
# Link to production
railway link    # Select PRODUCTION

# Export payments from date
railway run npm run audit-payments 2026-01-01

# Export date range
railway run npm run audit-payments 2026-01-01 2026-01-31
```

### Output

Creates `payments-audit-YYYY-MM-DD-now.csv` with columns:

- Payment ID, Amount, Currency, Date
- Customer Name, Customer Email
- Has Invoice (YES/NO), Invoice Number

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
| Wrong env vars locally      | Check `railway status` - ensure correct project is linked                     |

## Development Workflow

### Feature Development

```bash
# 1. Switch to staging branch
git checkout staging

# 2. Make changes and test locally
railway link    # Select STAGING
railway run npm run dev

# 3. Commit and push
git add .
git commit -m "Feature: xyz"
git push origin staging
# → Staging Railway auto-deploys

# 4. Test on staging environment

# 5. Merge to production
git checkout main
git merge staging
git push origin main
# → Production Railway auto-deploys
```

## Support

- **User guide:** [STRIPE_SETUP.md](./STRIPE_SETUP.md)
- **Stripe docs:** https://stripe.com/docs/webhooks
- **Számlázz.hu API:** https://docs.szamlazz.hu/hu/agent
- **Google Sheets API:** https://developers.google.com/sheets/api
