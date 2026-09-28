export type ClubIdentityReference = Readonly<{
  id: string
  externalId: string | null
  apiFootballId: number | null
  leagueId: string
}>

export const BAYER_LEVERKUSEN_LEGACY_ALIAS = {
  slug: "bayer-leverkusen",
  placeholderEaExternalId: "mock-bayer-leverkusen",
  targetEaExternalId: "32",
  targetApiFootballId: 168,
} as const

export function isVerifiedLegacyClubAlias(input: {
  requestedSlug: string
  placeholder: ClubIdentityReference
  target: ClubIdentityReference
}): boolean {
  return input.requestedSlug === BAYER_LEVERKUSEN_LEGACY_ALIAS.slug &&
    input.placeholder.externalId === BAYER_LEVERKUSEN_LEGACY_ALIAS.placeholderEaExternalId &&
    input.target.externalId === BAYER_LEVERKUSEN_LEGACY_ALIAS.targetEaExternalId &&
    input.target.apiFootballId === BAYER_LEVERKUSEN_LEGACY_ALIAS.targetApiFootballId &&
    input.placeholder.leagueId === input.target.leagueId
}

export type EaClubSyncResolution =
  | Readonly<{ kind: "MATCH"; clubId: string }>
  | Readonly<{ kind: "CREATE" }>
  | Readonly<{ kind: "CONFLICT"; reason: "EA_ID_MISSING" | "EA_IDENTITY_MISMATCH" | "SLUG_OWNED_BY_DIFFERENT_IDENTITY" }>

export function resolveEaClubSyncIdentity(input: {
  eaExternalId: string | null | undefined
  identityOwner: Readonly<{ id: string; externalId: string | null }> | null
  slugOwner: Readonly<{ id: string; externalId: string | null }> | null
}): EaClubSyncResolution {
  if (!input.eaExternalId) return { kind: "CONFLICT", reason: "EA_ID_MISSING" }

  if (input.identityOwner) {
    return input.identityOwner.externalId === input.eaExternalId
      ? { kind: "MATCH", clubId: input.identityOwner.id }
      : { kind: "CONFLICT", reason: "EA_IDENTITY_MISMATCH" }
  }

  if (!input.slugOwner) return { kind: "CREATE" }

  return input.slugOwner.externalId === input.eaExternalId
    ? { kind: "MATCH", clubId: input.slugOwner.id }
    : { kind: "CONFLICT", reason: "SLUG_OWNED_BY_DIFFERENT_IDENTITY" }
}
