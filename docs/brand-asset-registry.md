# Brand Asset Registry

Status: prepared only. The schema and migration are not applied, and this
document does not authorize downloading or publishing third-party logos.

## Boundary

Entity identity and visual artwork are separate facts:

```text
Club / League
  -> verified provider identity
  -> versioned brand asset metadata
  -> rights gate
  -> ClubLogo / LeagueLogo
  -> FutScout fallback when blocked or unavailable
```

Names and fuzzy matching are never asset identity. `League.externalId` remains
reserved for the EA catalog; an API-Football league ID belongs in
`BrandAssetIdentity`.

## Persistence model

`BrandAssetIdentity` owns the verified mapping from one local entity to one
provider identity. `BrandAsset` owns immutable asset versions and their policy
state. The prepared SQL validates polymorphic Club/League ownership without
changing either existing table and allows only one active version per identity
and asset type.

The flattened registry contract exposed to application code is equivalent to:

```text
entityType, entityId, provider, providerEntityId, assetType,
sourceUrl, storageUrl?, contentHash?, version, fetchedAt,
rightsStatus, operationalDecision, operatorRiskAccepted, riskAcceptedAt,
riskAcceptedBy, riskReason, sourceTermsUrl, revocable, status
```

## Rights policy

- `APPROVED`: approved local/licensed use; prefer storage, then source.
- `REMOTE_ONLY`: render only the approved remote source; never use storage.
- `CACHE_ALLOWED`: an approved cached copy may be used; prefer storage.
- `REVIEW_REQUIRED`: retain metadata for review, never render.
- `BLOCKED`: do not fetch, cache, publish or render.

Operational product authorization is stored separately from legal/source
evidence. `OWNER_AUTHORIZED_REMOTE_USE` may allow an `ACTIVE` remote reference
whose rights evidence remains `REVIEW_REQUIRED`, but it does not reclassify or
erase that evidence. It requires an authorization timestamp and reference,
never permits a storage/CDN copy, and can be revoked. `BLOCKED` always wins.

Only an `ACTIVE` asset with `APPROVED`, `REMOTE_ONLY`, `CACHE_ALLOWED`, or the
separate and complete `OWNER_AUTHORIZED_REMOTE_USE` decision passes the
frontend gate. Technical availability of a public URL is not proof of
trademark or redistribution rights.

For a controlled beta, the server-side
`BRAND_ASSET_REVIEW_PUBLICATION_ENABLED` switch may permit an `ACTIVE` and
technically valid `REVIEW_REQUIRED` asset to use only its remote `sourceUrl`,
but the switch is necessary and never sufficient by itself. The individual
asset must also carry a complete, revocable operator-risk acceptance record.
The default is `false`. Turning it off restores the fallback without changing
Registry data. `BRAND_ASSET_BLOCKED_PROVIDERS` and
`BRAND_ASSET_BLOCKED_ENTITY_IDS` provide provider and local-entity kill
switches. `BLOCKED` and `REVOKED` remain absolute, and none of these controls
changes or represents the documentary `rightsStatus`.

## Initial evidence, not persisted

Clubs with already verified API-Football identity:

- Liverpool: 40
- Manchester City: 50
- FC Barcelona: 529
- Real Madrid: 541

League evidence:

- LALIGA EA SPORTS: 140
- Premier League: 39
- UEFA Champions League: 2, but no local League currently exists

The first real batch may include the four clubs and the first two leagues only
after identity preflight and rights approval. Champions League remains outside
the batch until a separate local-entity decision.

## Scalable ingestion

1. Resolve and verify provider identity independently of artwork.
2. Fetch only asset metadata for verified identities under a bounded budget.
3. Validate HTTPS/local URL, content type, dimensions and entity context.
4. Apply the rights gate before downloading or activating anything.
5. Calculate a content hash and deduplicate provider responses.
6. Store a new version only when URL or content changed.
7. Activate atomically; retain the prior version for audit and rollback.
8. Resolve through the central registry; pages retain existing fallbacks.

For a new entity, the identity pipeline runs first. A changed logo creates a
new version. A changed URL with the same hash updates provenance without
duplicating content. Removed assets become `REMOVED`; provider failures retain
the last permitted active version and record the failed observation. Revoked
rights move the asset to `BLOCKED`, immediately restoring the fallback.

## Scale strategy

The 15 existing `Club.apiFootballId` values seed verified identity candidates.
The remaining clubs are processed in deterministic batches using provider ID,
country, league, team type and evidence snapshots; ambiguous cases go to
review. No club is linked by fuzzy name. League reconciliation uses provider
competition ID, country, type and season, without overwriting EA identity.

## Branding requirements

Before publication, final copy must state that FutScout is unofficial, does
not imply affiliation or endorsement, and that club and competition marks
belong to their respective owners. Third-party marks must not be combined with
the FutScout logo in a way that suggests a joint brand. Legal copy is reviewed
separately and is not published by this phase.
