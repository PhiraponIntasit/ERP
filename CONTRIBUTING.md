# การทำงานร่วมกัน (2 คน)

> path ในไฟล์นี้นับจากรากของ repo (ไม่มีโฟลเดอร์ `erp/` นำหน้า)

## แบ่งความรับผิดชอบ

### คน A: งานซ่อม และคน/อุปกรณ์

**เมนู:** ~~แจ้งปัญหา, คำร้องของฉัน, ศูนย์มอบหมายงาน, งานที่ได้รับมอบหมาย~~ (ปิดแล้ว — งานช่างย้ายไปอยู่ในระบบเคลม), ข้อมูลพนักงาน, ทะเบียนทรัพย์สิน, บัญชีผู้ใช้ & สิทธิ์, หน้า Login, ลืม/เปลี่ยนรหัสผ่าน, อีเมลแจ้งเตือน

**ไฟล์หลัก:**

- `src/app/(app)/users/` (หน้า `tickets/`, `dispatch/`, `work/` ถูกลบเมื่อปิดระบบแจ้งซ่อม)
- `src/app/login/`, `src/app/forgot-password/`, `src/app/reset-password/`
- `src/server/actions/people.ts`, `auth.ts`, `password-reset.ts`
- `src/server/uploads.ts`, `password-reset.ts`, `mail.ts`
- `src/lib/password.ts` — กฎความยาวรหัสผ่าน
- `src/app/api/zxing-reader/`
- `src/components/change-password.tsx`, `category-icons.tsx`, `barcode-scanner.tsx`
- `e2e/a/`

**เสร็จแล้ว:**

