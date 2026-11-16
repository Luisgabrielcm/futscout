# Joint transfer and loan integration

**Rollout superseded:** use [joint-real-game-loan-sync.md](joint-real-game-loan-sync.md). The owner approved the projected representation policy on 2026-11-16. New REAL movements are evaluated together with FutScout GAME projections; the previous REAL-only pilot sequence below is historical and must not be executed. Original EA evidence remains independent.

Implementation preparation; no Production operation or rollout flag is enabled. `beta-next: false` is unchanged. No schema change or migration is needed for this extension.

## Architecture and ownership

Reuse `EaRosterReference`, immutable `PlayerClubContextRevision.payload` and versioned `PlayerClubContextSelection`. The existing JSON constraints allow the additive, validated `jointTransfer.version = 1` extension. Keep the original snapshot metadata byte-equivalent under canonical JSON: its reference ID and hash cannot be redefined. Existing four-player revisions/selections and all previous immutable evidence remain untouched.

`lib/jointTransferContexts.ts` validates bound membership and loan evidence. GAME and REAL observations retain independent clubs, parent clubs, terms, dates and provenance. Source loan observations retain their original identity namespace and hashes; only presentation binds those source club IDs to registered database club IDs. Missing display metadata is enriched by a bounded identity-checked club join after source hash verification. This join never becomes new roster evidence.

GAME national memberships are validated separately from club links, including FREE_AGENT. UNKNOWN and NOT_IN_SQUAD remain distinct in the extension, while the legacy compatible envelope still uses UNKNOWN. No uniform `isgeneric` or real-club fallback supplies a game club. Purchase options, obligations and completed purchases remain distinct; no date expiration causes an inferred return.

Existing API-Football observations, approved real clubs and legacy transfers are not duplicated or mutated. The optional movement ledger records confirmed context-specific movement facts with evidence; the existing loan and squad planners decide safe incremental changes. Salaries, principal contracts, values, potential, manual edits, identities and `Player.clubId` have no write path in this adapter.

## Persistence, idempotency and rollback

`services/jointTransferPersistence.ts` exposes an operator-only API, imported by no public reader, route, build or scheduler. It requires an exact approved plan hash and explicit target. Before a transaction writes anything it checks player visibility, the expected legacy club/update timestamp, club identity bindings, expected selection version/reference, immutable snapshot identity and payload hashes. Per-player advisory locks, a shared Player row lock, serializable isolation and compare-and-swap selections prevent silent concurrent replacement.

An atomic batch appends references/revisions as needed and selects those revisions; it never updates a Player, Club, API identity or economic table. Replaying the same plan verifies its applied revision and expected applied version, rather than incrementing again. Rollback requires an approved receipt hash and compares every applied selection before changing any of them. It restores prior revision pointers with a **new** monotonic version, or removes only a selection introduced by the batch. Evidence is retained. Intervening edits stop the whole rollback.

`services/jointTransferSyncPreparation.ts` composes the existing incremental squad/loan planners with an immutable payload diff. Known pending REAL IDs are excluded. Malformed/conflicting players go to review without blocking unrelated safe IDs. Clearing an active loan needs closing evidence for that exact episode. Plans contain checkpoints, source hashes, prior hashes and rollback metadata; preparing one never invokes the writer or a provider.

## Readers and default-off rollout

The bulk reader verifies selection decision, exact payload hash, original snapshot hash/metadata, EA identity and club references. It runs at most one bounded selection query and one club metadata query for an approved scope (maximum 1,000 IDs). A missing or changed approved selection fails closed.

All new readers are off unless an operator supplies:

- `JOINT_TRANSFER_READ_ENABLED=1`.
- `JOINT_TRANSFER_READ_MANIFEST`: private JSON with `version`, `decisionReference` and entries bound to EA ID, payload hash, snapshot hash and contexts. Projected rollout entries require **both** REAL and GAME and `gameView: "FUTSCOUT_PROJECTED"`; see the joint projection policy for its additional gates. Independently approved historical snapshot readers retain their existing explicit context scope.
- `JOINT_TRANSFER_READ_MANIFEST_SHA256`: SHA-256 of canonical JSON for that exact manifest.
- Preview: `VERCEL_ENV=preview` and the existing `CLUB_CONTEXTS_PREVIEW_READ_ONLY=1`. The established pooled adapter enforces explicit READ ONLY transactions and rejects alternate database pools. No direct-URL fallback is added.
- Public Production additionally requires `JOINT_TRANSFER_READ_PRODUCTION_ENABLED=1`, separate operational authorization and the approved manifest. No configuration is changed in this work.

