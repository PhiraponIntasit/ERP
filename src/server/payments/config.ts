import 'server-only';

// Payment settings. Only the demo provider exists today: it creates a real PromptPay QR for the exact
// amount but to a fictitious PromptPay ID, and a "simulate transfer" button sends the signed webhook a
// real provider would. A real provider (e.g. Opn Payments) can be added behind the same interface later.

export type PaymentMode = 'demo';

export const paymentConfig = {
  mode: (): PaymentMode => 'demo',
  /** The simulate button only exists in demo mode, and can be switched off with PAYMENT_DEMO_SIMULATE=false. */
  canSimulate: () => process.env.PAYMENT_DEMO_SIMULATE !== 'false',
  /** Fictitious by default (13 zeros) so a real banking app refuses it. */
  promptPayId: () => process.env.PROMPTPAY_ID || '0000000000000',
  /** Minutes a customer has to pay before the order expires and its stock is released. */
  payMinutes: () => Math.max(1, Number(process.env.PAYMENT_EXPIRE_MINUTES) || 15),
  /** HMAC key for webhook signatures. Required in production; development falls back to a fixed key. */
  webhookSecret: (): string => {
    const s = process.env.PAYMENT_WEBHOOK_SECRET;
    if (s && s.length >= 16) return s;
    if (process.env.NODE_ENV !== 'production') return 'dev-only-webhook-secret-change-me';
    throw new Error('PAYMENT_WEBHOOK_SECRET (at least 16 characters) is not configured');
  },
};
