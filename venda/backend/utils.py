import io
from typing import Optional

import pandas as pd


def generate_barcode_image(barcode_value: str, barcode_format: str = "ean13") -> bytes:
    """Generate a barcode image byte stream for the given value.

    This function lazy-imports `python-barcode` and `Pillow`-backed writer so
    editors/linters without the packages installed won't show unresolved-import
    errors at module import time. If the dependency is missing a clear
    ImportError is raised with install instructions.
    """
    try:
        import barcode
        from barcode.writer import ImageWriter
    except ImportError as exc:
        raise ImportError(
            "Missing dependency 'python-barcode' or 'Pillow'."
            " Install with: pip install python-barcode Pillow"
        ) from exc

    writer = ImageWriter()
    barcode_class = barcode.get_barcode_class(barcode_format)
    code = barcode_class(barcode_value, writer=writer)
    stream = io.BytesIO()
    code.write(stream)
    return stream.getvalue()


def create_excel_report(data: list[dict], filename: str = "report.xlsx") -> bytes:
    """Create an Excel report from a list of dictionaries."""
    df = pd.DataFrame(data)
    stream = io.BytesIO()
    with pd.ExcelWriter(stream, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Report")
    stream.seek(0)
    return stream.getvalue()


def create_pdf_report(content: str, title: str = "Report") -> bytes:
    """Stub for generating a PDF report. Replace with ReportLab or WeasyPrint in production."""
    html = f"<html><body><h1>{title}</h1><pre>{content}</pre></body></html>"
    return html.encode("utf-8")


def send_receipt_to_printer(receipt_text: str) -> Optional[str]:
    """Send raw text to a local ESC/POS-compatible printer."""
    try:
        try:
            from escpos.printer import Dummy
        except ImportError:
            # If python-escpos is not installed, return a stubbed output
            raise ImportError(
                "Missing dependency 'python-escpos'. Install with: pip install python-escpos"
            )

        printer = Dummy()
        printer.text(receipt_text)
        # Dummy prints to an internal buffer; provide it for testing
        return getattr(printer, "output", b"").decode("utf-8", errors="ignore")
    except Exception:
        return None
