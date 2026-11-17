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

Publication and reader activation are separate gates. The currently integrated
database-manifest transport accepts ten IDs total, not ten per cohort; its immutable
selection root must include the complete authorized reader set. Thus the cohort
lists in these plans are validation groups, not an instruction to replace the ten
published readers. Public activation of a larger union needs a reviewed manifest
transport extension or an independently measured inline manifest. No such extension,
deployment or Production activation is performed by this preparer. Readers remain
off by default and `git.deploymentEnabled.beta-next` stays false.

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
