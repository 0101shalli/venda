export function ean13CheckDigit(body: string): string {
  if (!/^\d{12}$/.test(body)) {
    throw new Error(`EAN-13 body must be 12 digits, got "${body}"`);
  }
  let total = 0;
  for (let i = 0; i < body.length; i++) {
    total += i % 2 === 0 ? Number(body[i]) : Number(body[i]) * 3;
  }
  return String((10 - (total % 10)) % 10);
}

export function isEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  try {
    return ean13CheckDigit(value.slice(0, 12)) === value[12];
  } catch {
    return false;
  }
}

export function barcodeFormat(value: string): "EAN13" | "CODE128" {
  return isEan13(value) ? "EAN13" : "CODE128";
}

export function generateBarcode(): string {
  const ms = Date.now();
  const body = `750${String((ms + Math.floor(Math.random() * 1_000_000_000)) % 1_000_000_000).padStart(9, "0")}`;
  return body + ean13CheckDigit(body);
}
