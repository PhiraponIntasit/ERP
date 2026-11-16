// Storefront sample data: categories, brands, suppliers and PC parts with the specs the
// filters and the PC builder read. Prices are demo figures (THB, VAT included), not quotes.
import type { Prisma, PrismaClient } from '@prisma/client';

type Specs = Prisma.InputJsonObject;

const CATEGORIES: [string, string][] = [
  ['cpu', 'ซีพียู (CPU)'], ['mainboard', 'เมนบอร์ด'], ['ram', 'แรม (RAM)'], ['vga', 'การ์ดจอ'],
  ['ssd', 'SSD / สตอเรจ'], ['psu', 'พาวเวอร์ซัพพลาย'], ['case', 'เคส'], ['cooler', 'ชุดระบายความร้อน'],
  ['monitor', 'จอภาพ'], ['peripheral', 'คีย์บอร์ด & เมาส์'], ['cable', 'สายและอะแดปเตอร์'],
  ['notebook-parts', 'อะไหล่โน้ตบุ๊ก'], ['consumable', 'วัสดุสิ้นเปลือง'],
];

const BRANDS = [
  'AMD', 'Intel', 'ASUS', 'MSI', 'Gigabyte', 'Kingston', 'Corsair', 'G.Skill', 'Sapphire', 'WD', 'Crucial', 'Samsung',
  'Cooler Master', 'Seasonic', 'Lian Li', 'Montech', 'DeepCool', 'Thermalright', 'NZXT', 'LG', 'Dell', 'Logitech', 'HP', 'Lenovo', 'Generic',
];

const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Existing back-office items: category, brand, selling price and specs. */
const EXISTING: Record<string, [string, string, number, Specs]> = {
  'PWR-065W': ['notebook-parts', 'Dell', 1790, { wattage: 65, connector: 'USB-C' }],
  'RAM-16D5': ['ram', 'Kingston', 2290, { ramType: 'DDR5', capacityGB: 16, module: 'SODIMM' }],
  'SSD-1TB': ['ssd', 'Samsung', 3890, { interface: 'NVMe PCIe 4.0', capacityGB: 1000, formFactor: 'M.2 2280' }],
  'CBL-TB4': ['cable', 'Generic', 1090, { lengthM: 1.8 }],
  'MOU-M720': ['peripheral', 'Logitech', 1390, { connection: 'Bluetooth / USB receiver' }],
  'KB-K380': ['peripheral', 'Logitech', 1490, { connection: 'Bluetooth' }],
  'TON-HP26': ['consumable', 'HP', 3190, { model: '26A' }],
  'BAT-X1': ['notebook-parts', 'Lenovo', 3990, { capacityWh: 57 }],
  'HDMI-2M': ['cable', 'Generic', 290, { lengthM: 2, version: 'HDMI 2.1' }],
  'MON-U27': ['monitor', 'Dell', 14900, { sizeInch: 27, resolution: '3840x2160', refreshHz: 60 }],
};

