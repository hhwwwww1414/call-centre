-- CreateTable
CREATE TABLE "MarketplaceAccount" (
    "id" TEXT NOT NULL,
    "publicId" INTEGER NOT NULL,
    "contactId" TEXT,
    "phoneE164" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3) NOT NULL,
    "accountStatus" TEXT NOT NULL,
    "sellerActivatedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "profileType" TEXT,
    "profileName" TEXT,
    "legalName" TEXT,
    "city" TEXT,
    "region" TEXT,
    "verificationStatus" TEXT,
    "moderationNote" TEXT,
    "trustScore" INTEGER,
    "profileCompleteness" INTEGER,
    "listingsActive" INTEGER NOT NULL DEFAULT 0,
    "listingsDraft" INTEGER NOT NULL DEFAULT 0,
    "listingsPending" INTEGER NOT NULL DEFAULT 0,
    "listingsRejected" INTEGER NOT NULL DEFAULT 0,
    "listingsArchived" INTEGER NOT NULL DEFAULT 0,
    "listingsSold" INTEGER NOT NULL DEFAULT 0,
    "lastListingAt" TIMESTAMP(3),
    "views30d" INTEGER NOT NULL DEFAULT 0,
    "viewsTotal" INTEGER NOT NULL DEFAULT 0,
    "leadsTotal" INTEGER NOT NULL DEFAULT 0,
    "threadsTotal" INTEGER NOT NULL DEFAULT 0,
    "dealsTotal" INTEGER NOT NULL DEFAULT 0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "reviewsAvg" DOUBLE PRECISION,
    "links" JSONB NOT NULL DEFAULT '[]',
    "extraPhones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "campaign" TEXT,
    "marketplaceUpdatedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceAccount_contactId_key" ON "MarketplaceAccount"("contactId");

-- CreateIndex
CREATE INDEX "MarketplaceAccount_phoneE164_idx" ON "MarketplaceAccount"("phoneE164");

-- CreateIndex
CREATE INDEX "MarketplaceAccount_verificationStatus_idx" ON "MarketplaceAccount"("verificationStatus");

-- CreateIndex
CREATE INDEX "MarketplaceAccount_lastSeenAt_idx" ON "MarketplaceAccount"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "MarketplaceAccount" ADD CONSTRAINT "MarketplaceAccount_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

