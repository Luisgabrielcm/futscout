import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

// No command, method, host, arbitrary query or environment override from callers.
const allowedPath = /^(?:\/v13\/deployments\/dpl_[A-Za-z0-9]+|\/v4\/aliases\/[A-Za-z0-9.-]+|\/v9\/projects\/prj_[A-Za-z0-9]+(?:\?rollbackInfo=true)?)$/
const processCodes = new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOENT', 'ENOBUFS', 'EACCES', 'EPERM'])

export class VercelReadError extends Error {
  constructor(attempts) {
    const last = attempts.at(-1)
    super(`VERCEL_READ_${last.kind} (attempts=${attempts.length}, exit=${last.status}, signal=${last.signal})`)
    this.name = 'VercelReadError'
    this.attempts = attempts
  }
}

/** Bounded GET-only CLI transport. Diagnostics never contain output, URLs or env. */
export function readVercelApi({ cliPath, path, scope, teamId, timeoutMs = 15000,
  totalTimeoutMs = 35000, maxAttempts = 2 }, { run = spawnSync, now = Date.now } = {}) {
  assert.match(path, allowedPath)
  assert.match(scope, /^[A-Za-z0-9_-]+$/)
  assert.match(teamId, /^team_[A-Za-z0-9]+$/)
  for (const value of [timeoutMs, totalTimeoutMs, maxAttempts]) assert.ok(Number.isSafeInteger(value) && value > 0)
  assert.ok(maxAttempts <= 2 && totalTimeoutMs <= 60000)
  const args = [cliPath, 'api', `${path}${path.includes('?') ? '&' : '?'}teamId=${teamId}`, '--raw', '--scope', scope]
  const started = now(), attempts = []
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = totalTimeoutMs - (now() - started)
    if (remaining <= 0) break
    const began = now()
    let result
    try {
      result = run(process.execPath, args, { encoding: 'utf8', windowsHide: true,
        timeout: Math.min(timeoutMs, remaining), maxBuffer: 10000000 })
    } catch (error) {
      result = { status: null, signal: null, error, stdout: '', stderr: '' }
    }
    const code = processCodes.has(result.error?.code) ? result.error.code : result.error ? 'OTHER' : null
    const stderr = String(result.stderr || '')
    const httpStatus = [401, 403, 404, 429, 500, 502, 503, 504].find(status => new RegExp(`\\b${status}\\b`).test(stderr)) ?? null
    let kind = code || (result.signal ? 'SIGNAL' : httpStatus ? `HTTP_${httpStatus}` : result.status !== 0 ? 'EXIT' : 'OK')
    let data
    if (kind === 'OK') {
      try {
        data = JSON.parse(result.stdout)
        if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) kind = 'INVALID_RESPONSE'
      } catch { kind = 'INVALID_JSON' }
    }
    const record = { attempt, kind, status: Number.isInteger(result.status) ? result.status : null,
      signal: /^SIG[A-Z0-9]+$/.test(result.signal || '') ? result.signal : null, errorCode: code,
      httpStatus, elapsedMs: Math.max(0, now() - began),
      stdoutBytes: Buffer.byteLength(result.stdout || ''), stderrBytes: Buffer.byteLength(stderr) }
    attempts.push(record)
    if (kind === 'OK') return { data, attempts }
    // Retry only transient reads, never mutations, auth, 404, invalid JSON or resource exhaustion.
    if (!['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'HTTP_502', 'HTTP_503', 'HTTP_504'].includes(kind)) break
  }
  if (!attempts.length) attempts.push({ attempt: 0, kind: 'DEADLINE', status: null, signal: null })
  throw new VercelReadError(attempts)
}

/** A successful transport is not evidence that a candidate is safe to promote. */
export function requireReadyCandidate(data, { id, projectId, sha }) {
  assert.equal(data.id, id, 'CANDIDATE_ID_MISMATCH')
  assert.equal(data.projectId, projectId, 'CANDIDATE_PROJECT_MISMATCH')
  assert.equal(data.target, 'production', 'CANDIDATE_TARGET_MISMATCH')
  assert.equal(data.meta?.clubContextPilotSourceSha, sha, 'CANDIDATE_SHA_MISMATCH')
  assert.equal(data.readyState, 'READY', 'CANDIDATE_NOT_READY')
  assert.ok(Array.isArray(data.alias), 'CANDIDATE_ALIASES_UNKNOWN')
  assert.equal(data.alias.length, 0, 'CANDIDATE_HAS_ALIAS')
  return data
}
