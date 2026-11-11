-- Additive import ledger. Existing players default to PUBLIC; new rows are staged explicitly.
ALTER TABLE "Club" ADD COLUMN "eaImportVisibility" text NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "Club" ADD CONSTRAINT "club_ea_import_visibility_check"
  CHECK ("eaImportVisibility" IN ('PUBLIC', 'STAGED', 'ROLLED_BACK'));
CREATE INDEX "club_ea_import_visibility_idx" ON "Club" ("eaImportVisibility");
CREATE TABLE "EaMaleClubImportEntry" (
  "eaTeamId" text PRIMARY KEY,
  "clubId" text NOT NULL UNIQUE REFERENCES "Club" (id) ON DELETE RESTRICT,
  "sourcePlanHash" text NOT NULL,
  "sourceBinaryHash" text NOT NULL,
  "leagueExternalId" text NOT NULL,
  status text NOT NULL DEFAULT 'STAGED' CHECK (status IN ('STAGED', 'PUBLISHED', 'ROLLED_BACK')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "publishedAt" timestamptz,
  "rolledBackAt" timestamptz
);
CREATE TABLE "EaMaleClubImportEvent" (
  id uuid PRIMARY KEY,
  "eaTeamId" text NOT NULL REFERENCES "EaMaleClubImportEntry" ("eaTeamId") ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('STAGED', 'PUBLISHED', 'ROLLED_BACK')),
  "sourcePlanHash" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("eaTeamId", action)
);
ALTER TABLE "Player"
  ADD COLUMN "eaImportVisibility" text NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "eaFreeAgentEvidence" text NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "Player"
  ADD CONSTRAINT "player_ea_import_visibility_check"
  CHECK ("eaImportVisibility" IN ('PUBLIC', 'STAGED', 'ROLLED_BACK')),
  ADD CONSTRAINT "player_ea_free_agent_evidence_check"
  CHECK ("eaFreeAgentEvidence" IN ('UNKNOWN', 'SOURCE_POSSIBLE', 'CONFIRMED'));
CREATE INDEX "player_ea_import_visibility_idx" ON "Player" ("eaImportVisibility");
CREATE INDEX "player_ea_free_agent_filter_idx" ON "Player" ("eaFreeAgentEvidence")
  WHERE "eaImportVisibility" = 'PUBLIC' AND "eaFreeAgentEvidence" = 'CONFIRMED';

CREATE TABLE "EaMaleImportBatch" (
  "batchId" text PRIMARY KEY,
  "batchHash" text NOT NULL,
  "selectionHash" text NOT NULL,
  "sourceBinaryHash" text NOT NULL,
  "sourceCommit" text NOT NULL,
  "clubStatus" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('STAGED', 'ROLLED_BACK')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "rolledBackAt" timestamptz
);
CREATE TABLE "EaMaleImportEntry" (
  "batchId" text NOT NULL REFERENCES "EaMaleImportBatch" ("batchId") ON DELETE RESTRICT,
  "externalId" text PRIMARY KEY,
  "playerId" text NOT NULL UNIQUE REFERENCES "Player" ("id") ON DELETE RESTRICT,
  "contentHash" text NOT NULL,
  "clubExternalId" text,
  "clubStatus" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('STAGED', 'PUBLISHED', 'ROLLED_BACK')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "publishedAt" timestamptz,
  "rolledBackAt" timestamptz
);
CREATE INDEX "ea_male_import_entry_batch_idx" ON "EaMaleImportEntry" ("batchId");
CREATE TABLE "EaMaleImportEvent" (
  "eventId" uuid PRIMARY KEY,
  "batchId" text NOT NULL REFERENCES "EaMaleImportBatch" ("batchId") ON DELETE RESTRICT,
  "externalId" text NOT NULL REFERENCES "EaMaleImportEntry" ("externalId") ON DELETE RESTRICT,
  "action" text NOT NULL CHECK ("action" IN ('STAGED', 'PUBLISHED', 'ROLLED_BACK')),
  "contentHash" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("externalId", "action")
);
CREATE INDEX "ea_male_import_event_batch_idx" ON "EaMaleImportEvent" ("batchId");
