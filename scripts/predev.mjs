// Runs before `npm run dev` (package.json "predev").
// 1. Regenerates the Prisma client, so pulling a branch that changed prisma/schema.prisma never leaves the
//    app reading new columns through an old client (e.g. "Cannot read properties of undefined (reading 'toNumber')").
// 2. Warns — without stopping the dev server — when the local database is missing migrations.
import { spawnSync } from 'node:child_process';

const run = (cmd, timeout) => spawnSync(cmd, { shell: true, encoding: 'utf8', timeout, env: process.env });
const yellow = s => `\x1b[33m${s}\x1b[0m`;

const gen = run('npx prisma generate', 120_000);
if (gen.status !== 0) {
  process.stderr.write(gen.stdout + gen.stderr);
  console.error('prisma generate ล้มเหลว — ถ้าขึ้น EPERM (Windows) ให้ปิด npm run dev ที่เปิดค้างไว้ก่อน · ถ้าไม่ใช่ ตรวจ prisma/schema.prisma หรือรัน npm install แล้วลองใหม่');
  process.exit(1);
}
console.log('✔ Prisma client ตรงกับ prisma/schema.prisma');

const st = run('npx prisma migrate status', 20_000);
const out = `${st.stdout ?? ''}${st.stderr ?? ''}`;
if (/not yet been applied/i.test(out)) {
  const pending = out.split('\n').filter(l => /^\d{14}_/.test(l.trim())).map(l => l.trim());
  console.warn(yellow(`⚠ ฐานข้อมูลในเครื่องยังไม่ได้อัปเดต — ค้าง ${pending.length || 'บาง'} migration${pending.length ? ': ' + pending.join(', ') : ''}`));
  console.warn(yellow('  รัน  npx prisma migrate deploy  (เก็บข้อมูลเดิม)  หรือ  npx prisma migrate reset --force  (ล้างแล้วใส่ข้อมูลตัวอย่างใหม่)'));
} else if (/up to date/i.test(out)) {
  console.log('✔ ฐานข้อมูลเป็นเวอร์ชันล่าสุด');
} else {
  console.warn(yellow('⚠ ตรวจสถานะฐานข้อมูลไม่ได้ (ตั้ง DATABASE_URL ใน .env และเปิด PostgreSQL หรือยัง?) — เริ่ม dev server ต่อ'));
}
