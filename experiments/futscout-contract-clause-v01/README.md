# FutScout Contract & Release Clause v0.1

Offline experimental data contract; no network, database, provider authorization,
writer, current selector, economic formula or production imports. Fixtures are
synthetic, not extracted from Capology or any provider. Rights for commercial
calibration of screenshot data remain unconfirmed.

## Semantics

- Every record identifies player, club, REAL_WORLD/EA_CAREER context and season.
  `prepare` requires a separately supplied expected context; this checks consistency,
  not real-world identity. Identity confidence and evidence quality are independent.
- `provider`, local `sourceReference` and provenance evidence identifiers describe
  origin. No credentials/raw responses/URLs should be placed in these identifiers.
  Narrative evidence must be reviewed and sanitized by a future ingestion adapter.
- `observedAt` is the supplied real observation instant; `providerEffectiveAt` is
  nullable and never generated. UTC instants are normalized. No ambient clock.
- `signedAt` and `contractUntil` each have their own precision: `2028-06-30`/DAY,
  `2028-06`/MONTH, `2028`/YEAR, or null/UNKNOWN. Calendar validity is checked without
  returning a fabricated first/last day. No automatic contract-status inference.
- ACTIVE/INACTIVE/UNKNOWN is the source's assertion, not a verified current roster.
- Extension options remain separate conditional assertions and never extend the
  expiry automatically. null means unknown; [] requires explicit source evidence
  that no options are reported. Holder, conditions, source and partial date survive.
- Clauses: CONFIRMED and REPORTED require type and explicit evidence/source; an
  undisclosed amount is allowed. UNKNOWN does not mean no clause. CONFIRMED_NONE
  requires an explicit statement. This validates presence of evidence, not its truth.
- Amounts are exact decimal strings (18 integer digits, up to two decimals),
  canonicalized without floating point. Zero remains zero; '-' is rejected.
  Supported ISO currency subset: EUR/USD/GBP/SAR/BRL/JPY; other currencies require
  explicit reviewed support. No conversion, fee/value substitution or rounding.
- Content SHA-256 excludes observedAt; observation hash includes it. Input hash
  covers normalized inputs. Version namespace is separate from historical economic
  hashes. Object keys are canonicalized; option ordering is preserved.
- Simulation returns HYPOTHETICAL_SIMULATION, null prediction and either
  INVALID_OR_MISSING_INPUT or NO_APPROVED_MODEL. No caller flag can authorize it.
  artifactHash/domain/evaluation remain null until a real approved model exists.
  All outputs have currentEligible=false and publicationAllowed=false.

## Compatibility, not integration

Inspected `lib/economicData/value.ts` and Prisma State/Observation/Current: existing
amount Decimal(20,2), datePrecision, provider/context/version, observation timestamp,
deduplication and same-player/field CAS concepts are compatible. This prototype is
NOT an EconomicStateInput and has no providerPlayerId/persistence adapter.
Production contract storage uses date anchors plus precision; a future adapter must
make that storage-only mapping explicit, never claim the source supplied the day.
Club/season, extension options, evidence quality and clause conditions require a
reviewed versioned evidence mapping: the current metadata allowlist is narrower.
Do not silently drop them or auto-select these outputs. No migration proposed now.

## Future sources and gates

Candidate sources: authorized official club/league statements, licensed contract
feeds (including football-data.org after entitlement/storage clarification), and
Capology only with applicable rights. No source is authorized by this module.
Before production: approved license and retention rules, independently verified
provider identity, temporal/context review, evidence-quality policy, sanitized
evidence catalog, adapter tests, immutable observation handling and explicit
Serializable/CAS selection authorization. Factual clauses need evidence of type
and activation conditions (unknown conditions remain null). Simulations must stay
distinct and require their own validated model/artifact/domain and product approval.

Smallest next step: review this contract using a few explicitly authorized
source records; do not train or publish. Tests contain synthetic examples of dates,
options and a reported EUR clause; none are player facts.

## Local validation

`node node_modules/tsx/dist/cli.mjs --test experiments/futscout-contract-clause-v01/contract.test.ts`

`node node_modules/typescript/bin/tsc --noEmit --incremental false`

`node node_modules/eslint/bin/eslint.js experiments/futscout-contract-clause-v01/*.ts`
