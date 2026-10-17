-- CANDIDATE ONLY: explicitly reviewed administrative transaction required.
-- No role creation, runtime login credentials, destructive DDL or historical backfill.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
LOCK TABLE public."PlayerEconomicCurrent" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='futscout_economic_writer'
    AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) THEN
    RAISE EXCEPTION 'RESTRICTED_WRITER_ROLE_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname IN ('PlayerEconomicState','PlayerEconomicObservation','PlayerEconomicCurrent')
    AND pg_has_role('futscout_economic_writer',relowner,'MEMBER')) THEN
    RAISE EXCEPTION 'WRITER_MUST_NOT_OWN_TABLES';
  END IF;
END $$;
CREATE TABLE public."EconomicCollectionGeneration" (
  id text PRIMARY KEY CHECK (id ~ '^g[1-9][0-9]*$'),
  field text NOT NULL CHECK (field='MARKET_VALUE'),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id,field)
);
CREATE TABLE public."EconomicCollectionFence" (
  field text PRIMARY KEY CHECK (field='MARKET_VALUE'),
  generation text NOT NULL,
  token bigint NOT NULL CHECK(token>0),
  enabled boolean NOT NULL DEFAULT false,
  "promotionEnabled" boolean NOT NULL DEFAULT false,
  FOREIGN KEY(generation,field) REFERENCES public."EconomicCollectionGeneration"(id,field) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE public."EconomicObservationGeneration" (
  observation_id text PRIMARY KEY,
  field text NOT NULL DEFAULT 'MARKET_VALUE' CHECK(field='MARKET_VALUE'),
  generation text NOT NULL,
  FOREIGN KEY(observation_id) REFERENCES public."PlayerEconomicObservation"(id) ON DELETE RESTRICT,
  FOREIGN KEY(generation,field) REFERENCES public."EconomicCollectionGeneration"(id,field) ON DELETE RESTRICT
);
CREATE INDEX economic_observation_generation_lookup ON public."EconomicObservationGeneration"(generation,observation_id);
CREATE TRIGGER economic_generation_immutable BEFORE UPDATE OR DELETE ON public."EconomicCollectionGeneration" FOR EACH ROW EXECUTE FUNCTION public.economic_history_immutable();
CREATE TRIGGER economic_generation_no_truncate BEFORE TRUNCATE ON public."EconomicCollectionGeneration" FOR EACH STATEMENT EXECUTE FUNCTION public.economic_history_immutable();
CREATE TRIGGER economic_membership_immutable BEFORE UPDATE OR DELETE ON public."EconomicObservationGeneration" FOR EACH ROW EXECUTE FUNCTION public.economic_history_immutable();
CREATE TRIGGER economic_membership_no_truncate BEFORE TRUNCATE ON public."EconomicObservationGeneration" FOR EACH STATEMENT EXECUTE FUNCTION public.economic_history_immutable();
CREATE FUNCTION public.economic_generation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE gate public."EconomicCollectionFence"; member text; prior numeric; candidate record;
BEGIN
  IF TG_TABLE_NAME='EconomicObservationGeneration' THEN
    SELECT * INTO gate FROM public."EconomicCollectionFence" WHERE field='MARKET_VALUE' FOR SHARE;
    IF gate.field IS NULL OR NOT gate.enabled OR
       current_setting('futscout.generation',true) IS DISTINCT FROM gate.generation OR
       current_setting('futscout.token',true) IS DISTINCT FROM gate.token::text OR NEW.generation<>gate.generation THEN
      RAISE EXCEPTION 'FENCE_REJECTED' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."PlayerEconomicObservation" WHERE id=NEW.observation_id AND field=NEW.field) THEN
      RAISE EXCEPTION 'MEMBERSHIP_FIELD_INVALID' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.field='MARKET_VALUE' THEN RAISE EXCEPTION 'CURRENT_DELETE_FORBIDDEN' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.field<>'MARKET_VALUE' THEN RETURN NEW; END IF;
  SELECT * INTO gate FROM public."EconomicCollectionFence" WHERE field='MARKET_VALUE' FOR SHARE;
  SELECT generation INTO member FROM public."EconomicObservationGeneration" WHERE observation_id=NEW."observationId";
  IF gate.field IS NULL OR NOT gate.enabled OR NOT gate."promotionEnabled" OR member IS DISTINCT FROM gate.generation OR
     current_setting('futscout.generation',true) IS DISTINCT FROM gate.generation OR
     current_setting('futscout.token',true) IS DISTINCT FROM gate.token::text THEN
    RAISE EXCEPTION 'FENCE_REJECTED' USING ERRCODE='23514';
  END IF;
  SELECT s.presence,s.amount INTO candidate FROM public."PlayerEconomicObservation" o
    JOIN public."PlayerEconomicState" s ON s.id=o."stateId" WHERE o.id=NEW."observationId";
  IF TG_OP='UPDATE' THEN
    SELECT s.amount INTO prior FROM public."PlayerEconomicObservation" o JOIN public."PlayerEconomicState" s ON s.id=o."stateId"
      WHERE o.id=OLD."observationId" AND s.presence='VALUE';
    IF prior>0 AND (candidate.presence<>'VALUE' OR candidate.amount IS NULL OR candidate.amount<=0) THEN
      RAISE EXCEPTION 'PUBLISHED_POSITIVE_PRESERVED' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.economic_generation_guard() FROM PUBLIC;
REVOKE ALL ON public."EconomicCollectionGeneration",public."EconomicCollectionFence",public."EconomicObservationGeneration" FROM PUBLIC;
CREATE TRIGGER economic_membership_guard BEFORE INSERT ON public."EconomicObservationGeneration" FOR EACH ROW EXECUTE FUNCTION public.economic_generation_guard();
CREATE TRIGGER economic_current_generation_fence BEFORE INSERT OR UPDATE OR DELETE ON public."PlayerEconomicCurrent" FOR EACH ROW EXECUTE FUNCTION public.economic_generation_guard();
CREATE TRIGGER economic_current_no_truncate BEFORE TRUNCATE ON public."PlayerEconomicCurrent" FOR EACH STATEMENT EXECUTE FUNCTION public.economic_history_immutable();
GRANT USAGE ON SCHEMA public TO futscout_economic_writer;
GRANT SELECT,INSERT ON public."PlayerEconomicState",public."PlayerEconomicObservation",public."EconomicObservationGeneration" TO futscout_economic_writer;
GRANT SELECT,INSERT,UPDATE ON public."PlayerEconomicCurrent" TO futscout_economic_writer;
-- No initial generation/policy or promotions: fail closed until separately approved activation.
-- Effective inherited role grants, PUBLIC schema CREATE and login memberships still require audit.
