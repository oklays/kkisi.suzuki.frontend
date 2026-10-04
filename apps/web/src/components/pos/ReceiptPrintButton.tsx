'use client';

import { useEffect } from 'react';

export function ReceiptPrintButton({ autoPrint = false }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = setTimeout(() => {
      try {
        window.focus();
        window.print();
      } catch {
        // Ignored
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [autoPrint]);

  return (
    <button
      className="receipt-print-button"
      type="button"
      onClick={() => {
        try {
          window.focus();
          window.print();
        } catch {
          // Ignored
        }
      }}
    >
      Cetak struk
    </button>
  );
}
