# Contract sync offline v0.1

Pure in-memory simulator. No fetch, credentials, database, filesystem writer,
ambient clock, production imports or real source registered. All publication,
persistence and current flags stay false, including authorized synthetic cases.

## Modules and use

1. `source-registry.ts`: versioned permissions for access, storage, history,
   publication and commercial use. All must be CONFIRMED with an evidence reference.
   UNKNOWN/RESTRICTED/missing permission disables the source. Caller assertions
   are not a legal verification; no real provider has been authorized here.
2. `planner.ts`: `freezePlan(candidates, registry, evaluationAt)` freezes IDs,
   payloads, registry version and ordering under SHA-256. Priority: new change,
   conflict, missing contract, near/overdue expiry, other. Tie: Player.id/requestId.
   Near expiry is a conservative six-month period triage rule, not factual dating
   or validity. YEAR/MONTH are never converted to contractual days. Source discovery
   is assumed batched upstream; this simulator accepts captured evidence, not a
   per-player fetcher. `nextBatch` returns at most 100 and respects fixed boundaries.
3. `eligibility.ts`: reuses temporal v0.2 (which reuses contract v0.1). HIGH identity,
   consistent independently supplied player/club/time context, evidence rights and
   explicit corroboration of contractual terms are required. Club conflicts and
   contract changes remain distinct. Review eligibility is NOT write permission.
4. `replay.ts`: `startReplay`, `replayStep`, `reconcileReplay`. Each SUCCESS records
   a deterministic OFFLINE_ONLY receipt from preserved input, never a new source
   consultation. Ineligible results retain reasons, with no observation. Progress
   and prefix hashes at 25/50/75/100 and final remainder; complete replay state is
   serializable for interruption between checkpoints. No IO is performed here.

The caller supplies original observedAt; syntax cannot prove that it is genuine.
Publication/effective/verification timestamps remain separate. Missing timestamps
are rejected, never replaced with the current time. Real pilot drafts remain
unchanged regression fixtures and do not enter the synthetic replay.

## Resume and idempotency

- requestId identifies one captured evidence occurrence for a player/context.
  eventId is not merely a reusable article URL; provenance sourceReference may be
  shared across many players extracted from one document. Exact duplicate requests
  collapse; divergent payload or reassigned event request ID fails closed.
- Stop calling replayStep after INTERRUPTED/UNCERTAIN. INTERRUPTED leaves the last
  completed cursor intact. UNCERTAIN locks progress. There are no automatic retries.
- APPLIED reconciliation requires an exact existing receipt; it restores that
  receipt, not a newly observed fact. NOT_APPLIED requires an explicit referenced
  reconciliation and permits a later explicit replay of the preserved payload.
  STILL_UNKNOWN stays blocked. These are synthetic reconciliation inputs, not
  substitutes for a future database read-back. Old timestamps are preserved.
- Resuming uses the exact frozen plan/registry and full receipt ledger, never just
  a numeric cursor. Altered hashes/order/policy are rejected. Repeated successful
  delivery does not append another receipt. New genuine observations may reuse an
  offline state hash but retain their own request and observedAt. Offline hashes
  have a separate sync-version namespace and include qualifiers/options/calendar;
  observation and verification times do not change that state fingerprint.
  Original v0.1 hashes remain separately available inside the temporal assessment.

## Limits / next gate

Only memory and hash-based integrity, not durable storage, signed proofs, database
transactions, distributed leases or global cross-run deduplication. Process one
nextBatch at a time; queue/state must be retained by the future orchestration layer.
No network budget is consumed or simulated as real provider credit. A future
authorized connector must enforce per-source budgets/rate limits and pause on
429/transport; no source scraping or connector is included.

No State/Observation/Current or historical economic hashes changed. Any later
writer requires approved evidence-catalog mapping, rights/retention policy,
current-selection policy and Serializable/CAS/read-back. Renewal/transfer/
termination marks old evidence historical; no club/expiry mutation. Options remain
independent and unknown clauses remain UNKNOWN.

Smallest next step: review synthetic dry-run receipts/checkpoints and define the
durable evidence-catalog/reconciliation interface, still offline. Do not connect
real feeds or persist real contracts until their separate gates are approved.

Validation: run existing contract/adapter/temporal tests plus `sync-offline.test.ts`,
TypeScript `--noEmit --incremental false`, focused ESLint and whitespace checks.
