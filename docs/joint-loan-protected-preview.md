# Protected Preview of joint loans

Preparation only. This PR integrates reusable code, synthetic fixtures and documentation. The ten private player payloads, exact hashes, eligibility evidence, receipts and rollout manifests remain outside public Git. No application route, build hook or scheduled workflow imports the operator writer. No schema change, migration, database write, deployment or activation is performed by integration.

## Scope and immutable inputs

Reuse the frozen ten-pair package and the expressly approved `futscout-real-game-v1` policy. Reproduce each full payload hash with the integrated source before configuring a candidate. Each entry must request both REAL and GAME with `gameView: "FUTSCOUT_PROJECTED"`; a REAL-only stage is forbidden for these candidates. The exact manifest hashes and policy pin are delivered privately, not embedded in this document or the source.

Echeverri is Benfica, on loan from Manchester City, in REAL and the FutScout GAME projection. The original consulted EA snapshot remains Manchester City with no documented loan. Projected cards/profile labels must state that this is a FutScout update, not an official EA update. Dates that are unknown stay unknown; loan dates do not become principal contract dates.

The 56 unresolved REAL signals are excluded. The 614 native loan observations and 3,277 historical club differences remain reference inputs; they do not expand the ten-ID reader manifest. Paquetá/free-agent and national-team fixtures are controls, not extra publication candidates. The canonical Career Mode reference remains undecided.

## Prerequisites before any deployment

1. Pin the exact integrated commit and privately verified payload/policy/manifest hashes. Verify the ten source revisions against this commit without recalculating their values or rewriting the frozen source package.
2. Identify an existing approved **isolated non-Production database** with a pooled runtime connection and restricted access. No such remote database is provisioned or declared available by this preparation. A local disposable PostgreSQL fixture is not reachable by Vercel and is not a substitute. If no suitable database exists, obtain separate authorization before creating infrastructure or populating it. Production's existing selections are not modified for a Preview.
3. Under separate authorization, prepare only the needed isolated player/club/reference/selection data and protected comparison fixtures. Capture selection versions and expected hashes. Configure the application runtime READ ONLY after preparation; no operator write credential goes into the deployed runtime.
4. Confirm an authentication-protected Vercel target that supports the existing READ ONLY Preview policy. Use the Preview environment, not Production. Require Vercel authentication, inspect protection settings, and require an unauthenticated request to be challenged before making authenticated functional requests. Do not put an authentication-bypass token in public source, URLs or logs.

## Proposed deployment configuration — not applied

Use deployment-scoped values only, leaving shared secrets and public Production unchanged:

- `VERCEL_ENV=preview` is provided by the platform.
- `CLUB_CONTEXTS_PREVIEW_READ_ONLY=1` enables the established adapter's explicit READ ONLY transactions for pooled queries. Remove only the incompatible startup `default_transaction_read_only` option from this candidate's connection; do not use DIRECT_URL as runtime fallback.
- Enable `JOINT_TRANSFER_READ_ENABLED=1` and `JOINT_REAL_GAME_PROJECTION_READ_ENABLED=1` only for the protected candidate.
- Supply the privately approved `JOINT_TRANSFER_READ_MANIFEST`, its canonical SHA-256 pin, and `JOINT_REAL_GAME_POLICY_SHA256`. Permit exactly the ten approved EA IDs, both contexts, and their frozen payload/snapshot hashes. The native national-team presentation keeps its independent existing rights gates.
- Keep `JOINT_TRANSFER_READ_PRODUCTION_ENABLED` unset. No public hostname or promotion, no shared environment-variable edit, and no automatic source upload from a workspace containing private files.

Deploy only a clean export of the integrated commit. The private batch must reach the isolated database through a separately authorized private operator procedure; it is not bundled into the public source or build context. Reader configuration contains only the minimum private manifest needed at runtime.

`beta-next: false` remains unchanged. The PR's source branch is also explicitly disabled in `git.deploymentEnabled` so opening/pushing the PR cannot create an unapproved Preview. Do not remove either rule without later authorization.

## Functional gates for the future protected deployment

After effective authentication protection is confirmed, use HTTP 200 and essential rendered elements with explicit timeouts; do not wait for `networkidle`:

| Surface | Required result |
| --- | --- |
| Ten GAME profiles | Projected current club and documented parent; explicit FutScout provenance; historical EA source accessible separately. |
| Ten Vida real profiles | Same confirmed real route, sources and known dates; no contract-date inference. |
| Echeverri | Benfica / Manchester City in the joint views; historical City without a documented source loan. |
| Cards and search | Same selected context as the profile; current and origin clubs searchable. |
| Current/origin filters | Accurate IDs, counts and pagination for both contexts before row limits; exercise value/potential ordering. |
| Market and national teams | Explicit FREE_AGENT independent from REAL employment; preserved national membership. UNKNOWN/NOT_IN_SQUAD do not become free agents. |
| Exclusions and control | The 56 pending IDs, historical source queue and outside-scope legacy player do not acquire joint presentation. |
| Economics and identity | Salary, market value, principal contracts, potential, manual edits, EA identities and Player.clubId match protected baselines. |
| Desktop/mobile | Club/parent labels wrap; source and historical sections remain accessible, no horizontal overflow. |
| Runtime | No write paths or runtime 500s; READ ONLY remains enforced for profiles, auxiliary queries and filters. |

Reuse the 27 focused tests and previous PostgreSQL/visual receipts. Execute deployment-specific protection and functional checks once the deployment is authorized; local SSR is not evidence that a remote Preview passed.

## Gradual activation and rollback

In the isolated environment, enable one complete Echeverri pair, then five complete pairs, then all ten. A single selected immutable revision contains the REAL facts and GAME projection, so rollback never exposes half a pair. Verify the manifest and policy pins at every stage. Production activation requires a separate proposal, fresh READ ONLY preflight and authorization.

For immediate Preview shutdown, remove only the newly identified temporary deployment, or disable its deployment-scoped joint readers through a separately authorized deployment procedure. Do not remove the existing public deployment or other Previews. Persisted rollback is operator-only: compare the applied revision hash, decision and selection version, restore the prior whole selection with a new monotonic version (or remove only a newly introduced selection), and retain immutable evidence. Stop on intervening edits. Never roll back economic tables, Player.clubId or the official snapshot.

MODEL_B_CONSENT_GAP remains open and separate. This PR does not change the 231 published economic estimates, private recovery package or existing public deployment.
