# ขึ้นระบบจริงบน Vercel

| ส่วน | ใช้อะไร | หมายเหตุ |
|---|---|---|
| แอป + HTTPS | Vercel (region `sin1` สิงคโปร์ — ตั้งไว้ใน `vercel.json`) | HTTPS/ใบรับรองออกให้อัตโนมัติ |
| ฐานข้อมูล | Neon Postgres ผ่าน Vercel Marketplace (region `ap-southeast-1`) | มี point-in-time restore + dump รายวันด้วย GitHub Actions |
| รูปเคลมสินค้า | Vercel Blob แบบ **Private** | ดูรูปได้เฉพาะผ่าน `/api/claims/images/[id]` ที่เช็กสิทธิ์ (พนักงานที่มีเมนูเคลม หรือลูกค้าเจ้าของเคลม) |

> แพ็กเกจที่ใช้: **Vercel Hobby (ฟรี) + Neon Free** — โปรเจกต์จบ (ไม่เชิงพาณิชย์) ใช้แพ็กเกจฟรีได้
> ถ้าวันหนึ่งบริษัทจะใช้งานจริง ต้องอัปเกรดเป็น Vercel Pro (Hobby ห้ามใช้เชิงพาณิชย์)
>
> ข้อจำกัดของ Hobby: โปรเจกต์บน Vercel มีสมาชิกได้คนเดียว — ให้ **เจ้าของ repo (PhiraponIntasit) เป็นคน Import**
> แล้วคนอื่นทำงานผ่าน GitHub ตามปกติ (push → เปิด PR → merge เข้า `main` → Vercel deploy ให้เอง)
> ถ้า deploy ค้างเพราะ commit มาจากคนอื่น ให้เจ้าของโปรเจกต์กด Redeploy ในหน้า Vercel

## 1. สร้างโปรเจกต์

1. Vercel → **Add New → Project** → Import repo `PhiraponIntasit/ERP` (คนที่ import ต้องมีสิทธิ์เข้า repo นี้บน GitHub)
2. Framework: Next.js (ตรวจเจอเอง) — ไม่ต้องตั้ง Build Command เพราะ Vercel ใช้สคริปต์ `vercel-build` ใน `package.json` อัตโนมัติ
3. ยังไม่ต้องกด Deploy จนกว่าจะตั้งข้อ 2–4 เสร็จ (ถ้ากดไปแล้ว build แรกจะพังเพราะยังไม่มี DB — ไม่เป็นไร)

## 2. ฐานข้อมูล

1. Project → **Storage → Create Database → Neon** → region **Singapore (ap-southeast-1)**
2. Connect เข้ากับโปรเจกต์ โดยเลือก environment **Production** เท่านั้น
   (อย่าให้ Preview ใช้ DB จริง — ถ้าต้องการ DB สำหรับ Preview ให้เปิดตัวเลือก Neon branch ต่อ preview)
3. Vercel จะสร้าง `DATABASE_URL` (pooled) และ `DATABASE_URL_UNPOOLED` (direct) ให้เอง
4. ไม่ต้องแก้ `DATABASE_URL` (Vercel ล็อกค่าที่ Neon integration สร้างไว้) — `src/server/db.ts` เติม `pgbouncer=true&connection_limit=5` ให้เองเมื่อเป็น URL แบบ pooled (host มี `-pooler`)

ตอน deploy production สคริปต์ `scripts/vercel-build.sh` จะรัน `prisma migrate deploy` ผ่าน `DATABASE_URL_UNPOOLED` ให้อัตโนมัติ — Preview deploy จะไม่แตะฐานข้อมูล

## 3. ที่เก็บรูป

1. Project → **Storage → Create → Blob** → access **Private**, region ใกล้สุด (Singapore)
2. Connect เข้ากับ Production → ได้ `BLOB_STORE_ID` (store รุ่นใหม่ ยืนยันตัวตนด้วย OIDC ของ Vercel เอง) หรือ `BLOB_READ_WRITE_TOKEN` (store รุ่นเก่า) อัตโนมัติ — โค้ดรองรับทั้งสองแบบ

