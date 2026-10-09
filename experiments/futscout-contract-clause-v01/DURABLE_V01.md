# Durable offline replay v0.1

Experimental only. No network, database, current selection or publication. Existing replay,
eligibility and temporal semantics are unchanged. Only synthetic tests are supplied.

## Format

`JsonReceiptCheckpointStore` implements `ReceiptCheckpointStorage`. An explicit root and safe
run ID identify a directory. Immutable sequential JSON envelopes contain `schemaVersion`,
`runId`, `selectionHash` (the existing complete `planHash`), registry hash, sequence, previous
envelope hash, player position (1-based; checkpoint cursor is completed count), request ID,
status, payload/receipt/provenance hashes, original observedAt, proof reference and replay hash.
SHA-256 uses the existing canonical hash. No raw evidence, source text, URLs, credentials or
financial payloads are serialized. Proof references must be local nonsensitive identifiers.
Original provenance is retained in the separately frozen plan and bound by its hash, not copied.

## Operation and recovery

1. Preserve the frozen plan and registry independently. Open the run with `create`.
2. `begin` atomically records an uncertain intent **before** doing offline processing.
3. Pass the existing simulator receipt to `confirm`; it must exactly match the frozen input.
   This acknowledges an offline simulation, never proves an external write.
4. Checkpoints are appended every 25 completed items and at the end; explicit checkpoint is
   available. Each file is written exclusively to a temporary file, fsynced, closed and renamed.
5. On restart, verify the entire journal chain and rebuild the checkpoint prefix with the
   original replay functions, then reconcile its committed tail. This is linear verification,
   not a fast snapshot loader. Confirmed events are not processed again and observedAt is unchanged.
6. Intent without confirmation stays uncertain. Supply a verified receipt or explicit
   NOT_APPLIED proof; never silently retry. Temporary files are ignored and retained for review.
   Corrupt committed files, gaps, incompatible selection or receipts fail closed (not skipped).
7. Close releases the exclusive writer lock. A real process crash leaves a stale lock:
   an operator must establish that no writer exists, preserve evidence and remove **only** that
   lock before reopening. There is no automatic lock stealing, retry or history cleanup.

## Limits

Cooperative single-writer lock and in-process exclusion; no distributed fencing. Use a private,
trusted local directory with OS permissions (no shared/network filesystem). Run directory and
files reject symlinks; ancestor directory trust remains the caller's responsibility. Hashes
detect corruption, not malicious rewriting or deletion of an entire final journal suffix.
Rename provides atomic visibility, not universal power-loss durability: directory metadata is
not fsynced on Windows. Stale temporary files are never promoted automatically. Tests inject
crashes at rename boundaries; this is not a hardware power-loss certification.

Plans are required for recovery: hashes alone cannot reconstruct lost source evidence. No
secret detector can establish that an arbitrary identifier contains no secret; callers must
never put credentials in identifiers. The implementation allowlists metadata, not raw payloads.
Future production storage requires separately authorized transactional storage, unique keys,
CAS/fencing, immutable evidence, retention policy and approved publication eligibility.
