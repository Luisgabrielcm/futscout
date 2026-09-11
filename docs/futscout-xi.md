# Lote 7.3 — FutScout XI and complete position panel

## No official lineup source

The local Prisma schema has no starter/bench assignment, match lineup, formation
or official XI. `PlayerRealLifeStat.lineups` is a season/team/competition count,
not an eleven-player selection. No operational API or write is introduced.

## Exact deterministic selection

Five templates, in tie-break order (outfield rows plus exactly one GOL):

| Formation | Attack / midfield / defence |
| --- | --- |
| 4-3-3 | PE ATA PD / MC VOL MC / LE ZAG ZAG LD |
| 4-2-3-1 | ATA / PE MEI PD / VOL VOL / LE ZAG ZAG LD |
| 4-4-2 | ATA ATA / PE MC MC PD / LE ZAG ZAG LD |
| 3-4-3 | PE ATA PD / LE MC MC LD / ZAG ZAG ZAG |
| 3-5-2 | ATA ATA / LE MC VOL MC LD / ZAG ZAG ZAG |

LE/LD are wide players in the three-defender templates. No new tactical skill,
side or position is inferred. Only exact primary/explicit secondary EA positions
are compatible. Both the secondary array and legacy secondary field are read,
deduplicated. Primary GOL players only enter GOL slots; outfield players never do.
Valid EA OVR (0–99) is required for selection; invalid OVR remains visible as absent
in the full panel. No person can occupy two slots.

An exact dynamic program over 11 slot bits finds an assignment, not a greedy XI.
First require all eleven compatible slots. Then maximize the number of primary
matches; then total EA OVR. Equal assignments keep deterministic name/ID traversal;
equal formations keep the table order. String comparison is locale-independent.
Potential and value never influence the XI. This prioritizes positional fit over
OVR and does not claim to optimize real-world tactical performance.

If no complete template is feasible, do not show a partial team as an XI. Show
the best compatible coverage (N/11), an unavailable notice and the entire panel.
Never duplicate a player or invent compatibility merely to reach eleven.

## Full position panel

Every registered player appears once, grouped exclusively by primary position:
GOL; LE/LD; ZAG; VOL; MC/MEI; PE/PD; ATA; other/unknown. Empty groups are omitted.
Within each group: EA OVR descending, available potential descending (null last,
not zero), name, ID. The chosen eleven are marked, not removed from the panel.
PlayerImage supplies each portrait and neutral fallback; existing formatCurrency
renders persisted marketValue after the same BigInt-to-number conversion used
by the player mapper. Null stays a dash and valid zero survives.

## Query, rendering and responsive boundaries

One club-scoped findMany selects ten scalar fields for BOTH XI and panel. It has
no per-player queries, joins, roster truncation or client-side roster state.
The existing rating aggregate and separately requested paginated/sortable Squad
tab remain unchanged. DP cost is bounded by five templates × players × 2048 masks
× eleven slots, with only 2048 states per template. It runs in a Server Component.

The pitch shows eleven portraits, used positions and correctly labeled EA OVR.
The full side panel has its own desktop scroll, while mobile uses a single column
and expands the entire panel after the pitch. Original CSS field, semantic anchors,
visible focus and PT/EN copy are retained. No schema, dependencies, assets, sync,
matcher or Production/master change.
