# Stripe Setup Guide (User Guide)

Lépésről lépésre útmutató az automatikus számlázás beállításához.

## 1. Payment Link Custom Fields

Minden Payment Link-hez **kötelezően** add hozzá a következő custom fields-eket (számlázási címadatok):

| Mező         | Key        | Type    | Label               | Kötelező |
| ------------ | ---------- | ------- | ------------------- | -------- |
| Irányítószám | `irnytszm` | Numeric | Irányítószám        | ✅       |
| Város        | `vros`     | Text    | Város               | ✅       |
| Cím          | `cm`       | Text    | Cím (utca, házszám) | ✅       |

**Hogyan:**

1. Stripe Dashboard → **Payment Links** → Válassz ki egyet
2. **Collect additional information** → **Add custom field**
3. Írd be a fenti key-eket és beállításokat

---

## 2. Product Metadata (ÁFA + Sheet lap)

Minden Product-hoz add hozzá:

### Kötelező:

- **`vat_rate`**: ÁFA kulcs (`5`, `18`, vagy `27`)
- **`sheet_name`**: Google Sheets lap neve (ha nincs → `Sheet1`)

**Minimális példa:**

```
vat_rate: 27
sheet_name: Event_Jan_2026
```

**Hogyan:**

1. Dashboard → **Products** → Válassz ki egyet
2. Görgess le a **Metadata** szekcióhoz
3. **Add metadata** → Írd be a key-value párokat

---

## 3. Több rendezvény kezelése

Minden új rendezvényhez:

1. Hozz létre új **Product**-ot
2. Állítsd be a metadata-t (minimálisan `vat_rate` + `sheet_name`)
3. Hozz létre **Payment Link**-et
4. Add hozzá a 3 custom field-et

**Példa:** Két event külön Sheet tab-ra kerül:

```
Product 1:
  vat_rate: 27
  sheet_name: Mulasbuda_0127

Product 2:
  vat_rate: 27
  sheet_name: NYE_Party_1231
```

---

## 4. Webhook beállítása

1. Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. URL: `https://your-railway-app.up.railway.app/webhook/stripe`
3. Events:
   - `payment_intent.succeeded`
   - `charge.refunded`
4. Másold ki a **webhook signing secret**-et → Railway env változóba

---

## 5. Tesztelés (staging környezet)

**Ajánlott:** Készíts külön Railway projektet teszteléshez!

1. Railway: Hozz létre `stripe-invoice-staging` projektet
2. Használj **Stripe test mode** kulcsokat
3. Számlázz.hu **test agent key**
4. Külön teszt Sheet
5. Stripe webhook endpoint: `https://your-app-staging.up.railway.app/webhook/stripe`

**Előny:** Biztonságosan tesztelhetsz anélkül, hogy az éles számlák érintve lennének.
