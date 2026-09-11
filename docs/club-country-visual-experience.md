# Lote 7.2 — visual club and country experience

## Data boundary

Only existing read-only services and their DTOs are consumed. Club has no country,
stadium, kits or budget field. League.country is not a reliable substitute for
the club's country and is not inferred. Club country is shown as unavailable.
The approved FutScout outfield mean, goalkeeper mean and coverage are preserved.
No attack/midfield/defence ratings are invented. Fixtures and other unsupported
tabs retain their localized coming-soon state, without fetching operational APIs.

## Pitch decision (Lote 7.2, superseded by Lote 7.3)

This is a sector preview, NOT an XI or a formation. Registered primary positions
map to attack (ATA/PE/PD), midfield (MEI/MC/VOL), defence (LE/ZAG/LD) and goalkeepers
(GOL). At most three players from each sector appear on the CSS-drawn pitch,
ordered by valid EA OVR descending, then name and ID. Invalid OVR ranks after
valid zero. Every remaining player, including unknown positions, appears in
Squad options with the same portrait component and player destination.
No player is designated a starter or substitute. The bounded layout can display
up to twelve people, not a fixed eleven. This rule is explained on the page.

The current XI and full position panel replace that sector preview. See
[FutScout XI methodology](futscout-xi.md) for the current contract.

All field lines/markings are original CSS; no external artwork or SoFIFA code.
PlayerImage owns all portrait/crest validation and fallback. No new image pipeline.

## Navigation and accessibility

Normal links have no text underline. Contextual inline links use chips; hover
adds background as well as color. Keyboard focus retains an explicit outline.
The squad card's main anchor has a CSS-expanded hit area. Club, country and
position links are sibling anchors stacked above it, never nested anchors or
clickable divs. A visible arrow identifies the primary destination. Native
Tab/Shift+Tab/Enter behavior and GET sorting/pagination are preserved.

Country pages use a large existing local flag, localized title, player count and
an explicit non-call-up disclaimer. Their rich player cards also power full
club squads. Primary and secondary positions use the existing stable deduplication.
Null stays unavailable and valid zero remains visible. No translated value
becomes a persisted value, route identity or query filter.

## Responsive boundary

Wide overview: field and options/info side by side. Narrower screens: field
first, then options/info. Cards flow into multiple columns with one column on
mobile. Tabs scroll inside their own region; player positions use flow layout
rather than absolute placement. Only presentation changed: no schema, service,
query, sync or matcher modifications, no new client-side roster state.

Commit and automatic Preview are restricted to beta-next. Production/master
are outside the scope of this lot.
