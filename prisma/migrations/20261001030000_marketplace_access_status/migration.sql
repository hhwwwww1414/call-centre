-- AlterTable
ALTER TABLE "MarketplaceAccount" ADD COLUMN     "accessStatus" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "MarketplaceAccount_accessStatus_idx" ON "MarketplaceAccount"("accessStatus");

