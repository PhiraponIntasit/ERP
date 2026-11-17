-- New back-office menu "warranty" (ตรวจประกัน & เปลี่ยนสินค้า) for existing Admin, Manager and Store Keeper accounts,
-- matching ROLE_PERMS in src/lib/domain.ts. Serial statuses used from now on: in_stock | sold | claim | returned.
UPDATE "User" SET "perms" = array_append("perms", 'warranty')
WHERE "role" IN ('admin', 'manager', 'storekeeper') AND NOT ('warranty' = ANY("perms"));
