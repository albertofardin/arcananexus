-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: pagamenti eventi dalla data già registrata sulla Booking.
UPDATE "Payment" p
SET "createdAt" = b."paymentDate"
FROM "Booking" b
WHERE b."paymentId" = p."id" AND b."paymentDate" IS NOT NULL;

-- Backfill: pagamenti PayPal senza Booking (tessere) dalla data di cattura.
UPDATE "Payment" p
SET "createdAt" = (p."paymentData" #>> '{order,purchase_units,0,payments,captures,0,create_time}')::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b."paymentId" = p."id")
  AND (p."paymentData" #>> '{order,purchase_units,0,payments,captures,0,create_time}') ~ '^\d{4}-\d{2}-\d{2}T';
