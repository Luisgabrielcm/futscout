# FutScout Value v0.1 — offline code prototype

No production imports, DB, provider requests, UI, currents or published estimates. Potential is untouched. Only synthetic fixture models have been fitted. No synthetic model artifact is usable as a production estimate.

Future Economic Engine selection remains: eligible positive Live Football observation first; only for missing/null valuations may an independently approved in-domain FutScout estimate be considered; otherwise absence. Explicit zero remains distinct. `hybrid.ts` simulates this policy offline with hypothetical approvals only; it never writes State/Observation/Current or authorizes publication. Its model/input/artifact references could later be attached through a separately versioned experimental provenance contract, without rewriting existing economic hashes.

## Run

`npx tsx --test experiments/futscout-value-v01/engine.test.ts experiments/futscout-value-v01/hybrid.test.ts`

See VALIDATION.md for preregistered domain/abstention rules, reporting and separate gated train/evaluate commands. `run.ts check` verifies the frozen files and split identities without training.

`npx tsc --noEmit`

`npx eslint experiments/futscout-value-v01/*.ts`

Tests use invented players and mathematically generated labels, not Live Football labels. The optional frozen-dataset integrity test reads bytes for SHA-256 verification only; it does not rebuild the dataset or fit real data. That test requires the local ignored dataset artifacts.

## Model contract

A is ordinary least squares of ln(EUR) on intercept, OVR and continuous age. B additionally has DEF/MID/ATT indicators with GK reference. OVR/age normalization uses only training mean and population standard deviation. Reorthogonalized QR rejects singular designs; no regularization, feature selection or silent retry. exp(log-fit) is a log-scale centre, not an unbiased arithmetic-mean EUR prediction. No EA legacy market value, Potential, club, league, statistics or name coefficients.

Input validation and inputHash retain the frozen v0.1 dataset contract: original DOB/reference timestamps, continuous age, original position/group and identity/context. Context participates in integrity hashing but not features. Row sorting and canonical serialization make artifacts deterministic for the same Node numeric runtime. Model version, feature ordering, coefficients, train-only normalization, calibration, split hashes and IDs all enter artifactHash. Execution time does not. Exact cross-runtime floating-point bitwise equality is not promised.

Intervals are split-conformal absolute log-residual quantiles at 50/80/90%, using finite-sample rank ceil((n+1)*coverage), then exponentiating around the log fit. Insufficient rank returns unavailable calibration, never a fabricated quantile. Nominal levels are not established coverage for club-correlated or shifted/unseen-league data. Calibration targets never change coefficients. Test targets do not enter fitting or calibration.

Abstention covers invalid inputs, outside training OVR/age ranges, unseen positions, unavailable calibration and numeric overflow/underflow. Train min/max bounds are only a mechanical guard, NOT a statistically validated applicability domain. Sparse cells and in-range extrapolation still require evaluation; no publication rule or arbitrary accuracy threshold is implied. All inference includes publicationAllowed=false. Identity confidence remains separate from interval uncertainty.

`pipeline.ts` verifies the exact approved manifest and file hashes. `trainFrozenDataset` is deliberately blocked before loading labels by the fixed Live Football license gate. No env/CLI/owner override exists. Future license review must document applicable permission before changing this gate. After release, the function would fit A/B on train and calibrate on calibration, returning artifacts without writing files or evaluating the holdouts. Artifact freeze must precede separately authorized holdout evaluation. `evaluate` reports MAE EUR, median APE, MAE log, bias, coverage, interval width and abstention counts, not just metrics on surviving rows without denominators.

## License gate — UNKNOWN

Reviewed public Terms v2.1: https://www.live-football-api.com/terms (sections 5–6). Commercial use and data redistribution are explicit; model training/calibration, parameter retention and commercial derived estimates are not explicit. Owner authorization does not supply provider rights. Obtain written confirmation of those scopes, including retention after account termination. No real training here. This is a documentary gate, not a legal determination that training is forbidden.

## Next step

Confirm provider rights, then authorize an immutable real-data run. Keep the 1707/455/577/718 splits frozen. Compare A/B using development only; do not select coefficients, feature policy or abstention thresholds from holdout or unseen leagues. Predeclare subgroup metrics by OVR/age/position/region and interval usefulness criteria. Effective valuation dates remain unknown, low-OVR/geographic support is uneven, and targets are provider estimates rather than objective sale prices. Neither code readiness nor synthetic tests establish predictive quality or publication readiness.
