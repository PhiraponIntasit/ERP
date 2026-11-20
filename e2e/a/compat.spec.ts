import { test, expect } from '@playwright/test';
import { checkBuild, estimateWatts, issuesIfChosen, missingSlots, recommendedPsu, type Build, type Part } from '../../src/lib/compat';

// PC builder rules in src/lib/compat.ts — pure functions, no browser. Specs mirror the seed products.

const p = (sku: string, specs: Part['specs']): Part => ({ sku, name: sku, specs });
const R5 = p('CPU-R5-7600', { socket: 'AM5', tdpW: 65, igpu: 'มี' });
const I5F = p('CPU-I5-14400F', { socket: 'LGA1700', tdpW: 65, igpu: 'ไม่มี' });
const I7K = p('CPU-I7-14700K', { socket: 'LGA1700', tdpW: 125, igpu: 'มี' });
const B650M = p('MB-MSI-B650M', { socket: 'AM5', ramType: 'DDR5', formFactor: 'mATX', m2Slots: 2 });
const B650 = p('MB-TUF-B650', { socket: 'AM5', ramType: 'DDR5', formFactor: 'ATX', m2Slots: 3 });
const B760D4 = p('MB-GB-B760M', { socket: 'LGA1700', ramType: 'DDR4', formFactor: 'mATX', m2Slots: 2 });
const DDR5 = p('RAM-KF-32D5', { ramType: 'DDR5', capacityGB: 32 });
const DDR4 = p('RAM-CR-16D4', { ramType: 'DDR4', capacityGB: 16 });
const SODIMM = p('RAM-16D5', { ramType: 'DDR5', module: 'SODIMM' });
const SSD = p('SSD-WD-SN850X', { interface: 'NVMe PCIe 4.0' });
const PSU650 = p('PSU-CM-650B', { wattage: 650 });
const PSU850 = p('PSU-SS-GX850', { wattage: 850 });
const SMALL = p('CASE-CM-Q300L', { formFactors: ['mATX', 'ITX'], maxGpuLengthMm: 360 });
const BIG = p('CASE-MT-903', { formFactors: ['E-ATX', 'ATX', 'mATX', 'ITX'], maxGpuLengthMm: 400 });
const RTX4060 = p('VGA-GB-4060', { tdpW: 115, lengthMm: 192 });
const RX7800 = p('VGA-SAP-7800XT', { tdpW: 263, lengthMm: 280 });
const AK400 = p('COOL-DC-AK400', { sockets: ['AM5', 'AM4', 'LGA1700'], maxTdpW: 220 });

const errors = (b: Build) => checkBuild(b).filter(i => i.level === 'error').map(i => i.text);
const warns = (b: Build) => checkBuild(b).filter(i => i.level === 'warn').map(i => i.text);

test('a sensible AM5 build has no problems', () => {
  const b: Build = { cpu: R5, mainboard: B650M, ram: DDR5, vga: RTX4060, ssd: SSD, psu: PSU650, case: SMALL, cooler: AK400 };
  expect(checkBuild(b)).toEqual([]);
  expect(missingSlots(b)).toEqual([]);
});

test('socket, RAM type, notebook RAM, board size and card length mismatches are errors', () => {
  expect(errors({ cpu: I5F, mainboard: B650M })).toEqual(['CPU ใช้ Socket LGA1700 แต่เมนบอร์ดเป็น AM5', 'CPU นี้ไม่มีกราฟิกในตัว ต้องเลือกการ์ดจอด้วย ไม่งั้นเครื่องจะไม่มีภาพออกจอ']);
  expect(errors({ mainboard: B760D4, ram: DDR5 })).toEqual(['เมนบอร์ดรองรับแรม DDR4 แต่เลือกแรม DDR5']);
  expect(errors({ ram: SODIMM })).toEqual(['แรมนี้เป็นแบบ SODIMM สำหรับโน้ตบุ๊ก ใช้กับเมนบอร์ดคอมตั้งโต๊ะไม่ได้']);
  expect(errors({ mainboard: B650, case: SMALL })).toEqual(['เมนบอร์ดขนาด ATX ใส่เคสนี้ไม่ได้ (รองรับ mATX, ITX)']);
  expect(errors({ vga: p('LONG', { tdpW: 200, lengthMm: 380 }), case: SMALL })).toEqual(['การ์ดจอยาว 380 mm แต่เคสใส่ได้สูงสุด 360 mm']);
  expect(errors({ cpu: R5, cooler: p('C', { sockets: ['LGA1700'], maxTdpW: 200 }) })).toEqual(['ชุดระบายความร้อนไม่รองรับ Socket AM5 (รองรับ LGA1700)']);
  expect(errors({ mainboard: p('MB0', { m2Slots: 0 }), ssd: SSD })).toEqual(['SSD แบบ NVMe ต้องใช้ช่อง M.2 แต่เมนบอร์ดนี้ไม่มี']);
  expect(errors({ mainboard: B760D4, ram: DDR4, case: BIG, cpu: I7K, vga: RX7800 })).toEqual([]);
});

