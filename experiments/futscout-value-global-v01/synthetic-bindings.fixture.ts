import { createHash } from 'node:crypto'
import { validateValueBindings } from './local-bindings'
import type { QuarantineApproval } from './runner'

/** Only generated test journals supply these synthetic approvals. No operational config is read. */
export function syntheticBindings(selectionHash: string, approvals: readonly QuarantineApproval[]) {
  return validateValueBindings({ schemaVersion: 1, parentSelectionHash: selectionHash,
    offlineSelectionHash: createHash('sha256').update('synthetic-offline-selection').digest('hex'),
    quarantines: approvals.map(q => ({ selectionHash, parentSelectionHash: selectionHash,
      position: q.position, playerId: q.playerId, requestId: q.requestId,
      originalRequestHash: q.originalRequestHash, approvalReference: q.approvalReference,
      kind: 'SEARCH', extraManualSlot: false })) })
}
