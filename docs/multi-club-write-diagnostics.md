# Multi-club identity write diagnostics (F.2)

## Scope and safety

This change adds diagnostics, not authorization. It does not enable a new cohort,
retry a failed player, change public STOP statuses, change thresholds/margins, or
change the Serializable transaction settings (`maxWait: 5000`, `timeout: 15000`).
No schema, migration, cache refresh or matcher change is involved.

The historical F.1 `VALIDATION_FAILURE` cannot be reconstructed retroactively.
Timeout is a hypothesis only; these diagnostics must not be presented as evidence
that the historical failure was a timeout.

## Previous ambiguous origins

| Origin | Diagnostic stage / gate now | Previous control status |
| --- | --- | --- |
| Atomic policy target/provider mismatch | AUTHORIZATION / AUTHORIZATION_MISMATCH | VALIDATION_FAILURE |
| Prepared club/team mismatch | IDENTITY_VALIDATION / CLUB_IDENTITY_MISMATCH | VALIDATION_FAILURE |
| Decision, scores, birth, club, margin, confidence, autosave invalid | MATCHER_REVALIDATION / MATCHER_NOT_AUTO_MATCH | VALIDATION_FAILURE |
| Prepared cache hash, expiry or invalid clock | CACHE_VALIDATION / CACHE_HASH_MISMATCH or CACHE_INVALID | VALIDATION_FAILURE |
| Prepared or persisted snapshot mismatch | SNAPSHOT_VALIDATION / SNAPSHOT_MISMATCH | VALIDATION_FAILURE |
| Invalid identity dates | IDENTITY_VALIDATION / INVALID_IDENTITY | VALIDATION_FAILURE |
| Authorization expiry during validation | AUTHORIZATION (POST_WRITE_VALIDATION after writes) / AUTHORIZATION_EXPIRED | VALIDATION_FAILURE |
| Player missing on reload | PLAYER_RELOAD / PLAYER_NOT_FOUND | VALIDATION_FAILURE |
| Reloaded identity changed | IDENTITY_VALIDATION / PLAYER_STATE_CHANGED | VALIDATION_FAILURE |
| Existing incoherent association/Attempt or preexisting Attempt | ATTEMPT_VALIDATION / ATTEMPT_STATE_CHANGED | VALIDATION_FAILURE |
| Persisted cache pin/expiry mismatch | CACHE_VALIDATION / CACHE_HASH_MISMATCH or CACHE_INVALID | VALIDATION_FAILURE |
| Revalidation callback throws | Current/known stage, approved gate or database code preserved | Usually VALIDATION_FAILURE |
| Unclassified transaction acquisition/read/update error | Current stage / database category or UNKNOWN_FAILURE | VALIDATION_FAILURE |
| Legacy Barcelona adapter setup catch | AUTHORIZATION / known gate or UNKNOWN_FAILURE | VALIDATION_FAILURE |
| Multi-club pre-persistence catch: club order, completed identity, preparedMatch, audit, query failure | Known gate or current stage / safe category | VALIDATION_FAILURE unless existing named STOP reason |
| preparedMatch rejects decision or pristine Player/cache baseline | MATCHER_NOT_AUTO_MATCH or PLAYER_BASELINE_CHANGED gate | Converted by caller |
| Initial Git/envelope/summary/baseline failure | AUTHORIZATION or PREFLIGHT; typed safe error, no writable dependency | Throw / CLI abort |
| CLI outer catch | Structured safe diagnostic rather than generic text alone | CLI exit 2 |

`expectedUpdatedAt` drift, ownership conflict, zero-row update, Attempt creation
failure, serialization abort and unknown commit retain their original control
statuses. New diagnostic codes do not control retries or authorize writes.

The single-club and older Barcelona orchestrators are not the multi-club path.
Their own orchestration catch policies are unchanged; successful calls to the
shared atomic implementation now return additive diagnostics.

## Result and event contracts

`AtomicMatchResult` keeps `status`, `playerId`, `providerId` and adds `clubId`,
`diagnostic` and `events`. Optional typing preserves compatibility with legacy
dependency doubles; the real atomic implementation produces diagnostics on all
normal result paths. A dependency missing diagnostics is reported as unknown,
never assigned a fabricated confirmed transaction state.

`diagnostic` contains `stage`, `gate`, `code`, fixed `reason`, `transactionState`,
and optional allowlisted `originalCode` / `codeChain`. Raw-query P2010 and driver
P2039 wrappers preserve recognized nested database codes, never driver messages.
Stage/code unions and fixed reasons
live in `services/identityWriteDiagnostics.ts`. Existing recognized gate labels
remain distinct even if they share a diagnostic category.

`candidateReports` covers every approved execution position, including candidates
not reached. Each entry contains timestamp, batch ID/hash, execution position,
club ID, Player ID, provider ID, public status and diagnostic.

