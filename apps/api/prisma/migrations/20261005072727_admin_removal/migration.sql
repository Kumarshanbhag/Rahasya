-- DropForeignKey
ALTER TABLE "recovery_requests" DROP CONSTRAINT "recovery_requests_requested_by_fkey";

-- AlterTable
ALTER TABLE "recovery_requests" ALTER COLUMN "requested_by" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "recovery_requests" ADD CONSTRAINT "recovery_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
