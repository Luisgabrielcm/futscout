# Lote 7 — Club experience / connected navigation

## Read-only coverage audit (2026-09-10)

PostgreSQL was inspected with aggregate SELECTs inside a REPEATABLE READ,
READ ONLY transaction, rolled back at the end. No source API, resolver, matcher,
sync, migration or database write. Counts are an audit snapshot, not constants
used by production UI.

| Entity / fields | Classification | Coverage / limitation |
| --- | --- | --- |
| Club id, slug, name, externalId, league | AVAILABLE | 582 clubs; 582 EA identities and league relations |
| Club apiFootballId | PARTIAL | 15/582; never used as EA externalId |
| Club imageUrl | UNTRUSTED | 581/582 URLs, all player-shields, rejected by existing asset contract |
| Club country | MISSING / REQUIRES_SCHEMA | No Club.country; League.country must not be inferred as club country |
| Club registered players | AVAILABLE | 0–44 per club; one empty club |
| League country | PARTIAL | 1 Germany; 44 unknown placeholders, not useful club location evidence |
| Player slug/name/photo URL/birth date/nationality/primary position/EA OVR | AVAILABLE | 16,228 records; photo URL presence is not a guarantee of browser availability or license |
| Player club and derived league | PARTIAL | 14,701 associated; others remain unassigned |
| Secondary positions | PARTIAL | 9,909 nonempty; absence preserved |
| Dynamic overall | PARTIAL | 3 |
| Potential | PARTIAL | 4 |
| Form | PARTIAL | 3 |
| Market value | PARTIAL | 3; never summed into an invented club valuation |
| PlayerAttributes | AVAILABLE | 16,228 |
| PlayStyles | PARTIAL | 7,355 players, 36 codes; 14,991 normal and 120 plus links |
| Player transfers | PARTIAL | 3 rows; not a complete club transfer history |
| Player trophies | PARTIAL | 106 rows; not official Club trophies |
| Real-life player stats | PARTIAL | 64 rows; not team statistics/results |
| Club formation, starters, substitutes | MISSING / REQUIRES_NEW_SOURCE / REQUIRES_SCHEMA | No evidence for an XI |
| Official club overall, attack, midfield, defense | MISSING / REQUIRES_NEW_SOURCE / REQUIRES_SCHEMA | Do not label a derived rating as EA club rating |
| Stadium, capacity, city, foundation, nickname | MISSING / REQUIRES_NEW_SOURCE / REQUIRES_SCHEMA | No reliable club-level contract |
| Budget, club value, salary, contract, shirt number | MISSING / REQUIRES_NEW_SOURCE / REQUIRES_SCHEMA | Never backfill |
| Next fixture, schedule, results, team transfers/trophies/history | MISSING / REQUIRES_NEW_SOURCE / REQUIRES_SCHEMA | Player records cannot substantiate team history |
| Kits | MISSING / REQUIRES_NEW_SOURCE | Requires both trustworthy identity mapping and use rights |
| Official national teams/call-ups | MISSING / REQUIRES_NEW_SOURCE / REQUIRES_SCHEMA | Derived nationality directory only; no official eligibility assertion |

## Approved rating method

The user explicitly approved the arithmetic mean of registered outfield
players' EA OVR, with a separate goalkeeper mean and no inferred XI.

- Primary positions LD/LE/ZAG/VOL/MC/MEI/PD/PE/ATA constitute outfield.
- GOL is excluded from outfield and reported separately.
- Accept OVR 0–99; unknown positions and invalid values do not contribute.
- At least one valid player in a category is needed for that category's mean;
  otherwise it is unavailable, never zero. A sparse mean is not an estimate of
  missing players or a complete club strength claim.
- Database integer OVR sums are divided by the contributing player count,
  never averaged as positional means. Integer sums avoid grouping-dependent
  floating-point drift. No roster-size bonus.
- UI displays one decimal; ordering retains full precision.
- Best-team ties: mean descending (null last), name code-point ascending, ID
  ascending. Stable across languages. Coverage: contributing players / total
  registered players, plus a warning about incomplete squads.
- No attack/midfield/defense formula was added beyond the approved method.
- No formation, starters or substitutes inferred. The field groups **all**
  registered club players by primary position, with the same image contract.

## Data navigation

Club and league routes use real database slugs through the player mapper/DTO.
Nationality routes reuse exact country aliases from the local flag registry;
unknown names remain separate normalized directory keys. A grouped database
query finds the actual persisted spellings; player queries use those exact
values. No record is created, rewritten or treated as an official national team.

OVR/potential links mean **minimum** values; null has no link. Position filters
include primary, secondary-array and legacy secondary positions, combined with
search rather than replacing its OR. PlayStyle codes use a 36-code allowlist;
Plus uses the actual relation level, not a visual suffix. Filter removal and
pagination preserve canonical URL state and locale.

## Performance and scope

Regular club pages load 24 clubs and a single aggregate query for those IDs.
Best-team sorting loads compact matching club metadata (582 at audit time) and
grouped OVR values, ranks globally, then returns 24 results. It does not load
16k players or issue queries per club/player. For substantially larger club
catalogs, move ranking and pagination into a parameterized SQL aggregate query.

Overview selects compact player identity/photo/position/OVR for one club only.
Squad and nationality player lists are paginated through the existing catalog
contract (requires PlayerAttributes; full coverage at audit time). Only the
selected tab loads its data; unsupported tabs are honest coming-soon states.
No eager prefetch on tab or field links. No package/schema/migration changes.

## Separate badge/license plan

No trustworthy local club crest set was found. Existing player-shield URLs are
not crests. Previous API-Sports redistribution attempts are not reused. No new
assets downloaded and no license/legitimate hotlink permission presumed.

Keep initials for this lot. A future isolated task must obtain documented use
rights from a licensor/rights holder (including hosting, territory and retention
terms), verify each asset-to-club mapping, record source/license provenance, and
only then add approved assets. Availability of a URL alone is not permission.

## Delivery restrictions

Development branch: beta-next, created/published from 7c80043. master untouched.
Implementation was initially prepared without a commit. The final review task
authorizes one Lote 7 commit and a normal push of beta-next for Vercel Preview.
No merge, master push or production deployment is authorized.
