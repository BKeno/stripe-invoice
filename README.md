# Stripe Invoice Automation

Automated invoice generation system for Stripe Paylink payments using Számlázz.hu API with Google Sheets synchronization.

## Features

- Real-time Stripe webhook processing
- Automatic invoice generation via Számlázz.hu API
- Refund/storno invoice handling
- Google Sheets sync for sales tracking
- **Multi-event support** - each event/product can have its own Sheet tab
- **3-layer idempotency protection** against duplicate invoices
- Webhook signature verification for security
- TypeScript + Express 5 backend

## Architecture

```
src/
├── config/          # Stripe, environment config
├── controllers/     # Webhook request handlers
├── services/        # Business logic (Stripe, Számlázz.hu, Sheets)
├── middlewares/     # Auth, error handling
├── utils/           # Address mapping, error classes
└── types/           # TypeScript interfaces
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

**Required variables:**

- `STRIPE_SECRET_KEY` - Stripe API key (sk_...)
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (whsec_...)
- `SZAMLAZZ_API_KEY` - Számlázz.hu API key
- `SZAMLAZZ_ISSUER_NAME` - Your company name
- `GOOGLE_SHEETS_ID` - Google Sheets spreadsheet ID
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Service account credentials JSON

### 3. Setup Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/webhook/stripe`
3. Select events:
   - `payment_intent.succeeded`
   - `charge.refunded`
4. Copy webhook signing secret to `.env`

### 4. Configure Stripe Products

Add metadata to each Stripe Product:

- `vat_rate` - ÁFA kulcs (5, 18, vagy 27) **[KÖTELEZŐ]**
- `vat_type` - Számlázz.hu ÁFA kód **[OPCIONÁLIS]**
  - Ha nincs megadva: automatikusan beállítja a rate alapján
  - 27% → `AAM`, 18% → `KULLA`, 5% → `MAA`
- `sheet_name` - Google Sheets lap neve az adott rendezvényhez **[OPCIONÁLIS]**
  - Ha nincs megadva: `Sheet1` (alapértelmezett)

Example (minimális):
```json
{
  "vat_rate": "27",
  "sheet_name": "Mulasbuda_0127"
}
```

Example (explicit vat_type):
```json
{
  "vat_rate": "27",
  "vat_type": "AAM",
  "sheet_name": "Mulasbuda_0127"
}
```

**Részletes útmutató:** Lásd [STRIPE_SETUP.md](./STRIPE_SETUP.md)

### 5. Setup Google Sheets

1. Create a new Google Sheet
2. Add headers in first row:
   ```
   Dátum | Vásárló neve | Email | Összeg | Termék | Darabszám | ÁFA | Cím | Számla szám | Számla státusz | Stripe Payment ID
   ```
3. Create a Google Cloud service account
4. Share the sheet with service account email
5. Download credentials JSON and add to `.env`

### 6. Configure Custom Fields in Stripe Paylink

Ensure your Stripe payment links have these custom fields:

- `irnytszm` (Irányítószám) - Numeric, 4 characters
- `vros` (Város) - Text
- `cm` (Cím) - Text

### 7. Run Development Server

```bash
npm run dev
```

Server will start on `http://localhost:3000`

### 8. Test Webhook Locally (Optional)

Use Stripe CLI for local testing:

```bash
stripe listen --forward-to localhost:3000/webhook/stripe
```

## Workflow

### Payment Flow

1. Customer completes Stripe Paylink payment
2. Stripe sends `payment_intent.succeeded` webhook
3. System adds row to Google Sheets (status: "Függőben")
4. Invoice generated via Számlázz.hu
5. Sheet updated with invoice number (status: "Kiállítva")
6. Invoice number stored in Stripe payment metadata

### Refund Flow

1. Refund issued in Stripe Dashboard
2. Stripe sends `charge.refunded` webhook
3. System generates storno invoice
4. Sheet updated (status: "Sztornózva")

## Google Sheets Columns

