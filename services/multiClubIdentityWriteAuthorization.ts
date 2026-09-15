import { isDeepStrictEqual } from "node:util"
import { firstMultiClubBatchPolicy, type MultiClubBatchPolicy } from "./firstMultiClubIdentityBatch"
import { multiClubPreparationHash, requireSameMultiClubPreparation, type MultiClubPreparation,
  type MultiClubIdentityAuthorizationSummary } from "./multiClubIdentityAuthorization"

export type MultiClubWriteSummary = Omit<MultiClubIdentityAuthorizationSummary, "scope" | "writeEnabled"> & {
  scope: "MULTI_CLUB_IDENTITY_V1"; writeEnabled: true; batchId: string
}
export type MultiClubWriteEnvelope = {
  envelopeVersion: 1; authorizationPrefix: "AUTHORIZE_MULTI_CLUB_IDENTITY_V1"; writeEnabled: true
  createdAt: string; expiresAt: string; expectedHead: string; summaryHash: string; summary: MultiClubWriteSummary
}
export function requireMultiClubBatchPolicy(p: MultiClubPreparation, policy = firstMultiClubBatchPolicy()) {
  requireSameMultiClubPreparation(p,p)
  const s=p.summary
  if (s.clubs.length!==5 || s.selectionOrder.length!==20 || s.executionOrder.length!==20 || s.revalidationDeferred.length ||
      p.summaryHash!==policy.approvedSummaryHash || !isDeepStrictEqual(s.orderedClubList,policy.orderedClubList) ||
      !isDeepStrictEqual(s.selectionOrder,policy.selectionOrder) ||
      !isDeepStrictEqual(s.executionOrder.map(p=>p.playerId),policy.executionOrder)) throw new Error("MULTI_CLUB_ALLOWLIST_MISMATCH")
}
export function preparationFromWriteEnvelope(e: MultiClubWriteEnvelope): MultiClubPreparation {
  const { batchId: _batchId, ...fields }=e.summary; void _batchId
  const summary:MultiClubIdentityAuthorizationSummary={...fields,scope:"MULTI_CLUB_IDENTITY_PREPARATION",writeEnabled:false}
  return {summary,summaryHash:multiClubPreparationHash(summary),writeEnabled:false}
}
// Pure construction only. Readiness/preflight CLI NEVER calls this or emits a consumable token.
export function createMultiClubWriteEnvelope(p:MultiClubPreparation,head:string,now:Date,policy=firstMultiClubBatchPolicy()):MultiClubWriteEnvelope {
  requireMultiClubBatchPolicy(p,policy)
  if(!/^[a-f0-9]{40}$/.test(head)||!Number.isFinite(now.getTime()))throw new Error("INVALID_ENVELOPE_CONTEXT")
  const expires=Math.min(now.getTime()+900000,...p.summary.clubs.map(c=>Date.parse(c.cacheExpiresAt)))
  if(expires<=now.getTime())throw new Error("AUTHORIZATION_EXPIRED")
  const summary:MultiClubWriteSummary={...structuredClone(p.summary),scope:"MULTI_CLUB_IDENTITY_V1",writeEnabled:true,batchId:policy.id}
  return {envelopeVersion:1,authorizationPrefix:"AUTHORIZE_MULTI_CLUB_IDENTITY_V1",writeEnabled:true,
    createdAt:now.toISOString(),expiresAt:new Date(expires).toISOString(),expectedHead:head,summary,summaryHash:multiClubPreparationHash(summary)}
}
export function multiClubWriteToken(e:MultiClubWriteEnvelope) {
  return "AUTHORIZE_MULTI_CLUB_IDENTITY_V1:"+multiClubPreparationHash(e)
}
export function requireMultiClubWriteEnvelope(e:MultiClubWriteEnvelope,token:string,head:string,now:Date,
  policy:MultiClubBatchPolicy=firstMultiClubBatchPolicy()) {
  if(!e || e.envelopeVersion!==1 || e.authorizationPrefix!=="AUTHORIZE_MULTI_CLUB_IDENTITY_V1" || e.writeEnabled!==true ||
      e.summary?.scope!=="MULTI_CLUB_IDENTITY_V1" || e.summary.writeEnabled!==true || e.summary.batchId!==policy.id ||
      !/^[a-f0-9]{40}$/.test(head)||e.expectedHead!==head ||
      !/^AUTHORIZE_MULTI_CLUB_IDENTITY_V1:[a-f0-9]{64}$/.test(token) ||
      e.summaryHash!==multiClubPreparationHash(e.summary) || token!==multiClubWriteToken(e))throw new Error("AUTHORIZATION_MISMATCH")
  const created=Date.parse(e.createdAt),expires=Date.parse(e.expiresAt),at=now.getTime()
  if(!Number.isFinite(at)||!Number.isFinite(created)||!Number.isFinite(expires)||created>at||expires<=at||
      expires<=created||expires-created>900000||e.summary.clubs.some(c=>Date.parse(c.cacheExpiresAt)<expires))throw new Error("AUTHORIZATION_EXPIRED")
  const p=preparationFromWriteEnvelope(e)
  requireMultiClubBatchPolicy(p,policy)
  return p
}
