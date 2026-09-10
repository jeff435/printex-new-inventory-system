# Printex — changes

## 1. The JS chatbot definition

**`frontend/stores/chatStore.ts` — the widget could vanish entirely.**

`onRehydrateStorage` was:

```ts
onRehydrateStorage: () => (state) => { state?.setHasHydrated(true); }
```

Zustand calls this with `state === undefined` *and* an error argument when the
persisted JSON is corrupt or the localStorage quota is exhausted. The optional
chaining silently no-ops, `_hasHydrated` never becomes `true`, and
`ChatWidget`'s `if (!_hasHydrated) return null` guard means the launcher button
never renders — with nothing in the console to explain it. Now sets state on the
store directly so both the success and failure paths flip the flag, clears the
poisoned key, and warns.

Also added `MAX_PERSISTED_MESSAGES = 50` to `partialize`, since the unbounded
transcript is what blows the quota that triggers the above in the first place.

**`ChatWidget.tsx` — wrong API host.** It read
`process.env.NEXT_PUBLIC_API_URL` directly, bypassing `resolveApiUrl()` in
`lib/api.ts`. Every phone or laptop on the LAN called *its own* `localhost:8000`
and got nothing, while the rest of the app resolved the host correctly. Now
imports the new `API_BASE_URL` export.

**Error messages.** A non-OK response threw a bare status, so a 429 (rate
limited) and a 503 (`GROQ_API_KEY` unset on that deploy) both surfaced as
"couldn't connect" — sending people to debug a network fault that didn't exist.
The backend's `detail` is now read and shown.

Minor: avatar letter `S` → `P` (leftover from Soko), `whitespace-pre-wrap` on
bubbles so multi-line replies keep their line breaks, `maxLength={1000}` to
match the server's `Field(max_length=1000)`, and a "new chat" button wired to
the `clearChat` action that already existed in the store but was unreachable.

## 2. Assistant moved to the bottom left

`ChatWidget` is now `fixed bottom-5 left-5 ... items-start` (was `bottom-5
right-5 ... items-end`).

One thing worth flagging: `AdminAIWidget` was **already** bottom-left, and
`layout.tsx` mounts `ChatWidget` globally — including on `/admin`. Moving it
left would have stacked the two launchers on top of each other. `ChatWidget`
now returns `null` on `/admin` routes, where the admin assistant is both
already present and more capable. The assistant is therefore bottom-left on
every screen, with exactly one launcher visible at a time.

## 3. Analytics accuracy — the money bug

The database mixes two conventions deliberately:

| Field | Unit |
|---|---|
| `Product.price_kes`, `buying_price_usd`, `ProformaInvoice.total_kes` | integer **cents** |
| `Purchase.total_amount`, `Expense.amount` (`Numeric(12,2)`) | whole **shillings** |

The analytics router passed **both straight through**. Consequences:

- On the director's analytics page, *Total Stock Value*, *Goods Received*,
  *Sales* and *Net Stock Movement* rendered **100× too large**, while
  *Expenses* and *Purchases* beside them were correct.
- `/admin` divided everything by 100; `/admin/directors/analytics` divided
  nothing. **The same field showed two different numbers on two screens.**

