// PC builder compatibility rules (person A). Pure functions shared by the builder page, the server actions
// and the tests. Spec keys come from src/lib/specs.ts — a key renamed there must be renamed here.
// Shared file: change it in its own PR.

import type { Specs } from './specs';

/** Builder slots in display order. The slot key is also the product category slug. */
export const SLOTS = [
  { key: 'cpu', label: 'CPU', required: true },
  { key: 'mainboard', label: 'เมนบอร์ด', required: true },
  { key: 'ram', label: 'แรม', required: true },
  { key: 'vga', label: 'การ์ดจอ', required: false },
  { key: 'ssd', label: 'SSD', required: true },
  { key: 'psu', label: 'พาวเวอร์ซัพพลาย', required: true },
  { key: 'case', label: 'เคส', required: true },
  { key: 'cooler', label: 'ชุดระบายความร้อน CPU', required: false },
] as const;
export type Slot = (typeof SLOTS)[number]['key'];
export const isSlot = (s: string | null | undefined): s is Slot => SLOTS.some(x => x.key === s);
export const SLOT_LABEL = Object.fromEntries(SLOTS.map(s => [s.key, s.label])) as Record<Slot, string>;

export type Part = { sku: string; name: string; specs: Specs };
export type Build = Partial<Record<Slot, Part>>;

/** error: the parts don't fit or work together · warn: works, but the customer should know · missing: spec data absent, rule skipped */
export type Issue = { level: 'error' | 'warn'; slots: Slot[]; text: string };

/** Power for everything other than CPU and graphics card: board, RAM, SSD, fans, USB. */
export const BASE_WATTS = 100;
/** Headroom on top of the estimate when recommending a PSU. */
export const PSU_HEADROOM = 1.4;

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const s = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : undefined);

/** Estimated peak draw of the build in watts (CPU TDP + graphics card + BASE_WATTS). */
export function estimateWatts(b: Build) {
  return (n(b.cpu?.specs.tdpW) ?? 0) + (n(b.vga?.specs.tdpW) ?? 0) + BASE_WATTS;
}
/** Smallest PSU, in 50 W steps, that leaves PSU_HEADROOM over the estimate. */
export function recommendedPsu(b: Build) {
  return Math.ceil((estimateWatts(b) * PSU_HEADROOM) / 50) * 50;
}

