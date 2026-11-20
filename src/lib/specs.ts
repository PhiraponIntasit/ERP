// Spec fields per product category (keyed by Category.slug). The back office edits them,
// and the storefront filters and the PC builder's compatibility rules read the same keys,
// so a key renamed here must be renamed there too. Shared file: change it in its own PR.

export type SpecField =
  | { key: string; label: string; type: 'text'; unit?: string }
  | { key: string; label: string; type: 'number'; unit?: string }
  | { key: string; label: string; type: 'select'; options: readonly string[] }
  | { key: string; label: string; type: 'multi'; options: readonly string[] };

export type Specs = Record<string, string | number | string[]>;

const SOCKETS = ['AM5', 'AM4', 'LGA1851', 'LGA1700'] as const;
const RAM_TYPES = ['DDR5', 'DDR4'] as const;
const BOARD_SIZES = ['E-ATX', 'ATX', 'mATX', 'ITX'] as const;

export const SPEC_FIELDS: Record<string, readonly SpecField[]> = {
  cpu: [
    { key: 'socket', label: 'Socket', type: 'select', options: SOCKETS },
    { key: 'cores', label: 'จำนวนคอร์', type: 'number' },
    { key: 'threads', label: 'จำนวนเธรด', type: 'number' },
    { key: 'tdpW', label: 'TDP', type: 'number', unit: 'W' },
    { key: 'igpu', label: 'กราฟิกในตัว', type: 'select', options: ['มี', 'ไม่มี'] },
  ],
  mainboard: [
    { key: 'socket', label: 'Socket', type: 'select', options: SOCKETS },
    { key: 'chipset', label: 'ชิปเซ็ต', type: 'text' },
    { key: 'ramType', label: 'ชนิดแรม', type: 'select', options: RAM_TYPES },
    { key: 'formFactor', label: 'ขนาดบอร์ด', type: 'select', options: BOARD_SIZES },
    { key: 'm2Slots', label: 'ช่อง M.2', type: 'number' },
  ],
  ram: [
    { key: 'ramType', label: 'ชนิดแรม', type: 'select', options: RAM_TYPES },
    { key: 'module', label: 'รูปแบบ', type: 'select', options: ['DIMM', 'SODIMM'] },
    { key: 'capacityGB', label: 'ความจุรวม', type: 'number', unit: 'GB' },
    { key: 'modules', label: 'จำนวนแถว', type: 'number' },
    { key: 'speedMHz', label: 'ความเร็ว', type: 'number', unit: 'MHz' },
  ],
  vga: [
    { key: 'chip', label: 'ชิปกราฟิก', type: 'text' },
    { key: 'vramGB', label: 'หน่วยความจำ', type: 'number', unit: 'GB' },
    { key: 'tdpW', label: 'กินไฟ', type: 'number', unit: 'W' },
    { key: 'lengthMm', label: 'ความยาวการ์ด', type: 'number', unit: 'mm' },
  ],
  ssd: [
    { key: 'interface', label: 'อินเทอร์เฟซ', type: 'select', options: ['NVMe PCIe 5.0', 'NVMe PCIe 4.0', 'NVMe PCIe 3.0', 'SATA'] },
    { key: 'capacityGB', label: 'ความจุ', type: 'number', unit: 'GB' },
    { key: 'formFactor', label: 'ขนาด', type: 'select', options: ['M.2 2280', '2.5"'] },
  ],
  psu: [
    { key: 'wattage', label: 'กำลังไฟ', type: 'number', unit: 'W' },
    { key: 'efficiency', label: 'มาตรฐาน', type: 'select', options: ['80 PLUS White', '80 PLUS Bronze', '80 PLUS Gold', '80 PLUS Platinum', '80 PLUS Titanium'] },
  ],
  case: [
    { key: 'formFactors', label: 'รองรับบอร์ด', type: 'multi', options: BOARD_SIZES },
    { key: 'maxGpuLengthMm', label: 'ใส่การ์ดจอยาวได้สูงสุด', type: 'number', unit: 'mm' },
  ],
  cooler: [
    { key: 'sockets', label: 'รองรับ Socket', type: 'multi', options: SOCKETS },
    { key: 'maxTdpW', label: 'ระบายความร้อนได้สูงสุด', type: 'number', unit: 'W' },
    { key: 'radiatorMm', label: 'ขนาดหม้อน้ำ (ถ้ามี)', type: 'number', unit: 'mm' },
  ],
  monitor: [
    { key: 'sizeInch', label: 'ขนาดจอ', type: 'number', unit: 'นิ้ว' },
    { key: 'resolution', label: 'ความละเอียด', type: 'text' },
    { key: 'refreshHz', label: 'รีเฟรชเรต', type: 'number', unit: 'Hz' },
  ],
  peripheral: [{ key: 'connection', label: 'การเชื่อมต่อ', type: 'text' }],
  cable: [
    { key: 'lengthM', label: 'ความยาว', type: 'number', unit: 'm' },
    { key: 'version', label: 'มาตรฐาน', type: 'text' },
  ],
  'notebook-parts': [
    { key: 'wattage', label: 'กำลังไฟ', type: 'number', unit: 'W' },
    { key: 'capacityWh', label: 'ความจุแบตเตอรี่', type: 'number', unit: 'Wh' },
    { key: 'connector', label: 'หัวต่อ', type: 'text' },
  ],
  consumable: [{ key: 'model', label: 'รุ่นที่ใช้ได้', type: 'text' }],
};

export const specFieldsFor = (categorySlug: string | null | undefined) => (categorySlug && SPEC_FIELDS[categorySlug]) || [];

/** Turns raw form values into typed specs for the category; unknown keys and blanks are dropped.
 *  Returns the first problem as a Thai message instead of throwing. */
export function parseSpecs(categorySlug: string | null | undefined, raw: Record<string, string | string[] | undefined>): { specs: Specs; error?: string } {
  const specs: Specs = {};
  for (const f of specFieldsFor(categorySlug)) {
    const v = raw[f.key];
    if (f.type === 'multi') {
      const list = (Array.isArray(v) ? v : v ? [v] : []).filter(x => f.options.includes(x));
      if (list.length) specs[f.key] = list;
      continue;
    }
    const s = (Array.isArray(v) ? v[0] : v ?? '').trim();
    if (!s) continue;
    if (f.type === 'number') {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) return { specs, error: `${f.label} ต้องเป็นตัวเลขไม่ติดลบ` };
      specs[f.key] = n;
    } else if (f.type === 'select') {
      if (!f.options.includes(s)) return { specs, error: `${f.label}: ตัวเลือกไม่ถูกต้อง` };
      specs[f.key] = s;
    } else specs[f.key] = s.slice(0, 100);
  }
  return { specs };
}

/** Human-readable value, e.g. "65 W" or "ATX, mATX". */
export function specText(f: SpecField, v: unknown): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  return 'unit' in f && f.unit ? `${v} ${f.unit}` : String(v);
}
