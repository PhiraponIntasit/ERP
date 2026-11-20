-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "assigneeId" TEXT;

-- CreateTable
CREATE TABLE "ClaimEvent" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "t" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClaimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimImage" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "eventId" TEXT,
    "kind" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "ord" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimPart" (
    "claimId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "ClaimPart_pkey" PRIMARY KEY ("claimId","sku")
);

-- CreateIndex
CREATE INDEX "ClaimEvent_claimId_t_idx" ON "ClaimEvent"("claimId", "t");

-- CreateIndex
CREATE INDEX "ClaimImage_claimId_idx" ON "ClaimImage"("claimId");

-- CreateIndex
CREATE INDEX "Claim_assigneeId_status_idx" ON "Claim"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvent" ADD CONSTRAINT "ClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimImage" ADD CONSTRAINT "ClaimImage_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimImage" ADD CONSTRAINT "ClaimImage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ClaimEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimPart" ADD CONSTRAINT "ClaimPart_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimPart" ADD CONSTRAINT "ClaimPart_sku_fkey" FOREIGN KEY ("sku") REFERENCES "InventoryItem"("sku") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A repair uses at least one of each part
ALTER TABLE "ClaimPart" ADD CONSTRAINT "ClaimPart_qty_check" CHECK ("qty" > 0);

-- Technicians (IT Support / IT Manager) now work on customers' claims, matching ROLE_PERMS in src/lib/domain.ts.
UPDATE "User" SET "perms" = array_append("perms", 'claims')
WHERE "role" IN ('itsupport', 'itmanager') AND NOT ('claims' = ANY("perms"));
