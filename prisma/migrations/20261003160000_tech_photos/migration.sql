-- AlterTable
ALTER TABLE "TicketImage" ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'report';

-- AddForeignKey
ALTER TABLE "TicketImage" ADD CONSTRAINT "TicketImage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

