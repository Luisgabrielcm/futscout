# Hybrid validation 1 — preregistration, before any real training

Status: OFFLINE_ONLY / LIVE_FOOTBALL_TRAINING_LICENSE_PENDING. No model approved. The owner's permission to develop does not supply the provider's training/calibration rights. Commercial data display/redistribution is not treated as explicit permission for model training, parameter retention or derived estimate commercialization. See the existing README license reference. No new provider API calls.

## Fixed experiment

Dataset manifest SHA256: 83f6e21025aa1b308223bfccdf76146811510ac72c2314662d416cab05cabdc6. No new split, reshuffle or feature imputation. Train 1707; calibration 455; club holdout 577; unseen-league stress test 718. Current inputs and unknown valuation effective dates are not a historical backtest.

A: OVR + continuous age predicting ln(EUR). B: the same plus position dummies (GK reference). No Potential, club/league coefficients or legacy market value. Both baselines are predefined; neither holdout selects a winner or changes coefficients/quantiles/abstention. Fit preprocessing and coefficients only on train. Calibration labels only produce 50/80/90% finite-sample absolute log-residual interval quantiles. Freeze both artifacts and code/protocol hashes BEFORE revealing evaluation results.

## Domain and abstention fixed now

- Invalid/missing inputs or inconsistent input hash: reject/abstain, never impute.
- OVR/age outside observed training min/max, or position not represented in train: abstain.
- Missing finite-sample interval quantile or numeric overflow/underflow: abstain.
- These guards are not proof of statistical support within the rectangle. Validated applicability and product approval do not exist yet.
- Hybrid estimate requires separately approved exact modelVersion/artifactHash, rights, evaluation evidence and validated domain; HIGH identity is not statistical confidence.
- Observed eligible LF positive wins before model execution; explicit zero remains observed zero. LF null and no-current may be hypothetical estimate candidates. Malformed, ineligible and ABSENT-payload currents do not silently become null or estimates.
- `hybrid.ts` returns only a simulated decision, always publicationAllowed=false and createsCurrent=false. Synthetic approval fixtures cannot activate real training or the production reader/writer.

## Report prepared, not computed on real data

Report A and B separately for club holdout and unseen leagues: selected/predicted counts, abstentions by reason, MAE EUR, median absolute percentage error, MAE log, signed bias (predicted minus observed), 50/80/90% empirical interval coverage, mean width EUR and mean upper/lower ratio. Also report each by OVR band, age band, position and region with denominators. Error/interval metrics are conditional on non-abstention; always inspect abstention counts alongside them. Small strata have no automatic approval. Nominal conformal coverage is not guaranteed under club correlation or unseen-league shift.

No accuracy/width/publication threshold has been invented. Product decisions on acceptable error, bias, useful interval width and coverage/abstention tradeoff must be recorded before using test results to approve a release. Any model or policy revision after inspecting tests requires new independent evaluation evidence, not refitting to these holdouts. Live Football estimates remain reference labels, not objective sale prices. Null/selection bias persists.

## Commands from repository root

Verification only (permitted now):

`npx tsx experiments/futscout-value-v01/run.ts check`

Synthetic tests (permitted now):

`npx tsx --test experiments/futscout-value-v01/engine.test.ts experiments/futscout-value-v01/hybrid.test.ts`

Future training of BOTH predefined baselines (blocked now):

`npx tsx experiments/futscout-value-v01/run.ts train audit/output/value-v01-training-attempt-1`

Future evaluation of frozen A/B, without fitting (blocked now):

`npx tsx experiments/futscout-value-v01/run.ts evaluate audit/output/value-v01-training-attempt-1 audit/output/value-v01-evaluation-attempt-1`

Training/evaluation first require reviewed provider rights and separate execution authorization. The commands have no license bypass flag. Output directories must be new and within audit/output, never the dataset directory. Files use exclusive creation; a failed attempt must not overwrite prior evidence. A training manifest pins A/B bytes, dataset and code/protocol; evaluation rejects changed code/artifacts. The reports never auto-approve, publish, select a current or contact any API/database.
