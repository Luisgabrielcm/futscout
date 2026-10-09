# FutScout Value v0.1: mathematical coherence

Model A fits ln(value EUR) to an intercept, OVR and continuous age. Model B adds DEF/MID/ATT indicators with GK as reference. Both reuse engine.ts, training-only normalization, deterministic input/artifact hashes, calibration intervals and hybrid.ts. No Potential, club, league or performance features enter these models.

Age is linear on the log scale: at fixed OVR/position its effect has a constant direction determined by the coefficient. It cannot represent an age peak or different development/decline phases. Position effects have no assumed economic ranking. OVR monotonicity is not imposed by the existing unconstrained regression.

coherence.test.ts uses explicitly specified synthetic artifacts and hypothetical calibration quantiles. These coefficients are mathematical test inputs, not learned economic results. No training, real labels, dataset files, database or network is needed. The tests check analytic sensitivity ratios for positive/negative/zero coefficients, position effects, determinism, positive finite outputs, nested intervals, boundary inputs, numerical overflow/underflow and abstention. Synthetic domain bounds are test fixtures, not an approved player population.

Run from repository root:

    node --import tsx --test experiments/futscout-value-v01/coherence.test.ts experiments/futscout-value-v01/engine.test.ts experiments/futscout-value-v01/hybrid.test.ts

Incomplete inputs, unsupported OVR/age/position, unavailable calibration and numerical failure return absence. Training range checks are mechanical guards; they do not establish statistical support within those ranges. Hybrid simulation additionally requires approval, rights, evidence and a validated domain. Existing eligible observed positives and explicit zero take priority, and the offline policy never publishes or creates a current.

Mathematical coherence does not establish predictive accuracy, empirical interval coverage, low-OVR generalization or resistance to selection bias. Real validation still requires authorized references, unchanged frozen splits, train-only fitting, calibration-only intervals and separate club holdout/unseen-league reports as specified in VALIDATION.md. No real group becomes eligible through these tests.

Commercial training/calibration rights for Live Football data remain UNKNOWN. Owner authorization does not establish provider permission. This work preserves the existing license gate and all frozen dataset hashes. No model is approved for publication.
