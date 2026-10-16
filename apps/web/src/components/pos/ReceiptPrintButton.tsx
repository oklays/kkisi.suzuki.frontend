'use client';

import { useEffect } from 'react';

function prepareReceiptPage() {
  const paper = document.querySelector<HTMLElement>('.receipt-paper');
  if (!paper) return;
  // A narrow preview/checkout iframe must still be measured at the printed width.
  const { width, maxWidth } = paper.style;
  paper.style.width = '75mm';
  paper.style.maxWidth = 'none';
  const bounds = paper.getBoundingClientRect();
  paper.style.width = width;
  paper.style.maxWidth = maxWidth;
  if (bounds.width <= 0 || bounds.height <= 0) return;
  let page = document.getElementById('receipt-page-size');
  if (!page) {
    page = document.createElement('style');
    page.id = 'receipt-page-size';
    document.head.appendChild(page);
  }
  // Explicit roll length prevents the driver's default page from feeding past the footer.
  const heightMm = Math.ceil(bounds.height * 75 / bounds.width) + 1;
  page.textContent = `@page { size: 75mm ${heightMm}mm; margin: 0; }`;
}

function printReceipt() {
  prepareReceiptPage();
  window.focus();
  window.print();
}

export function ReceiptPrintButton({ autoPrint = false, label = 'Cetak struk' }: { autoPrint?: boolean; label?: string }) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    window.addEventListener('beforeprint', prepareReceiptPage);
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      prepareReceiptPage();
      if (autoPrint) timer = setTimeout(printReceipt, 400);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('beforeprint', prepareReceiptPage);
      document.getElementById('receipt-page-size')?.remove();
    };
  }, [autoPrint]);

  return (
    <button
      className="receipt-print-button"
      type="button"
      onClick={async () => { await document.fonts.ready; printReceipt(); }}
    >
      {label}
    </button>
  );
}
