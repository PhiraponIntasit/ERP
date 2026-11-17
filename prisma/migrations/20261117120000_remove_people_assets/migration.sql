-- The shop no longer keeps an employee directory or an internal IT asset register.
-- A staff account keeps its work email, phone and department, copied from the linked employee first.

ALTER TABLE "User"
ADD COLUMN "dept" TEXT NOT NULL DEFAULT '',
ADD COLUMN "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN "phone" TEXT NOT NULL DEFAULT '';

UPDATE "User" u SET "email" = e."email", "phone" = e."phone", "dept" = e."dept"
FROM "Employee" e WHERE u."empId" = e."id";

-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_holderId_fkey";
ALTER TABLE "AssetEvent" DROP CONSTRAINT "AssetEvent_assetTag_fkey";
ALTER TABLE "User" DROP CONSTRAINT "User_empId_fkey";

-- DropIndex
DROP INDEX "User_empId_key";

ALTER TABLE "User" DROP COLUMN "empId";

DROP TABLE "AssetEvent";
DROP TABLE "Asset";
DROP TABLE "Employee";

-- Their menus are gone too
UPDATE "User" SET "perms" = array_remove(array_remove("perms", 'employees'), 'assets')
WHERE 'employees' = ANY("perms") OR 'assets' = ANY("perms");
DELETE FROM "Counter" WHERE "key" = 'emp';