- [x] ให้ผู้ใช้เปลี่ยนรหัสผ่านเองได้ (#5)
- [x] รหัสผ่านอย่างน้อย 8 ตัวอักษร (#6)
- [x] ลืมรหัสผ่าน: ส่งลิงก์ตั้งรหัสใหม่ทางอีเมล (#13) — ตกลงใช้แทนการล็อกบัญชีเมื่อกรอกรหัสผิด
- [x] หน้าแจ้งปัญหาบนมือถือ (#16)
- [x] สแกนบาร์โค้ด / QR ของ Asset Tag ในหน้าแจ้งปัญหา (#18)
- [x] หน้างานที่ได้รับมอบหมายบนมือถือ: ตัวกรอง, ปุ่มโทร, ปุ่มสถานะ, เบิกอะไหล่แบบ −/+ (#19)
- [x] อีเมลแจ้งเตือนตามขั้นตอนงานซ่อม (#20)
- [x] ศูนย์มอบหมายงานบนมือถือ (#22)
- [x] พนักงาน / ทรัพย์สิน / ผู้ใช้บนมือถือ: ตารางเป็นการ์ด (#23)
- [x] ปุ่มสแกนในหน้าทะเบียนทรัพย์สิน + ลิงก์ `/assets?tag=…` สำหรับ QR สติกเกอร์ (#24) และตอนส่งมอบอุปกรณ์ (#26)
- [x] ล็อกอินแล้วกลับไปหน้าเดิม (#25) — เพิ่มเมนูใหม่ต้องเพิ่ม path ใน `matcher` ของ `src/proxy.ts`
- [x] ให้กฎตรงกันทุกเมนู (#26): มอบหมายงานได้เฉพาะช่างที่รับงานได้จริง (`src/server/assignable.ts`), เตือนงานค้างเมื่อระงับ/ถอดสิทธิ์ช่าง, กฎ Asset Tag เดียวกัน, ห้ามเบิกอะไหล่หลังแจ้งซ่อมเสร็จ
- [x] ตอนแจ้งปัญหา ตรวจ Asset Tag กับทะเบียนจริง: แสดงประเภท · รุ่น / เตือนถ้าไม่พบ (#27)
- [x] ให้ช่างแนบรูปตอนอัปเดตงาน (#28) — `TicketImage.kind` (`report` / `work`) และ `eventId` ผูกรูปกับประวัติ

**งานต่อจากนี้:** ยังไม่มี — เพิ่มไอเดียใหม่ไว้ที่นี่

### คน B: คลัง จัดซื้อ และภาพรวม

**เมนู:** คลังสินค้า, ใบขอซื้อ/ใบสั่งซื้อ (PDF), อนุมัติการสั่งซื้อ, แดชบอร์ด, Audit Log

**ไฟล์หลัก:**

- `src/app/(app)/inventory/`, `purchase/`, `approvals/`, `dashboard/`, `audit/`
- `src/server/actions/stock.ts`
- `src/components/procurement.tsx`
- `src/server/queries.ts`, `inventory.ts`, `audit-query.ts`
- `src/app/api/audit/`

**งานต่อจากนี้:**

- [x] แบ่งหน้าตารางที่ยาว: ประวัติสต็อก และประวัติการพิจารณาใบขอซื้อ (#2)
- [x] ขึ้นระบบจริง (Deploy): Postgres, HTTPS, ที่เก็บรูปพร้อมสำรองข้อมูล, `.env` สำหรับใช้งานจริง (#3)

### ทั้งคู่

- [x] ย้ายเทสต์ Playwright เข้า repo แล้วแต่ละคนดูแลและเพิ่มเทสต์ของเมนูตัวเอง (#4, #11)

## ไฟล์ส่วนกลาง (ต้องบอกอีกคนก่อนแก้)

- `src/lib/domain.ts` — บทบาท สิทธิ์ สถานะ กฎอนุมัติ
- `prisma/schema.prisma` และ `prisma/migrations/`
- `prisma/seed.ts`
- `src/app/globals.css`, `src/app/classical.css`
- `src/components/shell.tsx`, `dialog.tsx`, `use-action.ts`
- `src/server/views.ts`
- `package.json`, `package-lock.json`

กติกา:

1. แก้เป็น **PR เล็ก ๆ แยกต่างหาก** (ไม่ปนกับงานฟีเจอร์) แล้วรีวิว/merge ให้เร็ว เพื่อไม่ให้อีกคนต้องแก้ conflict
2. งานฟีเจอร์ที่ต้องพึ่งการแก้ไฟล์ส่วนกลาง ให้ merge PR ส่วนกลางก่อน แล้ว `git merge origin/main` เข้า branch ตัวเอง

### การแก้ฐานข้อมูล

- สร้าง migration ใหม่ **ทีละคน** และ `git pull origin main` ก่อนสร้างทุกครั้ง
  ```bash
  git pull origin main
  npx prisma migrate dev --name <ชื่อสั้น ๆ>
  ```
- **ห้ามแก้ไฟล์ migration ที่ merge ไปแล้ว** ถ้าต้องเปลี่ยน ให้สร้าง migration ใหม่
- ถ้าเพิ่มตาราง/คอลัมน์ที่ต้องมีข้อมูลตัวอย่าง ให้อัปเดต `prisma/seed.ts` ใน PR เดียวกัน

## ขั้นตอนทำงาน

1. ทำบน branch ของตัวเอง ตั้งชื่อขึ้นต้นด้วย `a/` หรือ `b/` เช่น `a/mobile-ticket`, `b/pagination`
2. ก่อนเปิด PR รัน `npm run lint` (typecheck) และ `npm run test:e2e` ให้ผ่าน (GitHub Actions รันชุดเทสต์ให้ทุก PR ด้วย)
3. เปิด PR เข้า `main` แล้ว **ให้อีกคนรีวิวก่อน merge**
4. ลบ branch หลัง merge แล้วเริ่มงานถัดไปจาก `main` ล่าสุด

## ฐานข้อมูลในเครื่อง

แต่ละคนใช้ Postgres ในเครื่องตัวเอง และใช้ข้อมูลตัวอย่างชุดเดียวกัน:

```bash
cp .env.example .env      # ตั้ง DATABASE_URL ไปที่ Postgres ในเครื่อง
npm install
npm run db:migrate
npm run db:seed           # บัญชีตัวอย่างใช้รหัส 1234
```

เมื่อ pull แล้วมี migration ใหม่: รัน `npm run db:migrate` หรือถ้าข้อมูลเพี้ยนให้ `npm run db:reset` (ลบข้อมูลทั้งหมดแล้ว seed ใหม่ — ใช้กับ DB ในเครื่องเท่านั้น)

## เทสต์ (Playwright)

```
e2e/
  helpers.ts        loginAs(), USERS (บัญชีตัวอย่าง), db (Prisma สำหรับเตรียมข้อมูล), pager()
  a/                เทสต์ของคน A — *.mobile.spec.ts รันบนจอมือถือ (Pixel 7)
  b/                เทสต์ของคน B
```

```bash
npx playwright install chromium   # ครั้งแรกครั้งเดียว
npm run test:e2e:fresh            # ล้าง DB ในเครื่อง + seed ใหม่ แล้วรันทั้งหมด (ลบข้อมูลทั้งหมด — ใช้กับ DB ในเครื่องเท่านั้น)
npm run test:e2e                  # รันซ้ำโดยไม่ล้าง DB
npx playwright test e2e/b         # รันเฉพาะของตัวเอง
npx playwright test --ui          # โหมดดูทีละขั้น
```

กติกา:
- เทสต์เริ่มจากข้อมูล seed เสมอ ถ้าเทสต์สร้างข้อมูลเพิ่มผ่าน `db` ให้ใส่ prefix เฉพาะ แล้วลบทิ้งใน `afterAll`
- แต่ละคนแก้/เพิ่มเทสต์ในโฟลเดอร์ของตัวเอง ส่วน `helpers.ts` และ `playwright.config.ts` เป็นไฟล์ส่วนกลาง
- ห้าม skip หรือปิดเทสต์ที่พังเพื่อให้ผ่าน — แก้สาเหตุ
