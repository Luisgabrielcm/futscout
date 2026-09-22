import { isDeepStrictEqual } from "node:util"
import { getVisualAssetSrc } from "../lib/visualAssets"

export type BrandEntityType = "CLUB" | "LEAGUE"
export type BrandAssetType = "CREST" | "LOGO"
export type BrandRightsStatus = "APPROVED" | "REMOTE_ONLY" | "CACHE_ALLOWED" | "REVIEW_REQUIRED" | "BLOCKED"
export type BrandOperationalDecision = "NOT_AUTHORIZED" | "OWNER_AUTHORIZED_REMOTE_USE" | "REVOKED"
export type BrandDisplayPolicy = "DISPLAY_ALLOWED" | "DISPLAY_BLOCKED"
export type BrandDeliveryStatus = "VALIDATED" | "UNVERIFIED" | "FAILED"
export type BrandIdentityStatus = "VERIFIED" | "REVIEW_REQUIRED" | "BLOCKED"
export type BrandAssetLifecycle = "DISCOVERED" | "VALIDATED" | "ACTIVE" | "STALE" | "REMOVED" | "ERROR"

export type BrandAssetPilotIdentity = Readonly<{
  entityType: BrandEntityType
  entityId: string
  provider: "api-football"
  providerEntityId: string
  assetType: BrandAssetType
}>

