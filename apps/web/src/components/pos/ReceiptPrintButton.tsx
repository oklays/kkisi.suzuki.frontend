'use client';

export function ReceiptPrintButton() {
  return <button className="receipt-print-button" type="button" onClick={() => window.print()}>Cetak struk</button>;
}
