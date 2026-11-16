# Generic economic simulation: public code and private release

This checkout contains the rendering, exact-ID selection, conflict checks and READ ONLY
database access for a 231-player simulation. It contains no live economic release,
production identity mapping, protected row fingerprints, receipts or consent documents.
Unit tests generate synthetic identities, values and evidence hashes in memory.

## Open documentary status

`MODEL_B_CONSENT_GAP` remains open. Operator authorization and evidence-reference hashes
do not certify supplier consent, commercial rights or parameter retention/reuse.
This PR neither resolves that gap nor authorizes a deployment or data change.

## Reproducibility and the outstanding dependency

The code and synthetic tests build from a clean checkout. No private local file is
imported, read or downloaded. The server accepts an optional private configuration
envelope containing the frozen projection and separate operational evidence references.
Absent, corrupt, oversized or incorrectly pinned configuration hides the simulation
and leaves legacy profiles available. Readers are off by default.

Full reproduction of the published values requires that exact private envelope and
its matching configuration. **An approved private, versioned delivery channel has not
been confirmed.** A local backup and a copy inside an existing deployment do not by
themselves establish an approved release registry, retention policy or recovery process.
Do not describe this checkout alone as reproducing the published 231 values. Do not
create an external service or repository, upload the release or set live configuration
as part of this PR. Those actions require a separate decision.

The proposed server-only configuration contract uses:

- `GENERIC_ECONOMICS_RELEASE_GZIP_BASE64`: gzip/base64 of a `generic-economic-private-release-v1` envelope.
- `GENERIC_ECONOMICS_RELEASE_GZIP_SHA256`: SHA-256 of those compressed bytes.
- The existing exact batch, projection, approval, stage and EA-ID pins.
- `GENERIC_ECONOMICS_READ_ENABLED=1` and the applicable protected-preview or Production gate.

No real values or hashes belong in examples, fixtures, PR text or `NEXT_PUBLIC_` variables.
The format is transport preparation only; it is not a newly provisioned store and does
not change configuration on an existing deployment. The original frozen artifact and
its canonical hashes must remain unchanged. No model execution is needed.

The private release must retain the exact 231/62 inclusion and exclusion sets, EA/player
identity pairs, source references, LOW/ESTIMATED/UNKNOWN labels and protected baselines.
The public policy retains the one-player, club and whole-batch stage restrictions.
Point reads remain parameterized inside an explicitly READ ONLY transaction, rolled back
even after success. Existing economics, manual/research heads, identity associations or
club-context records prevent the new section from being shown.

## Disable exposure without touching data

For the currently published deployment, the immediate mechanism is Vercel rollback to
the previously validated deployment. The exact IDs and rollback receipt remain private.
Rollback reassigns the public deployment and does not require a build, migration or
database write. It hides the simulation section, including model-B-derived values.
It does not delete the 231 profiles, their UNKNOWN status or any prepared data.

Setting `GENERIC_ECONOMICS_READ_ENABLED=0` or removing the Production gate disables a
**future** deployment. Editing project environment variables alone does not instantly
change the already-built deployment. A merge or `.gitignore` change also does not
disable the current site. None of these operational actions is executed by this PR.

Preserve `beta-next: false`. The reconciliation branch also disables automatic Git
deployments, so opening the PR must not create a Preview or promote a public build.
