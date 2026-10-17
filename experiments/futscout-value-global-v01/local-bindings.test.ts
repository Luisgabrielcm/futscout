import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadValueBindings, validateValueBindings } from './local-bindings'
import { syntheticBindings } from './synthetic-bindings.fixture'

const config = () => syntheticBindings('1'.repeat(64), [{ approved: true, selectionHash: '1'.repeat(64),
  position: 2, playerId: 'synthetic-player', requestId: `lfglobal-${'1'.repeat(16)}-synthetic-player-search`,
  originalRequestHash: '2'.repeat(64), approvalReference: 'synthetic-approval', approvedAt: '2026-01-01T00:00:00Z' }])

test('local bindings are detached, frozen and reject unknown fields or incomplete authority', () => {
  const value = config()
  assert(Object.isFrozen(value) && Object.isFrozen(value.quarantines) && Object.isFrozen(value.quarantines[0]))
  assert.throws(() => validateValueBindings({ ...value, schemaVersion: 2 }))
  assert.throws(() => validateValueBindings({ ...value, secret: 'synthetic' }))
  assert.throws(() => validateValueBindings({ ...value, parentSelectionHash: value.offlineSelectionHash }))
  for (const patch of [{ originalRequestHash: undefined }, { requestId: 'other' }, { position: 0 },
    { approvalReference: '' }, { playerId: 'https://example.invalid' }, { extraManualSlot: true },
    { parentSelectionHash: '0'.repeat(64) }, { kind: 'ANY' }]) {
    assert.throws(() => validateValueBindings({ ...value, quarantines: [{ ...value.quarantines[0], ...patch }] }))
  }
  assert.throws(() => validateValueBindings({ ...value, quarantines: [...value.quarantines, ...value.quarantines] }))
})

test('missing or malformed private file fails closed without exposing its contents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'value-private-config-'))
  try {
    const file = join(root, 'bindings.json')
    assert.throws(() => loadValueBindings(file), /^Error: VALUE_BINDINGS_REQUIRED_OR_UNREADABLE$/)
    await writeFile(file, '{synthetic-secret')
    assert.throws(() => loadValueBindings(file), /^Error: VALUE_BINDINGS_REQUIRED_OR_UNREADABLE$/)
    await writeFile(file, JSON.stringify(config()))
    assert.deepEqual(loadValueBindings(file), config())
  } finally { await rm(root, { recursive: true, force: true }) }
})
