# Experimental evidence catalog v0.1

Pure offline append-only catalog. No fetching, database, current selection, file writer or
publication. Existing contract, temporal, registry, replay and durable-store hashes remain unchanged.

Records bind Player/Club/context/season, source ID/version/policy, reviewed URL or local reference,
source type, original observation and proof reference, nullable publication/effective dates,
event type, bounded structured contract facts, partial dates/qualifiers, identity confidence,
evidence quality/status and optional supersedesEvidenceId. No full articles or raw responses.
The proof reference is required but its truth must be reviewed externally: code cannot establish
that a claimed observation happened. No clock supplies a missing timestamp.

Registry access/storage/history must each be CONFIRMED with a permission reference. Publication
and commercialUse remain separately preserved, including UNKNOWN/RESTRICTED; storing an authorized
research fact is not publication or commercial permission. Existing sync gates remain stricter.
Rights are reviewed assertions, never inferred from public access. No real provider is authorized here.

contentHash excludes evidence ID, observedAt and observation proof; includes source/policy,
context, facts and parent. Exact repeated content returns the original ID/time, not a fabricated
new observation. Repeated confirmations belong in separately evidenced receipts. recordHash binds
all fields. Changed facts require a new ID. Parents must already exist; cross-player/context and
backdated observations are rejected. Club changes require TRANSFER. Graph cycles are rejected.
Supersession is only a cited relationship, not confirmation of current validity. Differing terms
and club contexts generate conservative review flags, even when a renewal may explain them.

Export/import use versioned JSON and an externally retained artifactHash. Import validates both
graph and records against the frozen registry. Returned records are copies; no update/delete API.
The catalog is in memory plus explicit serialization, **not** a new durable filesystem backend.
`evidenceRef = catalog/<recordHash>` fits existing source/provenance and reconciliation references.
Future frozen plans must bind that reference and retain the separately authorized catalog artifact;
durable-store continues to store only its existing metadata/hashes, not protected source payloads.

Retention must follow each source's reviewed policy; no indefinite retention right is assumed.
Policy change/revocation blocks new use pending review; it does not silently rewrite historical
hashes. Authorized erasure, policy-version archives and retention enforcement need a separate
approved design before persistence. Export hashes detect corruption, not an adversary rewriting
both artifact and its trusted digest. Small text limits are not a copyright classifier: reviewers
must supply factual summaries/identifiers, not protected passages or credentials in URLs/IDs.

Production requires licenses, reviewed identities and temporal evidence, immutable authorized
storage with CAS/transactions, policy enforcement and explicit current selection approval.
No State/Observation/Current integration is enabled by this prototype.
