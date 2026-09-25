import assert from "node:assert/strict"
import { readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import { BRACK_SOURCE, ISL_SOURCE, ROSHN_SOURCE, ALEAGUE_SOURCE, CYPRUS_SOURCE } from "../lib/brackBrandSource"
import { fetchOfficialLeagueBytes } from "../services/brackBrandDelivery"
import { createPrismaBrandAssetWriteStore } from "../services/prismaBrandAssetWriteStore"
import { BRAND_ASSET_PILOT_ALLOWLIST, persistBrandAssetAtomically, type BrandAssetCandidate, type BrandAssetPilotIdentity } from "../services/brandAssetWrite"

const production = "rknsog8tmbl5u4xqbogxfux5"
export const operationSource = (key: string) => {
  assert.ok(key === "brack" || key === "isl" || key === "roshn" || key === "aleague" || key === "cyprus", "UNKNOWN_SOURCE")
  return key === "brack" ? BRACK_SOURCE : key === "isl" ? ISL_SOURCE : key === "roshn" ? ROSHN_SOURCE : key === "aleague" ? ALEAGUE_SOURCE : CYPRUS_SOURCE
}
type Approval = { approved: boolean; databaseId: string; entityId: string; provider: string;
  providerEntityId: string; sourceUrl: string; contentHash: string; decisionRef: string;
  approvedAt: string | null; approvedBy: string | null; riskReason: string }
export function approvedCandidate(key: string, approval: Approval, fetchedAt: string): BrandAssetCandidate {
  const source = operationSource(key)
  assert.equal(approval.approved, true, "OWNER_APPROVAL_REQUIRED")
  assert.equal(approval.databaseId, production, "DESTINATION_MISMATCH")
  for (const field of ["entityId", "provider", "providerEntityId", "sourceUrl", "contentHash"] as const)
    assert.equal(approval[field], source[field], "APPROVAL_SCOPE_MISMATCH")
  assert.ok(approval.approvedBy?.trim() && approval.decisionRef.trim() && approval.riskReason.trim(), "INCOMPLETE_APPROVAL")
  assert.ok(approval.approvedAt && Number.isFinite(Date.parse(approval.approvedAt)) && Date.parse(approval.approvedAt) <= Date.now(), "INVALID_APPROVAL_TIME")
  const authorizedAt = new Date(approval.approvedAt).toISOString() // Same instant, canonical Prisma Date round-trip.
  return { entityType: "LEAGUE", entityId: source.entityId, provider: source.provider,
    providerEntityId: source.providerEntityId, assetType: "LOGO", identityStatus: "VERIFIED",
    sourceUrl: source.sourceUrl, contentHash: source.contentHash, fetchedAt, storageUrl: null,
    rightsStatus: "REVIEW_REQUIRED", deliveryStatus: "VALIDATED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE",
    displayPolicy: "DISPLAY_ALLOWED", operationalAuthorizedAt: authorizedAt, operationalDecisionRef: approval.decisionRef,
    operatorRiskAccepted: true, riskAcceptedAt: authorizedAt, riskAcceptedBy: approval.approvedBy,
    riskReason: approval.riskReason, sourceTermsUrl: source.evidenceUrl, revocable: true }
}
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
export function candidateMatches(candidate: BrandAssetCandidate,
  identity: { entityType: string; entityId: string; provider: string; providerEntityId: string; status: string; version: number } | undefined,
  asset: Record<string, unknown> | undefined): boolean {
  if (!identity || !asset || identity.status !== "VERIFIED" || identity.version !== 1 ||
      asset.status !== "ACTIVE" || asset.version !== 1) return false
  for (const field of ["entityType", "entityId", "provider", "providerEntityId"] as const)
    if (identity[field] !== candidate[field]) return false
  return Object.entries(candidate).every(([field, value]) => {
    if (["entityType", "entityId", "provider", "providerEntityId", "identityStatus", "deliveryStatus"].includes(field)) return true
    const actual = asset[field]
    return (actual instanceof Date ? actual.toISOString() : actual) === value
  })
}
// Never remove the pending marker. A failed final receipt remains reconcilable.
export function publishReceipt(file: string, value: unknown) {
  assert.ok(!existsSync(file), "RECEIPT_EXISTS")
  const temporary = file + ".tmp"
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
  renameSync(temporary, file)
}
export async function main(args: string[]) {
  const [mode, key, connectionFile, receipt, extra] = args
  assert.ok(["preflight", "register", "confirm"].includes(mode), "MODE_REQUIRED")
  assert.ok(connectionFile && receipt, "CONNECTION_AND_RECEIPT_REQUIRED")
  const source = operationSource(key)
  // No dotenv, .env, DATABASE_URL, DIRECT_URL, runtime singleton or automatic retries.
  // The operator must verify this connection in the Console; a hostname is not proof.
  const connection = readJson(connectionFile)
  assert.equal(connection.databaseId, production, "DESTINATION_MISMATCH")
  assert.ok(connection.consoleEvidenceRef && connection.connectionString, "CONSOLE_PROVENANCE_REQUIRED")
  if (mode !== "confirm") assert.ok(!existsSync(receipt) && !existsSync(receipt + ".pending.json"), "RECEIPT_OR_PENDING_EXISTS")
  let candidate: BrandAssetCandidate | undefined
  if (mode === "register") {
    assert.ok(extra, "APPROVAL_FILE_REQUIRED")
    candidate = approvedCandidate(key, readJson(extra), new Date().toISOString())
    assert.ok(BRAND_ASSET_PILOT_ALLOWLIST.some((row: BrandAssetPilotIdentity) => row.entityType === "LEAGUE" && row.entityId === source.entityId &&
      row.provider === source.provider && row.providerEntityId === source.providerEntityId && row.assetType === "LOGO"), "ACTIVE_ALLOWLIST_REQUIRED")
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: connection.connectionString }) })
  const store = createPrismaBrandAssetWriteStore(db)
  const state = () => withPrismaReadOnly(db, async tx => ({
    league: await tx.league.findUnique({ where: { id: source.entityId } }),
    identities: await tx.brandAssetIdentity.findMany({ where: { entityType: "LEAGUE", OR: [
      { entityId: source.entityId }, { provider: source.provider, providerEntityId: source.providerEntityId },
    ] }, include: { assets: { orderBy: { version: "asc" } } }, orderBy: { id: "asc" } }),
    migrations: await tx.$queryRawUnsafe<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }[]>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name'),
    playerHash: await tx.$queryRawUnsafe('SELECT count(*)::text count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY md5(to_jsonb(t)::text)),\'\')) hash FROM "Player" t'),
    indexes: await tx.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
      "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('BrandAssetIdentity','BrandAsset') ORDER BY indexname"),
  }))
  try {
    if (mode === "confirm") {
      const pending = readJson(receipt + ".pending.json")
      if (existsSync(receipt + ".candidate.json")) pending.candidate = readJson(receipt + ".candidate.json")
      assert.equal(pending.databaseId, production); assert.equal(pending.source.entityId, source.entityId)
      const current = await state()
      const identity = current.identities.find(row => row.provider === source.provider && row.providerEntityId === source.providerEntityId)
      const asset = identity?.assets.find(row => row.status === "ACTIVE" && row.assetType === "LOGO")
      const matches = current.identities.length === 1 && candidateMatches(pending.candidate, identity, asset)
      // Read-only result to stdout; never changes original/pending receipts or repeats transaction.
      console.log(JSON.stringify({ databaseId: production, source: key, status: matches ? "EXPECTED_ASSET_PRESENT" :
        current.identities.length === 0 ? "NO_IDENTITY_PRESENT" : "REVIEW_CURRENT_STATE", current }, null, 2))
      return
    }
    const before = await state()
    assert.ok(before.league, "LOCAL_LEAGUE_MISSING")
    assert.equal(before.identities.length, 0, "REGISTRY_CONFLICT")
    assert.ok(before.migrations.some(row => row.migration_name.endsWith("brand_identity_blocked_history") && row.finished_at && !row.rolled_back_at), "HISTORY_MIGRATION_REQUIRED")
    assert.ok(before.migrations.every(row => row.finished_at && !row.rolled_back_at), "UNFINISHED_MIGRATION")
    const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter(row => row.isDirectory()).map(row => row.name).sort()
    assert.deepEqual(before.migrations.map(row => row.migration_name), migrations, "MIGRATION_HISTORY_MISMATCH")
    for (const row of before.migrations) assert.equal(createHash("sha256").update(readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex"), row.checksum, "MIGRATION_CHECKSUM_MISMATCH")
    for (const name of ["BrandAssetIdentity_one_nonblocked_local_provider_key", "BrandAsset_one_active_per_identity_type_key"])
      assert.ok(before.indexes.some(row => row.indexname === name), "REQUIRED_INDEX_MISSING")
    const audit = await store.audit()
    if (mode === "preflight") {
      publishReceipt(receipt, { at: new Date().toISOString(), databaseId: production,
        consoleEvidenceRef: connection.consoleEvidenceRef, source, before, audit, auditHash: hash(audit), status: "READ_ONLY_PREFLIGHT" })
      console.log("READ_ONLY_PREFLIGHT_RECORDED"); return
    }
    assert.ok(candidate)
    // The reviewed preflight filename is explicit in the approved document.
    const approval = readJson(extra!)
    assert.ok(approval.preflightFile && approval.preflightSha256, "PINNED_PREFLIGHT_REQUIRED")
    assert.equal(createHash("sha256").update(readFileSync(approval.preflightFile)).digest("hex"), approval.preflightSha256, "PREFLIGHT_FILE_CHANGED")
    const preflight = readJson(approval.preflightFile)
    assert.equal(preflight.databaseId, production); assert.equal(preflight.source.entityId, source.entityId)
    assert.equal(hash(audit), preflight.auditHash, "AUDIT_CHANGED_SINCE_PREFLIGHT")
    assert.equal(hash(before), hash(preflight.before), "STATE_CHANGED_SINCE_PREFLIGHT")
    publishReceipt(receipt + ".pending.json", { databaseId: production, source, candidate, before, audit,
      expected: { identity: null, latestAsset: null, activeAssetId: null }, status: "ATTEMPT_RESERVED_NO_RETRY" })
    // Exactly one image request; every failure keeps the pending marker and stops.
    let imageHttp: { status: number; mime: string | null; contentLength: string | null; encoding: string | null } | null = null
    try {
      await fetchOfficialLeagueBytes(source, async (...args) => {
        const response = await fetch(...args)
        imageHttp = { status: response.status, mime: response.headers.get("content-type"),
          contentLength: response.headers.get("content-length"), encoding: response.headers.get("content-encoding") }
        return response
      })
      publishReceipt(receipt + ".image-validation.json", { status: "VALIDATED", imageHttp, contentHash: source.contentHash })
    } catch (error) {
      const reason = error instanceof Error && /^(BRACK_|OFFICIAL_|UNKNOWN_)/.test(error.message) ? error.message :
        error instanceof Error ? error.name : "UNKNOWN_FAILURE"
      publishReceipt(receipt + ".image-validation.json", { status: "PRE_WRITE_VALIDATION_FAILED", imageHttp, reason })
      throw error
    }
    candidate = { ...candidate, fetchedAt: new Date().toISOString() }
    // Keep the exact candidate used for writing in a second immutable marker.
    publishReceipt(receipt + ".candidate.json", candidate)
    const result = await persistBrandAssetAtomically(store, { candidate,
      expected: { identity: null, latestAsset: null, activeAssetId: null } })
    publishReceipt(receipt + ".writer.json", result)
    assert.ok(result.status === "CREATED" && result.transactionState === "COMMIT_CONFIRMED", "STOP_RECONCILE_ONLY")
    const after = await state()
    assert.equal(hash(after.league), hash(before.league)); assert.equal(hash(after.playerHash), hash(before.playerHash))
    assert.equal(hash(after.migrations), hash(before.migrations)); assert.equal(hash(after.indexes), hash(before.indexes))
    const identity = after.identities.find(row => row.provider === source.provider && row.providerEntityId === source.providerEntityId)
    const asset = identity?.assets.find(row => row.id === result.assetId)
    assert.equal(identity?.status, "VERIFIED"); assert.equal(asset?.contentHash, source.contentHash)
    assert.equal(asset?.status, "ACTIVE"); assert.equal(asset?.storageUrl, null)
    assert.equal(asset?.rightsStatus, "REVIEW_REQUIRED"); assert.equal(asset?.displayPolicy, "DISPLAY_ALLOWED")
    assert.equal(asset?.operationalDecisionRef, candidate.operationalDecisionRef)
    assert.equal(identity?.entityId, source.entityId); assert.equal(after.identities.length, 1)
    assert.equal(asset?.operationalDecision, "OWNER_AUTHORIZED_REMOTE_USE"); assert.equal(asset?.revocable, true)
    assert.ok(candidateMatches(candidate, identity, asset), "CONFIRMATION_FAILED")
    publishReceipt(receipt, { status: "COMMITTED_INDEPENDENT_READ_CONFIRMED", databaseId: production, candidate, result, after })
    console.log("COMMITTED_INDEPENDENT_READ_CONFIRMED")
  } finally { await db.$disconnect() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { console.error("OPERATION_STOPPED: inspect local receipts; read-only confirm only, no automatic retry"); process.exitCode = 1 })
}
