"""
The "always works" assistant. No API key, no network call to any AI
provider — it pattern-matches the message against a handful of intents
and calls the SAME real tool functions in admin_ai.tools that the
Groq/xAI-powered loop uses, then formats the result as plain text.

This is deliberately simple and honest about being simple: it can't hold
a nuanced multi-turn conversation the way a real LLM can, but every number
and fact it reports is real, live data from your own database — never
fabricated — and it never depends on a third-party service being up,
configured, or paid for.
"""
import re
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin_ai import tools as t

HELP_TEXT = (
    "I can help with, in plain words:\n"
    "• \"stats\" / \"dashboard\" — overall numbers (stock, orders, revenue)\n"
    "• \"invoices\" — recent proforma & finalized invoices\n"
    "• \"payments\" — recent payment totals by status/method\n"
    "• \"find <part name>\" / \"search <part name>\" — look up a product\n"
    "• \"add product <name>, sku <SKU>, price <number>\" — create a product\n"
    "• \"errors\" / \"issues\" / \"problems\" — scan for data-quality issues\n"
    "\nThis offline mode doesn't need any AI provider key — it reads your "
    "system's real data directly. For open-ended web/Alibaba search, "
    "switch to Groq or xAI Grok above (once configured)."
)


def _fmt_kes(v) -> str:
    return f"KSh {v:,.2f}"


async def run_mock(message: str, db: AsyncSession) -> str:
    msg = message.lower().strip()

    if any(w in msg for w in ("help", "what can you do", "capabilities")):
        return HELP_TEXT

    if any(w in msg for w in ("stat", "dashboard", "how many", "overview", "revenue")):
        data = await t.get_dashboard_stats(db)
        lines = [
            f"Active products: {data['active_products']}",
            f"Low stock items: {data['low_stock_items']}",
            f"Out of stock: {data['out_of_stock_items']}",
            f"Orders in the last {data['orders_last_n_days']} days:",
        ]
        for row in data["orders_by_status"]:
            lines.append(f"  • {row['status']}: {row['count']} orders, {_fmt_kes(row['revenue_kes'])}")
        return "\n".join(lines)

    if "invoice" in msg:
        data = await t.get_invoices_summary(db)
        lines = ["Recent proforma invoices:"]
        for pi in data["recent_proforma_invoices"][:5]:
            lines.append(f"  • {pi['pi_number']} — {pi['customer']} — {pi['status']} — {_fmt_kes(pi['total_kes'])}")
        if data["recent_invoices"]:
            lines.append("Recent invoices:")
            for inv in data["recent_invoices"][:5]:
                lines.append(f"  • {inv['invoice_number']} — {inv['customer']} — {inv['status']} — {_fmt_kes(inv['total'])}")
        return "\n".join(lines) if len(lines) > 1 else "No invoices found yet."

    if "payment" in msg:
        data = await t.get_payments_summary(db)
        if not data["breakdown"]:
            return f"No payments recorded in the last {data['days']} days."
        lines = [f"Payments in the last {data['days']} days:"]
        for row in data["breakdown"]:
            lines.append(f"  • {row['method']} / {row['status']}: {row['count']} — {_fmt_kes(row['total_kes'])}")
        return "\n".join(lines)

    if any(w in msg for w in ("error", "issue", "problem", "wrong", "broken")):
        data = await t.detect_data_errors(db)
        return "\n".join(f"• {i}" for i in data["issues"])

    m = re.search(r"(?:find|search|look ?up|lookup)\s+(.+)", msg)
    if m:
        query = m.group(1).strip()
        data = await t.search_products(db, query)
        if not data["results"]:
            return f"No products matched \"{query}\"."
        lines = [f"Found {len(data['results'])} match(es) for \"{query}\":"]
        for p in data["results"][:10]:
            lines.append(f"  • {p['name']} ({p['sku']}) — {_fmt_kes(p['price_kes'])} — {p['status']}")
        return "\n".join(lines)

    if "add" in msg and ("product" in msg or "part" in msg):
        name_m = re.search(r"add (?:product|part)\s+([^,]+)", msg, re.IGNORECASE)
        sku_m = re.search(r"sku[:\s]+([a-z0-9\-_]+)", msg, re.IGNORECASE)
        price_m = re.search(r"price[:\s]+([\d.]+)", msg, re.IGNORECASE)
        if not (name_m and sku_m and price_m):
            return (
                "To add a product in offline mode, give me all three in one message, e.g.:\n"
                "\"add product Toner Cartridge 305A, sku CE305A, price 4500\""
            )
        result = await t.add_product(db, name=name_m.group(1).strip(), sku=sku_m.group(1).strip(), price_kes=float(price_m.group(1)))
        if "error" in result:
            return f"Couldn't add that: {result['error']}"
        return f"Added \"{result['name']}\" ({result['sku']}) at {_fmt_kes(result['price_kes'])}."

    if "alibaba" in msg:
        return "Alibaba search needs API credentials configured first (ALIBABA_APP_KEY/SECRET) — this offline mode can only read your own system's data, not the open web."

    if "google" in msg or "web search" in msg:
        return "Web search needs Google API credentials configured first (GOOGLE_SEARCH_API_KEY/CX) — this offline mode can only read your own system's data, not the open web."

    return (
        "I didn't recognize that in offline mode — I only understand a fixed set of requests here, "
        "not free conversation. Type \"help\" to see what I can do, or switch to Groq/xAI Grok above "
        "for open-ended questions."
    )