/** [sku, name, category, brand, unit, qty, min, cost, price, location, specs] */
type New = [string, string, string, string, string, number, number, number, number, string, Specs];
const PRODUCTS: New[] = [
  ['CPU-R5-7600', 'AMD Ryzen 5 7600', 'cpu', 'AMD', 'ชิ้น', 8, 3, 6290, 6990, 'S-01', { socket: 'AM5', cores: 6, threads: 12, tdpW: 65 }],
  ['CPU-R7-7800X3D', 'AMD Ryzen 7 7800X3D', 'cpu', 'AMD', 'ชิ้น', 5, 2, 13900, 14990, 'S-01', { socket: 'AM5', cores: 8, threads: 16, tdpW: 120 }],
  ['CPU-I5-14400F', 'Intel Core i5-14400F', 'cpu', 'Intel', 'ชิ้น', 7, 3, 6190, 6790, 'S-01', { socket: 'LGA1700', cores: 10, threads: 16, tdpW: 65 }],
  ['CPU-I7-14700K', 'Intel Core i7-14700K', 'cpu', 'Intel', 'ชิ้น', 4, 2, 13290, 14290, 'S-01', { socket: 'LGA1700', cores: 20, threads: 28, tdpW: 125 }],
  ['MB-TUF-B650', 'ASUS TUF GAMING B650-PLUS WIFI', 'mainboard', 'ASUS', 'ชิ้น', 5, 2, 6890, 7590, 'S-02', { socket: 'AM5', chipset: 'B650', ramType: 'DDR5', formFactor: 'ATX', m2Slots: 3 }],
  ['MB-MSI-B650M', 'MSI PRO B650M-A WIFI', 'mainboard', 'MSI', 'ชิ้น', 6, 2, 5290, 5790, 'S-02', { socket: 'AM5', chipset: 'B650', ramType: 'DDR5', formFactor: 'mATX', m2Slots: 2 }],
  ['MB-GB-B760M', 'Gigabyte B760M DS3H DDR4', 'mainboard', 'Gigabyte', 'ชิ้น', 6, 2, 3590, 3990, 'S-02', { socket: 'LGA1700', chipset: 'B760', ramType: 'DDR4', formFactor: 'mATX', m2Slots: 2 }],
  ['MB-ASUS-Z790P', 'ASUS PRIME Z790-P', 'mainboard', 'ASUS', 'ชิ้น', 3, 1, 7290, 7990, 'S-02', { socket: 'LGA1700', chipset: 'Z790', ramType: 'DDR5', formFactor: 'ATX', m2Slots: 3 }],
  ['RAM-KF-32D5', 'Kingston FURY Beast 32GB (2x16GB) DDR5-5600', 'ram', 'Kingston', 'ชุด', 10, 4, 3390, 3690, 'S-03', { ramType: 'DDR5', capacityGB: 32, modules: 2, speedMHz: 5600 }],
  ['RAM-GS-32D5', 'G.Skill Trident Z5 RGB 32GB (2x16GB) DDR5-6000', 'ram', 'G.Skill', 'ชุด', 6, 2, 4290, 4690, 'S-03', { ramType: 'DDR5', capacityGB: 32, modules: 2, speedMHz: 6000 }],
  ['RAM-CR-16D4', 'Corsair Vengeance LPX 16GB (2x8GB) DDR4-3200', 'ram', 'Corsair', 'ชุด', 9, 3, 1290, 1490, 'S-03', { ramType: 'DDR4', capacityGB: 16, modules: 2, speedMHz: 3200 }],
  ['VGA-GB-4060', 'GIGABYTE GeForce RTX 4060 WINDFORCE OC 8GB', 'vga', 'Gigabyte', 'ชิ้น', 6, 2, 10290, 10990, 'S-04', { chip: 'RTX 4060', vramGB: 8, tdpW: 115, lengthMm: 192 }],
  ['VGA-ASUS-4070S', 'ASUS DUAL GeForce RTX 4070 SUPER 12GB', 'vga', 'ASUS', 'ชิ้น', 4, 1, 21900, 22990, 'S-04', { chip: 'RTX 4070 SUPER', vramGB: 12, tdpW: 220, lengthMm: 267 }],
  ['VGA-SAP-7800XT', 'Sapphire PULSE Radeon RX 7800 XT 16GB', 'vga', 'Sapphire', 'ชิ้น', 3, 1, 18900, 19990, 'S-04', { chip: 'RX 7800 XT', vramGB: 16, tdpW: 263, lengthMm: 280 }],
  ['SSD-WD-SN850X', 'WD Black SN850X 1TB NVMe', 'ssd', 'WD', 'ชิ้น', 10, 3, 2990, 3290, 'A-02', { interface: 'NVMe PCIe 4.0', capacityGB: 1000, formFactor: 'M.2 2280' }],
  ['SSD-CR-P3P2T', 'Crucial P3 Plus 2TB NVMe', 'ssd', 'Crucial', 'ชิ้น', 7, 2, 4190, 4590, 'A-02', { interface: 'NVMe PCIe 4.0', capacityGB: 2000, formFactor: 'M.2 2280' }],
  ['PSU-CM-650B', 'Cooler Master MWE 650 Bronze V2', 'psu', 'Cooler Master', 'ชิ้น', 6, 2, 1890, 2090, 'S-05', { wattage: 650, efficiency: '80 PLUS Bronze' }],
  ['PSU-CO-RM750E', 'Corsair RM750e 750W', 'psu', 'Corsair', 'ชิ้น', 6, 2, 3490, 3890, 'S-05', { wattage: 750, efficiency: '80 PLUS Gold' }],
  ['PSU-SS-GX850', 'Seasonic FOCUS GX-850', 'psu', 'Seasonic', 'ชิ้น', 3, 1, 4290, 4690, 'S-05', { wattage: 850, efficiency: '80 PLUS Gold' }],
  ['CASE-LL-216', 'Lian Li LANCOOL 216', 'case', 'Lian Li', 'ชิ้น', 4, 1, 3290, 3590, 'คลังใหญ่', { formFactors: ['ATX', 'mATX', 'ITX'], maxGpuLengthMm: 392 }],
  ['CASE-MT-903', 'Montech AIR 903 MAX', 'case', 'Montech', 'ชิ้น', 4, 1, 2590, 2890, 'คลังใหญ่', { formFactors: ['E-ATX', 'ATX', 'mATX', 'ITX'], maxGpuLengthMm: 400 }],
  ['CASE-CM-Q300L', 'Cooler Master MasterBox Q300L', 'case', 'Cooler Master', 'ชิ้น', 5, 2, 1290, 1490, 'คลังใหญ่', { formFactors: ['mATX', 'ITX'], maxGpuLengthMm: 360 }],
  ['COOL-DC-AK400', 'DeepCool AK400', 'cooler', 'DeepCool', 'ชิ้น', 8, 3, 990, 1190, 'S-06', { sockets: ['AM5', 'AM4', 'LGA1700'], maxTdpW: 220 }],
  ['COOL-TR-PA120', 'Thermalright Peerless Assassin 120 SE', 'cooler', 'Thermalright', 'ชิ้น', 6, 2, 1090, 1290, 'S-06', { sockets: ['AM5', 'AM4', 'LGA1700'], maxTdpW: 250 }],
  ['COOL-NZ-K240', 'NZXT Kraken 240 AIO', 'cooler', 'NZXT', 'ชิ้น', 3, 1, 3990, 4390, 'S-06', { sockets: ['AM5', 'AM4', 'LGA1700'], maxTdpW: 250, radiatorMm: 240 }],
  ['MON-LG-27GR75Q', 'LG UltraGear 27GR75Q 27" QHD 165Hz', 'monitor', 'LG', 'เครื่อง', 4, 1, 7990, 8690, 'คลังใหญ่', { sizeInch: 27, resolution: '2560x1440', refreshHz: 165 }],
];

