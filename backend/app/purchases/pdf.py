"""Print-quality PDF for a single Purchase Order — the document sent to a
supplier listing what's being ordered from them. Uses reportlab, same
approach as app.proforma.pdf and app.analytics.pdf."""
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
LIGHT_GREY = colors.HexColor("#f5f6f8")
BORDER_GREY = colors.HexColor("#e6e8eb")

COMPANY_NAME = "PRINTEX ENGINEERS LIMITED"
COMPANY_ADDRESS_LINES = ["P.O BOX 5800-00200", "NAIROBI-KENYA"]


def _esc(value) -> str:
    if value is None:
        return ""
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_purchase_order_pdf(purchase) -> bytes:
    """purchase: app.purchases.models.Purchase (or anything shaped like it,
    with .items each carrying product_name/product_sku/product_part_number)
    — eager-load items→product and supplier before calling this."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Purchase Order {purchase.purchase_number}",
    )
    styles = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=9, leading=12)
    right = ParagraphStyle("right", parent=small, alignment=TA_RIGHT)
    hdr = ParagraphStyle("hdr", parent=small, textColor=colors.white, fontName="Helvetica-Bold")
    num_hdr = ParagraphStyle("num_hdr", parent=hdr, alignment=TA_RIGHT)
    num = ParagraphStyle("num", parent=small, alignment=TA_RIGHT)

    story = []
    story.append(Paragraph(f"<b>{_esc(COMPANY_NAME)}</b>", styles["Title"]))
    for line in COMPANY_ADDRESS_LINES:
        story.append(Paragraph(_esc(line), small))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.75, color=BORDER_GREY))
    story.append(Spacer(1, 8))

    story.append(Paragraph("<b>PURCHASE ORDER</b>", styles["Heading2"]))
    story.append(Paragraph(f"PO Number: <b>{_esc(purchase.purchase_number)}</b>", small))
    created = purchase.created_at.strftime("%d/%m/%Y") if getattr(purchase, "created_at", None) else "—"
    story.append(Paragraph(f"Date: {created}", small))
    status = purchase.status.value if hasattr(purchase.status, "value") else purchase.status
    story.append(Paragraph(f"Status: {_esc(str(status).title())}", small))
    story.append(Spacer(1, 10))

    story.append(Paragraph("<b>Supplier</b>", small))
    story.append(Paragraph(_esc(getattr(purchase, "supplier_name", None) or "—"), small))
    story.append(Spacer(1, 12))

    data = [[
        Paragraph("Part No.", hdr), Paragraph("Description", hdr),
        Paragraph("Qty", num_hdr), Paragraph("Unit Cost", num_hdr), Paragraph("Total", num_hdr),
    ]]
    total = Decimal("0")
    for item in purchase.items:
        line_total = item.subtotal if item.subtotal is not None else (item.quantity * item.unit_cost)
        total += Decimal(line_total)
        data.append([
            Paragraph(_esc(getattr(item, "product_part_number", None) or "—"), small),
            Paragraph(_esc(getattr(item, "product_name", None) or item.product_id), small),
            Paragraph(str(item.quantity), num),
            Paragraph(f"{float(item.unit_cost):,.2f}", num),
            Paragraph(f"{float(line_total):,.2f}", num),
        ])

    tbl = Table(data, colWidths=[26 * mm, 70 * mm, 16 * mm, 28 * mm, 28 * mm], repeatRows=1)
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
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"<b>TOTAL: KES {float(total):,.2f}</b>", right))

    if purchase.notes:
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"<b>Notes:</b> {_esc(purchase.notes)}", small))

    story.append(Spacer(1, 20))
    story.append(Paragraph("Authorised by: ________________________________", small))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Signature and date: ________________________________", small))

def render_supplier_parts_pdf(supplier_name: str, parts) -> bytes:
    """parts: list of app.purchases.schemas.SupplierTaggedPart — every part
    tagged with this supplier, printable as a reference list (not a PO)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Parts — {supplier_name}",
    )
    styles = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=9, leading=12)
    hdr = ParagraphStyle("hdr", parent=small, textColor=colors.white, fontName="Helvetica-Bold")
    num_hdr = ParagraphStyle("num_hdr", parent=hdr, alignment=TA_RIGHT)
    num = ParagraphStyle("num", parent=small, alignment=TA_RIGHT)

    story = []
    story.append(Paragraph(f"<b>{_esc(COMPANY_NAME)}</b>", styles["Title"]))
    for line in COMPANY_ADDRESS_LINES:
        story.append(Paragraph(_esc(line), small))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.75, color=BORDER_GREY))
    story.append(Spacer(1, 8))

    story.append(Paragraph(f"<b>PARTS SUPPLIED BY {_esc(supplier_name.upper())}</b>", styles["Heading2"]))
    story.append(Paragraph(
        "Every part tagged with this supplier in the catalogue — a reference list, "
        "not tied to whether an order has actually been placed.",
        small,
    ))
    story.append(Spacer(1, 10))

    data = [[
        Paragraph("Part No.", hdr), Paragraph("Name", hdr),
        Paragraph("SKU", hdr), Paragraph("Price (USD)", num_hdr),
    ]]
    for p in parts:
        data.append([
            Paragraph(_esc(p.part_number or "—"), small),
            Paragraph(_esc(p.name), small),
            Paragraph(_esc(p.sku), small),
            Paragraph(f"{p.price_usd/100:,.2f}" if p.price_usd is not None else "—", num),
        ])

    if len(data) == 1:
        story.append(Paragraph("No parts tagged with this supplier yet.", small))
    else:
        tbl = Table(data, colWidths=[28 * mm, 70 * mm, 30 * mm, 28 * mm], repeatRows=1)
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

