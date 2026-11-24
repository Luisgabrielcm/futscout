-- An absent legacy club must not prevent an identity-verified economic reference.
-- Existing identity/club foreign keys, immutable history, head guards and owner priority remain unchanged.
ALTER TABLE "ResearchEconomicRevision" ALTER COLUMN "clubId" DROP NOT NULL;

CREATE OR REPLACE VIEW "ResearchEconomicPublic" WITH (security_barrier=true) AS
  SELECT h."playerId",h.field,h.revision,r.payload,r.classification,r."sourceUrl",r."sourcePublishedOn"
  FROM "ResearchEconomicHead" h JOIN "ResearchEconomicRevision" r ON r.id=h."revisionId"
  JOIN "Player" p ON p.id=h."playerId" AND p."externalId"=r."eaId"
    AND p."clubId" IS NOT DISTINCT FROM r."clubId"
  WHERE r.payload IS NOT NULL AND r."playerId"=h."playerId" AND r.field=h.field AND r.revision=h.revision
    AND NOT EXISTS (SELECT 1 FROM "AdminEconomicHead" a WHERE a."playerId"=h."playerId" AND a.section=h.field);
