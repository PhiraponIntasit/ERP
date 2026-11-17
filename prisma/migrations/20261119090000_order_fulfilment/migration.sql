-- Order fulfilment (phase 4): completion & refund details, and the "orders" back-office menu.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundRef" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);


-- A refund always says why and how the money went back
ALTER TABLE "Order" ADD CONSTRAINT "Order_refund_complete" CHECK ("status" <> 'refunded' OR ("refundedAt" IS NOT NULL AND "refundReason" IS NOT NULL AND "refundRef" IS NOT NULL));

-- New back-office menu "orders" (คำสั่งซื้อ & จัดส่ง) for existing Admin, Manager and Store Keeper accounts,
-- matching ROLE_PERMS in src/lib/domain.ts. Per-person changes stay as they are.
UPDATE "User" SET "perms" = array_append("perms", 'orders')
WHERE "role" IN ('admin', 'manager', 'storekeeper') AND NOT ('orders' = ANY("perms"));
