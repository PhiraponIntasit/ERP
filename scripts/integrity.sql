-- Money & stock invariants. Each query returns one row per violation (no rows = healthy).
-- Used by the nightly backup job (restored copy) and by e2e/b/integrity.spec.ts. Read-only. Rules 7–10 cover A's claims.

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
GROUP BY c."code", c."used" HAVING c."used" <> COUNT(o."id")
UNION ALL
-- 7. A claim still open is for a unit the customer still has (not swapped behind the claim's back)
SELECT 'open claim on a unit that is not sold', c."id", c."serial" || ' is ' || s."status"
FROM "Claim" c JOIN "SerialNumber" s ON s."serial" = c."serial"
WHERE c."status" IN ('submitted', 'received') AND s."status" <> 'sold'
UNION ALL
-- 8. A replaced claim really swapped: old unit back at the shop, new unit of the same product sold on the same order line
SELECT 'replaced claim without a matching swap', c."id", c."serial" || ' (' || o."status" || ') → ' || COALESCE(c."newSerial", '—') || ' (' || COALESCE(n."status", 'missing') || ')'
FROM "Claim" c JOIN "SerialNumber" o ON o."serial" = c."serial" LEFT JOIN "SerialNumber" n ON n."serial" = c."newSerial"
WHERE c."status" = 'replaced' AND (n."serial" IS NULL OR o."status" NOT IN ('claim', 'returned') OR n."status" NOT IN ('sold', 'claim', 'returned')
  OR n."sku" <> o."sku" OR n."orderLineId" IS DISTINCT FROM o."orderLineId")
UNION ALL
-- 9. At most one open claim per unit
SELECT 'more than one open claim', c."serial", COUNT(*)::text || ' open claims'
FROM "Claim" c WHERE c."status" IN ('submitted', 'received') GROUP BY c."serial" HAVING COUNT(*) > 1
UNION ALL
-- 10. A unit swapped for a claim (the swap's audit row names it) belongs to a claim that ended `replaced`
SELECT 'unit swapped for a claim that did not end replaced', a."target", x."id" || ' is ' || x."status"
FROM "AuditLog" a
JOIN LATERAL (SELECT substring(a."detail" from 'เคลม (CLM-[0-9A-Z-]+)') AS cid) m ON m.cid IS NOT NULL
JOIN "Claim" x ON x."id" = m.cid   -- claims are never deleted by the app (only test clean-up removes them)
WHERE a."cat" = 'warranty' AND a."action" = 'เปลี่ยนสินค้าตามประกัน' AND x."status" <> 'replaced';
