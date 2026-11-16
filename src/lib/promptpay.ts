// PromptPay "Thai QR Payment" payload (EMVCo merchant-presented QR, BOT standard) for a fixed amount.
// Any Thai banking app reads it. The shop's demo PromptPay ID is fictitious, so scanning it in a real
// banking app is refused — nobody can transfer real money to the demo.

const tlv = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as 4 upper-case hex digits — field 63 of the payload. */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (const b of Buffer.from(s, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** `id`: a mobile number (10 digits, 0…) or a national/tax ID (13 digits). `amount` in baht, > 0. */
export function promptPayPayload(id: string, amount: number): string {
  const digits = id.replace(/\D/g, '');
  let account: string;
  if (digits.length === 10 && digits.startsWith('0')) account = tlv('01', '0066' + digits.slice(1));
  else if (digits.length === 13) account = tlv('02', digits);
  else throw new Error('PromptPay ID must be a 10-digit mobile number or a 13-digit ID');
  if (!(amount > 0) || amount > 9_999_999.99) throw new Error('amount out of range');
  const body =
    tlv('00', '01') +
    tlv('01', '12') +                                       // 12 = dynamic QR, one payment
    tlv('29', tlv('00', 'A000000677010111') + account) +    // PromptPay credit transfer
    tlv('53', '764') +                                      // THB
    tlv('54', amount.toFixed(2)) +
    tlv('58', 'TH') +
    '6304';
  return body + crc16(body);
}

/** Reads back the amount and checks the CRC — used by tests and as a self-check before showing a QR. */
export function parsePromptPay(payload: string): { amount: number; account: string } | null {
  if (payload.length < 8 || crc16(payload.slice(0, -4)) !== payload.slice(-4)) return null;
  const fields = new Map<string, string>();
  for (let i = 0; i < payload.length - 4;) {
    const id = payload.slice(i, i + 2), len = Number(payload.slice(i + 2, i + 4));
    fields.set(id, payload.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  const acc = fields.get('29') ?? '';
  return { amount: Number(fields.get('54')), account: acc.slice(acc.indexOf('A000000677010111') + 16 + 4) };
}
