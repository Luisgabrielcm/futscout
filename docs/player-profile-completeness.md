# Lote 7.1 — persisted attributes and presentation localization

## Read-only audit, 2026-09-10

Read-only PostgreSQL transaction, verified with SHOW transaction_read_only and
finished with ROLLBACK. No operational API, sync, migration or database write.
There are 1,816 goalkeepers and 1,816 related PlayerAttributes rows.

| Goalkeeper | EA OVR | PAC / SHO / PAS / DRI / DEF / PHY persisted | Acceleration / sprint speed |
| --- | --- | --- | --- |
| Marc-André ter Stegen | 86 | 84 / 84 / 89 / 85 / 47 / 84 | 45 / 50 |
| Thibaut Courtois | 89 | 85 / 89 / 76 / 90 / 46 / 88 | 42 / 52 |
| Gianluigi Donnarumma | 89 | 90 / 83 / 70 / 90 / 52 / 87 | 50 / 55 |
| Alisson (alisson-212831) | 89 | 86 / 85 / 86 / 89 / 56 / 90 | 60 / 49 |

These are audit examples, not production constants. Homonymous outfield players
named Alisson were distinguished by actual slug/position, never merged.

The EA mapper copies pac/sho/pas/dri/def/phy into generic attribute columns.
The local source type declares gkDiving, gkHandling, gkKicking, gkPositioning and
gkReflexes, but the mapper, normalizer and schema do not persist them. No saved
EA payload proves those five values for these players in this audit; no external
request was made to obtain them. Generic face stats must not be relabeled as
GK attributes based solely on familiar-looking numbers.

General subattributes exist in all four sampled GK records: acceleration,
sprintSpeed; positioning, finishing, shotPower, longShots, volleys, penalties;
vision, crossing, freeKickAccuracy, shortPassing, longPassing, curve; agility,
balance, reactions, ballControl, dribblingStat, composure; interceptions,
headingAccuracy, defensiveAwareness, standingTackle, slidingTackle; jumping,
stamina, strength, aggression. In particular, positioning is the existing
general field, NOT gkPositioning.

The profile previously suppressed the entire attributes component for GOL.
It now exposes actual general subattributes and separately labels persisted
face stats by their original codes. Missing GK-specific data is explicit.
No outfield analytical model is applied to goalkeepers. Absent/invalid rendered
values remain unavailable; valid zero is preserved. No schema or pipeline fix
is attempted here. The non-null schema does not itself prove source provenance
for every historical record.

## Localization and identity

displayNationality is the shared display-only helper. It uses the existing 153
explicit flag identities with Intl.DisplayNames and constituent-country labels.
Northern Ireland and Chinese Taipei have text-only translations; Congo and
unknown names remain unchanged rather than being assigned a different identity.
No flag mapping, persisted nationality, country slug or query scope changes.
Header, quick profile, country pages and club squads consume the same helper.
PlayerCard and comparison currently do not render nationality, so no extra
database field or new surface was added just to translate it.

All 36 allowlisted PlayStyles have PT presentation names and canonical EN names.
PT names are FutScout translations, not an assertion of official EA terminology.
Tiki Taka keeps its proper name. Unknown styles retain their source name.
Plus remains a separate visible label; existing legacy decorated-name display
compatibility is retained. Filter Plus semantics still come ONLY from the
persisted relation level. URLs always carry canonical keys, never translated
names. No description, artwork or source record is fabricated.

## Positions and assets

Existing stable primary/secondary-array/legacy-secondary deduplication is reused.
Jauregizar has MC + VOL; Ter Stegen has GOL with no secondary position. Both
primary and secondary links retain the current position filter semantics.

Club badges already use the central validator and the persisted club slug.
The previous audit found player-shields rather than trustworthy club crests;
these remain rejected. League has no logo column, and no approved local league
art exists. The league name stays clickable. No new asset was downloaded, no
player card/portrait was reused as a badge, and no logo coverage is claimed.

Only beta-next is eligible for this commit/push and automatic Preview. No merge
or Production deployment is authorized.
