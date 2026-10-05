-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'helper');

-- CreateEnum
CREATE TYPE "CharacterType" AS ENUM ('pg', 'png');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('sent', 'delivered', 'read', 'lost', 'deleted');

-- CreateEnum
CREATE TYPE "DataVisibility" AS ENUM ('hidden', 'visible');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('done', 'waitingApproval');

-- CreateEnum
CREATE TYPE "EventPriceType" AS ENUM ('fixed', 'percentageDiscount', 'fixedDiscount');

-- CreateEnum
CREATE TYPE "EventPriceCondition" AS ENUM ('beforeDate', 'firstEvent', 'firstEventCampaign');

-- CreateTable
CREATE TABLE "PersonalData" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "ssn" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "placeOfBirth" TEXT NOT NULL,

    CONSTRAINT "PersonalData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" SERIAL NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" INTEGER NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "urlSlag" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataType" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "DataType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Data" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "dataTypeId" INTEGER NOT NULL,
    "visibility" "DataVisibility" NOT NULL DEFAULT 'hidden',
    "characterId" INTEGER,
    "userId" TEXT,
    "visibilityConditionId" INTEGER,

    CONSTRAINT "Data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisibilityCondition" (
    "id" SERIAL NOT NULL,
    "functionName" TEXT NOT NULL,

    CONSTRAINT "VisibilityCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CharacterType" NOT NULL DEFAULT 'pg',
    "name" TEXT NOT NULL,
    "background" TEXT,
    "creationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalDate" TIMESTAMP(3),
    "deathDate" TIMESTAMP(3),
    "parkDate" TIMESTAMP(3),
    "printableNotes" TEXT,
    "hiddenNotes" TEXT,
    "lastUpdateDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "place" TEXT,
    "image" TEXT,
    "descriptionShort" TEXT,
    "descriptionFull" TEXT,
    "publicationDate" TIMESTAMP(3) NOT NULL,
    "closeDate" TIMESTAMP(3) NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialLink" (
    "link" TEXT NOT NULL,
    "icon" TEXT,
    "eventId" INTEGER NOT NULL,

    CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("link")
);

-- CreateTable
CREATE TABLE "EventPrice" (
    "id" SERIAL NOT NULL,
    "beforeDate" TIMESTAMP(3),
    "priceType" "EventPriceType" NOT NULL,
    "priceCondition" "EventPriceCondition" NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "EventPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "characterId" INTEGER,
    "paymentId" INTEGER,
    "couponId" TEXT,
    "price" INTEGER,
    "present" BOOLEAN,
    "bookingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "paymentData" JSONB NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "usedDate" TIMESTAMP(3),
    "paymentId" INTEGER NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "messageType" TEXT NOT NULL,
    "fromId" INTEGER NOT NULL,
    "toId" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "sentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedDate" TIMESTAMP(3),
    "readDate" TIMESTAMP(3),
    "status" "MessageStatus" NOT NULL DEFAULT 'sent',

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterActionLog" (
    "id" SERIAL NOT NULL,
    "characterId" INTEGER NOT NULL,
    "actionId" INTEGER NOT NULL,
    "creationDate" TIMESTAMP(3) NOT NULL,
    "lastChangeDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "actionData" JSONB,
    "status" "ActionStatus" NOT NULL,

    CONSTRAINT "CharacterActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" SERIAL NOT NULL,
    "actionName" TEXT NOT NULL,
    "functionName" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grant" (
    "userId" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "role" "Role" NOT NULL
);

-- CreateTable
CREATE TABLE "_BookingToEventPrice" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_BookingToEventPrice_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalData_userId_key" ON "PersonalData"("userId");

-- CreateIndex
CREATE INDEX "personalDataUserId" ON "PersonalData"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_year_key" ON "Membership"("userId", "year");

-- CreateIndex
CREATE INDEX "DataTypeCampaignId" ON "DataType"("campaignId");

-- CreateIndex
CREATE INDEX "DataDataTypeId" ON "Data"("dataTypeId");

-- CreateIndex
CREATE INDEX "CharacterCampaignId" ON "Character"("campaignId");

-- CreateIndex
CREATE INDEX "CharacterUserId" ON "Character"("userId");

-- CreateIndex
CREATE INDEX "EventCampaignId" ON "Event"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_paymentId_key" ON "Booking"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_couponId_key" ON "Booking"("couponId");

-- CreateIndex
CREATE INDEX "BookingEventId" ON "Booking"("eventId");

-- CreateIndex
CREATE INDEX "BookingCharacterId" ON "Booking"("characterId");

-- CreateIndex
CREATE INDEX "BookingUserId" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "PaymentUserId" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "MessageFromId" ON "Message"("fromId");

-- CreateIndex
CREATE INDEX "MessageToId" ON "Message"("toId");

-- CreateIndex
CREATE INDEX "CharacterActionLogCharacterId" ON "CharacterActionLog"("characterId");

-- CreateIndex
CREATE INDEX "ActionCampaignId" ON "Action"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Grant_userId_campaignId_key" ON "Grant"("userId", "campaignId");

-- CreateIndex
CREATE INDEX "_BookingToEventPrice_B_index" ON "_BookingToEventPrice"("B");

-- AddForeignKey
ALTER TABLE "PersonalData" ADD CONSTRAINT "PersonalData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataType" ADD CONSTRAINT "DataType_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Data" ADD CONSTRAINT "Data_dataTypeId_fkey" FOREIGN KEY ("dataTypeId") REFERENCES "DataType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Data" ADD CONSTRAINT "Data_visibilityConditionId_fkey" FOREIGN KEY ("visibilityConditionId") REFERENCES "VisibilityCondition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Data" ADD CONSTRAINT "Data_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Data" ADD CONSTRAINT "Data_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialLink" ADD CONSTRAINT "SocialLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Character"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Character"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterActionLog" ADD CONSTRAINT "CharacterActionLog_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookingToEventPrice" ADD CONSTRAINT "_BookingToEventPrice_A_fkey" FOREIGN KEY ("A") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookingToEventPrice" ADD CONSTRAINT "_BookingToEventPrice_B_fkey" FOREIGN KEY ("B") REFERENCES "EventPrice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
