# Second league logo batch — 2026-09-23

Decision reference: `owner-decision:brand-assets-second-league-batch-2026-09-23`.
Owner acceptance recorded at 2026-09-23T02:47:52.000Z. Technical verification is
separate from trademark rights; all four assets retain REVIEW_REQUIRED.

## Reused audit evidence

The preceding read-only audit queried exact API-Football league IDs and matched
local Club.apiFootballId values against season 2025/26 participants. All four
competitions had type League and also exposed a current 2026/27 season.
Local League.country was not populated; provider countries and exact club IDs
supplied the corroborating evidence. League.externalId was never used as an
API-Football identity.

| Local league | Local ID | Provider ID | Country / division | Exact local club matches |
| --- | --- | --- | --- | --- |
| Liga Portugal | cmt99o0480055ugucogcv1tys | 94 | Portugal / first | 16/16; 18 in regular standings |
| EFL Championship | cmt9cn4x903jhukuctl70f0n1 | 40 | England / second | 24/24 |
| Bundesliga 2 | cmt9d9yzg04znukuczx9cgidr | 79 | Germany / second | 18/18 in regular standings |
| Serie BKT | cmt9c850x02nfukucwm8657h5 | 136 | Italy / second | 16/16; 20 provider participants |

Each source received exactly one GET in the preceding audit, without retry.
All returned HTTP 200, image/png and a decodable PNG, and were visually verified.
This registration stage does not repeat provider queries or image downloads.

| Provider | Source URL | Dimensions | Original SHA-256 |
| --- | --- | --- | --- |
| 94 | https://media.api-sports.io/football/leagues/94.png | 112 x 150 | `73994d5ef3902b242f9f5f9ff76fc2040c2d1aa37ddbad5d78489bab0bb56b77` |
| 40 | https://media.api-sports.io/football/leagues/40.png | 125 x 150 | `8cdd60fb0f11404ea2b09d0e7ce431a7a50c5e8efc5033b5cc5573ef4e0a7917` |
| 79 | https://media.api-sports.io/football/leagues/79.png | 149 x 150 | `2d3ff1db0e4ce27a75529f907f7c2c6c700c873c40a3d75732a87fc9b6363393` |
| 136 | https://media.api-sports.io/football/leagues/136.png | 105 x 150 | `d528b9c53a4267f47176d9649735150190dda9a0d0fe8948abef520230f0386f` |

The individual GET timestamps were not retained during the read-only audit.
Its known completion timestamp was 2026-09-23T02:39:27.000Z; `fetchedAt`
uses that audit completion timestamp as the prior delivery observation time,
not as a claim of a new GET or an exact per-request timestamp.

## Operational scope and execution protocol

Only these four LEAGUE/LOGO identities are authorized. Required values:
OWNER_AUTHORIZED_REMOTE_USE, DISPLAY_ALLOWED, storageUrl=null,
operatorRiskAccepted=true, revocable=true, the owner acceptance timestamp,
actor, risk reason, source-terms URL and decision reference.
Rights remain REVIEW_REQUIRED; this is not a licence.

Use the existing Serializable transactional writer one league at a time in
order 94, 40, 79, 136. Pin a fresh database preflight, compare expected states,
and independently confirm every committed asset. Stop on conflict, drift,
audit failure or indeterminate commit; never automatically retry.
Audit protected Club/League tables and fingerprint all preexisting Registry
identities/assets so unrelated data cannot change unnoticed.
Check source resolution, revocation and the disabled publication policy
locally without downloading the images.

Ligue 2 (local cmt9ekar7005c1suckjql1hd7, provider 62) remains REVIEW and excluded.
Local Red Star FC (cmt9g1wkq037v1sucum6ntyxn) still points to API-Football 4396,
which the provider identifies as Red Star in Guadeloupe. Exact provider 104
identifies RED Star FC 93 in France, founded 1897, Stade Bauer in Saint-Ouen.
The focused read-only investigation found no Club or CLUB Registry owner of
104. The existing 4396 Registry identity and crest are outside this batch:
no Club association, existing identity or asset is modified or revoked.

## Execution results

Completed at 2026-09-23T02:56:21.772Z. Fresh database preflight found all four
local identities unchanged and no Registry conflicts. Each writer call returned
CREATED / COMMIT_CONFIRMED / retries=0, followed by an independent confirmation
read, operational-field comparison and audit before the next call.

| League | Provider ID | Confirmed asset ID |
| --- | --- | --- |
| Liga Portugal | 94 | cmudiewgx0001tgucsjx77auv |
| EFL Championship | 40 | cmudifjsw00013kucvt4zt5si |
| Bundesliga 2 | 79 | cmudig5t10001qwucc73c0eqy |
| Serie BKT | 136 | cmudigsr300019oucn1v9nybf |

Registry totals increased from 581 to 585 identities and assets. Registered
league coverage increased from 7/45 to 11/45 (24.44%), leaving 34 league
fallbacks. Registered club coverage remains 574/582; this count includes the
preexisting Red Star association under review and is not a new correctness
certification of those club identities. Ligue 2 still has no Registry identity.

Protected-table counts and MD5 hashes were unchanged:
- Club: 582, `3ddbb0cc171a82a44b7eeaf532ab3311`;
- League: 45, `d6abf94b92514885587f60b7645d5ec2`.

The SHA-256 fingerprint of every preexisting Registry identity and asset was
unchanged: `a127e936340d63090c8d8a7607aa4af2a6dd64c71d2c6ae79f4af6a34e847ddc`.
Final full Registry MD5 hashes: identities `8b6c483c3a543c06ca87cbb4d89ce900`,
assets `3ad56fbb7d2932dafcc0ec8699851079`.

All four references resolve to their audited source URL when the publication
policy is enabled, and resolve to fallback when individually revoked or the
global policy is disabled (in-memory checks only; no environment changes).
The previous visual/delivery audit was reused; no provider requests or image
downloads were performed during this registration stage.

Validation passed: 61 pertinent tests, `npx tsc --noEmit`, `npm run lint`, and
`git diff --check`. No deployment, migration or Red Star correction was made.
Local supporting files are under audit/output/league-batch2-*, ignored by Git.
