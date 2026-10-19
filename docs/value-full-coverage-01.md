# Value full coverage foundation

Task: FUTSCOUT_VALUE_FULL_COVERAGE_01. Base: 0fbf34b44592b61e0413ca44afab536ccd897f71.

## Reuse and evidence

The offline v0.1 engine already fits A/B baselines, calibrates prediction intervals,
validates player/external identity, whole-club and unseen-league split isolation,
and abstains outside mechanical training support. The hybrid simulator prefers
eligible provider values and requires artifact/domain approval before a hypothetical
fallback. Neither simulator nor inference writes currents or permits publication.

The frozen experiment has 1,707 training, 455 calibration, 577 holdout and 718
unseen-league assignments. It is not a longitudinal backtest: provider valuation
effective dates are not established. Player uniqueness prevents a second period of
the same player from crossing splits; it does not prove forward temporal validity.

Available experiment inputs include DOB/continuous age, position, club and league
identity plus OVR. A/B currently use OVR and age (B also position). Club/league are
context for isolation, not learned economic multipliers. No verified real-performance
history was established here; do not treat EA attributes or potential as real performance.

LIVE_FOOTBALL labels are **provider estimates**, not observed transaction prices or
objective valuations. Commercial API access does not establish training/retention
rights: the engine's existing license gate stays closed. Synthetic fixtures prove
software behavior only. No approved real-label training was performed.

Existing collection evidence is summarized in docs/value-coverage-01.md:
up to 1,787 positive EUR references among 5,989 selected receipts, pending private
evidence review. Historical 3,948 positive currents are a different inventory;
overlap is unknown and counts must not be added. The 16,228 denominator is historical,
not a current eligibility recount. No new coverage percentage is claimed.

## Functional increment

evaluateCoverage reuses existing evaluation and validates dataset/artifact/split
binding before reporting holdout and unseen-league diagnostics. It is integrated
into evaluateFrozenDataset; source licensing still runs before real files are read.

Reports retain sample counts, abstentions, errors and interval diagnostics by:
- target EUR bins below 100k, 100k to below 1m, 1m to below 10m, and 10m+;
- age below 20, 20–22 and 23+;
- position including GK;
- league, with training-support count (zero for unseen leagues).

Bins are diagnostic boundaries, not accepted error thresholds. No subgroup with
small support is silently approved. Source nature is explicit (SYNTHETIC or
PROVIDER_ESTIMATE), publicationApproved remains false and no winner is selected.
Observed references and FutScout estimates must remain separate provenance categories;
this change creates neither category of new public value.

## Smallest path to reliable fallback

1. Review rights and evidence for the existing provider reference pool; do not recollect
   or reconstruct the engine. Independently acquire approved temporal/performance
   evidence where missing; missing dates must not be fabricated.
2. Freeze training/calibration/holdout/unseen assignments and reference/input dates.
   Existing freeze is a cross-sectional experiment, not proof against future leakage.
3. Predeclare acceptable subgroup errors, interval coverage, minimum support and
   applicability domain with product approval, before examining real test results.
4. Once licensed, fit existing baselines and run the new diagnostics. Expand inputs
   only when evidence justifies it. Reject unsupported players/groups.
5. Only after gates and human approval connect the existing simulated fallback to a
   public read path with explicit FutScout estimate provenance. Keep missing as null
   until quality is established; 100% coverage is a goal, not permission to invent.

## Validation

17 engine/evaluation tests passed using Node 24 in a temporary copy with relative
imports changed to .ts solely for the native runner. Three new tests cover low-value
error visibility, young/GK/sparse groups, partition accounting, model mismatch,
duplicate players, invalid labels, source licensing and abstention denominators.

npm run validate was attempted and stopped at next type generation:
MODULE_NOT_FOUND for node_modules/next/dist/bin/next. Dependencies are absent and
the shell proxy is unreachable. TypeScript, lint, build and full suites are therefore
not certified; remote quality gates and human review remain required. No Production,
migration, paid API, real training, publication or model coefficient change.