/** Every compatibility problem in the build, errors first. Rules whose spec data is missing are reported as warnings. */
export function checkBuild(b: Build): Issue[] {
  const out: Issue[] = [];
  const err = (slots: Slot[], text: string) => out.push({ level: 'error', slots, text });
  const warn = (slots: Slot[], text: string) => out.push({ level: 'warn', slots, text });
  const unknown = (slots: Slot[], what: string) => warn(slots, `ตรวจ${what}ไม่ได้ เพราะสินค้ายังไม่มีข้อมูลสเปค — สอบถามร้านก่อนสั่งซื้อ`);
  const { cpu, mainboard: mb, ram, vga, ssd, psu, case: cs, cooler } = b;

  // CPU ↔ mainboard socket
  if (cpu && mb) {
    const a = s(cpu.specs.socket), z = s(mb.specs.socket);
    if (!a || !z) unknown(['cpu', 'mainboard'], 'Socket');
    else if (a !== z) err(['cpu', 'mainboard'], `CPU ใช้ Socket ${a} แต่เมนบอร์ดเป็น ${z}`);
  }
  // RAM ↔ mainboard
  if (ram) {
    if (s(ram.specs.module) === 'SODIMM') err(['ram'], 'แรมนี้เป็นแบบ SODIMM สำหรับโน้ตบุ๊ก ใช้กับเมนบอร์ดคอมตั้งโต๊ะไม่ได้');
    if (mb) {
      const a = s(ram.specs.ramType), z = s(mb.specs.ramType);
      if (!a || !z) unknown(['ram', 'mainboard'], 'ชนิดแรม');
      else if (a !== z) err(['ram', 'mainboard'], `เมนบอร์ดรองรับแรม ${z} แต่เลือกแรม ${a}`);
    }
  }
  // Mainboard ↔ case size
  if (mb && cs) {
    const size = s(mb.specs.formFactor), fits = list(cs.specs.formFactors);
    if (!size || !fits) unknown(['mainboard', 'case'], 'ขนาดเมนบอร์ดกับเคส');
    else if (!fits.includes(size)) err(['mainboard', 'case'], `เมนบอร์ดขนาด ${size} ใส่เคสนี้ไม่ได้ (รองรับ ${fits.join(', ')})`);
  }
  // Graphics card length ↔ case
  if (vga && cs) {
    const len = n(vga.specs.lengthMm), max = n(cs.specs.maxGpuLengthMm);
    if (len == null || max == null) unknown(['vga', 'case'], 'ความยาวการ์ดจอ');
    else if (len > max) err(['vga', 'case'], `การ์ดจอยาว ${len} mm แต่เคสใส่ได้สูงสุด ${max} mm`);
  }
  // No graphics card: the CPU must have integrated graphics. Flagged on the empty vga slot, so the CPU itself still counts as compatible.
  if (cpu && !vga) {
    const ig = s(cpu.specs.igpu);
    if (ig === 'ไม่มี') err(['vga'], 'CPU นี้ไม่มีกราฟิกในตัว ต้องเลือกการ์ดจอด้วย ไม่งั้นเครื่องจะไม่มีภาพออกจอ');
    else if (!ig) unknown(['vga'], 'กราฟิกในตัวของ CPU');
  }
  // Cooler ↔ CPU
  if (cooler && cpu) {
    const sock = s(cpu.specs.socket), ok = list(cooler.specs.sockets);
    if (!sock || !ok) unknown(['cooler', 'cpu'], 'Socket ของชุดระบายความร้อน');
    else if (!ok.includes(sock)) err(['cooler', 'cpu'], `ชุดระบายความร้อนไม่รองรับ Socket ${sock} (รองรับ ${ok.join(', ')})`);
    const tdp = n(cpu.specs.tdpW), max = n(cooler.specs.maxTdpW);
    if (tdp != null && max != null && tdp > max) warn(['cooler', 'cpu'], `CPU ร้อนสูงสุด ${tdp} W แต่ชุดระบายความร้อนรับได้ ${max} W อาจลดความเร็วเมื่อทำงานหนัก`);
  }
  if (cpu && !cooler && (n(cpu.specs.tdpW) ?? 0) > 65) warn(['cooler'], 'CPU รุ่นแรงมักไม่มีพัดลมแถมในกล่อง ควรเลือกชุดระบายความร้อนด้วย');
  // SSD ↔ M.2 slots
  if (ssd && mb && /NVMe/.test(s(ssd.specs.interface) ?? '') && n(mb.specs.m2Slots) === 0) err(['ssd', 'mainboard'], 'SSD แบบ NVMe ต้องใช้ช่อง M.2 แต่เมนบอร์ดนี้ไม่มี');
  // Power
  if (psu) {
    const w = n(psu.specs.wattage);
    if (w == null) unknown(['psu'], 'กำลังไฟ');
    else if (cpu || vga) {
      const est = estimateWatts(b), rec = recommendedPsu(b);
      if (w < est) err(['psu'], `กำลังไฟไม่พอ: ประเมินการใช้ไฟ ${est} W แต่พาวเวอร์จ่ายได้ ${w} W`);
      else if (w < rec) warn(['psu'], `กำลังไฟเหลือน้อย: แนะนำอย่างน้อย ${rec} W (ประเมินใช้ ${est} W)`);
    }
  }
  return out.sort((a, z) => (a.level === z.level ? 0 : a.level === 'error' ? -1 : 1));
}

/** Problems a candidate part would cause if put in `slot`, given the rest of the build. */
export function issuesIfChosen(b: Build, slot: Slot, part: Part): Issue[] {
  return checkBuild({ ...b, [slot]: part }).filter(i => i.level === 'error' && i.slots.includes(slot));
}

/** Required slots still empty. */
export const missingSlots = (b: Build) => SLOTS.filter(x => x.required && !b[x.key]).map(x => x.key);
