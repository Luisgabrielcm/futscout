import scope from './estimatePublicationScope.json'
export const SUPPLIER_NOTICE_POLICY = 'value-supplier-notice-v1' as const
// Presentation decision only. Does not grant rights or change eligible hashes.
export const estimateNoticeRequired = scope.requiredNotice
export const estimateNoticeDecision = scope.noticeDecision
export const approvedEstimateHashes = Object.keys(scope.states)
export function approvedEstimateMethod(hash: string | undefined): string | null {
  return hash && Object.prototype.hasOwnProperty.call(scope.states, hash)
    ? (scope.states as Record<string, string>)[hash] : null
}
