# Five league logos — execution verification

Branch: `beta-next`. Decision: `owner-decision:brand-assets-five-leagues-2026-09-23`.

The exact local League IDs and operational terms are recorded in
[the owner decision](brand-asset-operational-authorization.md#controlled-expansion-to-five-additional-league-logos).
Supporting JSON files referenced below are local audit artifacts under
`audit/output/`, ignored by Git. The essential execution evidence is retained
in this versioned report.

All five exact local IDs existed; there were no conflicting Registry identities.
The five source URLs returned HTTP 200 PNGs. SHA-256 hashes were pinned in
`league-logo-preflight.json` and checked again before each write.

Source URL pattern: `https://media.api-sports.io/football/leagues/{providerId}.png`.

| Provider ID | Verified source SHA-256 |
| --- | --- |
| 78 | `41008525e75e6a6206c4469b2947ff3579e46b86ed7991dbe6ec452e522518d0` |
| 61 | `4ccb07f4cb560024deb1f3eb5d5b15573e095c7398228d0f9d78ac4c0b1d9448` |
| 135 | `59a0fece857f60d23f4b7571777f35a3894564740b4a4056c7ebd2b25e48e6a6` |
| 88 | `c760aa11c1afca6ca832e24634a9c85a24e6419d9d1cae271514082e495252e6` |
| 253 | `4b79fc566b14a5fb4d005587ae9c4201fe9420b233555184d22f2492de9d387d` |

Each league was written individually through `persistBrandAssetAtomically`
using the existing Prisma store. All returned `CREATED`, `COMMIT_CONFIRMED`,
and `retries: 0`. Each transaction was followed by an independent read and
an audit. The corresponding `league-logo-write-{providerId}.json` files
contain the candidate, result, confirmation and before/after audits.

| League | Provider ID | Confirmed asset ID | Local browser verification |
| --- | --- | --- | --- |
| Bundesliga | 78 | cmudgzluo0001qwuctter4ikf | Loaded, natural size 48 x 48 |
| Ligue 1 McDonald's | 61 | cmudh2cg900014wucbw03z7ph | Loaded, natural size 48 x 27; low contrast on dark background |
| Serie A Enilive | 135 | cmudh4g830001ioucgj5awo88 | Loaded, natural size 48 x 48 |
| Eredivisie | 88 | cmudh50xx0001qcuc0ip4b0bc | Loaded in header (128 x 74) and club card (24 x 14); low contrast |
| MLS | 253 | cmudh5ijd0001ncucpwpvtdzo | Loaded, natural size 48 x 50 |

Browser verification used `http://localhost:3000/pt/ligas`, its second page,
and `/pt/ligas/eredivisie`. Each checked image had `complete = true`, positive
natural dimensions, and a same-origin `/_next/image` URL pointing to its exact
API-Sports league PNG. Existing neutral fallbacks were visible in both list pages.

Final database coverage: 7/45 leagues (15.56%), 574/582 clubs (98.63%);
38 league fallbacks remain. Registry totals: 581 identities and 581 assets.
Protected Club and League counts and hashes were unchanged across the batch.
The protected-table audit retained `Club` count 582 and MD5
`3ddbb0cc171a82a44b7eeaf532ab3311`, and `League` count 45 and MD5
`d6abf94b92514885587f60b7645d5ec2`. Final audit time: 2026-09-23T02:20:37.662Z.
See `league-logo-final.json` for the complete final audit and fallback list.

All new assets retain `REVIEW_REQUIRED`, `OWNER_AUTHORIZED_REMOTE_USE`,
`DISPLAY_ALLOWED`, `storageUrl = null`, and individual revocation.
No deployment, migration, manual INSERT, automatic write retry or credential
disclosure was performed.

Validation: 61 pertinent tests passed; `npx tsc --noEmit`, `npm run lint`,
targeted ESLint and `git diff --check` passed. The existing test's fixed
allowlist totals were updated from 576/2 leagues to 581/7 leagues.