เมื่อมีตัวแปรตัวใดตัวหนึ่งนี้ `src/server/uploads.ts` จะเก็บรูปใน Blob (`tickets/<ชื่อสุ่ม>.jpg`) แทนดิสก์ — ในเครื่อง dev ที่ไม่มี token ยังเก็บใน `UPLOAD_DIR` เหมือนเดิม

## 4. Environment Variables

Project → Settings → Environment Variables (Production) — ดูรายการเต็มที่ `.env.production.example`

| ตัวแปร | ค่า |
|---|---|
| `SHOW_DEMO_ACCOUNTS` | `true` เฉพาะตอนนำเสนอที่ใช้ข้อมูลตัวอย่าง — ใช้งานจริงต้องเป็น `false` |
| `DISPLAY_TZ` | `Asia/Bangkok` |
| `APPROVAL_LIMIT`, `REORDER_FACTOR`, `DEFAULT_THEME` | ตามนโยบายบริษัท |

ไม่ต้องตั้ง `COOKIE_SECURE` และ `UPLOAD_DIR`

**อีเมลสำหรับ "ลืมรหัสผ่าน"** — ถ้าไม่ตั้ง ปุ่มลืมรหัสผ่านจะส่งอีเมลไม่ได้ (ส่วนอื่นใช้งานได้ปกติ)

| ตัวแปร | ค่า |
|---|---|
| `APP_URL` | URL ของเว็บ เช่น `https://erp-xxx.vercel.app` (หรือโดเมนบริษัทเมื่อผูกแล้ว) — ใช้สร้างลิงก์ในอีเมล |
| `SMTP_HOST` / `SMTP_PORT` | Gmail: `smtp.gmail.com` / `587` · Office 365: `smtp.office365.com` / `587` · Resend: `smtp.resend.com` / `465` |
| `SMTP_USER` / `SMTP_PASS` | บัญชีที่ใช้ส่ง — Gmail ต้องเปิด 2-Step Verification แล้วสร้าง **App password** (ใช้รหัสผ่านปกติไม่ได้) |
| `MAIL_FROM` | ชื่อผู้ส่ง เช่น `IT Products Store <you@gmail.com>` (Gmail ต้องเป็นอีเมลเดียวกับ `SMTP_USER`) |

ครั้งแรกที่ deploy ยังไม่รู้ URL — deploy ไปก่อน แล้วค่อยใส่ `APP_URL` ตาม URL ที่ได้ แล้วกด Redeploy

## 5. Deploy + สร้าง Admin คนแรก

