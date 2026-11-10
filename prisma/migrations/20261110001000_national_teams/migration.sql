-- Additive candidate. Disposable tests only; public deployment requires source approval.
-- The existing country directory is derived from Player.nationality, not a SQL table.
-- countryKey points to that canonical directory only after explicit mapping.
CREATE TABLE "NationalTeam" (
  id text PRIMARY KEY,
  "eaTeamId" text NOT NULL UNIQUE,
  name text NOT NULL,
  "countryKey" text,
  "countryName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "national_team_country_pair" CHECK (("countryKey" IS NULL) = ("countryName" IS NULL))
);

CREATE TABLE "NationalTeamRoster" (
  id text PRIMARY KEY,
  "nationalTeamId" text NOT NULL REFERENCES "NationalTeam" (id) ON DELETE RESTRICT,
  "rosterHash" text NOT NULL,
  "sourceVersion" text NOT NULL,
  "sourceCommit" text NOT NULL,
  "sourceBinarySha256" text NOT NULL,
  "rosterDate" timestamptz,
  "observedAt" timestamptz NOT NULL DEFAULT now(),
  "rightsStatus" text NOT NULL DEFAULT 'UNVERIFIED' CHECK ("rightsStatus" IN ('UNVERIFIED', 'APPROVED')),
  status text NOT NULL DEFAULT 'STAGED' CHECK (status IN ('STAGED', 'PUBLISHED', 'ROLLED_BACK')),
  UNIQUE ("nationalTeamId", "sourceBinarySha256", "rosterHash")
);
CREATE INDEX "national_team_roster_status_idx" ON "NationalTeamRoster" (status, "nationalTeamId");
CREATE UNIQUE INDEX "national_team_one_published_roster_idx" ON "NationalTeamRoster" ("nationalTeamId")
  WHERE status = 'PUBLISHED';

CREATE TABLE "NationalTeamRosterPlayer" (
  "rosterId" text NOT NULL REFERENCES "NationalTeamRoster" (id) ON DELETE RESTRICT,
  "playerEaId" text NOT NULL,
  "playerId" text REFERENCES "Player" (id) ON DELETE RESTRICT,
  "sourceHash" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("rosterId", "playerEaId")
);
CREATE INDEX "national_team_roster_player_id_idx" ON "NationalTeamRosterPlayer" ("playerId");
CREATE INDEX "national_team_roster_player_ea_idx" ON "NationalTeamRosterPlayer" ("playerEaId");
