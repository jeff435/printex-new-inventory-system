"""Print-quality PDF rendering for a proforma invoice.

Uses reportlab (added to requirements.txt) rather than an HTML→PDF bridge so
this has no headless-browser dependency and stays fast under load.
"""
import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
)
from reportlab.lib.enums import TA_RIGHT, TA_CENTER

BRAND_NAVY = colors.HexColor("#14151a")
BRAND_GREEN = colors.HexColor("#2f8f4e")
LIGHT_GREY = colors.HexColor("#f5f6f8")
BORDER_GREY = colors.HexColor("#e6e8eb")


def _kes(cents: int) -> str:
    return f"KSh {cents / 100:,.2f}"


def render_proforma_pdf(inv) -> bytes:
    """inv: an app.proforma.models.ProformaInvoice with .items and
    .created_by eagerly loaded. Returns raw PDF bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=18 * mm, bottomMargin=18 * mm,
        leftMargin=16 * mm, rightMargin=16 * mm,
        title=f"Proforma Invoice {inv.pi_number}",
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=20,
                         textColor=BRAND_NAVY, spaceAfter=0)
    small_grey = ParagraphStyle("small_grey", parent=styles["Normal"],
                                 fontSize=9, textColor=colors.HexColor("#6b7078"))
    right = ParagraphStyle("right", parent=styles["Normal"],
                            fontSize=9, alignment=TA_RIGHT,
                            textColor=colors.HexColor("#6b7078"))
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10,
                           textColor=BRAND_NAVY, leading=14)
    status_style = ParagraphStyle(
        "status", parent=styles["Normal"], fontSize=11, alignment=TA_CENTER,
        textColor=colors.white,
    )

    story = []

    # ── Letterhead ──────────────────────────────────────────────────────────
    header_tbl = Table(
        [[Paragraph("PRINTEX ENGINEERS", h1),
          Paragraph(f"PROFORMA INVOICE<br/><b>{inv.pi_number}</b>", right)]],
        colWidths=[100 * mm, 74 * mm],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(header_tbl)
    story.append(Paragraph(
        "Printing press spare parts &amp; inventory &middot; Nairobi, Kenya",
        small_grey,
    ))
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=1.4, color=BRAND_GREEN))
    story.append(Spacer(1, 12))

    # ── Customer + meta block ──────────────────────────────────────────────
    created_at = inv.created_at.strftime("%d %b %Y") if getattr(inv, "created_at", None) else "—"
    meta_rows = [
        [Paragraph("<b>Bill to</b>", body), Paragraph("<b>Details</b>", body)],
        [Paragraph(inv.customer_name, body),
         Paragraph(f"Date: {created_at}", body)],
    ]
    if inv.customer_phone:
        meta_rows.append([Paragraph(inv.customer_phone, body), Paragraph(
            f"Valid until: {inv.valid_until or '—'}", body)])
    if inv.customer_email:
        meta_rows.append([Paragraph(inv.customer_email, body), Paragraph(
            f"Status: {inv.status.value if hasattr(inv.status, 'value') else inv.status}".title(), body)])

    meta_tbl = Table(meta_rows, colWidths=[100 * mm, 74 * mm])
    meta_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 14))

    # ── Line items ──────────────────────────────────────────────────────────
    item_rows = [["#", "Description", "Qty", "Unit Price", "Line Total"]]
    for idx, it in enumerate(inv.items, start=1):
        item_rows.append([
            str(idx),
            it.description,
            f"{it.quantity:g}" if float(it.quantity) == int(it.quantity) else str(it.quantity),
            _kes(it.unit_price_kes),
            _kes(it.line_total_kes),
        ])

    items_tbl = Table(
        item_rows, colWidths=[10 * mm, 84 * mm, 18 * mm, 30 * mm, 32 * mm],
        repeatRows=1,
    )
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 10))

    # ── Totals ──────────────────────────────────────────────────────────────
    totals_rows = [["Subtotal", _kes(inv.subtotal_kes)]]
    if inv.discount_kes:
        totals_rows.append(
            [f"Discount ({float(inv.discount_pct):g}%)", f"- {_kes(inv.discount_kes)}"])
    totals_rows.append(["VAT (16%)", _kes(inv.tax_kes)])
    totals_rows.append(["Total", _kes(inv.total_kes)])

    totals_tbl = Table(totals_rows, colWidths=[40 * mm, 40 * mm], hAlign="RIGHT")
    totals_tbl.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("LINEABOVE", (0, -1), (-1, -1), 1, BRAND_NAVY),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 12),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -2), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -2), 3),
    ]))
    story.append(totals_tbl)
    story.append(Spacer(1, 16))

    if inv.notes:
        story.append(Paragraph("<b>Notes</b>", body))
        story.append(Paragraph(inv.notes, body))
        story.append(Spacer(1, 12))

    story.append(HRFlowable(width="100%", thickness=0.75, color=BORDER_GREY))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "This is a proforma invoice — a quotation, not a tax invoice or demand for "
        "payment. Prices are quoted in Kenya Shillings (KES) and valid until the date "
        "shown above. VAT is charged at the standard Kenyan rate of 16%.",
        small_grey,
    ))
    story.append(Spacer(1, 4))
    prepared_by = inv.created_by.full_name if getattr(inv, "created_by", None) else "—"
    story.append(Paragraph(f"Prepared by: {prepared_by}", small_grey))

    doc.build(story)
    return buf.getvalue()
