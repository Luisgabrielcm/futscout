-- PREPARED ONLY: do not apply during Lote 12 / Fase E.
-- Additive registry only; no Club, League or existing data is changed.

CREATE TYPE "BrandAssetEntityType" AS ENUM ('CLUB', 'LEAGUE');
CREATE TYPE "BrandAssetType" AS ENUM ('CREST', 'LOGO');
CREATE TYPE "BrandAssetIdentityStatus" AS ENUM ('VERIFIED', 'REVIEW_REQUIRED', 'BLOCKED');
CREATE TYPE "BrandAssetRightsStatus" AS ENUM ('APPROVED', 'REMOTE_ONLY', 'CACHE_ALLOWED', 'REVIEW_REQUIRED', 'BLOCKED');
CREATE TYPE "BrandAssetStatus" AS ENUM ('DISCOVERED', 'VALIDATED', 'ACTIVE', 'STALE', 'REMOVED', 'ERROR');

CREATE TABLE "BrandAssetIdentity" (
  "id" TEXT NOT NULL,
  "entityType" "BrandAssetEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerEntityId" TEXT NOT NULL,
  "status" "BrandAssetIdentityStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "evidence" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandAssetIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrandAssetIdentity_entityId_nonempty" CHECK (length(btrim("entityId")) > 0),
  CONSTRAINT "BrandAssetIdentity_provider_canonical" CHECK ("provider" = lower(btrim("provider")) AND length("provider") > 0),
  CONSTRAINT "BrandAssetIdentity_providerEntityId_nonempty" CHECK (length(btrim("providerEntityId")) > 0),
  CONSTRAINT "BrandAssetIdentity_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "BrandAsset" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "assetType" "BrandAssetType" NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "storageUrl" TEXT,
  "contentHash" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "rightsStatus" "BrandAssetRightsStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "status" "BrandAssetStatus" NOT NULL DEFAULT 'DISCOVERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrandAsset_sourceUrl_nonempty" CHECK (length(btrim("sourceUrl")) > 0),
  CONSTRAINT "BrandAsset_storageUrl_nonempty" CHECK ("storageUrl" IS NULL OR length(btrim("storageUrl")) > 0),
  CONSTRAINT "BrandAsset_contentHash_nonempty" CHECK ("contentHash" IS NULL OR length(btrim("contentHash")) > 0),
  CONSTRAINT "BrandAsset_version_positive" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "BrandAssetIdentity_entityType_entityId_provider_key"
  ON "BrandAssetIdentity"("entityType", "entityId", "provider");
CREATE UNIQUE INDEX "BrandAssetIdentity_entityType_provider_providerEntityId_key"
  ON "BrandAssetIdentity"("entityType", "provider", "providerEntityId");
CREATE INDEX "BrandAssetIdentity_entityType_entityId_status_idx"
  ON "BrandAssetIdentity"("entityType", "entityId", "status");

CREATE UNIQUE INDEX "BrandAsset_identityId_assetType_version_key"
  ON "BrandAsset"("identityId", "assetType", "version");
CREATE INDEX "BrandAsset_identityId_assetType_status_idx"
  ON "BrandAsset"("identityId", "assetType", "status");
CREATE INDEX "BrandAsset_rightsStatus_status_idx"
  ON "BrandAsset"("rightsStatus", "status");
CREATE INDEX "BrandAsset_contentHash_idx" ON "BrandAsset"("contentHash");
CREATE UNIQUE INDEX "BrandAsset_one_active_per_identity_type_key"
  ON "BrandAsset"("identityId", "assetType") WHERE "status" = 'ACTIVE';

ALTER TABLE "BrandAsset"
  ADD CONSTRAINT "BrandAsset_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "BrandAssetIdentity"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma has no polymorphic relation syntax. This trigger preserves the local
-- Club/League identity invariant without adding columns to either model.
CREATE FUNCTION futscout_validate_brand_asset_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."entityType" = 'CLUB' AND NOT EXISTS (
    SELECT 1 FROM "Club" WHERE "id" = NEW."entityId"
  ) THEN
    RAISE EXCEPTION 'BRAND_ASSET_CLUB_IDENTITY_NOT_FOUND';
  END IF;

  IF NEW."entityType" = 'LEAGUE' AND NOT EXISTS (
    SELECT 1 FROM "League" WHERE "id" = NEW."entityId"
  ) THEN
    RAISE EXCEPTION 'BRAND_ASSET_LEAGUE_IDENTITY_NOT_FOUND';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER brand_asset_identity_requires_local_entity
BEFORE INSERT OR UPDATE OF "entityType", "entityId" ON "BrandAssetIdentity"
FOR EACH ROW EXECUTE FUNCTION futscout_validate_brand_asset_identity();

CREATE FUNCTION futscout_validate_brand_asset_type() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  entity_kind "BrandAssetEntityType";
BEGIN
  SELECT "entityType" INTO entity_kind
  FROM "BrandAssetIdentity"
  WHERE "id" = NEW."identityId";

  IF entity_kind IS NULL THEN
    RAISE EXCEPTION 'BRAND_ASSET_IDENTITY_NOT_FOUND';
  END IF;

  IF (entity_kind = 'CLUB' AND NEW."assetType" <> 'CREST') OR
     (entity_kind = 'LEAGUE' AND NEW."assetType" <> 'LOGO') THEN
    RAISE EXCEPTION 'BRAND_ASSET_TYPE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER brand_asset_type_matches_identity
BEFORE INSERT OR UPDATE OF "identityId", "assetType" ON "BrandAsset"
FOR EACH ROW EXECUTE FUNCTION futscout_validate_brand_asset_type();
