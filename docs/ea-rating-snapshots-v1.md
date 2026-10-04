# EA historical rating snapshots v1

Prepared locally; apply migration before enabling the updated EA ingestion. No retrospective backfill.

`EaPlayerRatingSnapshot` is append-only (UPDATE/DELETE blocked in PostgreSQL). Restrictive Player FK
keeps history when a player leaves the catalog; physical Player deletion is blocked, not cascaded.
Observations reference a state, while their parent preserves provider/edition and observed/source dates.
`observedAt` is retrieval time, never an inferred effective rating date. Unknown source dates stay null.

Deduplication: externalId + source context/edition + snapshotVersion + SHA-256 of canonical DOB,
primary position, OVR and supplied normalized attributes. Timestamp, name, club and image are excluded.
DOB is preserved from the confirmed Player state when omitted by the incoming patch; it is never invented.
Undefined attributes are absent; JSON null is source absence, not permission to clear a stored value.
The payload records source-supplied fields, not invented defaults or values copied into old observations.

The existing catalog pipeline remains incremental: domain updates may have already committed when a
later item fails. History is created only after the whole batch succeeds. Snapshots and provenance share
one Serializable transaction and read back accepted identity/rating/attribute values. A mismatch or
provenance failure rolls back history and prevents successful completion/checkpoint. This does not claim
that earlier domain updates were rolled back. Unaccepted outfield patches fail closed rather than
produce false applied-state history. Catalog capture excludes GK attributes it does not write. The
dedicated GK pipeline links GK snapshots after its own verified read-back, in its existing transaction.
It records only supplied GK fields (not preserved/carried-forward attributes); DOB/OVR are the confirmed
Player state at that observation, not a claim of a fresh source DOB/OVR measurement in the GK page.
The position pipeline also captures after its verified read-back, in the same transaction. Its snapshots
carry confirmed DOB/OVR but no freshly measured attributes. Attribute availability identifies partial
states; do not interpret every field as newly measured at the parent's effective date.

Snapshots contain no Potential outputs and do not change E v1. Retain compact states and observation
links for at least five years, preferably indefinitely; retain disappeared players in the evaluation cohort.
Historical tracking starts only after migration and an explicitly authorized subsequent EA ingestion.
