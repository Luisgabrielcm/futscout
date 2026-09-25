import { createHash } from "node:crypto"
import { BRACK_SOURCE, ISL_SOURCE, ROSHN_SOURCE, ALEAGUE_SOURCE, CYPRUS_SOURCE, OFFICIAL_LEAGUE_SOURCES } from "../lib/brackBrandSource"
import { jpegDimensions } from "../lib/reviewedJpeg"
import { resolveAssetSource, type AssetReference } from "../lib/assetPipeline"
import { isReviewedIslSvg } from "../lib/islSvgPolicy"
import { PUNJAB_SOURCE } from "../lib/punjabBrandSource"
import { isReviewedPunjabSvg } from "../lib/punjabSvgPolicy"
import { inspectAleaguePng } from "../lib/aleaguePngDiagnostic"

type OfficialSource = (typeof OFFICIAL_LEAGUE_SOURCES)[number] | typeof PUNJAB_SOURCE
const mimeFor = (source: OfficialSource) => source === ISL_SOURCE || source === PUNJAB_SOURCE ? "image/svg+xml" : source === CYPRUS_SOURCE ? "image/jpeg" : "image/png"
type DeliveryPhase = "read-before" | "fetch-headers" | "fetch-body" | "validate" | "read-after"
type DeliveryObservation = { phase: DeliveryPhase; httpStatus?: number; mime?: string; encoding?: string;
  declaredBytes?: number | null; receivedBytes?: number; redirected?: boolean; exactResponseUrl?: boolean;
  rejectedPng?: ReturnType<typeof inspectAleaguePng> }
const safeToken = (value: string | null, allowed: readonly string[]) => value !== null && allowed.includes(value) ? value : value === null ? "missing" : "other"
function deliveryErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "UNCLASSIFIED"
  const known = ["UNKNOWN_OFFICIAL_SOURCE", "BRACK_DELIVERY_REJECTED", "BRACK_EMPTY_BODY", "BRACK_SIZE_REJECTED", "BRACK_BYTES_REJECTED", "OFFICIAL_FORMAT_REJECTED"]
  if (known.includes(error.message)) return error.message
  if (error.name === "TimeoutError" || error.name === "AbortError") return "DEADLINE_OR_ABORT"
  const code = "code" in error ? error.code : undefined
  if (["P1000", "P1001", "P1002", "P1008", "P1017", "P2024"].includes(String(code))) return "DATABASE_CONNECTION_ERROR"
  if (error.name === "PrismaClientKnownRequestError" || error.name === "PrismaClientUnknownRequestError") return "DATABASE_QUERY_ERROR"
  const cause = error.cause
  const causeCode = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined
  const transportCodes = ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT",
    "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"]
  if (typeof causeCode === "string" && transportCodes.includes(causeCode)) return "TRANSPORT_" + causeCode
  if (error instanceof TypeError) return "TYPE_OR_TRANSPORT_ERROR"
  return "UNCLASSIFIED"
}

/** Fixed destination, bounded memory, no redirect, no persistent cache, no retry. */
export async function fetchBrackBytes(fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  return fetchOfficialLeagueBytes(BRACK_SOURCE, fetcher)
}