export const BRAND_ASSET_PILOT_ALLOWLIST = [
  { entityType: "CLUB", entityId: "cmt7hnsah0004z0ucqy6yoeqz", provider: "api-football", providerEntityId: "541", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt94sq79001l5guc4g4zj7y3", provider: "api-football", providerEntityId: "529", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt94sibe001a5guc60z2rphl", provider: "api-football", providerEntityId: "50", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt92ovai0001hwucqa7za5jj", provider: "api-football", providerEntityId: "40", assetType: "CREST" },
  { entityType: "LEAGUE", entityId: "cmt94rzm4000b5gucw3hp7cx7", provider: "api-football", providerEntityId: "140", assetType: "LOGO" },
  { entityType: "LEAGUE", entityId: "cmt92ouaa0000hwuc3mmpqdvt", provider: "api-football", providerEntityId: "39", assetType: "LOGO" },
  { entityType: "CLUB", entityId: "cmt988deb006axoucsek15lnf", provider: "api-football", providerEntityId: "42", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt988fv1006gxoucfvhe5ixq", provider: "api-football", providerEntityId: "530", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bpbac01jdukuc7pk7ymaj", provider: "api-football", providerEntityId: "44", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt988ik5006oxoucd513b45v", provider: "api-football", providerEntityId: "49", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt986ykp003ixouc55mf1aqi", provider: "api-football", providerEntityId: "157", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ci1vx037oukucp6bz74xm", provider: "api-football", providerEntityId: "175", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt997z4k009et4ucd72b4yil", provider: "api-football", providerEntityId: "33", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt94s5fj000n5gucp31fdk0k", provider: "api-football", providerEntityId: "85", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99gll7008avsuch9uw1gvl", provider: "api-football", providerEntityId: "746", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9aoe5300322kucqgprwdz0", provider: "api-football", providerEntityId: "167", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9aq1pu00682kucyfduu54a", provider: "api-football", providerEntityId: "172", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9974gg007ot4uc0dmv1sav", provider: "api-football", providerEntityId: "492", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt996zzw007et4ucl2aazk74", provider: "api-football", providerEntityId: "165", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99dyp8002ovsucnd49o3si", provider: "api-football", providerEntityId: "531", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99d7le0018vsucfd3qdwbc", provider: "api-football", providerEntityId: "34", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99d0zh000xvsuc626shxrs", provider: "api-football", providerEntityId: "497", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99es52004ivsuc2zio5yxu", provider: "api-football", providerEntityId: "66", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99hk2200a9vsuclj2kq7f3", provider: "api-football", providerEntityId: "496", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99hhgh00a2vsucsde2k885", provider: "api-football", providerEntityId: "168", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99fxkh006wvsucd1pc0mh8", provider: "api-football", providerEntityId: "502", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99fqa5006jvsucjlphws0b", provider: "api-football", providerEntityId: "173", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99n2rb003dugucvmtnlfza", provider: "api-football", providerEntityId: "47", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99otvt006xuguc9ob97r6d", provider: "api-football", providerEntityId: "543", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99ll0k0007ugucewlhmmd7", provider: "api-football", providerEntityId: "45", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99mfgd001xuguctnqzvtja", provider: "api-football", providerEntityId: "81", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9aomve003n2kuc30m6psei", provider: "api-football", providerEntityId: "65", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9an48l000q2kuc53xadjt6", provider: "api-football", providerEntityId: "548", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99r4g200b9uguc1264koey", provider: "api-football", providerEntityId: "533", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakx3y905ucq0uccwnjkrro", provider: "api-football", providerEntityId: "48", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b1okd0066ukucj2536us8", provider: "api-football", providerEntityId: "36", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b1tca006gukucxzlz3qhm", provider: "api-football", providerEntityId: "51", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b26jz0077ukuc69ka53an", provider: "api-football", providerEntityId: "500", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b4r0o00bgukucrylbu0tx", provider: "api-football", providerEntityId: "52", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9azalg0012ukuchrdpkw7r", provider: "api-football", providerEntityId: "91", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b2xb6008xukucwuzl4ze8", provider: "api-football", providerEntityId: "169", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bao2d00nqukuc037v4hcu", provider: "api-football", providerEntityId: "532", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9aqc44006y2kuc1zc1ba56", provider: "api-football", providerEntityId: "538", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b79po00h0ukucgt6c7vmw", provider: "api-football", providerEntityId: "727", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b6lri00fkukuc1vtrbcof", provider: "api-football", providerEntityId: "160", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b653d00emukucndncx74s", provider: "api-football", providerEntityId: "503", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b4it400b5ukucbe6qn8s7", provider: "api-football", providerEntityId: "488", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bbuqd00qnukucafvxkxw9", provider: "api-football", providerEntityId: "63", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bcu1h00t1ukucl7791hsv", provider: "api-football", providerEntityId: "728", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b856k00j2ukucfnj5vqgh", provider: "api-football", providerEntityId: "798", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bd5yd00trukucg403hewl", provider: "api-football", providerEntityId: "895", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b8xdh00l1ukucn4ur5aex", provider: "api-football", providerEntityId: "80", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9beltc00vrukucglu7th7s", provider: "api-football", providerEntityId: "163", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bb97700p5ukucvf2zetd7", provider: "api-football", providerEntityId: "546", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bb1rk00omukuchgc6fbdf", provider: "api-football", providerEntityId: "164", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bav6200o8ukuctbl9v2d1", provider: "api-football", providerEntityId: "114", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bevja00weukucp916j658", provider: "api-football", providerEntityId: "162", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bcy6500t7ukuc4gao05b5", provider: "api-football", providerEntityId: "867", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bi759014bukuc99d6gd28", provider: "api-football", providerEntityId: "547", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bhhdv012hukuccnokw0bg", provider: "api-football", providerEntityId: "94", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bkwvw019qukuc9f73wx88", provider: "api-football", providerEntityId: "35", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bjwvh017eukucc73q2hhm", provider: "api-football", providerEntityId: "161", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bhlku012tukucplt5sk3z", provider: "api-football", providerEntityId: "84", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bl3ws01a9ukucegxnoqrb", provider: "api-football", providerEntityId: "79", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bjoml016tukuc9efm9r7n", provider: "api-football", providerEntityId: "55", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bjvj10179ukuc9dnps0k8", provider: "api-football", providerEntityId: "182", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaotzgi06e2twucnytsc1qw", provider: "api-football", providerEntityId: "39", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bxiyb01zmukucgqjmuoi1", provider: "api-football", providerEntityId: "540", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cgnfo035bukuc1v68clvy", provider: "api-football", providerEntityId: "536", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cllx203fdukucv6lwoemo", provider: "api-football", providerEntityId: "542", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cjhak03bbukucpxoihcrp", provider: "api-football", providerEntityId: "95", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c9k1502plukucd02et50t", provider: "api-football", providerEntityId: "520", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cg2ty033xukuco9u99412", provider: "api-football", providerEntityId: "494", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cg6t90348ukucbs6pma9p", provider: "api-football", providerEntityId: "504", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cbohr02v2ukuc6k1cpafj", provider: "api-football", providerEntityId: "96", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9covwb03nwukucnbvxcy6p", provider: "api-football", providerEntityId: "170", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cvos9042xukuc0tisvee5", provider: "api-football", providerEntityId: "116", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9czcr804bcukuc8887w3ol", provider: "api-football", providerEntityId: "106", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cnutu03l9ukuchhi4g0va", provider: "api-football", providerEntityId: "495", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d2kzc04iwukuck8titqhq", provider: "api-football", providerEntityId: "490", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9coemo03mmukucl0ngbcpu", provider: "api-football", providerEntityId: "192", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d0yxo04eeukucbfc0zb4i", provider: "api-football", providerEntityId: "186", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9euxbb00rb1suceriap9g6", provider: "api-football", providerEntityId: "718", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj06wv011dq0ucaw9vuxxu", provider: "api-football", providerEntityId: "180", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9eli4i00821sucftm7ofvk", provider: "api-football", providerEntityId: "797", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d6fe904riukucqflt8shq", provider: "api-football", providerEntityId: "801", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d74e204tiukuceu6wrpnp", provider: "api-football", providerEntityId: "83", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d93lf04xfukucf1309kj9", provider: "api-football", providerEntityId: "108", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ejcqz00301suctsu8dt76", provider: "api-football", providerEntityId: "77", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9eqcn000he1suc94fvfux7", provider: "api-football", providerEntityId: "112", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fhokq02251sucn2s6wcag", provider: "api-football", providerEntityId: "539", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fgndl01zs1suc8zq991r1", provider: "api-football", providerEntityId: "97", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f0c6n012h1sucik1pzhk5", provider: "api-football", providerEntityId: "523", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fj3x4024e1suc1sfpxnnq", provider: "api-football", providerEntityId: "111", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9997da00bst4ucutt2pfcp", provider: "api-football", providerEntityId: "645", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99edix003lvsucj8kdheft", provider: "api-football", providerEntityId: "611", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99o0850056ugucu4ehsc23", provider: "api-football", providerEntityId: "212", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99qp6f00aluguc2e0o7o84", provider: "api-football", providerEntityId: "228", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b1x0i006oukucxkmpid6k", provider: "api-football", providerEntityId: "211", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9az1rs000kukucnze2wzuj", provider: "api-football", providerEntityId: "549", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bbzuv00r0ukucrnki07u7", provider: "api-football", providerEntityId: "217", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99gv4g008uvsucw9u6v6hs", provider: "api-football", providerEntityId: "2939", assetType: "CREST" },
] as const satisfies readonly BrandAssetPilotIdentity[]

export type BrandAssetCandidate = BrandAssetPilotIdentity & Readonly<{
  identityStatus: BrandIdentityStatus
  sourceUrl: string
  storageUrl: string | null
  contentHash: string | null
  fetchedAt: string
  rightsStatus: BrandRightsStatus
  displayPolicy: BrandDisplayPolicy
  operationalDecision: BrandOperationalDecision
  operationalAuthorizedAt: string | null
  operationalDecisionRef: string | null
  operatorRiskAccepted: boolean
  riskAcceptedAt: string | null
  riskAcceptedBy: string | null
  riskReason: string | null
  sourceTermsUrl: string | null
  revocable: boolean
  deliveryStatus: BrandDeliveryStatus
}>

export type BrandAssetDryRunRow = Readonly<{
  identity: BrandAssetPilotIdentity
  sourceUrl: string
  rightsStatus: BrandRightsStatus
  displayPolicy: BrandDisplayPolicy
  riskAccepted: boolean
  operationalDecision: BrandOperationalDecision
  publicationDecision: "ALLOWED_AT_OPERATOR_RISK" | "NOT_ALLOWED" | "REVOKED"
  deliveryStatus: BrandDeliveryStatus
  renderDecision: "REMOTE_WHEN_GLOBAL_ENABLED" | "FALLBACK"
  rollbackDecision: "REVOKE_ASSET" | "NOT_APPLICABLE"
  plannedStatus: Exclude<BrandAssetLifecycle, "STALE" | "REMOVED" | "ERROR">
  action: "CREATE_ACTIVE" | "NOT_WRITABLE"
  blockers: readonly string[]
  writable: boolean
}>

const identityKey = (value: BrandAssetPilotIdentity) => [value.entityType, value.entityId, value.provider,
  value.providerEntityId, value.assetType].join(":")
const kind = (entityType: BrandEntityType) => entityType === "CLUB" ? "club" as const : "league" as const
const expectedSourceUrl = (candidate: BrandAssetPilotIdentity) =>
  `https://media.api-sports.io/football/${candidate.entityType === "CLUB" ? "teams" : "leagues"}/${candidate.providerEntityId}.png`
const validHash = (value: string | null) => value !== null && /^[a-f0-9]{64}$/.test(value)
const validHttpsUrl = (value: string | null) => {
  try {
    const url = new URL(value ?? "")
    return url.protocol === "https:" && !url.username && !url.password
  } catch { return false }
}

function validateCandidate(candidate: BrandAssetCandidate, now: Date) {
  const compatible = candidate.entityType === "CLUB" ? candidate.assetType === "CREST" : candidate.assetType === "LOGO"
  if (!compatible || candidate.provider !== "api-football" || candidate.sourceUrl !== expectedSourceUrl(candidate) ||
      !getVisualAssetSrc(candidate.sourceUrl, kind(candidate.entityType)) ||
      (candidate.storageUrl !== null && !getVisualAssetSrc(candidate.storageUrl, kind(candidate.entityType))) ||
      !Number.isFinite(Date.parse(candidate.fetchedAt)) || Date.parse(candidate.fetchedAt) > now.getTime() ||
      (candidate.operationalAuthorizedAt !== null && (!Number.isFinite(Date.parse(candidate.operationalAuthorizedAt)) ||
        Date.parse(candidate.operationalAuthorizedAt) > now.getTime())) ||
      (candidate.riskAcceptedAt !== null && (!Number.isFinite(Date.parse(candidate.riskAcceptedAt)) ||
        Date.parse(candidate.riskAcceptedAt) > now.getTime()))) {
    throw new Error("BRAND_ASSET_CANDIDATE_INVALID")
  }
}

function blockers(candidate: BrandAssetCandidate) {
  const values: string[] = []
  const decisionRef = candidate.operationalDecisionRef?.trim() ?? ""
  const riskAcceptedBy = candidate.riskAcceptedBy?.trim() ?? ""
  const riskReason = candidate.riskReason?.trim() ?? ""
  const operationallyAuthorized = candidate.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" &&
    candidate.operationalAuthorizedAt !== null && decisionRef.length > 0 && candidate.operatorRiskAccepted &&
    candidate.riskAcceptedAt !== null && riskAcceptedBy.length > 0 && riskReason.length > 0 &&
    validHttpsUrl(candidate.sourceTermsUrl) && candidate.revocable
  if (candidate.identityStatus !== "VERIFIED") values.push("IDENTITY_NOT_VERIFIED")
  if (candidate.displayPolicy === "DISPLAY_BLOCKED") values.push("DISPLAY_BLOCKED")
  if (candidate.operationalDecision === "REVOKED") values.push("OPERATIONAL_AUTHORIZATION_REVOKED")
  if (candidate.rightsStatus === "REVIEW_REQUIRED" && candidate.displayPolicy === "DISPLAY_ALLOWED" &&
      !operationallyAuthorized) values.push("OPERATIONAL_AUTHORIZATION_INVALID")
  if (candidate.rightsStatus === "BLOCKED") values.push("RIGHTS_BLOCKED")
  if (candidate.operationalDecision === "NOT_AUTHORIZED" &&
      (candidate.operationalAuthorizedAt !== null || candidate.operationalDecisionRef !== null ||
       candidate.operatorRiskAccepted || candidate.riskAcceptedAt !== null || candidate.riskAcceptedBy !== null ||
       candidate.riskReason !== null || candidate.sourceTermsUrl !== null || !candidate.revocable)) {
    values.push("OPERATIONAL_AUTHORIZATION_INVALID")
  }
  if (candidate.operationalDecision !== "NOT_AUTHORIZED" &&
      !operationallyAuthorized) values.push("OPERATIONAL_AUTHORIZATION_INVALID")
  if (candidate.deliveryStatus !== "VALIDATED" || !validHash(candidate.contentHash)) values.push("DELIVERY_NOT_VALIDATED")
  if (candidate.rightsStatus === "REMOTE_ONLY" && candidate.storageUrl !== null) values.push("REMOTE_ONLY_STORAGE_FORBIDDEN")
  if (candidate.rightsStatus === "CACHE_ALLOWED" && candidate.storageUrl === null) values.push("CACHE_STORAGE_REQUIRED")
  if (operationallyAuthorized && candidate.storageUrl !== null) values.push("OWNER_AUTHORIZED_REMOTE_STORAGE_FORBIDDEN")
  return values
}

export function prepareBrandAssetPilotDryRun(candidates: readonly BrandAssetCandidate[], now = new Date()): BrandAssetDryRunRow[] {
  if (candidates.length !== BRAND_ASSET_PILOT_ALLOWLIST.length || candidates.some((candidate, index) =>
    identityKey(candidate) !== identityKey(BRAND_ASSET_PILOT_ALLOWLIST[index]))) throw new Error("BRAND_ASSET_ALLOWLIST_MISMATCH")
  return candidates.map(candidate => {
    validateCandidate(candidate, now)
    const blocked = blockers(candidate)
    const writable = blocked.length === 0
    return { identity: BRAND_ASSET_PILOT_ALLOWLIST.find(item => identityKey(item) === identityKey(candidate))!,
      sourceUrl: candidate.sourceUrl, rightsStatus: candidate.rightsStatus, displayPolicy: candidate.displayPolicy,
      riskAccepted: candidate.operatorRiskAccepted, operationalDecision: candidate.operationalDecision,
      publicationDecision: candidate.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" ? "ALLOWED_AT_OPERATOR_RISK" :
        candidate.operationalDecision === "REVOKED" ? "REVOKED" : "NOT_ALLOWED",
      deliveryStatus: candidate.deliveryStatus,
      renderDecision: writable && candidate.displayPolicy === "DISPLAY_ALLOWED" ? "REMOTE_WHEN_GLOBAL_ENABLED" : "FALLBACK",
      rollbackDecision: operationallyAuthorizedForRollback(candidate) ? "REVOKE_ASSET" : "NOT_APPLICABLE",
      plannedStatus: writable ? "ACTIVE" : candidate.deliveryStatus === "VALIDATED" ? "VALIDATED" : "DISCOVERED",
      action: writable ? "CREATE_ACTIVE" : "NOT_WRITABLE", blockers: blocked, writable }
  })
}

function operationallyAuthorizedForRollback(candidate: BrandAssetCandidate) {
  return candidate.operationalDecision === "OWNER_AUTHORIZED_REMOTE_USE" && candidate.operatorRiskAccepted && candidate.revocable
}

export type BrandIdentityRow = Readonly<{
  id: string; entityType: BrandEntityType; entityId: string; provider: string; providerEntityId: string
  status: BrandIdentityStatus; version: number
}>
export type BrandAssetRow = Readonly<{
  id: string; identityId: string; assetType: BrandAssetType; sourceUrl: string; storageUrl: string | null
  contentHash: string | null; version: number; fetchedAt: string; rightsStatus: BrandRightsStatus
  displayPolicy: BrandDisplayPolicy
  operationalDecision: BrandOperationalDecision; operationalAuthorizedAt: string | null; operationalDecisionRef: string | null
  operatorRiskAccepted: boolean; riskAcceptedAt: string | null; riskAcceptedBy: string | null; riskReason: string | null
  sourceTermsUrl: string | null; revocable: boolean
  status: BrandAssetLifecycle
}>
export type BrandExpectedState = Readonly<{
  identity: BrandIdentityRow | null
  latestAsset: BrandAssetRow | null
  activeAssetId: string | null
}>
export type BrandAssetWriteRequest = Readonly<{ candidate: BrandAssetCandidate; expected: BrandExpectedState }>
export type BrandAssetAudit = Readonly<{
  protected: Readonly<{ Club: Readonly<{ count: string; hash: string }>; League: Readonly<{ count: string; hash: string }> }>
  registry: Readonly<{ BrandAssetIdentity: Readonly<{ count: string; hash: string }>; BrandAsset: Readonly<{ count: string; hash: string }> }>
}>

export type BrandAssetWriteTransaction = {
  readLocalEntity(entityType: BrandEntityType, entityId: string): Promise<{ id: string; providerEntityId: string | null } | null>
  findIdentityByLocal(input: BrandAssetPilotIdentity): Promise<BrandIdentityRow | null>
  findIdentityByProvider(input: BrandAssetPilotIdentity): Promise<BrandIdentityRow | null>
  latestAsset(identityId: string, assetType: BrandAssetType): Promise<BrandAssetRow | null>
  activeAsset(identityId: string, assetType: BrandAssetType): Promise<BrandAssetRow | null>
  createIdentity(input: BrandAssetCandidate): Promise<BrandIdentityRow>
  markActiveStale(id: string, version: number): Promise<number>
  createAsset(identityId: string, version: number, input: BrandAssetCandidate): Promise<BrandAssetRow>
}
export type BrandAssetWriteStore = {
  audit(): Promise<BrandAssetAudit>
  transaction<T>(work: (tx: BrandAssetWriteTransaction) => Promise<T>): Promise<T>
}

export type BrandAssetWriteStatus = "CREATED" | "NO_OP" | "NOT_WRITABLE" | "AUTHORIZATION_MISMATCH" |
  "IDENTITY_CONFLICT" | "CONCURRENT_MODIFICATION" | "ROLLED_BACK" | "INDETERMINATE_COMMIT" | "AUDIT_MISMATCH"
export type BrandAssetWriteResult = Readonly<{
  status: BrandAssetWriteStatus; entityId: string; providerEntityId: string; assetId: string | null
  transactionState: "NOT_STARTED" | "ROLLED_BACK" | "COMMIT_CONFIRMED" | "COMMIT_INDETERMINATE"
  retries: 0; reason: string
}>

class BrandWriteAbort extends Error {
  constructor(readonly status: BrandAssetWriteStatus, readonly safeReason: string) { super(safeReason) }
}
const errorCode = (error: unknown) => typeof error === "object" && error !== null && "code" in error &&
  typeof error.code === "string" ? error.code : null
const result = (request: BrandAssetWriteRequest, status: BrandAssetWriteStatus, transactionState: BrandAssetWriteResult["transactionState"],
  reason: string, assetId: string | null = null): BrandAssetWriteResult => ({ status, entityId: request.candidate.entityId,
    providerEntityId: request.candidate.providerEntityId, assetId, transactionState, retries: 0, reason })

function sameProtected(before: BrandAssetAudit, after: BrandAssetAudit) {
  return isDeepStrictEqual(before.protected, after.protected)
}
function expectedRegistryDelta(before: BrandAssetAudit, after: BrandAssetAudit, identityCreated: boolean, assetCreated: boolean) {
  return Number(after.registry.BrandAssetIdentity.count) - Number(before.registry.BrandAssetIdentity.count) === (identityCreated ? 1 : 0) &&
    Number(after.registry.BrandAsset.count) - Number(before.registry.BrandAsset.count) === (assetCreated ? 1 : 0)
}
const sameAsset = (row: BrandAssetRow, candidate: BrandAssetCandidate) => row.assetType === candidate.assetType &&
  row.sourceUrl === candidate.sourceUrl && row.storageUrl === candidate.storageUrl && row.contentHash === candidate.contentHash &&
  row.rightsStatus === candidate.rightsStatus && row.operationalDecision === candidate.operationalDecision &&
  row.displayPolicy === candidate.displayPolicy &&
  row.operationalAuthorizedAt === candidate.operationalAuthorizedAt &&
  row.operationalDecisionRef === candidate.operationalDecisionRef &&
  row.operatorRiskAccepted === candidate.operatorRiskAccepted && row.riskAcceptedAt === candidate.riskAcceptedAt &&
  row.riskAcceptedBy === candidate.riskAcceptedBy && row.riskReason === candidate.riskReason &&
  row.sourceTermsUrl === candidate.sourceTermsUrl && row.revocable === candidate.revocable && row.status === "ACTIVE"

// No env, network, retry loop or singleton. A future authorized runner must supply the store and fresh expected state.
export async function persistBrandAssetAtomically(store: BrandAssetWriteStore, request: BrandAssetWriteRequest,
  clock: () => Date = () => new Date()): Promise<BrandAssetWriteResult> {
  const candidate = structuredClone(request.candidate)
  const pin = structuredClone(request.expected)
  const allowed = BRAND_ASSET_PILOT_ALLOWLIST.some(item => identityKey(item) === identityKey(candidate))
  if (!allowed) return result(request, "AUTHORIZATION_MISMATCH", "NOT_STARTED", "ALLOWLIST_MISMATCH")
  try { validateCandidate(candidate, clock()) } catch { return result(request, "AUTHORIZATION_MISMATCH", "NOT_STARTED", "CANDIDATE_INVALID") }
  const blocked = blockers(candidate)
  if (blocked.length) return result(request, "NOT_WRITABLE", "NOT_STARTED", blocked.join("+"))

  const before = await store.audit()
  let entered = false, callbackReturned = false, commitConfirmed = false, identityCreated = false, assetCreated = false
  try {
    const committed = await store.transaction(async tx => {
      entered = true
      const local = await tx.readLocalEntity(candidate.entityType, candidate.entityId)
      if (!local || (candidate.entityType === "CLUB" && local.providerEntityId !== candidate.providerEntityId)) {
        throw new BrandWriteAbort("IDENTITY_CONFLICT", "LOCAL_IDENTITY_MISMATCH")
      }
      const providerOwner = await tx.findIdentityByProvider(candidate)
      if (providerOwner && providerOwner.entityId !== candidate.entityId) throw new BrandWriteAbort("IDENTITY_CONFLICT", "PROVIDER_OCCUPIED")
      let identity = await tx.findIdentityByLocal(candidate)
      if (identity && (identity.providerEntityId !== candidate.providerEntityId || identity.status !== "VERIFIED" ||
          identity.entityType !== candidate.entityType)) throw new BrandWriteAbort("IDENTITY_CONFLICT", "IDENTITY_STATE_CONFLICT")
      const latest = identity ? await tx.latestAsset(identity.id, candidate.assetType) : null
      const active = identity ? await tx.activeAsset(identity.id, candidate.assetType) : null
      if (identity && active && sameAsset(active, candidate)) {
        callbackReturned = true
        return { status: "NO_OP" as const, assetId: active.id }
      }
      if (!isDeepStrictEqual(identity, pin.identity) || !isDeepStrictEqual(latest, pin.latestAsset) ||
          (active?.id ?? null) !== pin.activeAssetId) throw new BrandWriteAbort("CONCURRENT_MODIFICATION", "EXPECTED_STATE_CHANGED")
      if (!identity) { identity = await tx.createIdentity(candidate); identityCreated = true }
      if (active && await tx.markActiveStale(active.id, active.version) !== 1) {
        throw new BrandWriteAbort("CONCURRENT_MODIFICATION", "ACTIVE_ASSET_CHANGED")
      }
      const created = await tx.createAsset(identity.id, (latest?.version ?? 0) + 1, candidate)
      assetCreated = true
      const readBack = await tx.activeAsset(identity.id, candidate.assetType)
      if (!readBack || readBack.id !== created.id || !sameAsset(readBack, candidate)) {
        throw new BrandWriteAbort("ROLLED_BACK", "READ_BACK_MISMATCH")
      }
      callbackReturned = true
      return { status: "CREATED" as const, assetId: created.id }
    })
    commitConfirmed = true
    let after: BrandAssetAudit
    try { after = await store.audit() } catch {
      return result(request, "AUDIT_MISMATCH", "COMMIT_CONFIRMED", "AFTER_AUDIT_FAILED", committed.assetId)
    }
    if (!sameProtected(before, after) || !expectedRegistryDelta(before, after, identityCreated, assetCreated)) {
      return result(request, "AUDIT_MISMATCH", "COMMIT_CONFIRMED", "AFTER_AUDIT_MISMATCH", committed.assetId)
    }
    return result(request, committed.status, "COMMIT_CONFIRMED", committed.status === "NO_OP" ? "IDEMPOTENT_NO_OP" : "CREATED", committed.assetId)
  } catch (error) {
    if (error instanceof BrandWriteAbort) return result(request, error.status, entered ? "ROLLED_BACK" : "NOT_STARTED", error.safeReason)
    const code = errorCode(error)
    if (callbackReturned && !commitConfirmed && !["P2034", "40001", "40P01"].includes(code ?? "")) {
      return result(request, "INDETERMINATE_COMMIT", "COMMIT_INDETERMINATE", "COMMIT_ACKNOWLEDGEMENT_UNKNOWN")
    }
    const concurrent = ["P2002", "23505", "P2034", "40001", "40P01"].includes(code ?? "")
    return result(request, concurrent ? "CONCURRENT_MODIFICATION" : "ROLLED_BACK", entered ? "ROLLED_BACK" : "NOT_STARTED",
      concurrent ? "DATABASE_CONCURRENCY_CONFLICT" : "TRANSACTION_FAILED")
  }
}
