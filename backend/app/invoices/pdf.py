import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_CENTER


def render_invoice_pdf(invoice, company_name: str = "Printex") -> bytes:
    """invoice: an app.invoices.models.ProformaInvoice with .items loaded."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=20 * mm, bottomMargin=20 * mm,
        leftMargin=18 * mm, rightMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleBig", parent=styles["Title"], fontSize=20, spaceAfter=2)
    small_dim = ParagraphStyle(
        "SmallDim", parent=styles["Normal"], fontSize=9, textColor=colors.grey)
    right = ParagraphStyle("Right", parent=styles["Normal"], alignment=TA_RIGHT)

    story = []
    story.append(Paragraph(company_name, title_style))
    story.append(Paragraph("Proforma Invoice", small_dim))
    story.append(Spacer(1, 10))

    header_data = [
        ["Invoice #", invoice.invoice_number, "Status", invoice.status.value.upper()],
        ["Customer", invoice.customer_name, "Phone", invoice.customer_phone or "-"],
    ]
    header_table = Table(header_data, colWidths=[70, 170, 70, 170])
    header_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 14))

    rows = [["#", "Description", "Qty", "Unit Price", "Subtotal"]]
    for i, item in enumerate(invoice.items, start=1):
        rows.append([
            str(i),
            item.description or (item.product.name if item.product else ""),
            str(item.quantity),
            f"{item.unit_price:,.2f}",
            f"{item.subtotal:,.2f}",
        ])

    items_table = Table(
        rows, colWidths=[20, 260, 40, 80, 80], repeatRows=1)
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 10))

    totals_rows = [
        ["Subtotal", f"{invoice.subtotal:,.2f}"],
        [f"Tax ({invoice.tax_rate}%)", f"{invoice.tax_amount:,.2f}"],
        ["Total", f"{invoice.total:,.2f}"],
    ]
    totals_table = Table(totals_rows, colWidths=[400, 80])
    totals_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.75, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(totals_table)

    if invoice.notes:
        story.append(Spacer(1, 14))
        story.append(Paragraph(f"<b>Notes:</b> {invoice.notes}", styles["Normal"]))

    doc.build(story)
    return buf.getvalue()
