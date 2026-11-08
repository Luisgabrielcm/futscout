-- Permit a researched gross base estimate to be published as a separate, labelled reference.
-- Existing gross-total salary publications, owner edits and historical rows are unchanged.
CREATE OR REPLACE FUNCTION research_economic_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "ResearchEconomicRevision"%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND (NEW."playerId"<>OLD."playerId" OR NEW.field<>OLD.field OR NEW.revision<=OLD.revision) THEN
    RAISE EXCEPTION 'RESEARCH_ECONOMIC_HEAD_SEQUENCE';
  END IF;
  SELECT * INTO r FROM "ResearchEconomicRevision" WHERE id=NEW."revisionId";
  IF r.id IS NULL OR r."playerId"<>NEW."playerId" OR r.field<>NEW.field OR r.revision<>NEW.revision OR
     r.action NOT IN ('PUBLISH','ROLLBACK') THEN
    RAISE EXCEPTION 'RESEARCH_ECONOMIC_HEAD_MISMATCH';
  END IF;
  IF r.payload IS NOT NULL AND r.field='SALARY' AND NOT (
    (r.payload->>'taxType'='GROSS' AND r.payload->>'composition'='TOTAL' AND
      COALESCE(r.payload->>'weeklyEur','') ~ '^[0-9]+([.][0-9]{1,2})?$')
    OR
    (r.payload->>'taxType'='GROSS' AND r.payload->>'composition'='BASE' AND
      r.payload->>'currency' IN ('EUR','GBP','USD') AND
      COALESCE(r.payload->>'weeklyAmount','') ~ '^[0-9]+([.][0-9]{1,2})?$')
  ) THEN
    RAISE EXCEPTION 'RESEARCH_SALARY_INVALID_COMPOSITION';
  END IF;
  RETURN NEW;
END $$;
