import assert from 'node:assert/strict'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

// One shared root per host. Different receipt directories cannot bypass this lock.
export async function acquireGlobalLock(root: string, selectionHash: string) {
  assert(/^[a-f0-9]{64}$/.test(selectionHash), 'HASH')
  await mkdir(root, { recursive: true })
  const path = join(root, 'global-market-value.lock')
  const owner = { host: hostname(), pid: process.pid, token: randomUUID(), selectionHash, acquiredAt: new Date().toISOString() }
  const handle = await open(path, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify(owner)); await handle.sync() } finally { await handle.close() }
  return async () => {
    const current = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(current.token, owner.token, 'LOCK_OWNERSHIP_CHANGED')
    await unlink(path)
  }
}
export async function inspectGlobalLock(root: string) {
  const owner = JSON.parse(await readFile(join(root, 'global-market-value.lock'), 'utf8'))
  if (owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) return { owner, state: 'UNKNOWN' }
  try { process.kill(owner.pid, 0); return { owner, state: 'ACTIVE_OR_PID_REUSED' } }
  catch (error) { return { owner, state: (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'PROCESS_ABSENT_REVIEW_REQUIRED' : 'UNKNOWN' } }
  // Never removes locks. PID absence alone does not establish journal integrity.
}