1. กด **Deploy** (หรือ Redeploy) → migration รันอัตโนมัติ
2. เลือกอย่างใดอย่างหนึ่ง:
   - **สำหรับนำเสนอ/สอบโปรเจกต์** — ใส่ข้อมูลตัวอย่างได้ (บัญชีตัวอย่างรหัส 1234) และตั้ง `SHOW_DEMO_ACCOUNTS=true` ให้กรรมการกดเข้าแต่ละบทบาทได้ทันที:
     ```bash
     DATABASE_URL="<DATABASE_URL_UNPOOLED>" npm run db:seed
     ```
     seed ใช้กับฐานข้อมูลว่างเท่านั้น และวันที่ในข้อมูลตัวอย่างนับจากวันที่ seed — ถ้าอยากให้ SLA/กราฟ 7 วันดูสดตอนสอบ ให้สร้าง Neon branch ใหม่ (หรือ DB ใหม่) แล้ว migrate + seed ก่อนวันนำเสนอ 1–2 วัน
   - **สำหรับใช้งานจริง** — **ห้าม seed** ให้รัน bootstrap แทน จากเครื่องตัวเอง:
   ```bash
   npx vercel link && npx vercel env pull .env.production.local --environment=production
   # เอา DATABASE_URL_UNPOOLED จากไฟล์นั้นมาใช้
   DATABASE_URL="<DATABASE_URL_UNPOOLED>" ADMIN_USERNAME=admin ADMIN_NAME="ชื่อ นามสกุล" \
     ADMIN_PASSWORD='รหัสยาวอย่างน้อย 12 ตัว' npm run db:bootstrap
   rm .env.production.local
   ```
   สคริปต์จะตั้งเลขเอกสารเริ่มต้น (TCK-1001, PR-ปี-0001, ORD-ปี-000001) และสร้าง Admin 1 คน — รันซ้ำได้ ไม่ทับข้อมูลที่มีอยู่
   แล้วเตรียมข้อมูลร้าน (หมวดสินค้า 13 หมวด ยี่ห้อ 25 ยี่ห้อ และจัดสินค้าที่มีอยู่เข้าหมวดตามกลุ่มเดิม) — ไม่มีข้อมูลตัวอย่าง ไม่ลบ/ไม่ทับอะไร รันซ้ำได้:
   ```bash
   DATABASE_URL="<DATABASE_URL_UNPOOLED>" npm run db:bootstrap:store
   ```
   สคริปต์ไม่สร้างผู้ขาย ลูกค้า หรือคูปอง — ผู้ขายเป็นบริษัทจริงที่มีเลขผู้เสียภาษีจริง ให้เพิ่มเองที่ ใบขอซื้อ → **ผู้ขาย** (ต้องมีอย่างน้อย 1 รายก่อนสร้างใบขอซื้อได้)
   และสินค้าจะยังซ่อนจากหน้าร้านจนกว่าจะตั้งราคาขาย ยี่ห้อ แล้วกด **เปิดขาย** ในหน้าสินค้า
3. เข้าระบบด้วย Admin แล้วสร้างพนักงาน/ผู้ใช้คนอื่นจากเมนู "บัญชีผู้ใช้ & สิทธิ์"

**อัปเกรดระบบเดิมที่มีข้อมูลอยู่แล้ว** (deploy ทับ production เดิม): สำรองฐานข้อมูลก่อนเสมอ (หัวข้อ 7) — migration ชุดหน้าร้าน
ย้ายอีเมล/เบอร์/แผนกจากทะเบียนพนักงานเข้าบัญชีผู้ใช้ แล้ว**ลบทะเบียนพนักงานและทรัพย์สินไอทีทิ้ง** (ตัดออกจากขอบเขตตามที่ตกลง)
ผู้ใช้ งานซ่อม ใบขอซื้อ สต็อก และ Audit Log อยู่ครบ หลัง deploy ให้รัน `npm run db:bootstrap:store` ตามขั้นบน

## 6. โดเมน

Project → Settings → **Domains** → เพิ่มโดเมนบริษัท แล้วตั้ง DNS ตามที่ Vercel บอก — HTTPS ออกให้เอง

## 7. สำรองข้อมูล

**ฐานข้อมูล**
- Neon มี point-in-time restore ในตัว (ระยะย้อนหลังขึ้นกับแพ็กเกจ)
- `.github/workflows/db-backup.yml` dump ทุกคืน 02:00 เข้ารหัสด้วย GPG เก็บเป็น artifact 30 วัน
  ตั้ง repo secrets: `PROD_DATABASE_URL_UNPOOLED`, `BACKUP_PASSPHRASE` (เก็บ passphrase ไว้ที่ปลอดภัยนอก GitHub ด้วย)
  แล้วกด Actions → db-backup → **Run workflow** ทดสอบ 1 ครั้ง
- ทุกไฟล์ที่ dump ได้จะถูก**กู้ลงฐานข้อมูลชั่วคราวและตรวจก่อนเก็บ** (`scripts/verify-backup.sh`): มี migration ครบ นับแถวตารางหลัก
  และตรวจกฎเงิน/สต็อกใน `scripts/integrity.sql` (ยอดจอง = ออเดอร์รอจ่าย, ออเดอร์ที่รับเงินมี Payment ตรงยอด 1 รายการ,
  Serial บนชั้น = สต็อก + ของที่จ่ายแล้วรอส่ง, สิทธิ์คูปอง = ออเดอร์ที่ใช้) — ถ้าข้อใดไม่ผ่าน job จะ fail และไม่เก็บไฟล์
