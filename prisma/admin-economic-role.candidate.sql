-- Candidate for role-capable PostgreSQL only. Prisma Postgres does not support
-- CREATE ROLE or per-credential grants: never execute this file there.
-- On a role-capable server, run after the additive migration with an authorized
-- migration owner. Provision a separate LOGIN and grant membership outside it.
CREATE ROLE futscout_admin_economic NOLOGIN;
GRANT USAGE ON SCHEMA public TO futscout_admin_economic;
GRANT SELECT ON "Player","AdminEconomicRevision","AdminEconomicHead",
  "AdminLoginAttempt","AdminSession","AdminTotpStep" TO futscout_admin_economic;
GRANT INSERT ON "AdminEconomicRevision","AdminEconomicHead","AdminLoginAttempt",
  "AdminSession","AdminTotpStep" TO futscout_admin_economic;
GRANT UPDATE ON "AdminEconomicHead","AdminLoginAttempt","AdminSession" TO futscout_admin_economic;
-- Grant SELECT only on AdminEconomicPublic to the independently identified
-- public runtime role after verifying that role. The view hides audit history.