| Column | Description |
|--------|-------------|
| Dátum | Payment date |
| Vásárló neve | Customer name |
| Email | Customer email |
| Összeg | Amount with currency |
| Termék | Product name from Stripe |
| Darabszám | Quantity purchased |
| ÁFA | VAT rate (5%, 18%, 27%) |
| Cím | Full billing address |
| Számla szám | Számlázz.hu invoice number |
| Számla státusz | Invoice status |
| Stripe Payment ID | Payment Intent ID |

## Invoice Statuses

- **Függőben** - Payment received, invoice pending
- **Kiállítva** - Invoice successfully generated
- **Sztornózva** - Refund processed, storno issued
- **Hiba** - Invoice generation failed

## Deployment

### Production Checklist

1. Set `NODE_ENV=production`
2. Use HTTPS endpoint for webhooks
3. Deploy to server with public URL
4. Update Stripe webhook endpoint URL
5. Test with Stripe test mode first
6. Monitor logs for errors

### Recommended Hosting

- Railway
- Render
- Heroku
- VPS with nginx reverse proxy

## Security & Reliability

### Idempotency Protection (3 Layers)

A rendszer **3 különböző szinten** védi a duplikált számlák létrehozását webhook újrapróbálkozás esetén:

#### **Layer 1: Stripe Metadata Check**
```typescript
if (paymentIntent.metadata.invoice_number) {
  console.log('[IDEMPOTENCY] Invoice already exists');
  return; // Skip processing
}
```
- Ellenőrzi, hogy a Stripe Payment Intent metadata-jában van-e már `invoice_number`
- Ha igen: azonnal kilép, nem generál újabb számlát
- **Leggyorsabb** védelem, API hívás nélkül

#### **Layer 2: Google Sheets Duplicate Check**
```typescript
const rowExists = await checkRowExists(paymentIntent.id, sheetName);
if (rowExists) {
  console.log('[IDEMPOTENCY] Row already exists in sheet');
  return;
}
```
- Ellenőrzi a Google Sheets-ben, hogy létezik-e már sor az adott Payment ID-val
- Ha igen: azonnal kilép
- **Második védvonal**, ha a Stripe metadata valamilyen okból nem frissült

#### **Layer 3: Metadata Update After Invoice**
```typescript
await stripe.paymentIntents.update(paymentIntent.id, {
  metadata: { invoice_number: invoiceNumber }
});
```
- Számla generálás után **azonnal** elmenti a számlaszámot a Stripe-ban
- Ez biztosítja a Layer 1 működését a következő újrapróbálkozáskor
- Perzisztens, megmarad a Stripe-ban

### Webhook Retry Handling

**Stripe automatikus újrapróbálkozás:**
- Sikertelen webhook esetén Stripe ~1 órán keresztül többször újrapróbálkozik
- Exponenciális backoff: 5s, 30s, 2m, 15m, 1h
- A 3-layer idempotency védelem biztosítja, hogy nem keletkeznek duplikált számlák

**Manuális újrapróbálkozás:**
Ha valamilyen hiba történt és manuálisan kell újrapróbálni:
1. Stripe Dashboard → Webhooks → Event log
2. Válaszd ki a sikertelen eseményt
3. **Resend event** - biztonságos, nem fog duplikálni

### Other Security Measures

- Webhook signature verification enabled
- API keys in environment variables
- HTTPS enforced in production
- Express 5 native async error handling
- Input validation on all webhook events

## Troubleshooting

**Invoice not generated:**
- Check Számlázz.hu API credentials
- Verify product metadata has VAT config
- Check logs for error messages

**Sheets not updating:**
- Verify service account has edit access
- Check GOOGLE_SHEETS_ID is correct
- Ensure credentials JSON is valid

**Webhook failing:**
- Verify webhook secret matches Stripe
- Check endpoint is publicly accessible
- Review Stripe webhook logs in Dashboard

## Development

```bash
# Run with auto-reload
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build

# Run production build
npm start
```

## TODO

- [ ] Add email notifications for failed invoices
- [ ] Dashboard for viewing invoice status
- [ ] Retry logic for failed Számlázz.hu requests
- [ ] Support partial refunds
- [ ] Multi-currency invoice support
