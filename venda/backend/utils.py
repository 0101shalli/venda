import io
import os
import sys
import threading
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


def _default_file_printer_device() -> str:
    """Return a sensible default printer device for the current OS."""
    if os.name == "nt":
        return "USB001"
    if sys.platform == "darwin":
        return "/dev/usb/lp0"
    return "/dev/usb/lp0"


def send_receipt_to_printer(
    receipt_text: str,
    printer_type: str = "file",
    printer_device: str = "",
) -> dict:
    """Send raw text to a real ESC/POS-compatible printer.

    Supports the following ``printer_type`` values:
      - ``file``    : writes to a device file / port (default)
      - ``network`` : network receipt printer (``host:port``, default port 9100)
      - ``usb``     : USB printer (``vid:pid`` in hex, e.g. ``04b8:0202``)
      - ``serial``  : serial printer (``port[:baud]``, default baud 9600)
      - ``dummy``   : buffer-only, used for testing (never prints physically)

    Returns a dict with ``success`` (bool) and ``error`` (str or None).
    """
    printer = None
    try:
        from escpos.printer import Dummy, File, Network, Usb, Serial
    except ImportError:
        return {"success": False, "error": "python-escpos is not installed"}

    try:
        ptype = (printer_type or "file").lower()
        device = printer_device or ""

        if ptype == "network":
            if ":" in device:
                host, port = device.rsplit(":", 1)
                printer = Network(host, port=int(port), timeout=5)
            else:
                printer = Network(device or "127.0.0.1", timeout=5)
        elif ptype == "usb":
            parts = device.split(":")
            vid = int(parts[0], 16) if len(parts) > 0 and parts[0] else 0x04B8
            pid = int(parts[1], 16) if len(parts) > 1 and parts[1] else 0x0202
            printer = Usb(vid, pid)
        elif ptype == "serial":
            parts = device.split(":")
            port = parts[0] if parts and parts[0] else "/dev/ttyUSB0"
            baud = int(parts[1]) if len(parts) > 1 and parts[1] else 9600
            printer = Serial(port, baudrate=baud)
        elif ptype == "dummy":
            printer = Dummy()
        else:
            path = device or _default_file_printer_device()
            printer = File(path)

        printer.text(receipt_text)
        try:
            printer.cut()
        except Exception:
            pass
        printer.close()
        return {"success": True, "error": None}
    except Exception as exc:
        try:
            if printer is not None:
                printer.close()
        except Exception:
            pass
        return {"success": False, "error": str(exc) or "Printer not reachable"}


def print_receipt_with_timeout(
    receipt_text: str,
    printer_type: str = "file",
    printer_device: str = "",
    timeout: int = 8,
) -> dict:
    """Attempt to print a receipt, bounded by ``timeout`` seconds.

    Returns a dict with ``success`` (bool) and ``error`` (str or None) so the
    caller can surface print status (printed / not printed) to the user.
    """
    result: dict = {"success": False, "error": "Printer timed out"}

    def _do() -> None:
        try:
            result.clear()
            result.update(send_receipt_to_printer(receipt_text, printer_type, printer_device))
        except Exception as exc:  # pragma: no cover - defensive
            result.clear()
            result.update({"success": False, "error": str(exc)})

    thread = threading.Thread(target=_do, daemon=True)
    thread.start()
    thread.join(timeout=timeout)
    if thread.is_alive():
        return {"success": False, "error": "Printer timed out (no response within %ds)" % timeout}
    return result
