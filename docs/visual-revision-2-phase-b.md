# Visual Revision 2 — Phase B data audit

Audit date: 2026-09-17. The PostgreSQL inspection ran inside a read-only
transaction. No EA/API-Football request, sync, migration or domain write was
performed.

## EA positions and potential

The EA contract exposes one `position` plus an ordered `alternatePositions`
array. The mapper already retained the whole array, and `Player` already stores
both `secondaryPositions String[]` and the first legacy `secondaryPosition`.
No schema change is required.

The loss happened in normalization: `RM`, `LM` and `CF` were collapsed into
winger/striker roles. They are now preserved as the established FutScout display
codes `MD`, `ME` and `SA`. The official EA badges remain separate from the
FutScout positional-fit map. The fit engine deliberately keeps its existing nine
calculated roles; no new rating formula was invented.

The persisted catalog contains only the earlier normalized primary taxonomy:
ATA, GOL, LD, LE, MC, MEI, PD, PE, VOL and ZAG. Lamine Yamal (EA external ID
277643) is currently persisted as PD with no alternative positions. There is no
saved raw EA payload proving MD for him, so this phase does not add it. A future
EA observation that actually contains RM will normalize to MD automatically.

Only 4 of 16,228 persisted players have non-null potential. The current response
type and mapper accept optional `potential`, the normalizer preserves it, Prisma
stores it as nullable, and the frontend renders null as an em dash. This phase
does not infer or backfill the missing 16,224 values.

## Goalkeepers

There are 1,816 persisted goalkeepers. The local EA response type declares
`gkDiving`, `gkHandling`, `gkKicking`, `gkPositioning` and `gkReflexes`, but no
captured payload in the repository proves those values and the mapper,
normalizer and database do not persist them. The generic PAC/SHO/PAS/DRI/DEF/PHY
columns are therefore not renamed or presented as goalkeeper attributes.

The public profile now routes GOL to a dedicated goalkeeper empty state. Outfield
players continue to use the existing outfield attribute component and analysis.
A future GK pipeline needs captured source evidence first, then explicit typed
mapping, nullable persistence and source-backed tests. No migration was prepared
without that evidence.

## Salary, value and loans

The catalog card accepts only the existing `VerifiedSalary` contract: amount,
ISO currency, weekly/yearly period and a non-empty source. Missing or invalid
salary is displayed as `—`; transfer fee and market value are not used as a
fallback. OVR FutScout and form are no longer presented on player cards.

The EA catalog contract currently has no ownership club, loan destination, loan
status or loan date fields. The real-life transfer observation pipeline preserves
the exact API-Football labels `Loan` and `Return from loan`, but these are temporal
evidence and do not establish EA catalog ownership or a public loan roster by
themselves. Consequently the club page cannot yet split roster, loaned-in and
loaned-out players without inventing membership.

The future automated loan contract must preserve, independently: owning club
identity, current loan club identity, explicit status, start/end dates and source
provenance. Destination-roster and owner-loans-out views can be derived only once
that source-backed contract exists. Current Club V2 remains a separate real-life
dimension and `Player.clubId` remains the EA catalog club.
