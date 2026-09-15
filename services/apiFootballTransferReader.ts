import { ApiFootballRateLimitError, hasApiFootballRateLimitSignal, isApiFootballRateLimitError } from "./apiFootballErrors"
import { parseTransferResponse, positiveTransferId, TransferObservationError, transferRecord } from "../lib/transferObservations"
import type { TransferObservationResult, TransferRequestLog } from "../types/transferObservation"

export type TransferFetch = (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "text">>
export function transferFailureCode(error: unknown) {
  return isApiFootballRateLimitError(error) ? "API_FOOTBALL_RATE_LIMIT" : error instanceof TransferObservationError ? error.code : "TRANSFER_READER_FAILED"
}

// No env, Prisma, global fetch, persistence or legacy imports. One reader = one finite pilot.
export function createApiFootballTransferReader(options: {
  allowedPlayerIds: readonly number[]; apiKey: string; fetch: TransferFetch; now: () => Date; timeoutMs?: number
}) {
  const allowed = new Set(options.allowedPlayerIds)
  const timeoutMs = options.timeoutMs ?? 15000
  if (!options.apiKey || allowed.size !== options.allowedPlayerIds.length || allowed.size < 1 || allowed.size > 6 ||
      [...allowed].some(id => !positiveTransferId(id)) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) {
    throw new TransferObservationError("INVALID_READER_CONFIGURATION")
  }
  const requested = new Set<number>(), logs: TransferRequestLog[] = []
  let stopped = false, busy = false
  async function read(providerPlayerId: number): Promise<TransferObservationResult> {
    let log: TransferRequestLog | undefined, started = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const abort = new AbortController()
    try {
      if (stopped || busy) throw new TransferObservationError("TRANSFER_READER_STOPPED")
      if (requested.size >= 6) throw new TransferObservationError("TRANSFER_REQUEST_BUDGET")
      if (!allowed.has(providerPlayerId)) throw new TransferObservationError("TRANSFER_PLAYER_NOT_ALLOWED")
      if (requested.has(providerPlayerId)) throw new TransferObservationError("TRANSFER_RETRY_FORBIDDEN")
      const now = options.now()
      if (!Number.isFinite(now.getTime())) throw new TransferObservationError("INVALID_CLOCK")
      const fetchedAt = now.toISOString()
      started = performance.now()
      // Only this exact HTTPS origin/path/query can reach the injected transport.
      const url = new URL("https://v3.football.api-sports.io/transfers")
      url.searchParams.set("player", String(providerPlayerId))
      busy = true
      requested.add(providerPlayerId) // Failed requests consume budget too. No retry path.
      log = { ordinal: requested.size, providerPlayerId, endpoint: "/transfers", method: "GET", status: null, durationMs: 0, validation: "PENDING" }
      logs.push(log)
      const request = async () => {
        let response: Awaited<ReturnType<TransferFetch>>
        try { response = await options.fetch(url.toString(), { method: "GET", redirect: "error", cache: "no-store",
          signal: abort.signal, headers: { "x-apisports-key": options.apiKey } }) }
        catch { throw new TransferObservationError("TRANSFER_NETWORK_ERROR") }
        if (stopped || abort.signal.aborted) throw new TransferObservationError("TRANSFER_READER_STOPPED")
        log!.status = response.status
        if (response.status === 429) throw new ApiFootballRateLimitError()
        if (response.status !== 200) throw new TransferObservationError("TRANSFER_HTTP_ERROR")
        let body: unknown
        try {
          const raw = await response.text()
          if (raw.length > 2_000_000) throw new TransferObservationError("TRANSFER_RESPONSE_TOO_LARGE")
          body = JSON.parse(raw)
        } catch (error) {
          if (error instanceof TransferObservationError) throw error
          throw new TransferObservationError("MALFORMED_TRANSFER_JSON")
        }
        if (transferRecord(body) && (hasApiFootballRateLimitSignal(body.errors) || hasApiFootballRateLimitSignal(body.message))) throw new ApiFootballRateLimitError()
        const result = parseTransferResponse(body, providerPlayerId, now)
        if (stopped || abort.signal.aborted) throw new TransferObservationError("TRANSFER_READER_STOPPED")
        return result
      }
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new TransferObservationError("TRANSFER_TIMEOUT")) }, timeoutMs)
      })
      const result = await Promise.race([request(), timeout])
      log.validation = result.validation
      log.durationMs = Math.max(0, Math.round(performance.now() - started))
      return { ...result, requestMetadata: { ...log, fetchedAt } }
    } catch (error) {
      stopped = true
      abort.abort()
      if (log) log.validation = transferFailureCode(error)
      throw error
    } finally {
      if (timer) clearTimeout(timer)
      if (log) log.durationMs = Math.max(0, Math.round(performance.now() - started))
      busy = false
    }
  }
  return { read, stop: () => { stopped = true }, counters: () => ({ requests: requested.size, stopped, retry: 0 as const }),
    requestLog: () => structuredClone(logs) }
}
