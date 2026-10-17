-- REVIEW-ONLY production candidate. Do not run without a separately approved change window.
-- Execute as the database administrator before generation-install.candidate.sql.
-- No password, login, table ownership, global privilege or role membership is created here.
CREATE ROLE futscout_economic_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;

-- The additive migration grants only USAGE on public; SELECT/INSERT on economic
-- State, Observation and generation membership; SELECT/INSERT/UPDATE on Current.
-- A dedicated login credential must be provisioned outside Git, after the
-- application binding and effective-privilege audit are approved. Never reuse
-- the public DATABASE_URL or administrative DIRECT_URL for this role.