The reader gate does not grant source rights or approve a canonical roster. Those decisions must be recorded before creating an operational rollout manifest. The owner approved the separate FutScout projection policy on 2026-11-16; its version and canonical hash are required by projected readers. The original EA snapshot remains independent and noncanonical. This approval does not authorize a deployment, data write or reader activation.

## Connected consumers

- Player profiles and Vida real profiles use their own context views and source dates. Main contract/economic sections retain their existing source and values.
- Player cards on catalog, home, directories and favorites receive the same selected presentation. They show playing club, “Emprestado pelo [origem]” and, for GAME loans, an explicit consulted-snapshot/date-unconfirmed label.
- Catalog search matches playing club and parent club independently. Filters support context, current club, loan parent, explicit membership state and national team. Prisma counts/rows and SQL potential/value ordering use the same selected IDs **before** pagination. REAL catalog filtering covers only the explicitly approved REAL selection; players outside the rollout keep the legacy GAME presentation.
- The transfer-market entry uses explicit FREE_AGENT in the selected GAME evidence, never a null legacy club, UNKNOWN or NOT_IN_SQUAD. It is available via the catalog's free-agent link and `getTransferMarketPlayers`.
- Official national-team lists/counts and pagination use explicit selected GAME national links, combined with unchanged eligible legacy memberships outside covered IDs. Unknown national coverage preserves prior memberships. A free agent is not removed for lacking a club. Mixed/undated selections never acquire an invented single roster date. The pre-existing national-teams public gate remains required.

## Prepared scope and remaining gates

Private inputs yield 622 unique player revisions: 614 GAME loan observations and 10 REAL loans, with two players in both groups. Three REAL playing-club completions accompany the loan metadata; seven already-correct REAL clubs remain the same. The 317 GAME club differences are reused from the previous comparison, not new transfer conclusions. The 56 unresolved REAL signals and 31 source-only players remain outside this batch. Paquetá is a validation control, not an extra publication candidate.

The 614 GAME records are technically representable as source-bound storage, not approved as necessarily current Career Mode loans. The template's effective date, canonical status and public-reuse clearance remain unproven in the supplied packet. Historical EA-source disagreements are not resolved automatically. The exact original squad and known rights restrictions must be addressed before public GAME activation. No purchase terms are inferred from four raw native buy flags; Piroe's unknown trigger conditions remain unknown.

## Historical preparation notes

The original 622-record preparation below is retained as background. Its REAL-only rollout is superseded by [joint-real-game-loan-sync.md](joint-real-game-loan-sync.md). For the current ten-pair protected Preview use [joint-loan-protected-preview.md](joint-loan-protected-preview.md); none of the 614 historical loans or 3,277 old differences is activated by that plan.

## Protected Preview, gradual activation and recovery (superseded)

1. Perform a **targeted READ ONLY preflight** for selected IDs: current selection hashes/versions, `Player.updatedAt`, legacy club and protected economic/manual digests, plus immutable snapshot and club bindings. The prepared empty-baseline rehearsal is not a Production commit plan.
2. Record source-use/chronology decisions and the precise rollout context. Freeze private payloads and the operational commit/receipt hashes. Do not put private player packages, hashes or receipts in the public repository.
3. A protected Preview needs an isolated non-Production database containing the candidate revisions. Reuse an existing approved private test database and its pooled connection if available; none is provisioned here. Obtain infrastructure authorization if that prerequisite is missing. Seed only that isolated database, then make its Preview runtime READ ONLY. Never insert into Production merely to make Preview tests possible. After separate deployment authorization, require authentication and enable only Echeverri REAL initially, with no public-domain promotion. Keep GAME and projected readers off. Check his Benfica loan from City, archived Girona return, and separately exercise the City snapshot without a loan under a GAME-only test manifest. Add the ten REAL cases only after the first check passes.
4. Once GAME source/rights gates pass, validate a source-labeled GAME sample of five, then twenty, then the remaining approved records. Include a genuine game loan, Paquetá/free-agent-plus-Brasil and an outside-scope legacy control. Check cards, both profiles, current/parent filters, economic sorting/counts, transfer market, national roster pagination, desktop and mobile.
5. Obtain separate authorization before any Production write, deployment or public activation. Do not promote a Preview automatically. Keep automatic beta-next deployment disabled.
6. Immediate display rollback: disable `JOINT_TRANSFER_READ_ENABLED` using the authorized deployment procedure. Data rollback: apply the receipt-checked pointer restoration above; preserve immutable history and all legacy/economic data. Stop if another operator edited the affected selections.

Existing approved SQL/identity/loan audits are reused. Validation focuses on the new adapter, combined planner, consumers, gates, economic preservation, version-aware rollback and local responsive rendering. Any local PostgreSQL fixture is synthetic and isolated, with no versioned migrations or Production connection.
