# Stripe Setup Guide

Ez az útmutató lépésről lépésre bemutatja, hogyan kell beállítani a Stripe-ot az automatikus számlázáshoz.

## 1. Payment Link Custom Fields beállítása

Minden Payment Link-hez add hozzá a következő **Custom Fields**-t (kötelező):

### Custom Fields lista:

1. **Irányítószám**

   - Key: `irnytszm`
   - Type: `Numeric`
   - Label: `Irányítószám`
   - Required: ✅

2. **Város**

   - Key: `vros`
   - Type: `Text`
   - Label: `Város`
   - Required: ✅

3. **Cím**
   - Key: `cm`
   - Type: `Text`
   - Label: `Cím (utca, házszám)`
   - Required: ✅

### Hogyan add hozzá:

1. Stripe Dashboard → **Payment Links**
2. Válassz ki egy Payment Link-et vagy hozz létre újat
3. **Collect additional information** → **Add custom field**
4. Írd be a fenti adatokat mindhárom mezőhöz

---

## 2. Product Metadata beállítása

Minden Product-hoz add hozzá a következő **Metadata** mezőket:

### Kötelező metadata:

1. **vat_rate** - ÁFA kulcs (%)
   - Key: `vat_rate`
   - Value: `5` vagy `18` vagy `27`
   - Példa: `27`

### Opcionális metadata:

2. **vat_type** - ÁFA típus kód

   - Key: `vat_type`
   - Value: `AAM` (általános ÁFA mérték) vagy más Számlázz.hu ÁFA kód
   - Példa: `AAM`
   - **Ha nincs megadva:** automatikusan beállítja a rate alapján:
     - 27% → `AAM`
     - 18% → `KULLA`
     - 5% → `MAA`

3. **sheet_name** - Google Sheets lap neve
   - Key: `sheet_name`
   - Value: A Sheet lap neve, ahová az adott rendezvény adatai kerüljenek
   - Példa: `Mulasbuda_0127`
   - Ha nincs megadva: `Sheet1` (alapértelmezett)

### Hogyan add hozzá:

1. Stripe Dashboard → **Products**
2. Válassz ki egy Product-ot
3. Görgess le a **Metadata** szekcióhoz
4. Kattints **Add metadata**
5. Írd be a fenti Key-Value párokat

---

## 3. Webhook beállítása (már megtörtént)

Ha még nem állítottad be:

1. Stripe Dashboard → **Developers** → **Webhooks**
2. **Add endpoint**
3. Endpoint URL: `https://your-domain.com/webhook/stripe`
4. Events to send:
   - `payment_intent.succeeded`
   - `charge.refunded`

---

## 4. Példa konfiguráció

### Event: Mulasbuda! 01/27 GIRLZ

**Payment Link Custom Fields:**

- ✅ `irnytszm` (Irányítószám)
- ✅ `vros` (Város)
- ✅ `cm` (Cím)

**Product Metadata (minimális):**

```
vat_rate: 27
sheet_name: Mulasbuda_0127
```

Így működik:

- Vásárláskor a rendszer bekéri a címadatokat
- Számlát generál 27% ÁFA-val (AAM típussal, automatikusan beállítva)
- Az adatokat a `Mulasbuda_0127` sheet-re menti

---

## 5. Több rendezvény kezelése

Minden rendezvényhez:

1. Hozz létre új **Product**-ot Stripe-ban
2. Állítsd be a metadata-t:
   - `vat_rate`: ÁFA kulcs (5, 18, vagy 27) **[KÖTELEZŐ]**
   - `sheet_name`: Egyedi lap név (pl. `Event_0215`) **[OPCIONÁLIS]**
3. Hozz létre **Payment Link**-et a Product-hoz
4. Add hozzá a 3 custom field-et (irnytszm, vros, cm)

**Minimális konfiguráció példa:**

```
vat_rate: 27
sheet_name: Event_0215
```

Kész! Minden rendezvény külön sheet-re fog kerülni.

---

## ÁFA kulcsok referencia

| ÁFA % | Mikor használd                       |
| ----- | ------------------------------------ |
| 5%    | Könyv, újság, gyógyszer              |
| 18%   | Élelmiszer (többség), szállás        |
| 27%   | Általános (szolgáltatás, jegy, stb.) |

**Számlázz.hu ÁFA típus kódok:**

- `AAM` - Általános ÁFA mérték (27%)
- `KULLA` - 18%-os kulcs
- `MAA` - 5%-os kulcs

---