Fixed by converting **once, at the API boundary**. `analytics/router.py` now has
a documented money convention and `_money()` / `_whole()` helpers; every
monetary field it returns is whole units, rounded to 2dp exactly once (so a
figure can't be `12399.999999` in one export and `12400.00` in another).
`net_movement_value` is computed from the *already-converted* figures, so it
can't disagree with the three cards it's derived from.

Consumers updated to stop dividing: `analytics/excel_export.py`,
`analytics/pdf.py`, and `/admin`'s `kes()`. The directors' analytics page
needed no change — it was already formatting raw values, which are now right.

`/admin/page.tsx` now has **two** formatters, because it genuinely reads from
two conventions: `kes()` for `/analytics/*` responses, `kesFromCents()` for raw
ORM fields (`Order.total_kes`). Using the wrong one is what caused this.

### Other accuracy faults fixed

- **Stock counts were in the wrong unit.** `low_stock_parts` /
  `out_of_stock_parts` counted `inventory_items` **rows** — one per product
  *per branch* — but the dashboard divides them by the *per-product* catalogue
  total to get "% affected", which could exceed 100%. Now counts distinct
  products, with an overlap correction so a part that's out at one branch and
  low at another isn't counted twice.
- **Expenses landed in the wrong period.** Filtered on `created_at`, so last
  month's rent keyed in today fell into today's range. Now
  `coalesce(incurred_at, created_at)`.
- **Received POs could vanish.** Filtered on `received_at`; a null one fails
  both `>=` and `<=`, so those purchases silently dropped out of every
  date-filtered range. Now `coalesce(received_at, created_at)`.
- **The category table couldn't be reconciled.** `stock-value` inner-joined
  Category *and* InventoryItem, silently dropping every uncategorised part and
  every part never stocked — which is why its KES column never matched *Total
  Stock Value* above it, invisibly. Both joins are now OUTER, uncategorised
  parts appear under "Uncategorised", and a **totals row** was added so the
  check is actually possible on screen.
- **Negative stock reduced everything else.** A negative `quantity_on_hand` is
  a data fault, not negative money; now floored at 0 via `greatest()`.
- **Non-deterministic ordering.** Top-parts and goods-received had no
  tie-break, so tied rows reshuffled between identical queries. Added
  `Product.name` as secondary sort.
- **A correlated-subquery trap** in the new overlap count: both halves hit
  `inventory_items`, so SQLAlchemy would auto-correlate and drop the inner
  `FROM`. Aliased.

## 4. Stock ↔ price consistency

`POST /inventory/restock/{product}/{branch}` moved `quantity_on_hand` **without
writing a `StockMovement` row**. Stock added that way existed on the shelf but
was invisible to the entire analytics layer — absent from Goods Received, Top
Moving Parts, Net Stock Movement and the ledger. The dashboards and the shelf
disagreed with no way to find out why. It now logs a `GOODS_RECEIVED` movement,
the same as `/adjust` already did.

## 5. Automatic SKUs

SKUs were typed by hand on every save — the most common way to fail a create
(duplicate-key 409) and an open invitation for two people to invent two
conventions for the same shelf.

`_generate_sku()` in `products/router.py` produces `PX-<segment>-00001`:

| Category | SKU |
|---|---|
| `A — Valves` | `PX-A-00001` |
| `Bearings & Springs` | `PX-BEA-00001` |
| *(none)* | `PX-GEN-00001` |

The counter is per-segment so parts group readably. It re-checks the database
per candidate rather than trusting `max()`, since two staff adding a part at
the same moment would otherwise compute the same next number.

`sku` and `slug` are now `Optional` on `ProductCreate`. An explicitly supplied
SKU is still honoured (the register import needs to preserve codes already
written on the shelf) and keeps its duplicate check. `_unique_slug()` was added
alongside: two parts legitimately share a name ("Gripper Pad" on two presses),
and `slug` is UNIQUE, so the second save used to be a raw 500 from the driver.

The form now shows SKU as read-only ("Assigned automatically when you save")
and omits `sku`/`slug` from the create payload.

## 6. Categories stay alphabetical

`list_categories` ordered by `Category.sort_order`, which **defaults to 0 for
every row** — so the order was whatever the planner returned, a new category
could surface anywhere, and the order could change between two loads of the
same page.

- `.order_by(Category.sort_order, func.lower(Category.name))` — name is the
  tie-break that makes it deterministic; `sort_order` stays first so a
  deliberate non-zero ordering is still possible.
- `Category.children` relationship gets `order_by="Category.name"`, so nested
  sub-categories don't arrive unsorted under a correctly sorted parent.
- The categories page also sorts client-side with `Intl.Collator`
  (`numeric: true`, base sensitivity), because it renders optimistically off
  the react-query cache — without it a just-added category appears at the
  bottom for a moment, then jumps.
- `analytics/stock-value` orders by category name for the same reason.

---

## Before you deploy

I could not run the test suite or a build — there's no `node_modules` here and
the sandbox can't reach a database. What I did verify: every edited Python file
parses, the money arithmetic is correct on worked examples, the SKU generator
produces the expected codes, and brackets balance in every edited TSX file.
**Type-checking and a real end-to-end pass are still on you.**

```bash
cd frontend && npm install && npx tsc --noEmit && npm run build
cd backend && python -m pytest        # if you have tests
```

Two things to check by hand:

1. **`func.greatest`** is PostgreSQL syntax. Fine for your deploy (you're on
   Postgres — `UUID`, `JSONB`), but it is `MAX` on SQLite if anything local
   runs against one.
2. **Existing SKUs are untouched.** The generator only assigns new ones, and
   `PX-A-00001` numbering starts from the highest *matching* existing code, so
   it won't collide with the register import's codes.

## Not changed, but you should look

`ProductUpdate` has no `needs_pricing` field, so a part flagged "needs pricing"
during the register import stays flagged forever even after someone sets a
price — and `needs_pricing` is enforced in the order service, so those parts
can't be sold. That's a separate fix and I didn't want to fold it into this
batch silently.
