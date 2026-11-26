# Deployment-local value estimates

An optional private scope can approve up to 21 individually reviewed B partial-context estimates without committing their data or hashes. Set FUTSCOUT_PRIVATE_VALUE_SCOPE to the version 1 JSON envelope and FUTSCOUT_PRIVATE_VALUE_SCOPE_SHA256 to the SHA-256 of its exact UTF-8 bytes, exclusively on the intended deployment. Entries bind internal player ID, EA ID, immutable state content hash and method. Missing configuration keeps existing behavior; inconsistent configuration fails closed. Values and model artifacts remain in private custody.

Existing identity, economic-state, publication-hold and policy gates remain required. The new estimates require an explicit estimate note on cards and profiles. This presentation decision does not close MODEL_B_CONSENT_GAP or establish third-party rights.

Rollback: restore the preceding deployment, which lacks the private scope. Withdraw only the operation-owned current pointers using retained versions and receipts; retain immutable observations and model history. Do not change shared project variables or beta-next deployment policy.
