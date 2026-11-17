-- New back-office menu "products" (สินค้า & ราคาขาย): give it to existing Admin and Store Keeper accounts,
-- matching the role defaults in src/lib/domain.ts (ROLE_PERMS). Per-person changes stay as they are.
UPDATE "User" SET "perms" = array_append("perms", 'products')
WHERE "role" IN ('admin', 'storekeeper') AND NOT ('products' = ANY("perms"));
