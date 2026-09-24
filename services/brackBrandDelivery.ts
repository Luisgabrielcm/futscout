import { createHash } from "node:crypto"
import { BRACK_SOURCE, ISL_SOURCE, OFFICIAL_LEAGUE_SOURCES } from "../lib/brackBrandSource"
import { resolveAssetSource, type AssetReference } from "../lib/assetPipeline"
import { isReviewedIslSvg } from "../lib/islSvgPolicy"

type OfficialSource = (typeof OFFICIAL_LEAGUE_SOURCES)[number]
const mimeFor = (source: OfficialSource) => source === ISL_SOURCE ? "image/svg+xml" : "image/png"

/** Fixed destination, bounded memory, no redirect, no persistent cache, no retry. */
export async function fetchBrackBytes(fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  return fetchOfficialLeagueBytes(BRACK_SOURCE, fetcher)
}

export async function fetchOfficialLeagueBytes(source: OfficialSource, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  if (!OFFICIAL_LEAGUE_SOURCES.includes(source)) throw new Error("UNKNOWN_OFFICIAL_SOURCE")
  const signal = AbortSignal.timeout(8000)
  const response = await fetcher(source.sourceUrl, {
    redirect: "manual", cache: "no-store", signal,
    headers: { Accept: mimeFor(source) },
  })
  if (signal.aborted || response.status !== 200 || response.redirected ||
      (response.url !== "" && response.url !== source.sourceUrl) ||
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== mimeFor(source) ||
      (response.headers.has("content-length") && Number(response.headers.get("content-length")) !== source.bytes)) {
    await response.body?.cancel()
    throw new Error("BRACK_DELIVERY_REJECTED")
  }
  if (!response.body) throw new Error("BRACK_EMPTY_BODY")
  const reader = response.body.getReader()
  // Fixed capacity: no growing chunk array (including zero-byte chunks).
  // Transport buffers belong to fetch; never copy an oversized chunk into our buffer.
  const bytes = Buffer.alloc(source.bytes)
  let length = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      if (value.length > source.bytes - length) throw new Error("BRACK_SIZE_REJECTED")
      bytes.set(value, length)
      length += value.length
    }
  } finally {
    await reader.cancel()
  }
  if (length !== source.bytes || createHash("sha256").update(bytes).digest("hex") !== source.contentHash) {
    throw new Error("BRACK_BYTES_REJECTED")
  }
  if (source === ISL_SOURCE ? !isReviewedIslSvg(bytes) :
      bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.toString("ascii", 12, 16) !== "IHDR" || bytes.readUInt32BE(16) !== source.width ||
      bytes.readUInt32BE(20) !== source.height) throw new Error("OFFICIAL_FORMAT_REJECTED")
  return bytes
}

const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Type": "image/png" }

// Process-local pilot guard; metadata only. No byte cache, queue, timer or automatic retry.
export function createBrackRequestGate(clock: () => number = () => performance.now()) {
  let active = 0
  let starts: number[] = []
  return (): (() => void) | null => {
    const now = clock()
    starts = starts.filter(start => now - start < 60_000)
    if (active >= 4 || starts.length >= 60) return null
    starts.push(now)
    active++
    let released = false
    return () => { if (!released) { released = true; active-- } }
  }
}
const requestGate = createBrackRequestGate()
const islRequestGate = createBrackRequestGate()

export async function serveBrackAsset(request: Request, read: () => Promise<AssetReference | undefined>,
  fetcher: typeof fetch = fetch, admit = requestGate,
  enabled = process.env.BRACK_BRAND_ASSET_DELIVERY_ENABLED === "true"): Promise<Response> {
  return serveOfficialLeagueAsset(BRACK_SOURCE, request, read, fetcher, admit, enabled)
}

export async function serveIslAsset(request: Request, read: () => Promise<AssetReference | undefined>,
  fetcher: typeof fetch = fetch, admit = islRequestGate,
  enabled = process.env.ISL_BRAND_ASSET_DELIVERY_ENABLED === "true"): Promise<Response> {
  return serveOfficialLeagueAsset(ISL_SOURCE, request, read, fetcher, admit, enabled)
}

async function serveOfficialLeagueAsset(source: OfficialSource, request: Request,
  read: () => Promise<AssetReference | undefined>, fetcher: typeof fetch,
  admit: () => (() => void) | null, enabled: boolean): Promise<Response> {
  const responseHeaders = { ...headers, "Content-Type": mimeFor(source),
    ...(source === ISL_SOURCE ? { "Content-Disposition": 'attachment; filename="isl.svg"' } : {}) }
  const deny = (status: number) => new Response(null, { status, headers: responseHeaders })
  // Independent release gate: the writer allowlist is not a reader authorization control.
  // Fail closed before rate admission, database access or downloading any image.
  if (!enabled) return deny(404)
  if (request.method !== "GET" || new URL(request.url).search) return deny(404)
  const release = admit()
  if (!release) return new Response(null, { status: 429, headers: { ...responseHeaders, "Retry-After": "60" } })
  try {
    const before = await read()
    if (!before || resolveAssetSource(before, "league") !== source.deliveryPath) return deny(404)
    const bytes = await fetchOfficialLeagueBytes(source, fetcher)
    // A revocation during the fetch must not release bytes selected before it.
    const after = await read()
    if (!after || resolveAssetSource(after, "league") !== source.deliveryPath ||
        JSON.stringify(before) !== JSON.stringify(after)) return deny(404)
    return new Response(bytes as BodyInit, { headers: responseHeaders })
  } catch {
    // Do not expose upstream details or fall back to an unaudited remote URL.
    return deny(502)
  } finally {
    release()
  }
}
