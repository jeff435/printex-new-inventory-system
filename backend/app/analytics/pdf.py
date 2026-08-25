"""Print-quality PDF exports for the analytics module (stock status and
customer purchases), via reportlab — same approach as app.proforma.pdf."""
import io
from decimal import Decimal
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
)
from reportlab.lib.enums import TA_RIGHT

NAVY = colors.HexColor("#14151a")
GREEN = colors.HexColor("#2f8f4e")
RED = colors.HexColor("#c0392b")
AMBER = colors.HexColor("#b7791f")
LIGHT_GREY = colors.HexColor("#f5f6f8")
BORDER_GREY = colors.HexColor("#e6e8eb")


def _esc(value) -> str:
    """Escape text destined for a Paragraph — see the identical helper in
    app.proforma.pdf. Part names here routinely contain characters like
    "<" and "&" that Paragraph would otherwise try to parse as markup."""
    return (str(value if value is not None else "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _cell_styles(styles, size=8):
    """Paragraph styles for table cells.

    Every text cell in these reports is a Paragraph rather than a bare string.
    reportlab renders a bare string as a single unbroken line and never
    measures it against its column, so long part names and customer names ran
    straight over the columns to their right — the overlapping text on printed
    reports. A Paragraph wraps within the column and the row grows to fit.
    """
    cell = ParagraphStyle("cell", parent=styles["Normal"], fontSize=size,
                          leading=size + 2.5, textColor=NAVY, wordWrap="CJK")
    hdr = ParagraphStyle("cell_hdr", parent=cell, fontName="Helvetica-Bold",
                         textColor=colors.white)
    num = ParagraphStyle("cell_num", parent=cell, alignment=TA_RIGHT)
    num_hdr = ParagraphStyle("cell_num_hdr", parent=hdr, alignment=TA_RIGHT)
    return cell, hdr, num, num_hdr


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

    cell, hdr, num, num_hdr = _cell_styles(styles)

    def section(label, color, key):
        story.append(Paragraph(f"<b>{label}</b>", ParagraphStyle(
            "sec", parent=styles["Normal"], fontSize=12, textColor=color, spaceBefore=8, spaceAfter=6)))
        # "Part No." is the catalogue part number the storeman and the supplier
        # both order by; SKU is Printex's own internal stock code. Reports used
        # to print only the SKU, which meant nobody could reorder from them.
        headers = [
            Paragraph("Category", hdr), Paragraph("Part", hdr),
            Paragraph("Part No.", hdr), Paragraph("SKU", hdr),
            Paragraph("On Hand", num_hdr), Paragraph("Reorder Pt", num_hdr),
        ]
        if show_price:
            headers.append(Paragraph("Price (KES)", num_hdr))
        rows = [headers]
        any_rows = False
        for cat in report.categories:
            parts = getattr(cat, key)
            for p in parts:
                any_rows = True
                name = _esc(p.name) + (" <i>(unpriced)</i>" if p.needs_pricing else "")
                row = [
                    Paragraph(_esc(cat.category_name), cell),
                    Paragraph(name, cell),
                    Paragraph(_esc(getattr(p, "part_number", None) or "—"), cell),
                    Paragraph(_esc(p.sku), cell),
                    Paragraph(str(p.quantity_on_hand), num),
                    Paragraph(str(p.reorder_point), num),
                ]
                if show_price:
                    row.append(Paragraph(
                        f"{p.price_kes/100:,.2f}" if p.price_kes is not None else "—", num))
                rows.append(row)
        if not any_rows:
            story.append(Paragraph("None.", styles["Normal"]))
            return
        col_widths = [26*mm, 48*mm, 24*mm, 22*mm, 17*mm, 19*mm] + ([24*mm] if show_price else [])
        tbl = Table(rows, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GREY),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
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
        ["Manual stock added (qty)", str(summary.manual_stock_added_qty)],
        ["Manual stock added (value)", kes(summary.manual_stock_added_value)],
        ["Sales (qty)", str(summary.sales_qty)],
        ["Sales (value)", kes(summary.sales_value)],
        ["Total expenses", kes(summary.total_expenses)],
        ["Total purchases value", kes(summary.total_purchases_value)],
        ["Net movement (sales − goods received − manual stock added)", kes(summary.net_movement_value)],
        ["Pending payments — count", str(summary.pending_payments_count)],
        ["Pending payments — value", kes(summary.pending_payments_value)],
    ]
    cell, hdr, num, num_hdr = _cell_styles(styles, size=9)
    bold_num = ParagraphStyle("bold_num", parent=num, fontName="Helvetica-Bold")
    rows = [[Paragraph(_esc(r[0]), hdr if i == 0 else cell),
             Paragraph(_esc(r[1]), num_hdr if i == 0 else bold_num)]
            for i, r in enumerate(rows)]
    tbl = Table(rows, colWidths=[100 * mm, 70 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GREY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tbl)

    doc.build(story)
    return buf.getvalue()


def datetime_now_str() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%d %b %Y %H:%M")


def render_goods_received_pdf(rows) -> bytes:
    """rows: list of app.analytics.schemas.GoodsReceivedRow — new stock added
    in the period, broken down by product so a director can see exactly
    which part came in (not just a combined total)."""
    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    doc = _base_doc(buf, "Goods Received Report")
    story = []
    _header(story, styles, "Goods Received Report",
            f"New stock added this period, by part · Generated {datetime_now_str()}")

    cell, hdr, num, num_hdr = _cell_styles(styles)
    data = [[
        Paragraph("Part No.", hdr), Paragraph("Part / Description", hdr),
        Paragraph("SKU", hdr), Paragraph("Qty Added", num_hdr),
        Paragraph("Value Added (KES)", num_hdr), Paragraph("Last Received", hdr),
    ]]
    for r in rows:
        last = r.last_received_at.strftime("%d %b %Y") if r.last_received_at else "—"
        data.append([
            Paragraph(_esc(r.part_number or "—"), cell),
            Paragraph(_esc(r.product_name), cell),
            Paragraph(_esc(r.sku), cell),
            Paragraph(str(r.quantity_received), num),
            Paragraph(f"{float(r.value_received):,.2f}", num),
            Paragraph(last, cell),
        ])
    if len(data) == 1:
        story.append(Paragraph("No new stock recorded in this period.", styles["Normal"]))
    else:
        tbl = Table(data, colWidths=[26*mm, 46*mm, 24*mm, 20*mm, 30*mm, 28*mm], repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GREY),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)

    doc.build(story)
    return buf.getvalue()


def render_customer_purchases_pdf(rows) -> bytes:
    """rows: list of app.analytics.schemas.CustomerPurchaseRow"""
    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    doc = _base_doc(buf, "Customer Purchases Report")
    story = []
    _header(story, styles, "Customer Purchases Report",
            "Which customer bought which part, from completed (converted) proforma invoices")

    cell, hdr, num, num_hdr = _cell_styles(styles)
    data = [[
        Paragraph("Customer", hdr), Paragraph("Part No.", hdr),
        Paragraph("Part / Description", hdr), Paragraph("Total Qty", num_hdr),
        Paragraph("Total Value (KES)", num_hdr), Paragraph("Orders", num_hdr),
    ]]
    for r in rows:
        qty = (f"{r.total_quantity:g}"
               if float(r.total_quantity) == int(r.total_quantity)
               else str(r.total_quantity))
        data.append([
            Paragraph(_esc(r.customer_name), cell),
            Paragraph(_esc(getattr(r, "part_number", None) or "—"), cell),
            Paragraph(_esc(r.description), cell),
            Paragraph(qty, num),
            Paragraph(f"{r.total_value_kes/100:,.2f}", num),
            Paragraph(str(r.purchase_count), num),
        ])
    if len(data) == 1:
        story.append(Paragraph("No completed sales recorded yet.", styles["Normal"]))
    else:
        tbl = Table(data, colWidths=[36*mm, 24*mm, 52*mm, 18*mm, 28*mm, 16*mm], repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GREY),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)

    doc.build(story)
    return buf.getvalue()


