-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "paymentOptionLabel" TEXT;

-- Backfill: iscrizioni già pagate con un importo diverso dalla quota base e
-- uguale a quello di una quota alternativa dell'evento.
UPDATE "Booking" b
SET "paymentOptionLabel" = o."label"
FROM "Payment" p, "Event" e, "EventPaymentOption" o
WHERE p."id" = b."paymentId"
  AND e."id" = b."eventId"
  AND o."eventId" = b."eventId"
  AND o."amount" = p."value"
  AND p."value" <> e."price";