test('no graphics card is fine only when the CPU has integrated graphics', () => {
  expect(errors({ cpu: R5 })).toEqual([]);
  expect(errors({ cpu: I5F })).toHaveLength(1);
  expect(errors({ cpu: I5F, vga: RTX4060 })).toEqual([]);
  // A CPU without iGPU is still a valid choice — the problem sits on the empty graphics card slot.
  expect(issuesIfChosen({ mainboard: B760D4 }, 'cpu', I5F)).toEqual([]);
  expect(checkBuild({ cpu: I5F })[0].slots).toEqual(['vga']);
});

test('power: estimate, recommendation, too small is an error, tight is a warning', () => {
  const b: Build = { cpu: I7K, vga: RX7800 };
  expect(estimateWatts(b)).toBe(125 + 263 + 100);
  expect(recommendedPsu(b)).toBe(700); // 488 × 1.4 = 683.2 → next 50 W
  expect(errors({ ...b, psu: p('P400', { wattage: 400 }) })).toEqual(['กำลังไฟไม่พอ: ประเมินการใช้ไฟ 488 W แต่พาวเวอร์จ่ายได้ 400 W']);
  expect(warns({ ...b, psu: PSU650, cooler: AK400 })).toEqual(['กำลังไฟเหลือน้อย: แนะนำอย่างน้อย 700 W (ประเมินใช้ 488 W)']);
  expect(checkBuild({ ...b, psu: PSU850, cooler: AK400 })).toEqual([]);
});

test('missing spec data is a warning, never a silent pass; hot CPUs want a cooler', () => {
  expect(warns({ cpu: p('X', {}), mainboard: B650M })).toContain('ตรวจSocketไม่ได้ เพราะสินค้ายังไม่มีข้อมูลสเปค — สอบถามร้านก่อนสั่งซื้อ');
  expect(warns({ cpu: I7K, vga: RTX4060 })).toContain('CPU รุ่นแรงมักไม่มีพัดลมแถมในกล่อง ควรเลือกชุดระบายความร้อนด้วย');
  expect(warns({ cpu: I7K, vga: RTX4060, cooler: p('TINY', { sockets: ['LGA1700'], maxTdpW: 100 }) })).toEqual(['CPU ร้อนสูงสุด 125 W แต่ชุดระบายความร้อนรับได้ 100 W อาจลดความเร็วเมื่อทำงานหนัก']);
});

test('candidates are judged against the rest of the build; errors list first', () => {
  const b: Build = { cpu: R5, case: SMALL };
  expect(issuesIfChosen(b, 'mainboard', B650M)).toEqual([]);
  expect(issuesIfChosen(b, 'mainboard', B650).map(i => i.text)).toEqual(['เมนบอร์ดขนาด ATX ใส่เคสนี้ไม่ได้ (รองรับ mATX, ITX)']);
  expect(issuesIfChosen(b, 'mainboard', B760D4)).toHaveLength(1);
  expect(missingSlots(b)).toEqual(['mainboard', 'ram', 'ssd', 'psu']);
  const levels = checkBuild({ cpu: I7K, mainboard: B650M }).map(i => i.level);
  expect(levels).toEqual([...levels].sort((a, z) => (a === z ? 0 : a === 'error' ? -1 : 1)));
});
