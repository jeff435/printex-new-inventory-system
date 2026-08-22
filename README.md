# Printex Engineers — Inventory & Sales System

Internal parts-inventory and invoicing system for Printex Engineers Limited,
Nairobi — administrator, director, and secretary staff only. Built on an
open-source e-commerce skeleton (FastAPI + Next.js), since fully rebranded
and adapted for a staff-only parts inventory and sales workflow — see
[ORIGINAL_SKELETON_SETUP_GUIDE.md](ORIGINAL_SKELETON_SETUP_GUIDE.md) for
background on the underlying stack.

**Never set up a project like this before?**
Read **[BEGINNER_GUIDE.md](BEGINNER_GUIDE.md)** — it explains every click and
every command in plain language, assuming no prior experience.

**Comfortable with Docker and the terminal?**
Read **[SETUP_GUIDE.md](SETUP_GUIDE.md)** — the same journey, condensed.

```bash
./scripts/bootstrap.sh
```

| | |
|---|---|
| Staff sign-in | http://localhost:3000/login |
| Admin | http://localhost:3000/admin |
| API docs | http://localhost:8000/api/docs |

There is no public storefront — every route redirects to staff sign-in.
Registration and Google sign-in are disabled; staff accounts are created by
an administrator/director from `/admin`.

### First-time admin account

The very first super_admin has to be created once, directly against the
database, with the bootstrap script (see `app/scripts/create_admin.py`):

```bash
docker compose exec backend python -m app.scripts.create_admin \
    --name "Nevis Jeff" \
    --email "nevisjeff05@gmail.com" \
    --password "Nevisjeff2005#"
```

Safe to re-run — it promotes an existing account to super_admin and resets
its password rather than erroring on a duplicate.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind v4, TanStack Query, Zustand |
| Backend | FastAPI, SQLAlchemy 2 async, Python 3.12 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Payments | M-Pesa Daraja, Flutterwave |

---

## Two currencies, no exchange rate

Printex buys parts abroad in **US Dollars** and sells them locally in **Kenya
Shillings**. The register records both as independent figures — the shilling
price is *not* a converted dollar price.

```
products.buying_price_usd   USD cents   cost, admin-only
products.price_kes          KES cents   sale price, shown to customers
```

There is no conversion anywhere in this system and none should be added.
Converting one into the other would silently destroy the real margin. Both are
integer minor units to avoid float rounding.

---

## Customers are not users

`users` are people who sign in. `customers` are billing parties on an invoice,
and most are walk-in trade who will never have an account.

Orders carry both: `customer_id` is who is billed, `user_id` is who raised the
document. A signed-in shopper gets a customer record linked back by `user_id`,
so their online and counter purchases share one balance.

---

## Invoices vs quotations

Both are rows in `orders`, separated by `order_type`. The difference decides
whether stock moves:

| | Quotation | Invoice |
|---|---|---|
| Stock validated | no | yes |
| Stock deducted | no | yes |
| Customer balance | untouched | increased until paid |

Totals are computed in this order — VAT is charged on the discounted figure:

```
subtotal = Σ(qty × unit_price)
discount = subtotal × discount_pct / 100
vat      = (subtotal − discount) × vat_rate / 100
total    = subtotal − discount + vat + delivery_fee
```

`vat_rate` is stored per order, so a reprint shows the rate actually charged
even after the statutory rate changes.

---

## Stock movements

`stock_movements` is an append-only ledger. Every change to stock on hand writes
a row with a reason (`GOODS_RECEIVED`, `SALE`, `RETURN`, `STOCK_TAKE`, `DAMAGE`,
`OPENING_BALANCE`) and the resulting balance.

The previous system changed stock in two places and recorded neither, so a wrong
figure could never be explained. Mistakes here are corrected by writing an
opposing movement, never by editing history.

---

## Layout

```
backend/
  app/
    auth/          users, branches, addresses
    customers/     billing parties          ← added for Printex
    products/      parts, categories, inventory, stock movements
    orders/        invoices, quotations, payments
    payments/      M-Pesa, Flutterwave
    delivery/      rider tracking
    scripts/
      seed_printex.py       imports the parts register
      printex_parts.json    134 parts, transcribed
  migrations/      guarded SQL — see SETUP_GUIDE Part 3
frontend/
  app/             App Router pages (storefront + /admin)
  components/      shared and v2 design-system components
  lib/api.ts       axios client with token refresh
  stores/          zustand
docs/              the transcribed register (xlsx + pdf)
scripts/
  bootstrap.sh     one-command first run
```

---

## What was carried over from the old system

Kept: the invoice/quotation split, VAT and discount ordering, customer
auto-creation and balances, M-Pesa STK push, rider delivery tracking, categories.

Dropped: suppliers, employees, attendance, purchases, expenses. Inbound stock is
now handled by the stock-movement ledger instead of purchase orders.

Removed: the hardcoded `amountKsh / 130.0` exchange rate in the old
`formatPrice`, replaced by the two independent currency fields above.
# printex-new-inventory-system
