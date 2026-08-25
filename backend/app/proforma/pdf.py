"""Print-quality PDF rendering for a proforma invoice.

Layout follows PRINTEX's own paper proforma invoice template exactly
(company letterhead, INVOICE NO / Date, Client, Description / Quantity /
@ / Total Amount table, LESS discount / SUB TOTAL / 16% VAT / TOTAL, and
the full bank + M-Pesa payment block at the bottom) rather than a generic
invoice layout, so a PDF generated here matches what the business already
hands to customers on paper.

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
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT

BRAND_NAVY = colors.HexColor("#14151a")
BRAND_GREEN = colors.HexColor("#2f8f4e")
LIGHT_GREY = colors.HexColor("#f5f6f8")
BORDER_GREY = colors.HexColor("#e6e8eb")

# PRINTEX ENGINEERS LTD's own bank and mobile-money payment details, exactly
# as printed on the paper proforma invoice this template mirrors. These are
# fixed company details, not per-invoice data — same footer on every PI.
COMPANY_NAME = "PRINTEX ENGINEERS LIMITED"
COMPANY_ADDRESS_LINES = ["P.O BOX 5800-00200", "NAIROBI-KENYA"]

PAYMENT_DETAILS = {
    "NAME": "PRINTEX ENGINEERS LTD",
    "BANK": "NCBA BANK KENYA PLC",
    "BRANCH": "LUNGA LUNGA",
    "BRANCH CODE": "07128",
    "BANK CODE": "07000",
    "SWIFT CODE": "CBAFKENX",
    "ACCOUNT NO": "3026970037",
    "PIN NO": "P051550104M",
}
PAYBILL = {"PAYBILL NUMBER": "880100", "ACCOUNT NUMBER": "051501", "NAME": "PRINTEX ENGINEERS LTD"}
TILL = {"TILL NUMBER": "4977712", "ACCOUNT NAME": "PRINTEX ENGINEERS LTD"}


def _esc(value) -> str:
    """Escape text before it goes into a Paragraph.

    Paragraph parses its input as mini-HTML, so a description containing
    "<", ">" or "&" — e.g. a part rated "<=250mm" — would either vanish or
    raise a parse error mid-render. Everything user-entered goes through here.
    """
    return (str(value if value is not None else "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _kes(cents: int) -> str:
    return f"{cents / 100:,.2f}"


def _qty(quantity) -> str:
    q = float(quantity)
    return f"{q:g}" if q == int(q) else str(quantity)


def render_proforma_pdf(inv) -> bytes:
    """inv: an app.proforma.models.ProformaInvoice with .items and
    .created_by eagerly loaded. Returns raw PDF bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=16 * mm, bottomMargin=14 * mm,
        leftMargin=16 * mm, rightMargin=16 * mm,
        title=f"Proforma Invoice {inv.pi_number}",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Heading1"], fontSize=16,
                                  alignment=TA_CENTER, textColor=BRAND_NAVY, spaceAfter=0)
    company_style = ParagraphStyle("company", parent=styles["Normal"], fontSize=12,
                                    fontName="Helvetica-Bold", textColor=BRAND_NAVY, leading=15)
    addr_style = ParagraphStyle("addr", parent=styles["Normal"], fontSize=9,
                                 textColor=colors.HexColor("#6b7078"), leading=12)
    right_bold = ParagraphStyle("right_bold", parent=styles["Normal"], fontSize=9.5,
                                 alignment=TA_RIGHT, textColor=BRAND_NAVY, leading=13)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10,
                           textColor=BRAND_NAVY, leading=14)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8.5,
                            textColor=BRAND_NAVY, leading=12)
    small_bold = ParagraphStyle("small_bold", parent=styles["Normal"], fontSize=8.5,
                                 fontName="Helvetica-Bold", textColor=BRAND_NAVY, leading=12)

    story = []

    # ── Title ────────────────────────────────────────────────────────────
    story.append(Paragraph("PROFORMA INVOICE", title_style))
    story.append(Spacer(1, 8))

    # ── Letterhead: company block (left) / invoice no + date (right) ──────
    created_at = inv.created_at.strftime("%d/%m/%Y") if getattr(inv, "created_at", None) else "—"
    company_block = [Paragraph(COMPANY_NAME, company_style)] + [
        Paragraph(line, addr_style) for line in COMPANY_ADDRESS_LINES
    ]
    invoice_meta = Paragraph(
        f"<b>INVOICE NO:</b> {_esc(inv.pi_number)}<br/><b>Date:</b> {created_at}", right_bold
    )
    header_tbl = Table(
        [[company_block, invoice_meta]],
        colWidths=[110 * mm, 64 * mm],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=1.2, color=BRAND_GREEN))
    story.append(Spacer(1, 10))

    # ── Client ──────────────────────────────────────────────────────────
    story.append(Paragraph("<b>Client</b>", body))
    story.append(Paragraph(_esc(inv.customer_name), body))
    if inv.customer_phone:
        story.append(Paragraph(_esc(inv.customer_phone), body))
    if inv.customer_email:
        story.append(Paragraph(_esc(inv.customer_email), body))
    if getattr(inv, "customer_address", None):
        story.append(Paragraph(_esc(inv.customer_address), body))
    story.append(Spacer(1, 12))

    # ── Line items: Part No. | Description | Quantity | @ | Total Amount ──
    #
    # Every text cell is a Paragraph, never a bare string. reportlab draws a
    # bare string on one unbroken line: it does not measure it against the
    # column, so a long part description simply ran on past its cell and was
    # overprinted by the Quantity and @ columns beside it — the "letters on
    # top of each other" on printed invoices. A Paragraph wraps inside the
    # column width and grows the row height instead.
    cell = ParagraphStyle("cell", parent=styles["Normal"], fontSize=9,
                          leading=11.5, textColor=BRAND_NAVY,
                          wordWrap="CJK")
    cell_hdr = ParagraphStyle("cell_hdr", parent=cell, fontName="Helvetica-Bold",
                              textColor=colors.white)
    cell_num = ParagraphStyle("cell_num", parent=cell, alignment=TA_RIGHT)
    cell_num_hdr = ParagraphStyle("cell_num_hdr", parent=cell_hdr, alignment=TA_RIGHT)

    item_rows = [[
        Paragraph("Part No.", cell_hdr),
        Paragraph("Description", cell_hdr),
        Paragraph("Quantity", cell_num_hdr),
        Paragraph("@", cell_num_hdr),
        Paragraph("Total Amount", cell_num_hdr),
    ]]
    for it in inv.items:
        # part_number is snapshot onto the line when the PI is raised; older
        # lines and free-text entries have none, and print as an em dash.
        pn = getattr(it, "part_number", None) or "—"
        item_rows.append([
            Paragraph(_esc(pn), cell),
            Paragraph(_esc(it.description), cell),
            Paragraph(_qty(it.quantity), cell_num),
            Paragraph(_kes(it.unit_price_kes), cell_num),
            Paragraph(_kes(it.line_total_kes), cell_num),
        ])

    items_tbl = Table(
        item_rows, colWidths=[26 * mm, 62 * mm, 20 * mm, 30 * mm, 32 * mm],
        repeatRows=1,
    )
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GREY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 4))

    # ── Totals: LESS discount / SUB TOTAL / 16% VAT / TOTAL ────────────────
    totals_rows = []
    if inv.discount_kes:
        totals_rows.append(
            [f"LESS {float(inv.discount_pct):g}% DISCOUNT", f"({_kes(inv.discount_kes)})"])
    totals_rows.append(["SUB TOTAL", _kes(inv.subtotal_kes - inv.discount_kes)])
    totals_rows.append(["16% VAT", _kes(inv.tax_kes)])
    totals_rows.append(["TOTAL", _kes(inv.total_kes)])

    totals_tbl = Table(totals_rows, colWidths=[44 * mm, 30 * mm], hAlign="RIGHT")
    totals_tbl.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("LINEABOVE", (0, -1), (-1, -1), 1, BRAND_NAVY),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 11.5),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -2), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -2), 3),
    ]))
    story.append(totals_tbl)
    story.append(Spacer(1, 18))

    if inv.notes:
        story.append(Paragraph("<b>Notes</b>", body))
        story.append(Paragraph(_esc(inv.notes), body))
        story.append(Spacer(1, 12))

    story.append(HRFlowable(width="100%", thickness=0.75, color=BORDER_GREY))
    story.append(Spacer(1, 8))

    # ── Signature, then full payment credentials footer — stacked
    # sequentially (not side-by-side columns), matching the paper template:
    # Received by / Signature and date first, THEN Account Payable To below
    # it, reading top to bottom rather than left/right.
    def _kv_lines(d: dict) -> str:
        return "<br/>".join(f"<b>{k}:</b> {v}" for k, v in d.items())

    story.append(Paragraph(
        "Received by: ________________________________", small,
    ))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Signature and date: ________________________________", small,
    ))
    story.append(Spacer(1, 14))

    story.append(Paragraph(
        "<b>ACCOUNT PAYABLE TO:</b><br/>"
        + _kv_lines(PAYMENT_DETAILS)
        + "<br/><br/><b>OR,</b><br/>"
        + _kv_lines(PAYBILL)
        + "<br/><br/><b>OR,</b><br/>"
        + _kv_lines(TILL),
        small,
    ))

    doc.build(story)
    return buf.getvalue()
