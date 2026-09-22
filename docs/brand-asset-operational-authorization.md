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
`BRAND_ASSET_REVIEW_PUBLICATION_ENABLED=false` switch disables every
risk-accepted `REVIEW_REQUIRED` asset.

This phase does not apply the prepared migration, insert registry rows,
download artwork, or publish assets. A later write requires separate
authorization, exact provider identity, validated delivery, a clean CAS
preflight, and a successful protected-table audit.
