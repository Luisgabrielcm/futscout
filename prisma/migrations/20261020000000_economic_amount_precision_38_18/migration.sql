-- Widen shared economic amount storage, preserving VALUE/NULL and history.
-- MARKET_VALUE, WAGE_WEEKLY and RELEASE_CLAUSE retain their existing semantics.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='PlayerEconomicState' AND column_name='amount'
      AND data_type='numeric' AND (numeric_precision,numeric_scale) IN ((20,2),(38,18))) THEN
    RAISE EXCEPTION 'UNEXPECTED_ECONOMIC_AMOUNT_SCHEMA';
  END IF;
END $$;
ALTER TABLE public."PlayerEconomicState" ALTER COLUMN amount TYPE NUMERIC(38,18)
  USING amount::NUMERIC(38,18);
COMMIT;
