# ขึ้นระบบจริงบน Vercel

| ส่วน | ใช้อะไร | หมายเหตุ |
|---|---|---|
| แอป + HTTPS | Vercel (region `sin1` สิงคโปร์ — ตั้งไว้ใน `vercel.json`) | HTTPS/ใบรับรองออกให้อัตโนมัติ |
| ฐานข้อมูล | Neon Postgres ผ่าน Vercel Marketplace (region `ap-southeast-1`) | มี point-in-time restore + dump รายวันด้วย GitHub Actions |
| รูปแจ้งซ่อม | Vercel Blob แบบ **Private** | ดูรูปได้เฉพาะผ่าน `/api/files/[id]` ที่เช็กสิทธิ์ |

> ⚠️ Vercel แพ็กเกจ Hobby (ฟรี) ใช้ได้เฉพาะงานส่วนตัว/ไม่เชิงพาณิชย์ — ระบบของบริษัทต้องใช้ **Pro**

## 1. สร้างโปรเจกต์

1. Vercel → **Add New → Project** → Import repo `PhiraponIntasit/ERP` (คนที่ import ต้องมีสิทธิ์เข้า repo นี้บน GitHub)
2. Framework: Next.js (ตรวจเจอเอง) — ไม่ต้องตั้ง Build Command เพราะ Vercel ใช้สคริปต์ `vercel-build` ใน `package.json` อัตโนมัติ
3. ยังไม่ต้องกด Deploy จนกว่าจะตั้งข้อ 2–4 เสร็จ (ถ้ากดไปแล้ว build แรกจะพังเพราะยังไม่มี DB — ไม่เป็นไร)

## 2. ฐานข้อมูล

1. Project → **Storage → Create Database → Neon** → region **Singapore (ap-southeast-1)**
2. Connect เข้ากับโปรเจกต์ โดยเลือก environment **Production** เท่านั้น
   (อย่าให้ Preview ใช้ DB จริง — ถ้าต้องการ DB สำหรับ Preview ให้เปิดตัวเลือก Neon branch ต่อ preview)
3. Vercel จะสร้าง `DATABASE_URL` (pooled) และ `DATABASE_URL_UNPOOLED` (direct) ให้เอง
4. แก้ `DATABASE_URL` ต่อท้ายด้วย `&pgbouncer=true&connection_limit=5` (Prisma ต้องใช้เมื่อผ่าน connection pooler)

ตอน deploy production สคริปต์ `scripts/vercel-build.sh` จะรัน `prisma migrate deploy` ผ่าน `DATABASE_URL_UNPOOLED` ให้อัตโนมัติ — Preview deploy จะไม่แตะฐานข้อมูล

## 3. ที่เก็บรูป

1. Project → **Storage → Create → Blob** → access **Private**, region ใกล้สุด (Singapore)
2. Connect เข้ากับ Production → ได้ `BLOB_READ_WRITE_TOKEN` อัตโนมัติ

เมื่อมี token นี้ `src/server/uploads.ts` จะเก็บรูปใน Blob (`tickets/<ชื่อสุ่ม>.jpg`) แทนดิสก์ — ในเครื่อง dev ที่ไม่มี token ยังเก็บใน `UPLOAD_DIR` เหมือนเดิม

## 4. Environment Variables

Project → Settings → Environment Variables (Production) — ดูรายการเต็มที่ `.env.production.example`

| ตัวแปร | ค่า |
|---|---|
| `SHOW_DEMO_ACCOUNTS` | `false` (ต้องเป็น false เสมอ) |
| `DISPLAY_TZ` | `Asia/Bangkok` |
| `APPROVAL_LIMIT`, `REORDER_FACTOR`, `DEFAULT_THEME` | ตามนโยบายบริษัท |

ไม่ต้องตั้ง `COOKIE_SECURE` และ `UPLOAD_DIR`

## 5. Deploy + สร้าง Admin คนแรก

