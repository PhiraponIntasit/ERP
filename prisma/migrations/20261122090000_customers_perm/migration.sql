-- New back-office menu "customers" (ลูกค้า) for existing Admin and Manager accounts, matching ROLE_PERMS in src/lib/domain.ts.
UPDATE "User" SET "perms" = array_append("perms", 'customers')
WHERE "role" IN ('admin', 'manager') AND NOT ('customers' = ANY("perms"));
