-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'CARRIER', 'COURIER', 'OPERATOR', 'SUPPORT', 'FINANCE', 'ADMIN');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'MATCHING', 'MATCHED', 'PAYMENT_PENDING', 'PAID', 'PICKUP_ASSIGNED', 'PICKED_UP', 'INSPECTED', 'WITH_CARRIER', 'IN_TRANSIT', 'ARRIVED', 'LAST_MILE', 'DELIVERED', 'COMPLETED', 'INCIDENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'OPEN', 'FULL', 'DEPARTED', 'ARRIVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustodyEventType" AS ENUM ('PICKUP_FROM_SENDER', 'HANDOFF_TO_CARRIER', 'HANDOFF_FROM_CARRIER', 'DELIVERY_TO_RECIPIENT', 'INCIDENT_HOLD', 'RELEASE_FROM_HOLD');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('SIGN_IN', 'PHONE_CHANGE', 'SENSITIVE_ACTION');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "email" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "locale" TEXT NOT NULL DEFAULT 'fr-SN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceIdHash" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationChallenge" (
    "id" TEXT NOT NULL,
    "destinationHash" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "VerificationChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Corridor" (
    "id" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Corridor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isAllowed" BOOLEAN NOT NULL DEFAULT false,
    "constraints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParcelCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "corridorId" TEXT NOT NULL,
    "flightNo" TEXT NOT NULL,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "capacityKg" DECIMAL(8,2) NOT NULL,
    "reservedKg" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "publicRef" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "corridorId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "declaredValue" DECIMAL(14,2),
    "currentCustodianId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcel" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "declaredWeight" DECIMAL(8,2) NOT NULL,
    "actualWeight" DECIMAL(8,2),
    "sealNo" TEXT,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "status" "MatchStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "type" "CustodyEventType" NOT NULL,
    "requestId" TEXT,
    "serverTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "metadata" JSONB,

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "actorId" TEXT,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregate" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "requestId" TEXT,
    "ipHash" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneE164_key" ON "User"("phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_role_idx" ON "UserRoleAssignment"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserRoleAssignment_userId_role_scope_key" ON "UserRoleAssignment"("userId", "role", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "Session_accessTokenHash_key" ON "Session"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_familyId_revokedAt_idx" ON "Session"("familyId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_accessExpiresAt_idx" ON "Session"("accessExpiresAt");

-- CreateIndex
CREATE INDEX "Session_refreshExpiresAt_idx" ON "Session"("refreshExpiresAt");

-- CreateIndex
CREATE INDEX "VerificationChallenge_destinationHash_purpose_createdAt_idx" ON "VerificationChallenge"("destinationHash", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationChallenge_expiresAt_idx" ON "VerificationChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "Corridor_isActive_idx" ON "Corridor"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Corridor_originCountry_originCity_destinationCountry_destin_key" ON "Corridor"("originCountry", "originCity", "destinationCountry", "destinationCity");

-- CreateIndex
CREATE UNIQUE INDEX "ParcelCategory_code_key" ON "ParcelCategory"("code");

-- CreateIndex
CREATE INDEX "Trip_corridorId_departureAt_status_idx" ON "Trip"("corridorId", "departureAt", "status");

-- CreateIndex
CREATE INDEX "Trip_carrierId_status_idx" ON "Trip"("carrierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_publicRef_key" ON "Shipment"("publicRef");

-- CreateIndex
CREATE INDEX "Shipment_clientId_createdAt_idx" ON "Shipment"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_corridorId_status_idx" ON "Shipment"("corridorId", "status");

-- CreateIndex
CREATE INDEX "Shipment_status_updatedAt_idx" ON "Shipment"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_sealNo_key" ON "Parcel"("sealNo");

-- CreateIndex
CREATE INDEX "Parcel_shipmentId_idx" ON "Parcel"("shipmentId");

-- CreateIndex
CREATE INDEX "Match_tripId_status_idx" ON "Match"("tripId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Match_shipmentId_tripId_key" ON "Match"("shipmentId", "tripId");

-- CreateIndex
CREATE INDEX "CustodyEvent_shipmentId_serverTime_idx" ON "CustodyEvent"("shipmentId", "serverTime");

-- CreateIndex
CREATE INDEX "CustodyEvent_toUserId_serverTime_idx" ON "CustodyEvent"("toUserId", "serverTime");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_objectKey_key" ON "MediaAsset"("objectKey");

-- CreateIndex
CREATE INDEX "MediaAsset_shipmentId_purpose_idx" ON "MediaAsset"("shipmentId", "purpose");

-- CreateIndex
CREATE INDEX "Incident_shipmentId_status_idx" ON "Incident"("shipmentId", "status");

-- CreateIndex
CREATE INDEX "Incident_reporterId_createdAt_idx" ON "Incident"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_keyHash_route_key" ON "IdempotencyRecord"("keyHash", "route");

-- CreateIndex
CREATE INDEX "WebhookEvent_processedAt_failedAt_idx" ON "WebhookEvent"("processedAt", "failedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregate_aggregateId_createdAt_idx" ON "OutboxEvent"("aggregate", "aggregateId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_corridorId_fkey" FOREIGN KEY ("corridorId") REFERENCES "Corridor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_corridorId_fkey" FOREIGN KEY ("corridorId") REFERENCES "Corridor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ParcelCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
