-- Money & stock invariants. Each query returns one row per violation (no rows = healthy).
-- Used by the nightly backup job (restored copy) and by e2e/b/integrity.spec.ts. Read-only.

-- 1. Units held = units in orders still awaiting payment
SELECT 'reserved ≠ unpaid orders' AS problem, i."sku" AS ref, i."reserved"::text || ' vs ' || COALESCE(SUM(l."qty"), 0)::text AS detail
FROM "InventoryItem" i
LEFT JOIN "OrderLine" l ON l."sku" = i."sku" AND l."orderId" IN (SELECT "id" FROM "Order" WHERE "status" = 'pending_payment')
GROUP BY i."sku", i."reserved" HAVING i."reserved" <> COALESCE(SUM(l."qty"), 0)
UNION ALL
-- 2. Every order that took money has exactly one payment for exactly its total
SELECT 'paid order without one matching payment', o."id", o."status" || ' · ' || COUNT(p."id")::text || ' payment(s)'
FROM "Order" o LEFT JOIN "Payment" p ON p."orderId" = o."id" AND p."status" IN ('successful', 'refunded') AND p."amount" = o."total"
WHERE o."status" IN ('paid', 'packing', 'shipped', 'completed', 'refunded')
GROUP BY o."id", o."status" HAVING COUNT(p."id") <> 1
UNION ALL
-- 3. Money received only for orders that took it (late payments must be flagged by an expired/cancelled order)
SELECT 'successful payment on an unpaid order', o."id", o."status"
FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId"
WHERE p."status" = 'successful' AND o."status" = 'pending_payment'
UNION ALL
-- 4. Shipped serial-tracked lines carry one serial per unit
SELECT 'shipped line without its serials', l."orderId" || ' ' || l."sku", COUNT(s."serial")::text || ' of ' || l."qty"::text
FROM "OrderLine" l JOIN "Order" o ON o."id" = l."orderId" JOIN "InventoryItem" i ON i."sku" = l."sku" AND i."serialTracked"
LEFT JOIN "SerialNumber" s ON s."orderLineId" = l."id" AND s."status" IN ('sold', 'claim', 'returned')
WHERE o."status" IN ('shipped', 'completed')
GROUP BY l."id", l."orderId", l."sku", l."qty" HAVING COUNT(s."serial") < l."qty"
UNION ALL
-- 5. Serial units on the shelf = stock on hand + units paid for but not yet shipped
SELECT 'serials on shelf ≠ stock', i."sku", (SELECT COUNT(*) FROM "SerialNumber" s WHERE s."sku" = i."sku" AND s."status" = 'in_stock')::text
  || ' vs ' || (i."qty" + COALESCE((SELECT SUM(l."qty") FROM "OrderLine" l JOIN "Order" o ON o."id" = l."orderId" WHERE l."sku" = i."sku" AND o."status" IN ('paid', 'packing')), 0))::text
FROM "InventoryItem" i WHERE i."serialTracked"
  AND (SELECT COUNT(*) FROM "SerialNumber" s WHERE s."sku" = i."sku" AND s."status" = 'in_stock')
   <> i."qty" + COALESCE((SELECT SUM(l."qty") FROM "OrderLine" l JOIN "Order" o ON o."id" = l."orderId" WHERE l."sku" = i."sku" AND o."status" IN ('paid', 'packing')), 0)
UNION ALL
-- 6. Coupon uses = orders holding the code (unpaid ones that ended gave theirs back)
SELECT 'coupon uses ≠ orders', c."code", c."used"::text || ' vs ' || COUNT(o."id")::text
FROM "Coupon" c LEFT JOIN "Order" o ON o."couponCode" = c."code" AND o."status" NOT IN ('expired', 'cancelled')
GROUP BY c."code", c."used" HAVING c."used" <> COUNT(o."id");