`events` records START, VALIDATION_PASS, TRANSACTION_STARTED, UPDATE_PASS,
ATTEMPT_PASS, COMMIT_CONFIRMED, FAILED, AUDIT_START and AUDIT_PASS. Boundary events
have a club ID and null candidate/position; their stage is CLUB_BOUNDARY_AUDIT.
An audit failure does not overwrite a previous candidate's confirmed commit.

The existing CLI prints live structured JSONL on stderr and the complete final
JSON on stdout. Operators should retain both streams for a separately authorized
execution. A process termination can lose the final stdout report; earlier live
events are not proof of COMMIT unless COMMIT_CONFIRMED was emitted.
Disconnect failures use CLIENT_CLEANUP and retain the last observed candidate
transaction state instead of incorrectly claiming that no transaction started.

Observers are non-throwing and receive copies; they are not safety gates. Event
timestamps use wall-clock observation, without consuming the injected policy
clock or changing its expiration checks.

## Transaction states: do not overclaim

| State | Evidence |
| --- | --- |
| NOT_STARTED | Pre-transaction gate rejection, known pool acquisition failure, or candidate not dispatched |
| START_UNCONFIRMED | Acquisition failed without evidence that the callback began |
| STARTED | Prisma entered the transaction callback |
| ROLLED_BACK | Managed transaction rejected on the rollback path; no commit acknowledged |
| ROLLBACK_UNCONFIRMED | Connection failure prevents claiming server rollback acknowledgement |
| COMMIT_CONFIRMED | The transaction promise resolved; for early validation returns this is a completed transaction **without a Player update**, not a successful match |
| COMMIT_INDETERMINATE | Callback returned but commit acknowledgement failed; do not retry |

The original code returns several validation failures normally from the callback.
Those read-only transactions finish normally: reporting ROLLED_BACK for them
would be incorrect. Interpret transactionState together with public status and
UPDATE/ATTEMPT events. Connection ambiguity is not hidden.

Serialization/deadlock rejection at commit remains SERIALIZATION_FAILURE and
ROLLED_BACK, not a fabricated successful commit. Indeterminate commits preserve
the existing global STOP and independent read-only reconciliation.

## Safe error classification

- P2034 / 40001 / 40P01: SERIALIZATION_FAILURE.
- P2002 / 23505: UNIQUE_VIOLATION (existing public status precedence unchanged).
- Known connectivity codes: CONNECTION_FAILURE.
- P2028: TRANSACTION_TIMEOUT only with an explicit recognized expired/timed-out
  transaction indication; otherwise TRANSACTION_ERROR. P2028 alone is not proof.
- Other allowlisted DB codes: DATABASE_ERROR; unknown errors: UNKNOWN_FAILURE.
- Commit ambiguity: INDETERMINATE_COMMIT, preserving an approved original code.

No arbitrary error messages, SQL, parameters, stacks, meta, headers, tokens or
connection strings are included. Recognized error text is used only for closed
classification; the returned reason is always a fixed literal.

## Revalidation cost (deterministic fake measurement)

The instrumented real adapter, using five synthetic clubs with no snapshots,
performs **42 Prisma/raw-query method calls per successful write transaction**:

- 4 narrow reads: Player, provider owner, Attempt, cache pin;
- 25 broad reads: 5 clubs x (club, roster cache, cache hash, relevant Players,
  latest lineup snapshot);
- 11 global audit reads: 9 table hashes + all Player hashes + all Attempt rows;
- 2 writes: conditional Player update + Attempt create.

Thus 36 of 40 reads are broad revalidation. Each `validateCurrent` also evaluates
all five club reports and verifies the 20 original selected identities (including
already completed ones). The same broad state is read outside the write transaction
before and after each candidate, plus club boundaries.

These are **adapter method counts**, not a claim of 42 PostgreSQL protocol
statements: Prisma relation loading can expand one method into additional SQL.
The test does not measure production latency or prove the historical timeout.

Future performance work should first profile stage durations and actual SQL
counts. Pure, immutable envelope/order validation could potentially be prepared
outside the transaction. Mutable identity, ownership, Attempt, timestamp, cache
and any state used to authorize writes must still have an equivalent concurrency
defense inside it. Do not simply move global reads outside and remove TOCTOU
protection; any replacement needs a separately reviewed consistency contract.

## Regression coverage

Deterministic tests cover each requested gate, safe reason/code serialization,
P2028 with and without timeout evidence, unknown errors, known callback errors,
normal early transaction returns, rollback after update, lost commit acknowledgement,
16 successes + failure17 + untouched18-20, and boundary/global audit failures.
The existing READ ONLY tests continue to verify SET TRANSACTION READ ONLY and
managed ROLLBACK. No production runner is executed by these tests.

Future resumption requires a new reviewed scope and fresh baseline/authorization;
this change neither creates nor approves one.
