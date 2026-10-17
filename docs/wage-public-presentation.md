# Wage: public presentation, delivery 01

## Current state

`experiments/futscout-wage-v01/method-contextual-v02.json` is the decision record:
Wage v0.2 is a synthetic-only contextual core, without OVR, real calibration,
approved intervals or publication authorization. The historical v0.1 experiments
are preserved; they are not the site's salary source. No engine is imported into
the public runtime in this delivery.

The versioned inventory documents zero references eligible for calibration.
Training/calibration rights, gross-base semantics, dated FX and historical club
alignment remain unresolved. This task does not inspect private references or
claim that persisted salaries are licensed for public display.

## Functional increment

The shared salary formatter now requires explicit `nature: OBSERVED` and
`publicationAllowed: true` in the existing presentation contract, together with
valid amount, currency, period and a nonempty public source. Older objects with
only a source string fail closed. The profile and catalog card label an accepted
salary as observed and display its salary-specific source; the career provider
is not substituted for salary provenance. Fractional amounts retain cents.

Missing, unauthorized and estimated amounts are never displayed. The real-life
profile explains that verified observed salary and FutScout estimate are
unavailable. Both provider and FutScout estimates remain blocked even if passed
with `publicationAllowed: true`: the current Wage policy authorizes neither.
This is a presentation guard, not a license verifier or a new economic model.

The site currently supplies no salary read adapter. Consequently this delivery
publishes no new salary numbers, selects no economic observations and makes no
database/API calls. A future adapter must verify identity, source semantics and
publication rights before asserting the observed-salary contract. Training or
calibration permission alone does not establish publication rights. Estimate
activation additionally requires real calibration and an approved artifact under
the existing Wage decision; it cannot be enabled by the presentation flag.

No salary is inferred from market value, transfer fees, OVR, potential or EA
attributes. No currency/period conversion is introduced. Existing weekly/annual
observed-salary units remain explicit; the future contextual target remains
EUR/GROSS/BASE/WEEK.

## Validation

Synthetic tests cover PT/EN observed values and source, cents, weekly/annual
units, explicit zero, absence, denied/missing authorization, provider/FutScout
estimates, invalid values and escaped source text. Run `npm run validate:cloud`
for the site's offline tests, TypeScript, lint and build; Wage's experimental
tests can be run with `node --import tsx --test experiments/futscout-wage-v01/*.test.ts`.
