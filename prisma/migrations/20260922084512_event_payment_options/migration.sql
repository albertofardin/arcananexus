-- CreateTable
CREATE TABLE "EventPaymentOption" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "EventPaymentOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventPaymentOptionEventId" ON "EventPaymentOption"("eventId");

-- AddForeignKey
ALTER TABLE "EventPaymentOption" ADD CONSTRAINT "EventPaymentOption_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
