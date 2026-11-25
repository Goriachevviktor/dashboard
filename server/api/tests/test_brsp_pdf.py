from datetime import date
from io import BytesIO

import pytest
from fastapi import HTTPException
from pypdf import PdfReader

from app import brsp


def test_draft_pdf_contains_only_current_nonempty_reports_and_note():
    from app.brsp_pdf import render_draft_pdf

    meeting = {
        "date": "2026-11-25",
        "status": "draft",
        "note": "Решение по встрече",
        "topics": [
            {"name": "ОЕМ", "text": "Доклад сегодня\nВторой абзац"},
            {"name": "Пустая тема", "text": "  \n "},
            {"name": "Плейсхолдер", "text": " ————  "},
            {"name": "Терминалы", "text": "Следующий доклад <важно>"},
        ],
    }
    pdf = render_draft_pdf(meeting)
    reader = PdfReader(BytesIO(pdf))
    text = "\n".join(page.extract_text() for page in reader.pages)

    assert pdf.startswith(b"%PDF-")
    assert "25 ноября 2026" in text
    assert "ОЕМ" in text
    assert "Доклад сегодня" in text
    assert "Второй абзац" in text
    assert "Терминалы" in text
    assert "Следующий доклад <важно>" in text
    assert "Решение по встрече" in text
    assert "Пустая тема" not in text
    assert "Плейсхолдер" not in text


def test_draft_pdf_paginates_long_cyrillic_report():
    from app.brsp_pdf import render_draft_pdf

    long_report = "Длинный доклад на русском языке. " * 800
    pdf = render_draft_pdf({
        "date": "2026-11-25", "status": "draft", "note": "",
        "topics": [{"name": "Большая тема", "text": long_report}],
    })
    reader = PdfReader(BytesIO(pdf))

    assert len(reader.pages) > 1
    assert "Большая тема" in reader.pages[0].extract_text()
    assert "Длинный доклад" in reader.pages[-1].extract_text()


def test_export_rejects_done_and_empty_drafts(monkeypatch):
    class Connection:
        def __init__(self, row):
            self.row = row

        def execute(self, query, params):
            assert "owner_id" in query
            assert params == (5, 7)
            return self

        def fetchone(self):
            return self.row

    class Db:
        def __init__(self, row):
            self.row = row

        def __enter__(self):
            return Connection(self.row)

        def __exit__(self, *_):
            pass

    for row in (
        {"status": "done", "topics": [{"name": "ОЕМ", "text": "Есть доклад"}]},
        {"status": "draft", "topics": [{"name": "ОЕМ", "text": "  "}]},
        {"status": "draft", "topics": [{"name": "ОЕМ", "text": "--------"}]},
    ):
        monkeypatch.setattr(brsp, "db", lambda: Db(row))
        with pytest.raises(HTTPException) as error:
            brsp.download_brsp_draft_pdf(5, {"id": 7})
        assert error.value.status_code == 409

    monkeypatch.setattr(brsp, "db", lambda: Db(None))
    with pytest.raises(HTTPException) as error:
        brsp.download_brsp_draft_pdf(5, {"id": 7})
    assert error.value.status_code == 404


def test_export_returns_named_pdf_attachment(monkeypatch):
    meeting = {
        "id": 5, "meeting_date": date(2026, 11, 25), "status": "draft", "note": "",
        "topics": [{"name": "ОЕМ", "text": "Сегодняшний доклад"}],
    }

    class Connection:
        def execute(self, query, params):
            assert params == (5, 7)
            return self

        def fetchone(self):
            return meeting

    class Db:
        def __enter__(self):
            return Connection()

        def __exit__(self, *_):
            pass

    monkeypatch.setattr(brsp, "db", Db)
    response = brsp.download_brsp_draft_pdf(5, {"id": 7})

    assert response.media_type == "application/pdf"
    assert response.headers["content-disposition"] == 'attachment; filename="sink-brsp-2026-11-25-draft.pdf"'
    assert response.headers["cache-control"] == "no-store"
    assert "Сегодняшний доклад" in PdfReader(BytesIO(response.body)).pages[0].extract_text()