/** [name, tax ID, phone, email] — fictitious distributors for the demo */
export const SUPPLIERS: [string, string, string, string][] = [
  ['บจก. ไอทีซัพพลาย', '0105551234567', '02-111-2233', 'sales@itsupply.example'],
  ['บจก. คอมพาร์ท ดิสทริบิวชั่น', '0105559876543', '02-444-5566', 'order@compart.example'],
  ['หจก. สยามไอทีเทรด', '0103557654321', '02-777-8899', 'po@siamittrade.example'],
];

export async function seedStore(db: PrismaClient, stockedAt: Date, by: string) {
  await db.category.createMany({ data: CATEGORIES.map(([slug, name], sort) => ({ id: 'cat-' + slug, slug, name, sort })) });
  await db.brand.createMany({ data: BRANDS.map(name => ({ id: 'brand-' + slugOf(name), slug: slugOf(name), name })) });
  await db.supplier.createMany({ data: SUPPLIERS.map(([name, taxId, phone, email], i) => ({ id: `sup-${i + 1}`, name, taxId, phone, email })) });

  for (const [sku, [cat, brand, price, specs]] of Object.entries(EXISTING))
    await db.inventoryItem.update({ where: { sku }, data: { price, categoryId: 'cat-' + cat, brandId: 'brand-' + slugOf(brand), specs, slug: slugOf(sku), active: true } });

  await db.inventoryItem.createMany({
    data: PRODUCTS.map(([sku, name, cat, brand, unit, qty, min, cost, price, loc, specs]) => ({
      sku, name, cat: CATEGORIES.find(c => c[0] === cat)![1], unit, qty, min, cost, price, loc, specs,
      categoryId: 'cat-' + cat, brandId: 'brand-' + slugOf(brand), slug: slugOf(sku), active: true, warrantyMonths: 36,
    })),
  });
  await db.stockMove.createMany({ data: PRODUCTS.map(([sku, , , , , qty]) => ({ t: stockedAt, sku, type: 'in', qty, ref: 'ยอดตั้งต้น', by })) });

  // CPUs, graphics cards and mainboards carry a manufacturer warranty per unit, so they are sold by serial
  const tracked = PRODUCTS.filter(p => SERIAL_CATS.includes(p[2]));
  await db.inventoryItem.updateMany({ where: { sku: { in: tracked.map(p => p[0]) } }, data: { serialTracked: true } });
  await db.serialNumber.createMany({
    data: tracked.flatMap(([sku, , , , , qty]) => Array.from({ length: qty }, (_, k) => ({ serial: `${sku}-SN${String(k + 1).padStart(4, '0')}`, sku, receivedRef: 'ยอดตั้งต้น' }))),
  });
}

const SERIAL_CATS = ['cpu', 'vga', 'mainboard'];
