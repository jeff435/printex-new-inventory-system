"""Print-quality PDF exports for the analytics module (stock status and
customer purchases), via reportlab — same approach as app.proforma.pdf."""
import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
)

NAVY = colors.HexColor("#14151a")
GREEN = colors.HexColor("#2f8f4e")
RED = colors.HexColor("#c0392b")
AMBER = colors.HexColor("#b7791f")
LIGHT_GREY = colors.HexColor("#f5f6f8")
BORDER_GREY = colors.HexColor("#e6e8eb")


def _base_doc(buf, title):
    return SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=16 * mm, bottomMargin=16 * mm,
        leftMargin=14 * mm, rightMargin=14 * mm,
        title=title,
    )


def _header(story, styles, title, subtitle):
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=17, textColor=NAVY)
    small_grey = ParagraphStyle("small_grey", parent=styles["Normal"], fontSize=9,
                                 textColor=colors.HexColor("#6b7078"))
    story.append(Paragraph("PRINTEX ENGINEERS", h1))
    story.append(Paragraph(title, ParagraphStyle(
        "sub", parent=styles["Normal"], fontSize=12, textColor=GREEN, spaceAfter=2)))
    story.append(Paragraph(subtitle, small_grey))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1.2, color=GREEN))
    story.append(Spacer(1, 10))


def render_stock_status_pdf(report) -> bytes:
    """report: app.analytics.schemas.StockStatusReport"""
    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    doc = _base_doc(buf, "Stock Status Report")
    story = []
    _header(story, styles, "Stock Status Report",
            f"Generated {report.generated_at.strftime('%d %b %Y %H:%M')} · "
            f"{report.total_out_of_stock} out of stock · {report.total_low_stock} low stock")

    show_price = any(p.price_kes is not None for cat in report.categories
                      for p in (cat.out_of_stock + cat.low_stock))

    def section(label, color, key):
        story.append(Paragraph(f"<b>{label}</b>", ParagraphStyle(
            "sec", parent=styles["Normal"], fontSize=12, textColor=color, spaceBefore=8, spaceAfter=6)))
        headers = ["Category", "Part", "SKU", "On Hand", "Reorder Pt"]
        if show_price:
            headers.append("Price (KES)")
        rows = [headers]
        any_rows = False
        for cat in report.categories:
            parts = getattr(cat, key)
            for p in parts:
                any_rows = True
                row = [cat.category_name, p.name + (" (unpriced)" if p.needs_pricing else ""),
                       p.sku, str(p.quantity_on_hand), str(p.reorder_point)]
                if show_price:
                    row.append(f"{p.price_kes/100:,.2f}" if p.price_kes is not None else "—")
                rows.append(row)
        if not any_rows:
            story.append(Paragraph("None.", styles["Normal"]))
            return
        col_widths = [28*mm, 62*mm, 20*mm, 18*mm, 20*mm] + ([24*mm] if show_price else [])
        tbl = Table(rows, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GREY),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 10))

    section("Out of Stock", RED, "out_of_stock")
    section("Low Stock", AMBER, "low_stock")

    doc.build(story)
    return buf.getvalue()


def render_summary_pdf(summary) -> bytes:
    """summary: app.analytics.schemas.AnalyticsSummary — the overview page's
    headline figures (stock position, goods received, sales, expenses,
    purchases, net movement, pending payments), as one printable sheet."""
    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    doc = _base_doc(buf, "Analytics Summary")
    story = []

    period = ""
    if summary.period_start or summary.period_end:
        start = summary.period_start.strftime("%d %b %Y") if summary.period_start else "the start"
        end = summary.period_end.strftime("%d %b %Y") if summary.period_end else "now"
        period = f" · {start} to {end}"
    _header(story, styles, "Analytics Summary",
            f"Generated {datetime_now_str()}{period}")

    def kes(v):
        return f"KES {float(v):,.2f}"

    rows = [
        ["Metric", "Value"],
        ["Total parts in catalogue", str(summary.total_parts)],
        ["Low stock parts", str(summary.low_stock_parts)],
        ["Out of stock parts", str(summary.out_of_stock_parts)],
        ["Total stock value", kes(summary.total_stock_value)],
        ["Goods received (qty)", str(summary.goods_received_qty)],
        ["Goods received (value)", kes(summary.goods_received_value)],
        ["Sales (qty)", str(summary.sales_qty)],
        ["Sales (value)", kes(summary.sales_value)],
        ["Total expenses", kes(summary.total_expenses)],
        ["Total purchases value", kes(summary.total_purchases_value)],
        ["Net movement (sales − goods received)", kes(summary.net_movement_value)],
        ["Pending payments — count", str(summary.pending_payments_count)],
        ["Pending payments — value", kes(summary.pending_payments_value)],
    ]
    tbl = Table(rows, colWidths=[100 * mm, 70 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica"),
        ("FONTNAME", (1, 1), (1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tbl)

    doc.build(story)
    return buf.getvalue()


def datetime_now_str() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%d %b %Y %H:%M")
    """rows: list of app.analytics.schemas.CustomerPurchaseRow"""
    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    doc = _base_doc(buf, "Customer Purchases Report")
    story = []
    _header(story, styles, "Customer Purchases Report",
            "Which customer bought which part, from completed (converted) proforma invoices")

    headers = ["Customer", "Part / Description", "Total Qty", "Total Value (KES)", "Orders"]
    data = [headers]
    for r in rows:
        data.append([
            r.customer_name, r.description, f"{r.total_quantity:g}" if float(r.total_quantity) == int(r.total_quantity) else str(r.total_quantity),
            f"{r.total_value_kes/100:,.2f}", str(r.purchase_count),
        ])
    if len(data) == 1:
        story.append(Paragraph("No completed sales recorded yet.", styles["Normal"]))
    else:
        tbl = Table(data, colWidths=[38*mm, 66*mm, 20*mm, 30*mm, 18*mm], repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GREY),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)

    doc.build(story)
    return buf.getvalue()
