# FutScout potential — pure E-v1 core

`calculateFutscoutPotentialEV1(input)` in `modelEV1.ts` implements the frozen
`potential-model-e-v1` experiment. The explicit namespace distinguishes this
estimate from imported/legacy `Player.potential`. No consumer is connected yet.
This is an experimental estimate, not official EA potential or a historically
validated prediction. Product selection does not constitute predictive validation.

Input: continuous `age` at an explicit reference, `overall`, normalized primary
`position`. The core does not derive dates: a future adapter must explicitly use
`(asOf - birthDate) / (365.2425 * 86400000)`, with its own date validation. Never
substitute integer UI age, implicit current time or attributes into this model.

Output: version on both INVALID and EXPERIMENTAL results; the latter includes
role, T0–T10 annual decomposition, all 120 monthly steps (including pre-clamp
values), raw maximum over T1–T10, displayed Math.round value and first peak year.
T0 is excluded; estimates below current overall are valid. The horizon is
conditional on continued activity, without an invented retirement rule.

Fixed constants: line G=2/Y=23/D=1.5/C=31, GK G=1.5/Y=25/D=1.2/C=35,
width=2.5, D3 extension=2, D3 intensity=0.25, tapers line 26–30/GK 28–32,
E line-only intensity=0.25 with smoothstep boundaries 22/23/25/27,
headroom sqrt(clamp01((99-currentLevel)/20)). Mid-month integration, 12 steps
per year, clamp 1–99 after growth minus decline. GK retains D3. All constants
are fixed by this version; no caller override or calibration is provided.

Keep IEEE-754 operation order and no intermediate rounding. The golden contract
allows absolute error <=1e-10 for raw values (tiny runtime floating-point variation,
not tuning); display integers and peak seasons must be exact. No epsilon rounding.

## Portable regression fixtures

`tests/fixtures/futscoutPotential/model-e-v1.json` mechanically projects all 325
frozen cases plus 24 boundary probes from the approved audit fixtures. No outputs
were recalculated. Original source SHA-256 values are embedded. Names/IDs are not
needed in either the algorithm or regression inputs. Tests work without `audit/`.

Monthly tuples, in order: month, time, age, previous, growth, decline, preClamp,
bounded. All original numeric values are retained without precision reduction.
The compact representation avoids repeating field names 41,880 times. Do not
regenerate expectations from the implementation under test or update them to
accommodate a failing implementation.

Future consumers identified but NOT connected: playerService (filter/order before
pagination), mapDatabasePlayer, playerSelectionService, clubService and official
lineup read contracts. A separate versioned persistence/provenance decision is
required; no fallback into Player.potential is introduced here.

Run: `npx tsx --test --test-concurrency=1 tests/unit/lib/futscoutPotentialEV1.test.ts`.