- ตรวจไฟล์สำรองเองบนเครื่องใดก็ได้ที่มี PostgreSQL:
  ```bash
  gpg -d erp-YYYYMMDD-HHMM.dump.gpg > erp.dump
  scripts/verify-backup.sh erp.dump postgresql://postgres:postgres@localhost:5432/postgres
  ```
- ตรวจกฎเดียวกันกับฐานข้อมูลที่ใช้งานอยู่ (อ่านอย่างเดียว): `psql "$DATABASE_URL" -f scripts/integrity.sql` — ไม่มีแถว = ปกติ
- กู้คืน:
  ```bash
  gpg -d erp-YYYYMMDD-HHMM.dump.gpg > erp.dump
  pg_restore --clean --if-exists --no-owner -d "<DATABASE_URL_UNPOOLED>" erp.dump
  ```
  ⚠️ ตาราง `AuditLog` มี trigger ห้ามลบ — กู้ลงฐานข้อมูลใหม่ที่ว่างเปล่า (สร้าง Neon branch/DB ใหม่) แล้วสลับ `DATABASE_URL` จะง่ายกว่ากู้ทับ

**รูป** (รูปเคลม รูปสินค้า และรูปงานซ่อมเดิมอยู่ใต้ prefix เดียวกัน `tickets/` สคริปต์นี้จึงสำรองครบทุกแบบ)
- Vercel Blob เก็บแบบ durable อยู่แล้ว สำรองไว้กันลบผิด/ย้ายผู้ให้บริการ:
  ```bash
  BLOB_READ_WRITE_TOKEN=... npm run backup:photos -- /path/to/backup/photos
  # store แบบ OIDC: npx vercel env pull แล้วใช้ BLOB_STORE_ID + VERCEL_OIDC_TOKEN จากไฟล์นั้นแทน (token ใช้ได้ ~12 ชม.)
  ```
  ดึงเฉพาะรูปใหม่ (incremental) — ตั้งให้รันทุกวันบนเครื่องในออฟฟิศหรือ NAS ได้

## Checklist ก่อนเปิดใช้งานจริง (ไม่ใช่รอบนำเสนอ)

- [ ] ตั้ง `APP_URL` + SMTP แล้ว และลอง "ลืมรหัสผ่าน" กับบัญชีจริง 1 ครั้ง — ได้อีเมล และลิงก์ในอีเมลเปิดเว็บถูกโดเมน

- [ ] `SHOW_DEMO_ACCOUNTS=false` และไม่ได้ seed ข้อมูลตัวอย่าง (ปิดทั้งบัญชีทดลองพนักงานและหน้า `/demo-shop`)
- [ ] ตั้ง `PAYMENT_WEBHOOK_SECRET` และ `CRON_SECRET` (`openssl rand -hex 32`) · ถ้าเปิดให้คนนอกดูเดโม ตั้ง `PAYMENT_DEMO_SIMULATE=false`
- [ ] ระบบชำระเงินยังเป็น**โหมดเดโม** (QR ไปยังรหัสพร้อมเพย์สมมติ) — ขายจริงต้องต่อผู้ให้บริการจริงก่อน (ดู docs/DEMO.md หัวข้อต่อยอด)
- [ ] Preview environment ไม่ได้ต่อกับ DB/Blob ของ production
- [ ] ล็อกบัญชีเมื่อใส่รหัสผิดซ้ำ + รหัสผ่านขั้นต่ำ (งานของคน A) merge แล้ว
- [ ] ทดสอบแจ้งเคลมพร้อมรูปจากมือถือ แล้วเปิดดูรูปจากบัญชีช่างได้
- [ ] รัน db-backup 1 ครั้ง และลองกู้คืนลง DB ทดสอบสำเร็จ
