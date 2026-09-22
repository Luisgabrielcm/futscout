# Brand asset operational authorization — Phase J

Status: product decision recorded for implementation preparation only.

Decision date: 2026-09-21

The FutScout owner has authorized a future controlled pilot that remotely
displays the API-Football technical references for these exact identities:

- Club / Real Madrid / API-Football 541 / CREST;
- Club / Barcelona / API-Football 529 / CREST;
- Club / Manchester City / API-Football 50 / CREST;
- Club / Liverpool / API-Football 40 / CREST;
- League / LaLiga / API-Football 140 / LOGO;
- League / Premier League / API-Football 39 / LOGO.

The registry value for this product decision is
`OWNER_AUTHORIZED_REMOTE_USE` (the persisted equivalent of
`ALLOWED_AT_OPERATOR_RISK`), referenced as
`owner-decision:brand-assets-phase-j`. A complete record also requires
`operatorRiskAccepted = true`, the acceptance time and actor, a non-empty risk
reason, the reviewed source-terms URL, and `revocable = true`.

This decision is separate from `rightsStatus`. It does not state or imply that
API-Sports, a club, a league, or another rightsholder granted a trade-mark or
copyright licence. The six assets remain `REVIEW_REQUIRED` unless independent
rights evidence justifies a different status. The documentary conclusions in
`brand-assets-informational-use-review.md` remain unchanged.

`BLOCKED` is absolute and cannot be overridden by this product decision.
`REVOKED` is the per-asset kill switch. The server-side global switch and the
provider/entity deny lists can independently restore the FutScout fallback.
Remote-use authorization never permits a FutScout storage/CDN copy.

## Proposed non-affiliation copy

> FutScout is an independent project and is not affiliated with, sponsored by,
> or endorsed by the clubs, leagues, or other owners of the marks displayed.
> Trademarks and logos belong to their respective owners.

This notice does not grant rights and is not published to Production by this
phase.

## Takedown procedure

1. Record the request, affected provider identity, source, reason and time.
2. Set the affected asset decision to `REVOKED`, or its rights status to
   `BLOCKED` when the documentary decision itself is blocked.
3. Confirm the registry reader returns the FutScout fallback immediately.
4. Preserve the audit record and do not reactivate without a new review and
   explicit owner decision.

For an urgent provider-wide or entity-specific response, use
`BRAND_ASSET_BLOCKED_PROVIDERS` or `BRAND_ASSET_BLOCKED_ENTITY_IDS`. The global
`BRAND_ASSET_PUBLICATION_ENABLED=false` switch disables every
risk-accepted `REVIEW_REQUIRED` asset.

This phase does not apply the prepared migration, insert registry rows,
download artwork, or publish assets. A later write requires separate
authorization, exact provider identity, validated delivery, a clean CAS
preflight, and a successful protected-table audit.

## Controlled expansion to all identified clubs

Decision date: 2026-09-22

After the six-asset pilot was validated in Production, the FutScout owner
authorized the same revocable remote-use decision for every remaining Club
that already had an exact, persisted API-Football identity. The expansion adds
these eleven Club identities; the original four Clubs and two Leagues remain
unchanged:

- Arsenal / API-Football 42 / CREST;
- Atlético de Madrid / API-Football 530 / CREST;
- Burnley / API-Football 44 / CREST;
- Chelsea / API-Football 49 / CREST;
- FC Bayern München / API-Football 157 / CREST;
- Hamburger SV / API-Football 175 / CREST;
- Manchester United / API-Football 33 / CREST;
- Paris Saint-Germain / API-Football 85 / CREST;
- Sunderland / API-Football 746 / CREST;
- TSG Hoffenheim / API-Football 167 / CREST;
- VfB Stuttgart / API-Football 172 / CREST.

The expansion changes neither the documentary conclusion nor the publication
contract. Every added asset remains `REVIEW_REQUIRED`, uses
`OWNER_AUTHORIZED_REMOTE_USE` plus `DISPLAY_ALLOWED`, keeps `storageUrl = null`,
and is individually revocable. `BLOCKED` remains absolute. No provider ID is
inferred by name: each local Club already stored the exact provider ID before
this authorization.

## Controlled expansion to 25 priority clubs

Decision date: 2026-09-22

The FutScout owner subsequently authorized the same revocable remote-use
decision for a further 25 priority clubs. Exact API-Football identity and
remote PNG delivery were revalidated before this code change:

- SSC Napoli / 492; Borussia Dortmund / 165; Athletic Club / 531;
- Newcastle United / 34; AS Roma / 497; Aston Villa / 66;
- Juventus / 496; Bayer Leverkusen / 168; Fiorentina / 502;
- RB Leipzig / 173; Tottenham Hotspur / 47; Real Betis / 543;
- Everton / 45; Olympique de Marseille / 81; Nottingham Forest / 65;
- Real Sociedad / 548; Villarreal / 533; West Ham United / 48;
- Fulham / 36; Brighton & Hove Albion / 51; Bologna / 500;
- Crystal Palace / 52; AS Monaco / 91; Eintracht Frankfurt / 169;
- Valencia / 532.

These assets retain `REVIEW_REQUIRED`, `DISPLAY_ALLOWED`,
`OWNER_AUTHORIZED_REMOTE_USE`, `storageUrl = null`, and per-asset revocation.
The documentary rights conclusion is unchanged. Provider identities must be
persisted by exact ID with a protected audit before registry writes; no name
matching or placeholder clubs are authorized.

## Controlled expansion to 100 covered clubs

Decision date: 2026-09-22

The owner authorized a further 60 exact Club identities, bringing the total
controlled crest coverage to 100 Clubs. The cohort prioritizes the remaining
real clubs from the Premier League, LaLiga, Serie A, Bundesliga and Ligue 1,
then Galatasaray, Fenerbahçe, Beşiktaş, FC Porto, Sporting CP, SL Benfica,
SC Braga and Al Nassr. Every provider identity was checked by exact numeric ID;
all 60 remote PNG deliveries and SHA-256 hashes were validated before write.

`Lombardia FC`, `Milano FC`, `Bergamo Calcio` and `Latium` remain excluded:
they are EA catalogue placeholders and must not be associated with real clubs.
The empty mock Bayer Leverkusen record is also excluded. No fuzzy matching or
automatic substitution is permitted.

The rights and rollback contract is unchanged: `REVIEW_REQUIRED`,
`DISPLAY_ALLOWED`, `OWNER_AUTHORIZED_REMOTE_USE`, `storageUrl = null`,
individual revocation, absolute `BLOCKED`, and the global publication kill
switch all remain in force.
