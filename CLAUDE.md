# Déryné Stripe Invoice

Stripe payment → Számlázz.hu invoice → Google Sheets sync

## Stack

- Express 5 + TypeScript, Railway (staging/prod)
- APIs: Stripe webhooks, Számlázz.hu XML, Google Sheets v4

## Structure

```
src/
├── controllers/webhookController.ts  # Stripe Webhook entry point
├── services/
│   ├── webhookService.ts            # Main flow: handlePaymentSuccess, handleRefund
│   ├── szamlazz/                    # Invoice XML builders + API
│   └── sheetsService.ts             # Google Sheets append/update
├── middlewares/stripeSignature.ts   # Webhook verification
└── utils/addressMapper.ts           # Stripe custom fields → billing address
scripts/
├── process-old-payment.ts           # Manual: railway run npm run process-payment <id>
└── export-payments-audit.ts         # Audit: railway run npm run audit-payments <date>
```

## Payment Flow

1. `payment_intent.succeeded` webhook arrives
2. Fetch fresh PaymentIntent → check `metadata.invoice_number` (idempotency)
3. Get checkout session → skip if none or no `irányítószám` field
4. Generate invoice via Számlázz.hu XML API
5. Store `invoice_number` in Stripe metadata IMMEDIATELY (idempotency marker)
6. Append rows to Sheet (best effort, errors caught)

## Refund Flow

1. `charge.refunded` webhook arrives
2. Check `metadata.invoice_number` exists (skip if no invoice to cancel)
3. Check `metadata.refund_invoice_number` doesn't exist (idempotency)
4. Generate storno invoice (references original)
5. Store `refund_invoice_number` in Stripe metadata IMMEDIATELY
6. Update Sheet status → "Sztornózva" (best effort, errors caught)

## Idempotency

- **Single source of truth**: Stripe PaymentIntent metadata
- Check `invoice_number` / `refund_invoice_number` BEFORE processing
- Store in metadata IMMEDIATELY after invoice generation (before Sheet write)
- Sheet is best-effort log, not part of idempotency chain

## Key Gotchas

- Webhook event data can be stale → always fetch fresh PaymentIntent
- Service fee products split into 2 invoice lines (base + fee), but Sheet shows full amount
- Payments without `irányítószám` field skipped (SevenRooms, etc.)
- Refunded payments still have status=succeeded (check charges for refund status)
- Sheet errors don't fail webhook (invoice exists, Stripe has record)

## Scripts

```bash
railway link                                    # Switch staging/prod
railway run npm run audit-payments 2026-01-01   # Export missing invoices
railway run npm run audit-payments 2026-01-01 --include-refunded
railway run npm run process-payment pi_xxx      # Manual invoice generation
```

## Stripe Metadata (stored on PaymentIntent)

- `invoice_number`: set after invoice generated (idempotency key)
- `refund_invoice_number`: set after storno generated

## Product Metadata (Stripe)

- `vat_rate`: "5" | "18" | "27" (required)
- `sheet_name`: custom Sheet tab (optional)
- `service_fee_percentage`: "15" → splits invoice, marks as advance invoice

## Environment

- No local `.env` file - all env vars via Railway
- Local dev: `railway run npm run dev` (injects env vars from linked project)
- `railway link` to switch between staging/production projects
