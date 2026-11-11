import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export type StagingUrls = { runtimeUrl: string; writerUrl: string; administrationUrl: string }
/** Trusted local inventory, independently checked against the provider control plane.
 * Never derive this approval from environment labels or a successful SQL connection.
 * Fingerprints bind the complete credentials as shared Prisma gateways are ambiguous.
 */
export type StagingIsolation = {
  provider: 'prisma-postgres'
  databaseId: string
  productionDatabaseId: string
  verifiedAt: string
  evidenceReference: string
  approvedUrlHashes: readonly string[]
  productionUrls: readonly string[]
}

function parsed(value: string, requireVerifiedTls = true) {
  try {
    const url = new URL(value)
    assert(['postgres:', 'postgresql:'].includes(url.protocol))
    assert(url.username && url.password && url.hostname && url.pathname.length > 1)
    // No alternate libpq routing, service files or search-path injection.
    assert([...url.searchParams.keys()].every(key => ['sslmode', 'connect_timeout', 'application_name'].includes(key)))
    if (requireVerifiedTls) assert(url.searchParams.get('sslmode') === 'verify-full')
    assert(!url.hash)
    return url
  } catch { throw new Error('STAGING_URL_INVALID_OR_UNSAFE') }
}

export function stagingUrlHash(value: string) {
  return createHash('sha256').update(parsed(value).href).digest('hex')
}

export function assertStagingIsolation(urls: StagingUrls, proof?: StagingIsolation, now = Date.now()) {
  assert(proof?.provider === 'prisma-postgres', 'STAGING_ISOLATION_UNPROVEN')
  assert(proof.databaseId && proof.productionDatabaseId && proof.databaseId !== proof.productionDatabaseId,
    'STAGING_RESOURCE_COLLISION')
  const age = now - Date.parse(proof.verifiedAt)
  assert(Number.isFinite(age) && age >= 0 && age <= 86400000, 'STAGING_PROOF_EXPIRED')
  assert(proof.evidenceReference.trim() && proof.productionUrls.length > 0, 'STAGING_INVENTORY_REQUIRED')
  assert(proof.approvedUrlHashes.length === 3 && new Set(proof.approvedUrlHashes).size === 3,
    'STAGING_THREE_CONNECTIONS_REQUIRED')
  const production = proof.productionUrls.map(value => parsed(value, false))
  for (const value of [urls.runtimeUrl, urls.writerUrl, urls.administrationUrl]) {
    const candidate = parsed(value)
    for (const live of production) {
      assert(candidate.href !== live.href && candidate.password !== live.password, 'STAGING_PRODUCTION_CREDENTIAL')
      // Shared provider gateways require the independently approved full URL hash.
      if (!candidate.hostname.endsWith('.prisma.io')) {
        assert(candidate.hostname !== live.hostname || candidate.pathname !== live.pathname,
          'STAGING_PRODUCTION_DESTINATION')
      }
    }
    assert(proof.approvedUrlHashes.includes(stagingUrlHash(value)), 'STAGING_URL_NOT_APPROVED')
  }
}

/** Production-only legacy tools must never interpret a staging invocation as .env. */
export function rejectLegacyStaging(env: Readonly<Record<string, string | undefined>> = process.env, args: readonly string[] = process.argv) {
  assert(env.FUTSCOUT_DATABASE_TARGET !== 'staging' &&
    !args.some(arg => /staging/i.test(arg)), 'STAGING_LEGACY_TOOL_FORBIDDEN')
}