def render_category_value_pdf(rows) -> bytes:
    """rows: list of app.analytics.schemas.CategoryValueRow — current stock
    value by category, mirroring the register's summary-by-column table."""
    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    doc = _base_doc(buf, "Stock Value & Potential Sales")
    story = []
    _header(story, styles, "Stock Value & Potential Sales by Category",
            f"Current stock on hand · Generated {datetime_now_str()}")

    cell, hdr, num, num_hdr = _cell_styles(styles)
    data = [[
        Paragraph("Category", hdr), Paragraph("Line Items", num_hdr),
        Paragraph("Total Qty", num_hdr), Paragraph("Stock Value (USD)", num_hdr),
        Paragraph("Potential Sales (KES)", num_hdr),
    ]]
    total_items = total_qty = 0
    total_usd = total_kes = Decimal("0")
    for r in rows:
        data.append([
            Paragraph(_esc(r.category_name), cell),
            Paragraph(str(r.line_items), num),
            Paragraph(str(r.total_qty), num),
            Paragraph(f"{float(r.stock_value_usd):,.2f}", num),
            Paragraph(f"{float(r.potential_sales_kes):,.2f}", num),
        ])
        total_items += r.line_items
        total_qty += r.total_qty
        total_usd += r.stock_value_usd
        total_kes += r.potential_sales_kes

    if len(data) == 1:
        story.append(Paragraph("No priced stock on hand.", styles["Normal"]))
    else:
        data.append([
            Paragraph("<b>TOTAL</b>", hdr), Paragraph(f"<b>{total_items}</b>", num_hdr),
            Paragraph(f"<b>{total_qty}</b>", num_hdr),
            Paragraph(f"<b>{float(total_usd):,.2f}</b>", num_hdr),
            Paragraph(f"<b>{float(total_kes):,.2f}</b>", num_hdr),
        ])
        tbl = Table(data, colWidths=[54*mm, 24*mm, 24*mm, 32*mm, 40*mm], repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("BACKGROUND", (0, -1), (-1, -1), LIGHT_GREY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, LIGHT_GREY]),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GREY),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)
        story.append(Paragraph(
            "Stock Value (USD) = Qty × Buying Price. Potential Sales (KES) = Qty × Selling Price. "
            "The two totals are separate currencies and are not comparable to one another.",
            styles["Normal"],
        ))

    doc.build(story)
    return buf.getvalue()
