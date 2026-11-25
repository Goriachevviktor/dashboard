from datetime import date
from html import escape
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


FONT_PATH = Path(__file__).with_name("fonts") / "NotoSans-Regular.ttf"
MONTHS = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)


def render_draft_pdf(meeting: dict) -> bytes:
    pdfmetrics.registerFont(TTFont("BrspPdf", str(FONT_PATH)))
    meeting_date = date.fromisoformat(meeting["date"])
    formatted_date = f"{meeting_date.day} {MONTHS[meeting_date.month - 1]} {meeting_date.year} г."
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=19 * mm, bottomMargin=20 * mm,
        title=f"Синк БРСП — {formatted_date}", author="Дашборд руководителя",
    )
    title_style = ParagraphStyle(
        "BrspTitle", fontName="BrspPdf", fontSize=16, leading=22,
        textColor=colors.HexColor("#20375f"), spaceAfter=5 * mm,
    )
    date_style = ParagraphStyle(
        "BrspDate", fontName="BrspPdf", fontSize=10, leading=14,
        textColor=colors.HexColor("#61738f"), spaceAfter=8 * mm,
    )
    topic_style = ParagraphStyle(
        "BrspTopic", fontName="BrspPdf", fontSize=11, leading=16,
        textColor=colors.HexColor("#20375f"), spaceBefore=5 * mm,
        spaceAfter=2 * mm,
    )
    report_style = ParagraphStyle(
        "BrspReport", fontName="BrspPdf", fontSize=10, leading=15,
        alignment=TA_LEFT, spaceAfter=4 * mm, splitLongWords=True,
    )
    flow = [
        Paragraph("Синк БРСП — черновик встречи", title_style),
        Paragraph(formatted_date, date_style),
    ]
    for topic in meeting["topics"]:
        if not topic["text"].strip():
            continue
        flow.append(Paragraph(escape(topic["name"]), topic_style))
        flow.append(Paragraph(escape(topic["text"]).replace("\n", "<br/>"), report_style))
    if meeting["note"].strip():
        flow.append(Spacer(1, 3 * mm))
        flow.append(Paragraph("Общий комментарий", topic_style))
        flow.append(Paragraph(escape(meeting["note"]).replace("\n", "<br/>"), report_style))

    def footer(canvas, _document):
        canvas.saveState()
        canvas.setFont("BrspPdf", 8)
        canvas.setFillColor(colors.HexColor("#61738f"))
        canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, str(canvas.getPageNumber()))
        canvas.restoreState()

    document.build(flow, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
