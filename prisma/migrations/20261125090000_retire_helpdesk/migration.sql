-- The internal IT helpdesk (แจ้งปัญหา / คำร้องของฉัน / ศูนย์มอบหมายงาน / งานที่ได้รับมอบหมาย) is retired: the shop's
-- after-sales work now runs through customer claims. Old tickets stay in the database as history; nothing is deleted.
-- Matches ROLE_PERMS in src/lib/domain.ts.

-- 1. Nobody keeps the helpdesk menus
UPDATE "User" SET "perms" = array_remove(array_remove(array_remove(array_remove("perms",
  'ticket_new'), 'my_tickets'), 'dispatch'), 'tickets_work');

-- 2. Technicians (IT Support → ช่างเทคนิค, IT Manager → หัวหน้าช่าง) work on claims, look up warranty and see stock
UPDATE "User" SET "perms" = "perms" || ARRAY(SELECT m FROM unnest(ARRAY['claims', 'warranty', 'inventory']) AS m WHERE NOT (m = ANY("perms")))
WHERE "role" IN ('itsupport', 'itmanager');

-- 3. Helpdesk requesters (role employee) have nothing left to open: suspend them and end their sessions
UPDATE "User" SET "active" = false WHERE "role" = 'employee';
DELETE FROM "Session" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'employee');
DELETE FROM "PasswordReset" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'employee');

-- 4. Leave a trace in the Audit Log
INSERT INTO "AuditLog" ("t", "userId", "by", "role", "cat", "action", "target", "detail")
SELECT now(), NULL, 'ระบบ (migration)', 'system', 'system', 'ปิดระบบแจ้งซ่อมภายใน',
  'helpdesk', 'ถอดเมนูแจ้งซ่อม · ช่างได้เมนูเคลม/ประกัน/คลัง · ระงับบัญชีพนักงานทั่วไป ' || (SELECT count(*) FROM "User" WHERE "role" = 'employee') || ' บัญชี';
