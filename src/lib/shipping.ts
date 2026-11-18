// Shipping fee rules (decided 16 Nov 2026):
//  · Bangkok and its five neighbouring provinces: free
//  · elsewhere: flat ฿150
//  · goods worth ฿2,000 or more after discount (exactly ฿2,000 included): free everywhere
// Computed on the server from the delivery province; the browser only displays it.

export const FREE_SHIPPING_MIN = 2000;
export const UPCOUNTRY_FEE = 150;
export const METRO = ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม'] as const;

/** All 77 provinces, Bangkok first, the rest in Thai alphabetical order. */
export const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท',
  'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม',
  'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
  'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์',
  'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง',
  'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
  'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย',
  'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี',
] as const;

/** "จ.นนทบุรี", "จังหวัด นนทบุรี", "กทม.", "กรุงเทพฯ" → the official name; null if it isn't a Thai province. */
export function provinceOf(raw: string): string | null {
  const p = String(raw ?? '').trim().replace(/^(จังหวัด|จ\.)\s*/, '').replace(/\s+/g, '');
  if (/^(กทม\.?|กรุงเทพ(ฯ|มหานคร)?|bangkok)$/i.test(p)) return 'กรุงเทพมหานคร';
  return (PROVINCES as readonly string[]).includes(p) ? p : null;
}

export const isMetro = (province: string) => (METRO as readonly string[]).includes(provinceOf(province) ?? '');

/** Fee in baht for goods worth `goods` (after discount) delivered to `province`. */
export function shippingFee(province: string, goods: number): number {
  if (goods >= FREE_SHIPPING_MIN) return 0;
  return isMetro(province) ? 0 : UPCOUNTRY_FEE;
}

/** Short reason shown next to the fee. */
export function shippingNote(province: string, goods: number): string {
  if (goods >= FREE_SHIPPING_MIN) return `ส่งฟรี — ยอดสินค้าครบ ฿${FREE_SHIPPING_MIN.toLocaleString('en-US')}`;
  if (isMetro(province)) return 'ส่งฟรี — กรุงเทพฯ และปริมณฑล';
  return `ต่างจังหวัด เหมาจ่าย ฿${UPCOUNTRY_FEE} · ซื้ออีก ฿${(FREE_SHIPPING_MIN - goods).toLocaleString('en-US', { maximumFractionDigits: 2 })} ส่งฟรี`;
}
