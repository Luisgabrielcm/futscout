# Incremental REAL and FutScout GAME preparation

This preparer reuses the existing catalog comparison and archived evidence. It never
queries a database, invokes a provider, writes player data or enables readers.
`services/globalTransferAutomation.ts` calls the existing joint context planner.

Inputs are private, versioned envelopes: original EA membership, confirmed REAL
facts, identity bindings, licensing evidence and hashes. A current roster proves
`CURRENT_CLUB_CONFIRMED`; it does not establish a permanent transfer, ownership of
the main contract, an active loan or closure of a previous loan. Loan movements still
require route, chronology and movement evidence. An expired historical loan is not
evidence of a return. Source discrepancies remain attached to their own snapshots.

The preparer deduplicates exact candidates, isolates contradictory evidence by EA
ID, excludes published selections, and checks source binding, observation age and
future dates. The existing projection policy additionally validates availability,
individual eligibility where required, original EA data and independent national
teams. A failed player does not block safe players. Unknown transfer types and
unproved licensing remain pending. No identity classification or economic field is
part of the write payload.

Local execution uses `sync/runGlobalTransferPreparation.ts --input <private-file>
--sha256 <private-input-file-hash> --out <new-private-plan>`. Both paths must be under
the ignored `audit/output` directory. It verifies the supplied file bytes and refuses
to replace an existing output. It prints counts only. Private hashes, packages,
receipts and source captures must not be committed to the public repository.

Plans contain up to 100 complete player pairs per transaction (maximum 200), stable
batch IDs, compare-and-swap rollback requirements and a checkpoint bound to the
input. Completing a checkpoint requires an independently verified execution receipt;
the preparer itself cannot attest that a database transaction happened. Replaying
unchanged inputs produces the same plan. Changed inputs invalidate the checkpoint.

Before any future publication, read the selected target records again, bind actual
selection versions/revision hashes and normalize PostgreSQL timestamp metadata to
UTC. Preserve existing joint history and require explicit closure of active loans.
Recheck protected player hashes, actual club bindings, backup and authorization.
Then use `prepareJointRealGameCommit` and `commitJointTransfers`; the latter writes
complete pairs in one serializable transaction. A bounded operator timeout must be
chosen for the approved transaction size. On a real concurrent edit, requeue only
that player and refreeze the remaining batch before writing it.

Publication and reader activation are separate gates. The existing `DATABASE`
transport retains its ten-ID limit and original manifest hash format. The opt-in
`DATABASE_INDEX` transport supports up to 512 IDs, including the union of the ten
published loans and the 351 additions. Its version-2 root pins each ordered EA ID,
selection version, revision ID, decision, payload hash and original snapshot ID/hash,
as well as the approved eligibility policy. Different batch decisions can coexist.
`extendJointReadIndex` preserves every protected prior entry and rejects replacement.
The cohort lists are validation groups, not permission to remove published readers.
Readers remain off by default and `git.deploymentEnabled.beta-next` stays false.

For `DATABASE_INDEX`, supply only the ordered `JOINT_TRANSFER_READ_EA_IDS`, the
privately approved index root in `JOINT_TRANSFER_READ_MANIFEST_SHA256`, existing
reader/policy gates, and `JOINT_TRANSFER_READ_MANIFEST_SOURCE=DATABASE_INDEX`.
Omit both the inline manifest and the legacy common selection-version variable;
versions are pinned per entry in the index. Never change shared variables to prepare
this configuration. Existing inline and ten-ID database deployments are unaffected.

The new reader authenticates the complete index in one metadata-only bulk call.
It then fetches only requested payloads in one bulk call, and clubs in another.
Every consumed payload, snapshot metadata and club identity is verified against the
index, including selection changes between calls. Immutable revision/reference
constraints remain required. Unrequested payload JSON is not downloaded or rendered;
its selection and declared hashes remain pinned. Full catalog/filter/national-team
reads use the same bounded bulk operations. Verified immutable bodies/views have a
process-local cache partitioned by database client, approved root and UTC day, with
at most two roots of up to 512 entries per client. No failed read populates it.
Warm calls still authenticate the entire mutable selection index and live clubs;
they skip payload transfer/validation already proved for those immutable bodies.
Returned data are cloned to prevent callers mutating cached approvals. A new UTC
day revalidates loan chronology. There is no per-player query, persistent
cache, provider call, transaction/session override or schema change. Local tests
measure bounded query counts/bytes and CPU; actual pooled latency remains a protected
Preview gate before public activation.

## Four frozen batches and isolated validation

The private 100/100/100/51 batches retain their original payloads and hashes. They
contain 24 documented current loans and 327 current-club confirmations, not 327
newly proved permanent transfers. Keep the pending queue, identity conflict and
four earlier independent club-context readers outside these additions. Private
revisions, protected indices, receipts, scoped dependency lists and per-batch
rollback plans stay in ignored storage.

Reconcile only the required isolated staging players/clubs/leagues against the
frozen package. Preserve existing staging records and the published-ten comparison
controls; do not assume the earlier ten-player seed contains all 351 dependencies.
Loading additional staging records and creating a protected deployment require
their operational authorization. Use the existing staging project and pooled
READ ONLY runtime, with preparation credentials kept out of runtime. Do not copy
unrelated records or private source packages into the deployment build.

After authorized isolated preparation, verify the entire 361-entry index and each
batch, then test a current loan and a roster-only confirmation, followed by
100/200/300/351 additions while retaining the ten controls. Require paired REAL/GAME,
origin/destination and documented dates, unchanged native snapshot/nationals,
financial presentation, profiles/cards/search/current-parent filters/market and
HTTP 200 essential elements. Measure pooled query count and latency before public
approval. Require authentication before functional tests; keep public flags off.

Future Production publication revalidates only fresh target baselines, backup,
rights/chronology and hashes. Bind actual versions and full previous joint history,
use the existing atomic writer for each approved frozen batch, and save actual
receipts before proceeding. Operator transaction timeouts and consumption must be
bounded for the approved batch size; do not silently inherit a five-second timeout
for hundreds of remote operations. Build/promote no candidate without separate
authorization. Rollback uses actual receipts and CAS, preserving evidence and
economics. Remove only an identified temporary Preview and revoke its exclusive
credential after confirming that nothing authorized still depends on it.

For recurring preparation, group jobs by exact official URL, club and source version.
Reuse local source hashes/cache/checkpoints; use conditional HTTP requests when a
source supports them. Only changed source observations need research. Stop and save
progress on 429 or provider errors; do not mark incomplete research as completed or
call paid APIs. New observations still pass every gate. Official current membership
is distinct from an announced move conditional on registration or a work permit.
Ambiguities go to the private review queue, without halting the remainder.

Rollback requires the actual committed receipt, its approved hash, and exact applied
selection versions. Reuse `rollbackJointTransfers` to restore only pointers; retain
immutable snapshots, revisions and evidence. Roll back the deployment separately if
presentation fails. Neither rollback changes `Player.clubId`, economic values or
main contracts. The separate documentary issue `MODEL_B_CONSENT_GAP` remains open.