export async function fetchOfficialLeagueBytes(source: OfficialSource, fetcher: typeof fetch = fetch,
  observe?: (event: DeliveryObservation) => void): Promise<Uint8Array> {
  if (source !== PUNJAB_SOURCE && !OFFICIAL_LEAGUE_SOURCES.some(known => known === source)) throw new Error("UNKNOWN_OFFICIAL_SOURCE")
  const signal = AbortSignal.timeout(8000)
  observe?.({ phase: "fetch-headers" })
  const response = await fetcher(source.sourceUrl, {
    redirect: "manual", cache: "no-store", signal,
    headers: { Accept: mimeFor(source), "Accept-Encoding": "identity", "Cache-Control": "no-cache" },
  })
  // fetch decodes gzip/br/deflate but keeps the wire Content-Length header.
  // Bound both declared wire size and the decoded stream; hash pins decoded bytes.
  const encoding = response.headers.get("content-encoding")?.trim().toLowerCase() ?? "identity"
  const declaredLength = response.headers.has("content-length") ? Number(response.headers.get("content-length")) : null
  observe?.({ phase: "fetch-headers", httpStatus: response.status,
    mime: safeToken(response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? null,
      ["image/png", "image/jpeg", "image/svg+xml", "image/webp", "text/html", "application/json", "application/octet-stream"]),
    encoding: safeToken(encoding, ["identity", "gzip", "br", "deflate"]),
    declaredBytes: declaredLength !== null && Number.isSafeInteger(declaredLength) && declaredLength >= 0 ? declaredLength : null,
    redirected: response.redirected, exactResponseUrl: response.url === "" || response.url === source.sourceUrl })
  const invalidLength = declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength < 0 ||
    (encoding === "identity" ? declaredLength !== source.bytes : declaredLength > source.bytes))
  // Audit the single observed discrepancy without releasing bytes or accepting another hash.
  // Fixed capacity and the existing deadline apply before copying any body chunk.
  if (source === ALEAGUE_SOURCE && declaredLength === 15498 && encoding === "identity" &&
      response.status === 200 && !response.redirected && response.url === source.sourceUrl &&
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "image/png" && response.body) {
    const reader = response.body.getReader()
    const rejected = Buffer.alloc(15498)
    let received = 0
    try {
      while (true) {
        signal.throwIfAborted()
        const { done, value } = await reader.read()
        signal.throwIfAborted()
        if (done) break
        if (value.length > rejected.length - received) throw new Error("BRACK_SIZE_REJECTED")
        rejected.set(value, received); received += value.length
      }
      observe?.({ phase: "validate", rejectedPng: inspectAleaguePng(rejected.subarray(0, received)) })
    } finally { await reader.cancel() }
    throw new Error("BRACK_DELIVERY_REJECTED")
  }
  if (signal.aborted || response.status !== 200 || response.redirected ||
      (response.url !== "" && response.url !== source.sourceUrl) ||
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== mimeFor(source) ||
      (!["identity", "gzip", "br", "deflate"].includes(encoding) || invalidLength)) {
    await response.body?.cancel()
    throw new Error("BRACK_DELIVERY_REJECTED")
  }
  if (!response.body) throw new Error("BRACK_EMPTY_BODY")
  const reader = response.body.getReader()
  // Fixed capacity: no growing chunk array (including zero-byte chunks).
  // Transport buffers belong to fetch; never copy an oversized chunk into our buffer.
  const bytes = Buffer.alloc(source.bytes)
  let length = 0
  observe?.({ phase: "fetch-body", receivedBytes: 0 })
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      if (value.length > source.bytes - length) throw new Error("BRACK_SIZE_REJECTED")
      bytes.set(value, length)
      length += value.length
      observe?.({ phase: "fetch-body", receivedBytes: length })
    }
  } finally {
    await reader.cancel()
  }
  observe?.({ phase: "validate", receivedBytes: length })
  if (length !== source.bytes || createHash("sha256").update(bytes).digest("hex") !== source.contentHash) {
    throw new Error("BRACK_BYTES_REJECTED")
  }
  const jpeg = source === CYPRUS_SOURCE ? jpegDimensions(bytes) : null
  if (source === PUNJAB_SOURCE ? !isReviewedPunjabSvg(bytes) : source === ISL_SOURCE ? !isReviewedIslSvg(bytes) : source === CYPRUS_SOURCE ?
      jpeg?.width !== source.width || jpeg?.height !== source.height :
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
const roshnRequestGate = createBrackRequestGate()
const aleagueRequestGate = createBrackRequestGate()
const cyprusRequestGate = createBrackRequestGate()
const punjabRequestGate = createBrackRequestGate()

export async function servePunjabAsset(request: Request, read: () => Promise<AssetReference | undefined>,
  fetcher: typeof fetch = fetch, admit = punjabRequestGate,
  enabled = process.env.PUNJAB_BRAND_ASSET_DELIVERY_ENABLED === "true"): Promise<Response> {
  return serveOfficialLeagueAsset(PUNJAB_SOURCE, request, read, fetcher, admit, enabled)
}

export async function serveAleagueAsset(request: Request, read: () => Promise<AssetReference | undefined>,
  fetcher: typeof fetch = fetch, admit = aleagueRequestGate,
  enabled = process.env.ALEAGUE_BRAND_ASSET_DELIVERY_ENABLED === "true"): Promise<Response> {
  return serveOfficialLeagueAsset(ALEAGUE_SOURCE, request, read, fetcher, admit, enabled)
}

export async function serveCyprusAsset(request: Request, read: () => Promise<AssetReference | undefined>,
  fetcher: typeof fetch = fetch, admit = cyprusRequestGate,
  enabled = process.env.CYPRUS_BRAND_ASSET_DELIVERY_ENABLED === "true"): Promise<Response> {
  return serveOfficialLeagueAsset(CYPRUS_SOURCE, request, read, fetcher, admit, enabled)
}

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

export async function serveRoshnAsset(request: Request, read: () => Promise<AssetReference | undefined>,
  fetcher: typeof fetch = fetch, admit = roshnRequestGate,
  enabled = process.env.ROSHN_BRAND_ASSET_DELIVERY_ENABLED === "true"): Promise<Response> {
  return serveOfficialLeagueAsset(ROSHN_SOURCE, request, read, fetcher, admit, enabled)
}

async function serveOfficialLeagueAsset(source: OfficialSource, request: Request,
  read: () => Promise<AssetReference | undefined>, fetcher: typeof fetch,
  admit: () => (() => void) | null, enabled: boolean): Promise<Response> {
  const responseHeaders = { ...headers, "Content-Type": mimeFor(source),
    ...(source === ISL_SOURCE || source === PUNJAB_SOURCE ? { "Content-Disposition": `attachment; filename="${source === ISL_SOURCE ? "isl" : "punjab"}.svg"` } : {}) }
  const kind = source === PUNJAB_SOURCE ? "club" : "league"
  const deny = (status: number) => new Response(null, { status, headers: responseHeaders })
  // Independent release gate: the writer allowlist is not a reader authorization control.
  // Fail closed before rate admission, database access or downloading any image.
  if (!enabled) return deny(404)
  if (request.method !== "GET" || new URL(request.url).search) return deny(404)
  const release = admit()
  if (!release) return new Response(null, { status: 429, headers: { ...responseHeaders, "Retry-After": "60" } })
  const started = performance.now()
  let observation: DeliveryObservation = { phase: "read-before" }
  try {
    const before = await read()
    if (!before || resolveAssetSource(before, kind) !== source.deliveryPath) return deny(404)
    const bytes = await fetchOfficialLeagueBytes(source, fetcher, event => { observation = { ...observation, ...event } })
    // A revocation during the fetch must not release bytes selected before it.
    observation.phase = "read-after"
    const after = await read()
    if (!after || resolveAssetSource(after, kind) !== source.deliveryPath ||
        JSON.stringify(before) !== JSON.stringify(after)) return deny(404)
    return new Response(bytes as BodyInit, { headers: responseHeaders })
  } catch (error) {
    // Finite metadata only: never log exception text/stack, URL, headers, body or credentials.
    console.error("BRAND_ASSET_DELIVERY_FAILED", { provider: source.provider, ...observation,
      errorCode: deliveryErrorCode(error), elapsedMs: Math.round(performance.now() - started) })
    // Do not expose upstream details or fall back to an unaudited remote URL.
    return deny(502)
  } finally {
    release()
  }
}
