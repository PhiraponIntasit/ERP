# การทำงานร่วมกัน (2 คน)

> path ในไฟล์นี้นับจากรากของ repo (ไม่มีโฟลเดอร์ `erp/` นำหน้า)

## แบ่งความรับผิดชอบ

### คน A: งานซ่อม และคน/อุปกรณ์

**เมนู:** แจ้งปัญหา, คำร้องของฉัน, ศูนย์มอบหมายงาน, งานที่ได้รับมอบหมาย, ข้อมูลพนักงาน, ทะเบียนทรัพย์สิน, บัญชีผู้ใช้ & สิทธิ์, หน้า Login

**ไฟล์หลัก:**

- `src/app/(app)/tickets/`, `dispatch/`, `work/`, `employees/`, `assets/`, `users/`
- `src/app/login/`
- `src/server/actions/tickets.ts`, `people.ts`, `auth.ts`
- `src/server/uploads.ts`, `src/server/assets.ts`
- `src/app/api/files/`
- `src/components/ticket-bits.tsx`

**งานต่อจากนี้:**

- [ ] หน้าแจ้งปัญหาบนมือถือ ทำตามรูปตัวอย่าง 1–5 (พนักงานส่วนใหญ่แจ้งซ่อมจากมือถือ)
- [ ] ให้ผู้ใช้เปลี่ยนรหัสผ่านเองได้ (ตอนนี้มีแต่ Admin ที่ตั้งรหัสให้ได้)
- [ ] ล็อกบัญชีชั่วคราวเมื่อกรอกรหัสผิดหลายครั้ง และเพิ่มความยาวรหัสผ่านขั้นต่ำ (ตอนนี้ 4 ตัว)

### คน B: คลัง จัดซื้อ และภาพรวม

**เมนู:** คลังสินค้า, ใบขอซื้อ/ใบสั่งซื้อ (PDF), อนุมัติการสั่งซื้อ, แดชบอร์ด, Audit Log

**ไฟล์หลัก:**

- `src/app/(app)/inventory/`, `purchase/`, `approvals/`, `dashboard/`, `audit/`
- `src/server/actions/stock.ts`
- `src/components/procurement.tsx`
- `src/server/queries.ts`, `inventory.ts`, `audit-query.ts`
- `src/app/api/audit/`

**งานต่อจากนี้:**

- [ ] แบ่งหน้าตารางที่ยาว: ประวัติสต็อก และประวัติการพิจารณาใบขอซื้อ
- [ ] ขึ้นระบบจริง (Deploy): Postgres, HTTPS, ที่เก็บรูปพร้อมสำรองข้อมูล, `.env` สำหรับใช้งานจริง

### ทั้งคู่

- [ ] ย้ายเทสต์ Playwright (40 ข้อ) เข้า repo แล้วแต่ละคนดูแลและเพิ่มเทสต์ของเมนูตัวเอง

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
2. ก่อนเปิด PR รัน `npm run lint` (typecheck) และเทสต์ของเมนูตัวเองให้ผ่าน
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
