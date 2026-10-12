# Contextual evaluation v0.1

Offline, synthetic-only protocol. Reuses the contextual engine and input builder;
does not load MLSPA/Mendeley, train real data, change v0.1 A/B or publish estimates.

1. Freeze eligible identity/context/labels and dated FX before splitting. The
   input adapter currently requires USD/year and existing eligibility; do not
   relabel another currency. Truthful synthetic provenance is the caller's duty.
2. Freeze one evidenced season per league. Different league calendars remain
   separate. Repeated Player.id (including transfers) is rejected, not silently
   split. Future multi-period data requires connected-identity/temporal groups.
3. Hash-sort whole Club.id groups independently of wages/OVR. Default allocation
   is approximately 60/20/remainder percent of clubs, at least one in each split.
   At least three clubs required. For explicit held-out leagues, reserve all
   associated clubs for test and allocate remaining clubs about 80/20 to training
   and calibration; at least two development clubs required. These are protocol
   choices, not evidence of statistical sufficiency. Freeze manifest before fit.
4. Fit only training rows with existing synthetic engine. Never tune penalties,
   support thresholds or fallback using final test labels. Calibration is reserved,
   not an implemented interval-fitting procedure. No new trainer is supplied.
5. Evaluate reserved clubs/leagues with `evaluateSynthetic`. The current engine
   baseline abstains on every unseen club/league: 100% abstention is a valid reported outcome,
   **not successful wage prediction**. Zero predictions means null point metrics,
   not zero error. Report prediction coverage separately from interval coverage.
6. Point metrics on predicted rows: MAE EUR/week, median absolute percentage error
   (percent), absolute natural-log error, signed bias (prediction minus actual).
   Intervals/width/coverage 50/80/90 remain null until a separately validated,
   calibration-only procedure exists. Never invent them from point estimates.

## Hierarchical fallback v0.1 (synthetic opt-in)

`predictContextualSynthetic` and `evaluateSynthetic` default to `BASELINE`,
preserving previous abstention rules. Explicit `LEAGUE_FALLBACK_V01` retains
the learned club deviation only with sufficient club support; otherwise sets
that deviation to zero and uses the learned league-season plus age/position.
This is not a fixed club multiplier or a newly fitted model. Liga-season and
position support and the training age domain remain mandatory. Unseen leagues
always abstain. Levels distinguish `CLUB_SPECIFIC`, `LEAGUE_UNSEEN_CLUB`,
`LEAGUE_SPARSE_CLUB` and `NONE` (abstention).

`compareSyntheticFallback` evaluates the same frozen rows and artifact twice,
without refitting or test-driven tuning. It reports metrics/coverage separately,
never claims predictive improvement, and keeps intervals unavailable. Prediction
provenance records artifact/training hashes and policy; existing artifact payloads,
coefficient hashes and splits are unchanged. The parent effect may still reflect
imbalanced clubs and does not measure an unseen club's financial capacity.

This opt-in is a new experimental hypothesis, not the previously required validated
economic fallback. Real activation still requires eligible data, independent
club-held-out evaluation, support/acceptance thresholds fixed before test, and
appropriate treatment of unseen-league risk. No production or publication approval.

Synthetic tests prove calculation/split integrity only. Real evaluation requires
documented training/evaluation rights, gross-base semantics, HIGH identity, salary
club/season evidence, historical position/age and dated FX. Preserve original labels
and the 93 real references. A validated contextual pooled fallback and sufficient
multi-club/multi-league data are necessary to demonstrate unseen-group prediction;
the implemented synthetic fallback is not real-data validated and does not waive production abstention.

Run: `node --import tsx --test experiments/futscout-wage-v01/contextual-evaluation.test.ts`
