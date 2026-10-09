# Experimental CONTRACT_UNTIL bridge

Pure adapter plus dependency-injected mock execution. No runtime client, credentials, network or
database connection. No productive module changes. Only DAY contract/renewal evidence can produce
an EconomicWrite; MONTH/YEAR, clause events, transfer, termination and option events abstain by error.
Existing clauses/options stay in the catalog; no separate economic values are emitted.

Input: frozen catalog JSON + independently retained artifact hash, matching frozen registry,
evidence ID/ref, and a reviewed identity/temporal attestation bound to recordHash. The attestation
must identify the Player, Club, season/context and provider player ID, with independent local proof
references, original observedAt/proof and review timestamp. These assertions are trusted reviewed
inputs, not proof inferred by software or automatic name matching. The actual review must establish
the provider ID mapping and temporal club link. No ID is derived from Player.id or player name.

All registry permissions must be CONFIRMED in this conservative first bridge (including commercial
use/publication); that does not itself authorize publication. Catalog conflicts, provisional terms,
inactive source status and future effective terms block the proposal. Unknown effective time stays
null. A documented contract does not prove it remains current or exclude negotiations.

Output preserves provider/context, original observation time and catalog/<recordHash> provenance.
The existing economicFingerprint generates a NEW economic namespace hash; no historical catalog or
contract hash changes. selectCurrent=false and expectedRevision=null are mandatory even at execution.
requestId deterministically binds bridge version + recordHash + proven provider player ID. Exact
replay uses the same requestId. A new actual observation needs separately preserved capture evidence,
not a modified timestamp on the old catalog record.

Reconciliation states:
- NOT_PROCESSED: authoritative absence AND all attempts/transactions known settled.
- CONFIRMED: read-back matches requestId, full economic fingerprint, stored hash and observedAt.
- INDETERMINATE: read failure, unresolved in-flight write or unavailable result. Never resubmit.
- CONFLICT: divergent existing result or writer receipt/read-back disagreement. Stop and review.

Executor reads first, writes at most once, then reads back; uniqueness errors never imply success.
The injected readBack implementation must not return settled absence merely because one SELECT
found no row: an uncertain transaction may still commit. A future coordinator needs durable intent,
single-owner/fencing and authoritative settlement before permitting another attempt. This prototype
does not supply that production coordinator. Existing offline receipts are not database commit proofs.
The existing writer supplies Serializable and immutable state/observation, while CAS applies only to
current selection (disabled here). No automatic retries. No fallback to legacy Player fields.

Next proof: PostgreSQL disposable cluster, using the real existing writer with explicit synthetic
grant, verifying rollback, unique-request races, exact read-back and unchanged currents. Mock tests
do not establish database isolation, durability, production licenses or a retention policy. Real
evidence storage and provider authorization remain separately gated before any production write.
