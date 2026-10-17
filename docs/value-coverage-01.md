# Value coverage 01

Base: `origin/beta-next`, commit `6f231a7`. No global audit was repeated.
No database connection, paid API, migration, role change, import, current
selection or public data publication was performed.

## What the numbers establish

| Layer | Available evidence | What it does not establish |
| --- | --- | --- |
| Catalog | Owner reports 16,228 players; existing postgres gate asserts that historical count. | No current database recount in Cloud. |
| Persisted current history | Owner reports 4,951 currents: 3,948 positive, 1,003 null, subject to confirmation. | No new read-back or public eligibility measurement. These totals are not independently confirmed here. |
| Offline collection | `prepareOfflineImport` requires exactly 5,989 HIGH/MATCHED receipts: 1,787 positive EUR and 4,202 null, plus the original selection and chained journal. | Code assertions are not a revalidation of missing private evidence. Receipts/journals remain on the local host. |
| Public eligibility | Existing reader requires a selected MARKET_VALUE current, REAL_WORLD, VALUE/VALID, HIGH/MATCHED, supported currency and safe amount (catalog remains EUR-only). | A collected or staged observation is not a selected public current; rights/identity/temporal review and existing-current overlap still matter. |

**Potential pool:** up to 1,787 positive collected values, subject to local
evidence validation, overlap, currency/amount eligibility and authorization.
The 4,202 null receipts contribute no positive value. Do not add 1,787 to 3,948
as measured coverage: disjointness and current public eligibility are unknown.
**Actually made available by this task: 0.** No real before/after coverage claim.

## Functional delivery

`positive-import.ts` adds a read-only preparation path over the existing full
receipt/journal verifier. `preparePositiveOfflineImport(selectionFile,
evidenceRoot)` always runs `prepareOfflineImport` first. The pure
`buildPositiveImportPlan` helper revalidates all source items and batch metadata,
including deferred null receipts, then uses `buildImportBatches` for the positive
subset. It never creates a new value, plan, request ID, content hash, observation
timestamp, authorization or current-selection decision. Invalid source items,
duplicate players/requests/positions, altered summaries and malformed batches
fail closed. Returned plans are detached from caller input.

The existing preparation command now accepts `--positive-only`:

```
node --import tsx experiments/futscout-value-global-v01/prepare-offline-import.mts --positive-only
```

It uses the existing private local bindings and evidence paths, opens no database
or API client, and prints only counts and batch metadata. It does not print
player IDs, amounts, plans or receipt bodies. The default mixed preparation is
preserved. No private files belong in GitHub or Cloud.

The API returns `source` and `batches` compatible with
`runPreparedStagingBatch`. For an explicitly authorized isolated rehearsal, pass
one returned batch, that exact source, and the frozen player context in the same
order as the batch items to the existing executor. Keep the original full
evidence and its nulls; prioritization is not deletion or exclusion from history.
The executor still checks the original source binding and still requires
`selectCurrent=false`, the shared lock, durable journal, read-back and generation
guards. There is no second importer, collection/balance probe or publishing loop.

## Measured before/after (synthetic scenario, not player coverage)

The regression suite constructs 5,989 synthetic receipts with the reported
1,787/4,202 split. At the existing 100-item limit:

| Preparation | Planned items | Planned batches | NULLs in priority batches |
| --- | ---: | ---: | ---: |
| Existing mixed path | 5,989 | 60 | 4,202 |
| Positive-only path | 1,787 | 18 | 0 |

Original positive amounts/provenance/hashes/timestamps survive unchanged. Tests
feed a positive-only batch to the existing executor and prove zero collection
requests, no null writes, no current publication and idempotent replay. Other
tests reject corrupted deferred nulls, duplicates across batches, weak identities,
zero/wrong-currency values, forged counts and batch metadata. Empty/all-null
inventories produce no batch and no claimed public gain.

## Smallest next action and exact dependencies

1. On the host holding the private evidence, run the new **read-only** positive
   preparation to verify the real 1,787-candidate inventory. No API or database
   permission is needed for this step. Keep output/evidence private.
2. For a separately authorized rehearsal, use the first positive batch with the
   existing executor against a previously provisioned isolated target, verified
   frozen player context, empty generation and exclusive journal/shared lock.
   The current PostgreSQL gate reconciles the entire generation; 18 planned
   batches do **not** imply authorization/support for a multi-batch import loop
   in one generation. Preserve uncertainty locks and reconciliation rules.
3. Public rollout still needs an authorized target and read-back, a bounded
   comparison with existing observations/currents, and explicit current-selection
   policy/authorization preserving old history and rights. Never change this
   staging plan to `selectCurrent=true` to bypass that gate.

The missing private evidence and an authorized isolated database/writer are
separate dependencies. This delivery completes useful preparation without the
three Prisma roles; it does not claim to have solved provider permissions or
silently weaken `generationConnections`. No real import is attempted here.

Validation: `npm run test:value` includes the new planner and the executor
integration regression; `npm run validate` runs the existing Cloud gates.
Result: 18 focused regressions passed; `npm run validate` passed with 2,145
application tests passing, eight opt-in HTTP tests skipped, 57 Value tests
passing, plus TypeScript, lint and build. These checks do not prove real import
or public coverage.
