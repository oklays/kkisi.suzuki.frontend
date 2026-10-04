export const PAYMENT_METHODS = ['Cash', 'QRIS', 'Kredit'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export type PaymentBehavior = {
  requiresTenderAmount: boolean;
  affectsCashDrawer: boolean;
  requiresMember: boolean;
  isReceivable: boolean;
};

export const PAYMENT_BEHAVIORS: Record<PaymentMethod, PaymentBehavior> = {
  Cash: {
    requiresTenderAmount: true,
    affectsCashDrawer: true,
    requiresMember: false,
    isReceivable: false,
  },
  QRIS: {
    requiresTenderAmount: false,
    affectsCashDrawer: false,
    requiresMember: false,
    isReceivable: false,
  },
  Kredit: {
    requiresTenderAmount: false,
    affectsCashDrawer: false,
    requiresMember: true,
    isReceivable: true,
  },
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export const isCashPayment = (m: PaymentMethod): boolean => m === 'Cash';
export const isQrisPayment = (m: PaymentMethod): boolean => m === 'QRIS';
export const isCreditPayment = (m: PaymentMethod): boolean => m === 'Kredit';
