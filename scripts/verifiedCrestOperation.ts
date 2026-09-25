import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import { createPrismaBrandAssetWriteStore } from "../services/prismaBrandAssetWriteStore"
import { persistBrandAssetAtomically, type BrandAssetCandidate, type BrandAssetRow, type BrandIdentityRow } from "../services/brandAssetWrite"
import { writeExclusiveDurable, publishRedStarReceipt } from "../services/redStarReceipt"

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")
async function main() {
  const [mode, connectionFile, manifestFile, output, preflightFile, preflightHash] = process.argv.slice(2)
  assert.ok(["preflight", "register", "reconcile"].includes(mode), "MODE_REQUIRED")
  const connection = JSON.parse(readFileSync(connectionFile, "utf8"))
  assert.equal(connection.databaseId, "rknsog8tmbl5u4xqbogxfux5"); assert.ok(connection.consoleEvidenceRef)
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"))
  const candidate: BrandAssetCandidate = manifest.candidate
  assert.equal(candidate.entityType, "CLUB"); assert.equal(candidate.assetType, "CREST")
  if (mode !== "reconcile") {
    assert.equal(createHash("sha256").update(readFileSync(manifest.imageFile)).digest("hex"), candidate.contentHash, "ARCHIVE_HASH_MISMATCH")
    assert.ok(Date.now() - Date.parse(candidate.fetchedAt) < 86400000, "IMAGE_EVIDENCE_EXPIRED")
  }
  if (mode !== "reconcile") assert.ok(!existsSync(output) && !existsSync(output + ".pending.json"), "ATTEMPT_EXISTS")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: connection.connectionString }) })
  const read = () => withPrismaReadOnly(db, async tx => ({
    club: await tx.club.findUniqueOrThrow({ where: { id: candidate.entityId } }),
    players: await tx.player.findMany({ where: { clubId: candidate.entityId }, select: { id: true }, orderBy: { id: "asc" } }),
    identities: await tx.brandAssetIdentity.findMany({ where: { entityType: "CLUB", OR: [{ entityId: candidate.entityId }, { provider: candidate.provider, providerEntityId: candidate.providerEntityId }] }, include: { assets: { orderBy: { version: "asc" } } }, orderBy: { id: "asc" } }),
    playerHash: await tx.$queryRawUnsafe('SELECT count(*)::text count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), \'\' ORDER BY id), \'\')) hash FROM "Player" t'),
  }))
  try {
    const store = createPrismaBrandAssetWriteStore(db)
    const before = JSON.parse(JSON.stringify(await read()))
    assert.equal(before.club.apiFootballId, manifest.apiFootballId); assert.equal(before.club.externalId, manifest.eaId); assert.equal(before.club.leagueId, manifest.leagueId)
    const local = before.identities.find((i: BrandIdentityRow) => i.provider === candidate.provider && i.providerEntityId === candidate.providerEntityId)
    assert.ok(before.identities.every((i: BrandIdentityRow) => i.entityId === candidate.entityId), "PROVIDER_OCCUPIED")
    if (mode === "reconcile") {
      const pending = JSON.parse(readFileSync(output + ".pending.json", "utf8"))
      assert.equal(pending.databaseId, connection.databaseId)
      assert.deepEqual(pending.candidate, candidate)
      const asset = local?.assets.find((a: BrandAssetRow) => a.status === "ACTIVE" && a.contentHash === candidate.contentHash && a.operationalDecisionRef === candidate.operationalDecisionRef)
      let matches = local?.status === "VERIFIED" && !!asset
      matches &&= hash(before.club) === hash(pending.before.club) && hash(before.players) === hash(pending.before.players) && hash(before.playerHash) === hash(pending.before.playerHash)
      for (const [key, value] of Object.entries(candidate)) if (!["entityType", "entityId", "provider", "providerEntityId", "identityStatus", "deliveryStatus"].includes(key)) matches &&= asset?.[key] === value
      for (const previous of pending.before.identities) {
        const current = before.identities.find((i: BrandIdentityRow) => i.id === previous.id)
        if (previous.id !== local?.id) matches &&= hash(current) === hash(previous)
        else {
          matches &&= hash({ ...current, assets: [] }) === hash({ ...previous, assets: [] })
          for (const old of previous.assets) {
            const saved = current?.assets.find((a: BrandAssetRow) => a.id === old.id)
            matches &&= !!saved && hash({ ...saved, status: old.status, updatedAt: old.updatedAt }) === hash(old) && saved.status === (old.id === pending.expected.activeAssetId ? "STALE" : old.status)
          }
        }
      }
      console.log(JSON.stringify({ status: matches ? "EXPECTED_ASSET_PRESENT" : hash(before) === hash(pending.before) ? "MATCHES_BEFORE" : "REVIEW_CURRENT_STATE", assetId: asset?.id ?? null })); return
    }
    const audit = await store.audit()
    if (mode === "preflight") {
      await writeExclusiveDurable(output, JSON.stringify({ databaseId: connection.databaseId, candidate, before, audit }, null, 2)); console.log("READ_ONLY_PREFLIGHT_CONFIRMED"); return
    }
    const bytes = readFileSync(preflightFile)
    assert.equal(createHash("sha256").update(bytes).digest("hex"), preflightHash)
    const pin = JSON.parse(bytes.toString("utf8"))
    assert.equal(pin.databaseId, connection.databaseId); assert.deepEqual(pin.candidate, candidate)
    assert.equal(hash(pin.before), hash(before), "PREFLIGHT_STATE_CHANGED"); assert.deepEqual(pin.audit, audit)
    const identity: BrandIdentityRow | null = local ? { id: local.id, entityType: local.entityType, entityId: local.entityId, provider: local.provider, providerEntityId: local.providerEntityId, status: local.status, version: local.version } : null
    const latest = local?.assets.at(-1)
    const fields = ["id", "identityId", "assetType", "sourceUrl", "storageUrl", "contentHash", "version", "fetchedAt", "rightsStatus", "operationalDecision", "displayPolicy", "operationalAuthorizedAt", "operationalDecisionRef", "operatorRiskAccepted", "riskAcceptedAt", "riskAcceptedBy", "riskReason", "sourceTermsUrl", "revocable", "status"]
    const latestAsset = latest ? Object.fromEntries(fields.map(k => [k, latest[k]])) as BrandAssetRow : null
    const expected = { identity, latestAsset, activeAssetId: local?.assets.find((a: BrandAssetRow) => a.status === "ACTIVE")?.id ?? null }
    await writeExclusiveDurable(output + ".pending.json", JSON.stringify({ databaseId: connection.databaseId, candidate, before, expected }, null, 2))
    const result = await persistBrandAssetAtomically(store, { candidate, expected })
    await writeExclusiveDurable(output + ".writer.json", JSON.stringify(result, null, 2))
    assert.equal(result.transactionState, "COMMIT_CONFIRMED", "STOP_RECONCILE_ONLY"); assert.equal(result.status, "CREATED", "STOP_RECONCILE_ONLY")
    const after = JSON.parse(JSON.stringify(await read()))
    assert.deepEqual(after.club, before.club); assert.deepEqual(after.players, before.players); assert.deepEqual(after.playerHash, before.playerHash)
    const next = after.identities.find((i: BrandIdentityRow) => i.provider === candidate.provider && i.providerEntityId === candidate.providerEntityId)
    assert.equal(next?.status, "VERIFIED")
    const asset = next.assets.find((a: BrandAssetRow) => a.id === result.assetId)
    assert.equal(asset?.status, "ACTIVE")
    for (const [key, value] of Object.entries(candidate)) if (!["entityType", "entityId", "provider", "providerEntityId", "identityStatus", "deliveryStatus"].includes(key)) assert.deepEqual(asset[key], value, "ASSET_CONFIRMATION_MISMATCH")
    for (const previous of before.identities) {
      const current = after.identities.find((i: BrandIdentityRow) => i.id === previous.id)
      if (previous.id !== next.id) assert.deepEqual(current, previous, "HISTORY_CHANGED")
      else for (const old of previous.assets) {
        const saved = current.assets.find((a: BrandAssetRow) => a.id === old.id)
        assert.deepEqual({ ...saved, status: old.status, updatedAt: old.updatedAt }, old, "HISTORY_CHANGED")
        assert.equal(saved.status, old.id === expected.activeAssetId ? "STALE" : old.status)
      }
    }
    await publishRedStarReceipt(output, JSON.stringify({ status: "COMMITTED_INDEPENDENT_READ_CONFIRMED", databaseId: connection.databaseId, candidate, result, before, after }, null, 2))
    console.log("COMMITTED_INDEPENDENT_READ_CONFIRMED")
  } finally { await db.$disconnect() }
}
main().catch(() => { console.error("CREST_OPERATION_STOPPED_PRESERVE_PENDING_RECONCILE_NO_RETRY"); process.exitCode = 1 })
