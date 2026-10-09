# Contract temporal v0.2 — offline only

Additive wrapper `assessTemporal(input, expectedContext, evaluationAt)`; v0.1,
the evidence adapter and their historical hashes are unchanged. No database,
network, ambient clock, current selection or production imports.

## Dates and evidence

DAY/MONTH/YEAR/UNKNOWN retain the original string/null. `periodQualifier`
preserves SUMMER, SEASON_END or other source wording and evidence reference.
Competition calendar/season is separate context: neither MLS nor a cross-year
league can generate a contractual month/day. Signed dates remain independent.

`observedAt` must be supplied from a genuine source observation; syntax validation
cannot prove that a timestamp is truthful. Missing original timestamps in the 12
drafts stay missing: this wrapper intentionally rejects those incomplete inputs.
`publishedAt` is a partial date, unknown when not documented. A source effective
instant stays nullable and may describe a future event. `lastVerifiedAt` derives
only from an explicit scoped verification with its own source reference, never
from publication, expiry or the evaluation clock. A new review is a new record,
not a retroactive replacement of the original observation. No cache crawl date
is treated as an original publication/effective date.

The previous current-validation outcome was PARTIAL, not READY. Affiliation
corroboration alone does not reconfirm the exact expiry. This version deliberately
requires a reviewed CONTRACT_TERMS corroboration, HIGH identity and official
explicit evidence for CURRENT_CORROBORATED. Even then it is an evidence assessment,
not legal certainty, absence of negotiations, or permission to publish. No
arbitrary freshness cutoff: a future production policy must define rechecking.

## Changes and abstenção

Later evidence targets the exact v0.1 content hash and the same player/club/context.
Confirmed effective renewal, transfer, termination or option exercise makes that
old record historical and requires a separately reviewed new record. Unknown,
future or merely reported effective changes require review. Explicit conflicts,
including contradictory option assertions, return CONFLICTED. Events must be
reviewed as relevant changes to the target, not attached merely because their
publication is newer. This module checks structure, not the truth of assertions.

Options remain conditional and separate. Exercise/non-exercise requires its own
event, reference and known option index; even exercise never overwrites expiry.
UNKNOWN is not NOT_EXERCISED, and neither is CONFIRMED_NONE. Current clauses remain
UNKNOWN absent new evidence; v0.1 clause rules are unchanged.

## Regression evidence (not new factual observations)

Yamal 2031-06-30/DAY; Kane 2027-06-30/DAY; Lauenborg 2028/YEAR + summer;
Almirón 2027/YEAR with a separate 2028/YEAR option. Tests validate the frozen
selection/evidence and adapter artifact hashes. Only dates are reused in synthetic
clock/context tests; no invented timestamps are attached to real players.
Renewal/transfer/option events in tests are synthetic, not claims about these players.

## Compatibility and remaining gates

`legacyContentHash`/`legacyObservationHash` remain v0.1 values. New `inputHash`
and `artifactHash` have their own temporal version namespace; evaluation time is
included in artifactHash, not inputHash. Repeating identical inputs/time is
idempotent. No caller-owned objects are mutated.

All outputs remain persistenceEligible/currentEligible/publicationAllowed=false.
State → Observation → Current is unaffected. Production integration still needs
rights/retention approval, reviewed identity, fresh terms evidence, sanctioned
metadata mapping and an explicit selection policy. Existing source restrictions
remain unresolved; this module grants no reuse rights. Smallest next step: offline
review of a genuinely timestamped, authorized evidence receipt; no schema change.

Run the three `*.test.ts` files in this directory with the existing tsx test runner,
then TypeScript and focused ESLint. No build required for this isolated module.
