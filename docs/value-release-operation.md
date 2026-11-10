# Value stage-only release

This procedure imports the 12,280 frozen FutScout estimates without selecting
Current, changing the 3,948 supplier values, or approving publication/licensing.
Never run the disposable integration test against Production.

## Inputs and target binding

Use Node 24 and the local dependencies. Preserve the existing bundle, coverage,
and manifest byte hashes; do not regenerate predictions or preparation timestamps.
Keep all target files, resource evidence, journals and receipts in `audit/output`.

Create a reviewed target JSON (no connection string):

```json
{
  "version": "value-release-target-v1",
  "environment": "STAGING",
  "resourceRef": "provider/project/resource-id",
  "connectionEnv": "FUTSCOUT_RELEASE_WRITER_URL",
  "identityEvidence": { "file": "audit/output/release/resource-binding.private.json", "sha256": "REPLACE_WITH_SHA256" },
  "expected": {
    "host": "REPLACE_WITH_VERIFIED_HOST",
    "port": 5432,
    "database": "REPLACE_WITH_VERIFIED_DATABASE",
    "username": "REPLACE_WITH_RESTRICTED_WRITER",
    "databaseOid": "REPLACE_WITH_DATABASE_OID",
    "serverVersionNum": "REPLACE_WITH_VERSION_NUM"
  }
}
```

The separately reviewed evidence JSON must contain the same `resourceRef`,
`environment`, `expected`, and a `verificationMethod`. Bind an actual provider
resource ID to the database using trusted provider metadata and a read-only
database preflight; a hostname, variable name, or operator-chosen database name
alone is insufficient. Pin the evidence bytes by SHA256. This attestation is an
input to the command, not an automatic provider verification or license approval.

Provide the selected connection variable securely through the process environment;
the executor never loads `.env` and rejects DATABASE_URL/DIRECT_URL selection.
STAGING/PRODUCTION require TLS `sslmode=verify-full`. DISPOSABLE accepts loopback
only. No URLs/credentials are accepted in command arguments or printed.

The writer must have SELECT on Player/economic tables and INSERT on State and
Observation only. It must lack ownership/elevated membership, schema CREATE,
history mutation and Current DML. Existing history guards must remain enabled.
Provisioning these permissions is a separate administrative operation.

## Commands

From the repository root, use the same arguments for all modes:

```powershell
$releaseArgs = @(
  '--target', 'audit/output/release/target.private.json',
  '--bundle', 'audit/output/value-final-activation-prep-01/staging-bundle.private.json',
  '--bundle-sha256', 'c6cf92821ef86c948aca2bff8aba7376acd1fae76788d96d176a12782fc73906',
  '--coverage', 'audit/output/value-benchmark-remediation-01/coverage.private.json',
  '--journal', 'audit/output/release/staging.journal.private.ndjson'
)
node node_modules/tsx/dist/cli.mjs scripts/runValueRelease.ts preflight @releaseArgs
node node_modules/tsx/dist/cli.mjs scripts/runValueRelease.ts import @releaseArgs
```

Confirm the bundle hash against the original private manifest before use. For a
future separately authorized PRODUCTION invocation, the target environment must
be PRODUCTION and arguments must additionally include `--authorize-production`
with the exact reviewed resourceRef. This flag is an intentional technical gate;
it does not obtain business authorization or satisfy rights/quality conditions.

## Ordering and stop conditions

1. Freeze the code artifact; verify hashes, target resource, PostgreSQL version,
   actual schema, applied migration checksums, immutable triggers and effective
   role separation in a read-only preflight. Stop on unexplained drift.
2. Authorize the change window separately. Pause/drain economic writers. Take a
   fresh consistent backup of schema, identities, all economic fields, observations
   and Current; hash it and test restoration in a disposable target-major cluster.
3. Review all pending migrations. The new migration is
   `20261020000000_economic_amount_precision_38_18`, depending on the existing
   `20261006000000_player_economic_data_v1`. Do not deploy unrelated pending SQL
   blindly. After approval, `npx prisma migrate status --config prisma/valueRelease.config.ts` then
   `npx prisma migrate deploy --config prisma/valueRelease.config.ts` use only
   the explicitly verified administrative FUTSCOUT_VALUE_MIGRATION_URL, supplied
   securely to that process. This config does not load .env and never falls back
   to DATABASE_URL/DIRECT_URL. These commands are never invoked by the writer.
   Generate/validate the client explicitly. No reset, db push or seeding.
