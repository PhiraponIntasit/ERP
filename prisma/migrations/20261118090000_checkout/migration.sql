-- Checkout (phase 3): customer sessions, and money/state guards for orders and payments.

-- CreateTable
CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An order is paid at most once: one successful payment per order
CREATE UNIQUE INDEX "Payment_one_success_per_order" ON "Payment"("orderId") WHERE "status" = 'successful';
-- Money columns are never negative, and the total adds up
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_valid" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "shippingFee" >= 0 AND "total" = "subtotal" - "discount" + "shippingFee");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
