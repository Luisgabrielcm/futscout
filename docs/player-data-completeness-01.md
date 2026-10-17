# Player data completeness — delivery 01

Base inspected: `beta-next` at `f493ee59b196d52447fc5b1524aa5bd6063dde48`.
Scope is the four economic fields, not a new global audit. No database, provider
API, migration, import, current selection or publication grant was executed.

## Field map

| Field | Source, persistence and eligibility | Automatic refresh and display | Delivered / next increment |
| --- | --- | --- | --- |
| Market value | Selected `PlayerEconomicCurrent` → Observation → State. Live Football adapter; REAL_WORLD, VALUE/VALID, HIGH/MATCHED and safe nonnegative amount. Writer requires an explicit provider/context/field grant. Legacy Player.marketValue is not a fallback. Live Football labels are provider estimates; Value's own model remains unapproved. | Runtime reads persisted selections in a bounded query. Offline collection/staging exists separately; this task does not activate a scheduler/import. Previously every public reader required EUR. | Real-life detail now accepts supported source currencies without conversion and identifies LF as a provider estimate. EUR catalog filtering/sorting keeps its existing domain. Next: authorized automatic refresh/current-selection with measured coverage, independent of model training. |
| Salary | Existing economic field WAGE_WEEKLY and immutable state/observation/current infrastructure. Wage v0.2 is a contextual synthetic core without OVR. Public VerifiedSalary requires OBSERVED, explicit publicationAllowed, valid units and a salary-specific source. | No salary read adapter supplies the site. Both provider and FutScout estimates are unavailable under current policy. No automatic real salary ingest was found in the inspected public runtime. | No new salary amounts activated. Next: authorized observed-salary read/ingestion adapter with identity, contractual club/season, gross-base semantics, source dates and publication evidence. Reuse Wage normalization/eligibility. |
| Contract expiry | CONTRACT_UNTIL supports DAY/MONTH/YEAR precision; month/year storage anchors are not source-supplied days. Contract/Clause experiments preserve club/season, options, temporal evidence and separate rights. | Public career type accepts an expiry, but the real-life page supplies approved club/league only. Offline evidence/sync/durable bridge prototypes do not establish an authorized real feed. | No invented dates or options activated. Next: authorized evidence adapter/read projection preserving precision, independent field provenance and temporal validity. |
| Release clause | RELEASE_CLAUSE economic field plus experimental evidence catalog/bridge. UNKNOWN differs from CONFIRMED_NONE; type, conditions, currency and source evidence matter. | Profile header is unavailable; no real clause read/feed was activated. Offline prototypes are not public player facts. | No clause absence or amount inferred. Next: reviewed evidence ingestion and a public unknown/reported/confirmed distinction, without losing activation conditions. |

## Counts and their limits

No live database coverage denominator is available in this task; none is inferred
from schema, seeds or synthetic tests. No Production connection was attempted.

Existing versioned inventories, **not current database counts**:

- Wage `method-contextual-v02.json`: 93 historical HIGH identity references;
  **0 eligible for calibration**. Rights, gross-base semantics, dated FX and
  complete salary-club alignment are unresolved. These are not 93 publishable wages.
- Contract `EVIDENCE_ADAPTER.md`: 12 review drafts; four official expiry drafts
  without documented conflict are for manual evidence review only. None of these
  drafts is eligible for persistence/publication/current selection. Every current
  clause in that pilot is UNKNOWN; Yamal's 2023 clause is historical evidence.
- Value `VALIDATION.md`: frozen experimental splits 1,707 / 455 / 577 / 718;
  these are reference-label partitions, not site coverage or approved estimates.

## Functional increment

A selected USD/GBP/BRL market value previously became INVALID_CURRENT in the
real-life profile even with the same valid identity/context/status as EUR. The
detail reader now opts into SOURCE currency scope; the default stays EUR_ONLY
for catalog consumers. The detail prints the ISO currency code and original
amount, including cents and explicit zero. It retains provider and actual
consultation timestamp. No FX, source authorization, fingerprint, provenance,
rights evidence or persisted selection changes. Source-specific effective dates
are not inferred from consultation timestamps.

Live Football is explicitly labeled a provider estimate rather than a confirmed
objective valuation or FutScout estimate. Other providers' valuation nature is
explicitly unspecified; HIGH identity confidence does not establish valuation
nature. Source terms already documented in Value's README are not expanded by
this delivery. No new provider or publication permission is asserted.

This increases the currencies the existing selected-data interface can use;
the number of additional real players covered is **not measured**. It requires
neither Value staging promotion nor a new source credential.

## Verification

Regression tests exercise the real-life service-to-page projection in PT/EN,
USD/GBP/BRL original units and cents, provider-estimate/unknown-nature labels,
provenance, zero, missing/invalid/duplicate current, identity/context rejection,
and continued EUR-only catalog behavior. Fixtures are synthetic and establish
code behavior, not player coverage. Existing Wage presentation tests remain
part of the affected suite. `npm run validate` delegates to the existing
`validate:cloud` gate (offline tests, Value tests, TypeScript, lint and build with
loopback placeholder database URLs).

Result: `npm run validate` passed: 2,145 application tests passed, eight skipped
(opt-in HTTP tests), 49 Value tests passed, TypeScript, lint and optimized build
passed. No browser or database coverage validation is claimed.
