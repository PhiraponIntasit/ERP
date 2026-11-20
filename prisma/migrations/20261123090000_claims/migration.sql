-- Warranty claims raised by storefront customers (person A). Status moves submitted → received → replaced | rejected, or cancelled by the customer.
-- Approving a claim goes through replaceUnit() in src/server/warranty.ts; the claim never changes a serial's status itself.
-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "newSerial" TEXT,
    "staffNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Claim_customerId_createdAt_idx" ON "Claim"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_status_createdAt_idx" ON "Claim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_serial_idx" ON "Claim"("serial");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_serial_fkey" FOREIGN KEY ("serial") REFERENCES "SerialNumber"("serial") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Claim numbers CLM-<year>-000001
INSERT INTO "Counter" ("key", "value") VALUES ('clm', 1) ON CONFLICT ("key") DO NOTHING;

-- New back-office menu "claims" (เคลมสินค้า) for existing Admin, Manager and Store Keeper accounts, matching ROLE_PERMS in src/lib/domain.ts.
UPDATE "User" SET "perms" = array_append("perms", 'claims')
WHERE "role" IN ('admin', 'manager', 'storekeeper') AND NOT ('claims' = ANY("perms"));
