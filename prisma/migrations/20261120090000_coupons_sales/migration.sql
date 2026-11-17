-- Coupons & sales dashboard (phase 5): coupon rules, cost snapshot on order lines, two new back-office menus.

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "maxDiscount" DECIMAL(12,2),
ADD COLUMN     "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "oncePerCustomer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "cost" DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "Order_couponCode_idx" ON "Order"("couponCode");


-- Cost of existing order lines: the product's current cost is the best estimate available
UPDATE "OrderLine" l SET "cost" = i."cost" FROM "InventoryItem" i WHERE l."sku" = i."sku" AND l."cost" IS NULL;

-- Coupon rules the database itself enforces
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_valid" CHECK (
  "kind" IN ('percent', 'fixed') AND "value" > 0 AND ("kind" <> 'percent' OR "value" <= 100)
  AND "minSpend" >= 0 AND ("maxDiscount" IS NULL OR "maxDiscount" > 0) AND "endsAt" > "startsAt"
  AND "used" >= 0 AND ("usageLimit" IS NULL OR ("usageLimit" > 0 AND "used" <= "usageLimit"))
);

-- New back-office menus for existing accounts, matching ROLE_PERMS in src/lib/domain.ts
UPDATE "User" SET "perms" = array_append("perms", 'coupons') WHERE "role" IN ('admin', 'manager') AND NOT ('coupons' = ANY("perms"));
UPDATE "User" SET "perms" = array_append("perms", 'sales') WHERE "role" IN ('admin', 'manager', 'executive') AND NOT ('sales' = ANY("perms"));
