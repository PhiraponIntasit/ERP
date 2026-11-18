// The shop's own details, printed on receipts and purchase orders.
// Fictitious company for the senior project demo — replace with real registration details before any real use.
export const SHOP = {
  brand: 'COREPICK',
  name: 'บริษัท คอร์พิค จำกัด',
  nameEn: 'Corepick Co., Ltd.',
  addr: '88 ถนนพญาไท แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400',
  taxId: '0000000000000',
  phone: '02-000-0000',
} as const;

/** Carriers offered when an order is shipped. */
export const CARRIERS = ['ไปรษณีย์ไทย (EMS)', 'Kerry Express', 'Flash Express', 'J&T Express', 'ร้านจัดส่งเอง'] as const;

/** VAT 7% already included in `gross`: the part that is tax, and the part before tax. */
export function vatOf(gross: number) {
  const vat = Math.round((gross * 7) / 107 * 100) / 100;
  return { vat, net: Math.round((gross - vat) * 100) / 100 };
}
