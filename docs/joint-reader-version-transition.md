# Approved selection version transitions

The normal database index accepts one externally approved root. Updating an
existing selection changes that root, including when rollback restores an old
revision: the selection version must still increase.

For a controlled transition, a deployment may additionally set:

- `JOINT_TRANSFER_READ_TRANSITION_ENABLED=1`
- `JOINT_TRANSFER_READ_TRANSITION_SHA256S=<applied-root>,<rollback-root>`

`JOINT_TRANSFER_READ_MANIFEST_SHA256` remains the approved initial root. The two
additional roots must be distinct SHA-256 values, different from the initial
root. This configuration works only with `DATABASE_INDEX`; the ordered player
allowlist and all existing policy, payload, snapshot and context checks remain
mandatory. Malformed or incomplete configuration grants no reader access.

Prepare all three complete indexes from frozen, version-pinned proposals outside
the public repository. The applied and rollback states must be reached in one
atomic compare-and-swap transaction, with unrelated selections unchanged. The
rollback index contains the restored revision and decision but an increased
selection version. Never reset versions or disable triggers to reuse an old root.

Immutable bodies are cached by the root actually authenticated, database client
and UTC day. Mutable headers and club identities are read again. A version switch
between the header and body queries can retry the complete authenticated read
once. Unknown roots, partial batches and invalid provenance remain rejected.
Healthy reads keep their existing bulk-query count; no per-player query or
background write is introduced.

Validate the protected deployment before any public switch, preserve the prior
deployment, and prepare the rollback deployment for the actual rollback root.
Publication and rollback require their own operational authorization and receipts.
Use deployment-local configuration; do not change shared secrets or enable Git
deployments for `beta-next`. All transition behavior is disabled by default.
