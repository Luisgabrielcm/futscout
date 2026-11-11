-- Permit researched weekly salary references with explicit tax basis, composition,
-- season, original currency and verified EUR normalization. Owner edits and history remain unchanged.
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
    (r.payload->>'taxType' IN ('GROSS','NET','UNKNOWN') AND
      r.payload->>'composition' IN ('BASE','GUARANTEED','TOTAL','UNKNOWN') AND
      r.payload->>'currency' IN ('EUR','GBP','USD') AND
      COALESCE(r.payload->>'weeklyAmount','') ~ '^[0-9]+([.][0-9]{1,2})?$' AND
      COALESCE(r.payload->>'weeklyEur','') ~ '^[0-9]+([.][0-9]{1,2})?$' AND
      COALESCE(r.payload->>'season','') ~ '^20[0-9]{2}(-20[0-9]{2})?$' AND
      ((r.payload->>'currency'='EUR' AND (r.payload->>'weeklyAmount')::numeric=(r.payload->>'weeklyEur')::numeric
        AND r.payload->'fx'='null'::jsonb) OR
       (r.payload->>'currency' IN ('GBP','USD') AND jsonb_typeof(r.payload->'fx')='object' AND
        COALESCE(r.payload->'fx'->>'unitsPerEur','') ~ '^[0-9]+([.][0-9]{1,6})?$' AND
        COALESCE(r.payload->'fx'->>'asOf','') ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' AND
        COALESCE(r.payload->'fx'->>'sourceUrl','') ~ '^https://[^[:space:]]+$')))
  ) THEN
    RAISE EXCEPTION 'RESEARCH_SALARY_INVALID_COMPOSITION';
  END IF;
  RETURN NEW;
END $$;