4. Verify NUMERIC(38,18), supplier/Current baseline, and exact equality for wages,
   clauses and nulls as well as market values. Migration lock timeout is 5s and
   statement timeout 30s; a timeout stops the release without retries.
5. Run preflight and import above with the dedicated writer. Only estimates are
   staged. Journal intentions are fsynced BEFORE writing and receipts AFTER commit.
   Hash chains bind the journal to the bundle and target. One database advisory
   lock excludes other copies of this executor; unrelated writers still require
   operational draining. Current and supplier history baselines are checked.
6. Reconcile 16,228 identities and exact decimal text, original provider history,
   provenance, request IDs, and unchanged Current. A second import must add no
   rows. Preserve pre-existing null/history rows: total table row counts need not
   equal 16,228. The existing policy still permits 3,946 values and retains 12,282
   under the frozen baseline; any actual drift requires review.
7. Deploy the reviewed reader artifact only after separate release authorization.
   Import is not Current promotion. Estimates remain blocked by existing rights,
   quality and activity/identity gates. Keep the sole public marketValue and the
   approved title/euro formatting.

## Interruption, resume and rollback

Never retry automatically after a transport error or ambiguous commit. If the
journal has PENDING, import stops. Inspect the error and run explicitly:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/runValueRelease.ts reconcile @releaseArgs
node node_modules/tsx/dist/cli.mjs scripts/runValueRelease.ts import @releaseArgs
```

Reconcile accepts only an already committed request with matching identity, hash,
timestamp, exact decimal and unchanged baseline. If absent, it stays blocked:
absence does not establish termination of a lost transaction. Obtain independent
transaction-termination evidence and a reviewed recovery procedure; never edit or
truncate the journal to force a retry. A torn journal also stops for investigation.

After complete staging, logical withdrawal reuses the existing service:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/runValueRelease.ts withdraw @releaseArgs
```

Withdrawal is idempotent, retains immutable history, changes no Current, and
permanently closes this journal to import. An incomplete batch remains paused and
unpublished until reconciled; it is not deleted. Do not narrow back to NUMERIC(20,2)
after sub-cent estimates exist. Roll back a reader deployment only to a verified
compatible artifact. A database restore requires separate authorization and a
plan for subsequent unrelated writes.

## Local rehearsal and release evidence

`node node_modules/tsx/dist/cli.mjs tests/integration/valueStagingValidation.ts`
creates its own disposable PostgreSQL 14 cluster, applies the versioned migration,
checks shared economic fields, exercises the operational command, interrupted
checkpoint reconciliation, replay, withdrawal, reader gates and cleanup.
It accepts no destination arguments. Run the target PostgreSQL major rehearsal
before a Production release if it differs from 14.

`npm run build:isolated` validates the reader without productive URLs or API keys.
The repository CI is a quality workflow, not proof of a Production deployment.
The current checkout has uncommitted work: HEAD alone is not a release artifact.
Confirm Vercel project ID, Production branch, exact deployed commit/deployment ID
and a compatible rollback deployment through the deployment operator before GO.

## Director-provided Studio evidence — 21 October 2026

Accepted without repeating those queries: PostgreSQL 17.2; 16,228 players;
23 completed migrations, none incomplete; NUMERIC(20,2); 4,951 MARKET_VALUE
Current entries; 3,948 positive states and 1,003 nulls. These statements do not
identify a local secret or establish administrative/writer effective privileges.
Locally there are 24 migration directories: 23 predecessors and the new precision
migration. Compare the already obtained names/checksums with the local inventory;
a matching count alone is not checksum reconciliation. Do not fabricate that list.
The existing private Production preflight receipt dated 13 October contains 23
completed migrations. All 23 names and file SHA256 checksums match the local
predecessors; only the new precision migration is absent from that receipt.
This comparison uses existing evidence and is not a fresh Production query.

Remaining GO evidence is confined to the explicit credential/resource binding,
effective roles, fresh restorable backup, exact migration reconciliation and the
reviewed deployment/rollback artifacts. No new value/model investigation is needed.
Staging the bundle still does not publish the 12,280 experimental estimates.
