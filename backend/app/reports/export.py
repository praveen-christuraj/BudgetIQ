"""Excel (OpenPyXL) and PDF (ReportLab) report generation."""
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


@dataclass
class ReportSection:
    title: str
    headers: list[str]
    rows: list[list] = field(default_factory=list)
    total_row: list | None = None
    widths: list[float] | None = None


@dataclass
class ReportDocument:
    title: str
    subtitle: str
    sections: list[ReportSection]
    meta: dict = field(default_factory=dict)


def _fmt(value) -> str:
    if isinstance(value, Decimal):
        return f"{value:,.2f}"
    if isinstance(value, (date, datetime)):
        return value.strftime("%d-%m-%Y")
    if value is None:
        return "-"
    return str(value)


def _numeric(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return value
    return value


# --------------------------------------------------------------------------- #
# Excel
# --------------------------------------------------------------------------- #
def build_excel(document: ReportDocument) -> BytesIO:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = document.title[:31] or "Report"

    heading_font = Font(bold=True, size=14, color="1B5E20")
    subtitle_font = Font(italic=True, size=10, color="546E7A")
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2E7D32")
    section_font = Font(bold=True, size=12, color="1B5E20")
    thin = Side(style="thin", color="CFD8DC")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    sheet["A1"] = document.title
    sheet["A1"].font = heading_font
    sheet["A2"] = document.subtitle
    sheet["A2"].font = subtitle_font

    row_cursor = 4
    for key, value in document.meta.items():
        sheet.cell(row=row_cursor, column=1, value=f"{key}: {value}").font = Font(size=9, color="607D8B")
        row_cursor += 1

    row_cursor += 1
    max_columns = 1
    for section in document.sections:
        sheet.cell(row=row_cursor, column=1, value=section.title).font = section_font
        row_cursor += 1
        for col_index, header in enumerate(section.headers, start=1):
            cell = sheet.cell(row=row_cursor, column=col_index, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = border
        row_cursor += 1
        max_columns = max(max_columns, len(section.headers))

        for data_row in section.rows:
            for col_index, value in enumerate(data_row, start=1):
                cell = sheet.cell(row=row_cursor, column=col_index, value=_numeric(value))
                cell.border = border
                if isinstance(value, Decimal):
                    cell.number_format = "#,##0.00"
            row_cursor += 1

        if section.total_row:
            for col_index, value in enumerate(section.total_row, start=1):
                cell = sheet.cell(row=row_cursor, column=col_index, value=_numeric(value))
                cell.font = Font(bold=True)
                cell.fill = PatternFill("solid", fgColor="E8F5E9")
                cell.border = border
                if isinstance(value, Decimal):
                    cell.number_format = "#,##0.00"
            row_cursor += 1
        row_cursor += 2

    for col_index in range(1, max_columns + 1):
        sheet.column_dimensions[get_column_letter(col_index)].width = 18
    sheet.freeze_panes = "A4"

    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    return stream


# --------------------------------------------------------------------------- #
# PDF
# --------------------------------------------------------------------------- #
def build_pdf(document: ReportDocument) -> BytesIO:
    stream = BytesIO()
    doc = SimpleDocTemplate(
        stream,
        pagesize=landscape(A4),
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title=document.title,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle", parent=styles["Title"], fontSize=17, textColor=colors.HexColor("#1B5E20"), spaceAfter=2
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#546E7A")
    )
    section_style = ParagraphStyle(
        "Section", parent=styles["Heading2"], fontSize=11, textColor=colors.HexColor("#1B5E20"), spaceBefore=8, spaceAfter=3
    )

    story = [Paragraph(document.title, title_style), Paragraph(document.subtitle, subtitle_style)]
    if document.meta:
        meta_text = " | ".join(f"{k}: {v}" for k, v in document.meta.items())
        story.append(Paragraph(meta_text, subtitle_style))
    story.append(Spacer(1, 8))

    for section in document.sections:
        story.append(Paragraph(section.title, section_style))
        table_data = [section.headers] + [[_fmt(v) for v in row] for row in section.rows]
        if section.total_row:
            table_data.append([_fmt(v) for v in section.total_row])

        if len(table_data) == 1:
            story.append(Paragraph("No records for this period.", subtitle_style))
            story.append(Spacer(1, 6))
            continue

        table = Table(table_data, repeatRows=1, hAlign="LEFT")
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2E7D32")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                    ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                    ("ALIGN", (0, 1), (0, -1), "LEFT"),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CFD8DC")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7F6")]),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        if section.total_row:
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E8F5E9")),
                        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ]
                )
            )
        story.append(table)
        story.append(Spacer(1, 6))

    def _footer(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#78909C"))
        canvas.drawString(12 * mm, 8 * mm, "Family Finance Manager - private household report")
        canvas.drawRightString(landscape(A4)[0] - 12 * mm, 8 * mm, f"Page {_doc.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    stream.seek(0)
    return stream
