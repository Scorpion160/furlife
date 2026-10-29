-- Pricing rules are server-controlled; quotes snapshot the rule used for a matched shipment.
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "corridorId" TEXT NOT NULL,
    "baseFee" DECIMAL(14,2) NOT NULL,
    "pricePerKg" DECIMAL(14,2) NOT NULL,
    "minimumFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PricingRule_baseFee_nonnegative" CHECK ("baseFee" >= 0),
    CONSTRAINT "PricingRule_pricePerKg_nonnegative" CHECK ("pricePerKg" >= 0),
    CONSTRAINT "PricingRule_minimumFee_nonnegative" CHECK ("minimumFee" >= 0)
);

CREATE TABLE "PricingQuote" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "pricingRuleId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "weightKg" DECIMAL(8,2) NOT NULL,
    "baseFee" DECIMAL(14,2) NOT NULL,
    "variableFee" DECIMAL(14,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingQuote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PricingQuote_weight_positive" CHECK ("weightKg" > 0),
    CONSTRAINT "PricingQuote_baseFee_nonnegative" CHECK ("baseFee" >= 0),
    CONSTRAINT "PricingQuote_variableFee_nonnegative" CHECK ("variableFee" >= 0),
    CONSTRAINT "PricingQuote_totalAmount_nonnegative" CHECK ("totalAmount" >= 0)
);

CREATE UNIQUE INDEX "PricingRule_corridorId_key"
ON "PricingRule"("corridorId");

CREATE INDEX "PricingRule_isActive_idx"
ON "PricingRule"("isActive");

CREATE UNIQUE INDEX "PricingQuote_matchId_key"
ON "PricingQuote"("matchId");

CREATE INDEX "PricingQuote_shipmentId_createdAt_idx"
ON "PricingQuote"("shipmentId", "createdAt");

CREATE INDEX "PricingQuote_pricingRuleId_createdAt_idx"
ON "PricingQuote"("pricingRuleId", "createdAt");

ALTER TABLE "PricingRule"
ADD CONSTRAINT "PricingRule_corridorId_fkey"
FOREIGN KEY ("corridorId") REFERENCES "Corridor"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PricingQuote"
ADD CONSTRAINT "PricingQuote_shipmentId_fkey"
FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PricingQuote"
ADD CONSTRAINT "PricingQuote_matchId_fkey"
FOREIGN KEY ("matchId") REFERENCES "Match"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PricingQuote"
ADD CONSTRAINT "PricingQuote_pricingRuleId_fkey"
FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