1. กด **Deploy** (หรือ Redeploy) → migration รันอัตโนมัติ
2. **ห้ามรัน `npm run db:seed` กับฐานข้อมูลจริง** (ข้อมูลตัวอย่าง + รหัส 1234) ให้รัน bootstrap แทน จากเครื่องตัวเอง:
   ```bash
   npx vercel link && npx vercel env pull .env.production.local --environment=production
   # เอา DATABASE_URL_UNPOOLED จากไฟล์นั้นมาใช้
   DATABASE_URL="<DATABASE_URL_UNPOOLED>" ADMIN_USERNAME=admin ADMIN_NAME="ชื่อ นามสกุล" \
     ADMIN_PASSWORD='รหัสยาวอย่างน้อย 12 ตัว' npm run db:bootstrap
   rm .env.production.local
   ```
   สคริปต์จะตั้งเลขเอกสารเริ่มต้น (TCK-1001, PR-ปี-0001, EMP-0001) และสร้าง Admin 1 คน — รันซ้ำได้ ไม่ทับข้อมูลที่มีอยู่
3. เข้าระบบด้วย Admin แล้วสร้างพนักงาน/ผู้ใช้คนอื่นจากเมนู "บัญชีผู้ใช้ & สิทธิ์"

## 6. โดเมน

Project → Settings → **Domains** → เพิ่มโดเมนบริษัท แล้วตั้ง DNS ตามที่ Vercel บอก — HTTPS ออกให้เอง

## 7. สำรองข้อมูล

**ฐานข้อมูล**
- Neon มี point-in-time restore ในตัว (ระยะย้อนหลังขึ้นกับแพ็กเกจ)
- `.github/workflows/db-backup.yml` dump ทุกคืน 02:00 เข้ารหัสด้วย GPG เก็บเป็น artifact 30 วัน
  ตั้ง repo secrets: `PROD_DATABASE_URL_UNPOOLED`, `BACKUP_PASSPHRASE` (เก็บ passphrase ไว้ที่ปลอดภัยนอก GitHub ด้วย)
  แล้วกด Actions → db-backup → **Run workflow** ทดสอบ 1 ครั้ง
- กู้คืน:
  ```bash
  gpg -d erp-YYYYMMDD-HHMM.dump.gpg > erp.dump
  pg_restore --clean --if-exists --no-owner -d "<DATABASE_URL_UNPOOLED>" erp.dump
  ```
  ⚠️ ตาราง `AuditLog` มี trigger ห้ามลบ — กู้ลงฐานข้อมูลใหม่ที่ว่างเปล่า (สร้าง Neon branch/DB ใหม่) แล้วสลับ `DATABASE_URL` จะง่ายกว่ากู้ทับ

**รูป**
- Vercel Blob เก็บแบบ durable อยู่แล้ว สำรองไว้กันลบผิด/ย้ายผู้ให้บริการ:
  ```bash
  BLOB_READ_WRITE_TOKEN=... npm run backup:photos -- /path/to/backup/photos
  ```
  ดึงเฉพาะรูปใหม่ (incremental) — ตั้งให้รันทุกวันบนเครื่องในออฟฟิศหรือ NAS ได้

## Checklist ก่อนเปิดใช้งาน

- [ ] `SHOW_DEMO_ACCOUNTS=false` และไม่ได้ seed ข้อมูลตัวอย่าง
- [ ] Preview environment ไม่ได้ต่อกับ DB/Blob ของ production
- [ ] ล็อกบัญชีเมื่อใส่รหัสผิดซ้ำ + รหัสผ่านขั้นต่ำ (งานของคน A) merge แล้ว
- [ ] ทดสอบแจ้งซ่อมพร้อมรูปบนมือถือ แล้วเปิดดูรูปจากบัญชีช่างได้
- [ ] รัน db-backup 1 ครั้ง และลองกู้คืนลง DB ทดสอบสำเร็จ
