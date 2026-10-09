# Disposable PostgreSQL bridge verification

Run explicitly: `node node_modules/tsx/dist/cli.mjs experiments/futscout-contract-clause-v01/bridge-postgres-test.ts`.
Requires installed PostgreSQL 14 binaries. No downloads, dotenv, DATABASE_URL, DIRECT_URL or production
client. Only a fresh temporary cluster bound to 127.0.0.1, random port, fixed synthetic user/database.
Server directory/port/user/version are asserted before schema application. The existing economic SQL
is applied unchanged with minimal synthetic Player/Club tables. Prisma skills guided the isolated
client/transaction setup; no production writer changes or generated-client changes are needed.

12 sequential native scenarios exercise the real bridge and writer: create, exact read-back/time,
request replay, state dedup, uniqueness rollback, forced observation rollback, lost acknowledgement,
unresolved-attempt guard, concurrent duplicate request, composite FK, immutability/no Current,
and an actual server-blocked transaction followed by reconciliation. A test-only insert trigger
asserts actual `transaction_isolation=serializable`. No retries; concurrency allows only P2002/P2034
for the losing attempt. Final synthetic totals: 3 states / 5 observations / 0 currents.

Cleanup disconnects clients, stops pg_ctl, verifies stopped status and removes only the validated
mkdtemp directory. A success run prints POSTGRES_STOPPED_AND_TEMP_CLUSTER_REMOVED. Local trust auth
and disabled SSL apply only to this disposable loopback cluster, never a deployment configuration.

Test counting: before bridge, 115 = 102 other tests + 13 durable tests. The previous bridge run
executed 102 + 13 NEW bridge tests = 115, omitting durable tests; accumulated total was 128.
This stage runs all 128 existing node:test tests plus 12 separately named native scenarios.
Native scenarios are not additional node:test cases and are reported separately, not as 140 unit tests.

Limits: read-back's settled-absence guarantee relies on the test coordinator owning all attempts.
Production needs durable attempt coordination/fencing and settlement proof; a single SELECT absence
is insufficient. Lost acknowledgement is injected after a real commit, not a real network outage.
No real evidence/license is approved by these tests; next step is review of coordinator and rights
before any real persistence, without enabling Current or UI.
