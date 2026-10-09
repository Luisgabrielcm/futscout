# Experimental durable economic reconciliation

`durable-reconciliation.ts` coordinates the existing bridge and JSON journal. It does not change the economic writer or enable Current. Retain the immutable proposal, source registry, evidence catalog and single-attempt plan separately; the journal stores their references/hashes, not source documents.

The journal identity derives from the bridge requestId, not from a new timestamp. The proposal binds evidenceRef, economic contentHash, original observedAt and selectionHash. A durable BEGIN precedes dispatch. There are no retries.

## Recovery

- NOT_STARTED: authoritative, settled PostgreSQL absence and no outstanding local intent (or explicit reviewed rollback/non-dispatch proof).
- CONFIRMED: exact request, content and original timestamp read-back, with State/Observation identifiers recorded in the journal. A lost receipt is reconstructed from database evidence, not a reconstructed observation.
- UNKNOWN: pending intent without settlement proof, failed read-back or indeterminate transaction. Do not dispatch again.
- CONFLICT: differing content, acknowledgement identifiers, or local/database confirmation. Stop for review.

Uniqueness exceptions alone are never success. Confirmed requests are read back again on restart and never written again. The existing OFFLINE receipt is a journal completion artifact, not independent proof of a database commit. `selectCurrent=false` is mandatory.

## Verification

Run `node node_modules/tsx/dist/cli.mjs experiments/futscout-contract-clause-v01/bridge-postgres-test.ts`.
The existing 12 native scenarios are followed by 11 durable scenarios: lost receipt after commit/rollback/backend termination, restart/replay, uncertainty, cooperative concurrency, divergent content/IDs, corrupt checkpoint and incompatible proposal/selection. Only synthetic data and a loopback disposable PostgreSQL cluster are used; cleanup stops and removes that cluster.

## Limits before integration

Local locks are cooperative, not distributed fencing. Hard process crashes may leave a lock requiring reviewed recovery; never remove an active writer's lock. JSON hash chains detect accidental corruption but are not adversarially authenticated. Settlement proof is a trusted, independently reviewed input; PostgreSQL absence alone cannot rule out an in-flight commit. Production integration requires a durable authorized backend, distributed attempt ownership, approved source rights and temporal evidence policy. No contracts or estimates are published by this module.
