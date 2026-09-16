# Transfer persistence — Phase E

The prepared schema was applied separately in Phase D. This implementation adds an
injected Prisma store and a manual, closed-cohort operator. It does not change the
temporal domain policy, Player, Club, EA sync, public UI or legacy PlayerTransfer.

## Boundaries and transactions

`prismaTransferObservationStore` implements the Phase C append-only port. Identity is
rechecked, source facts are revalidated by `prepareTransferHistory`, and inserts use
Prisma `createMany(skipDuplicates)` / PostgreSQL ON CONFLICT DO NOTHING. No observation
UPDATE/DELETE exists. Source corrections remain separate rows with domain-produced
possibleRevisionHashes; these are hints, not invented provider event IDs.

The controlled orchestration uses one SERIALIZABLE transaction per player, covering
all observation inserts, revision links, read-back and the PROPOSED projection. A
shared Player row lock prevents identity/EA membership updates during that unit.
The reviewed Player.updatedAt, exact team directory, roster and lineup table hashes
are checked again. A serialization/ownership/constraint/read-back failure rolls back
that entire unit and stops the batch; earlier committed players remain committed.
No retry is automatic. Unknown commit outcome requires audit before any rerun.

Projection creation is insert-only here. An identical existing projection is a no-op;
a different one requires review, not upsert. Proposed evidence always has writable=false.
Unknown teams keep provider IDs/raw names in observations; observation schema has no
Club foreign key. Exact-ID resolutions are derived. An unresolved destination can be
retained in the proposed providerTeamId while its clubId stays null. The engine's
decision/reason/effectiveSince are preserved, not converted to a promoted membership.

## Manual operation

Only `scripts/persistTransferObservationPilot.ts` is operational. Its closed six-player
scope uses the existing audited identities, not player-specific matching rules.
It reads the original ignored Phase B structured artifact, pinned by SHA-256. Missing,
modified or foreign identity payloads are rejected; no reconstruction from prose and
no HTTP transport are allowed. `fetch` is disabled by the operator.

Modes: `--dry-run`, `--write`, `--rerun`, `--audit`, each followed by `--head <full SHA>`.
The checkout must be clean beta-next at that exact committed SHA. DIRECT_URL is used
for this explicit administrative operation; public runtime configuration is unchanged.

Dry-run uses verified READ ONLY transactions and rollback. Its JSON plan binds all
inputs, protected hashes, identities and decisions. Write requires the same plan and
snapshot, no older than five minutes. All six are planned before writing any player.
The replay uses the same evaluation instant/source snapshot within that window, so
evaluatedAt, createdAt and every existing projection/observation remain identical.
A later operational run needs a fresh reviewed plan; changing existing projections
is deliberately not enabled by this pilot. Checksums detect accidental corruption,
not authorization. Explicit operator authorization is still required for writes.

Durable ignored attempt markers are written before mutation. A partial/indeterminate
run cannot silently reuse the same marker. Inspect audit results and obtain direction;
do not delete the marker merely to bypass the safety gate.

The operator records before/after counts, all 14 protected table hashes, complete six
Player rows, full observation/projection read-back, insert/no-op/revision counts, query
counts (never SQL parameters), and fail-stop status. Unknown-team reviews remain separate
from promotion readiness. Strong temporal proposals still require a new authorization
and a separately designed promotion contract. No scheduler, master merge or deployment.

## Validation and limits

Tests use Prisma-shaped transactional fakes: insert, no-op, ownership, exact/unknown
team resolution, revisions, rollback, projection, read-back tampering, source changes,
expired plans, allow-list and fail-stop. They do not prove concurrent PostgreSQL lock
scheduling. Real triggers are inspected by catalog, never destructive probes.

Per-player source/identity/history reads are bounded; observation insert/read-back is
two operations per new event (explicit N+1 tradeoff for the 31-event pilot). No 16k-player
query loop is used. Bulk insertion may be considered for scale separately. Global
integrity hashes scan existing tables before/after operations, not once per event.

Array columns have the prepared SQL defaults, but permit SQL NULL at storage level;
the adapter rejects NULL arrays rather than masking them. Database permissions must
not permit an eventual restricted application role to disable append-only triggers.
No role/permission change or new migration is included here.
