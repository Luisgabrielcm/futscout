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
  { entityType: "CLUB", entityId: "cmt9cizg903a3ukuchi92767u", provider: "api-football", providerEntityId: "436", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c7h3z02lvukucfl6cah21", provider: "api-football", providerEntityId: "451", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fdbyl01ss1sucs8bsvnht", provider: "api-football", providerEntityId: "225", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c79lm02lgukucgl5eo8j2", provider: "api-football", providerEntityId: "446", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c509w02fxukucsf97pnyf", provider: "api-football", providerEntityId: "435", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7j22d01bg6wuct4aefwm0", provider: "api-football", providerEntityId: "171", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8l2ta03r26wucjl0uu12l", provider: "api-football", providerEntityId: "179", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f3p8b01a81sucxhg6cjer", provider: "api-football", providerEntityId: "438", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cei21030kukucf9k89crh", provider: "api-football", providerEntityId: "617", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fr8gm02m91sucfj3fdqt3", provider: "api-football", providerEntityId: "783", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fwa4e02wb1suc1ea6q6r1", provider: "api-football", providerEntityId: "58", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtab1s5p00qdggucsm4btjwm", provider: "api-football", providerEntityId: "1064", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cn30e03jcukucnoqup43g", provider: "api-football", providerEntityId: "575", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cn51a03jiukucw5ajq8q0", provider: "api-football", providerEntityId: "62", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cyd26048wukuc9axfsgw3", provider: "api-football", providerEntityId: "20787", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9en37200b11suc1rkin0ry", provider: "api-football", providerEntityId: "458", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f8eoc01k11sucrwdk95n7", provider: "api-football", providerEntityId: "71", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta71u7c008g6wuccskh8jpp", provider: "api-football", providerEntityId: "191", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7xrps029o6wuclfnn8qwo", provider: "api-football", providerEntityId: "452", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fwqi602xi1suc54t5glog", provider: "api-football", providerEntityId: "261", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fwhhn02ww1sucyvyfvlcc", provider: "api-football", providerEntityId: "339", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gaqo103pl1suc1w0rny0i", provider: "api-football", providerEntityId: "1355", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7ppwd01qh6wucqh1x3wu7", provider: "api-football", providerEntityId: "455", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7kq3y01fo6wucip1okg09", provider: "api-football", providerEntityId: "1600", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cdhpy02ydukuc4la6roqn", provider: "api-football", providerEntityId: "551", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f2lz6017c1suchl7bgfz9", provider: "api-football", providerEntityId: "159", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ghqo0044e1suc4wdn4h1s", provider: "api-football", providerEntityId: "2432", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g205v03891suc85t8vk2v", provider: "api-football", providerEntityId: "347", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g87tv03li1suczyn1b0oa", provider: "api-football", providerEntityId: "38", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gatqt03ps1suczevlvtzd", provider: "api-football", providerEntityId: "1837", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtael7qh06o59gucjdbgl9t8", provider: "api-football", providerEntityId: "1072", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9emqub00a51sucrn2zt62k", provider: "api-football", providerEntityId: "1597", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ep9yb00g91sucremuzfcu", provider: "api-football", providerEntityId: "1598", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f4irl01bg1sucmh34k9nh", provider: "api-football", providerEntityId: "606", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gb7k903ql1suc4yabvvc6", provider: "api-football", providerEntityId: "445", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fup2x02sl1suct8amuocy", provider: "api-football", providerEntityId: "260", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gjcgy048s1suc71b59w5w", provider: "api-football", providerEntityId: "72", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta752yg00fm6wuconqlfbpy", provider: "api-football", providerEntityId: "56", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta85hug02qw6wucw2w4vf3z", provider: "api-football", providerEntityId: "59", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaim1b8002eq0ucdnalrpap", provider: "api-football", providerEntityId: "68", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaf2leh07vn9gucjb8hr9s4", provider: "api-football", providerEntityId: "3484", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9btnjn01s9ukuctp0lbzsh", provider: "api-football", providerEntityId: "2242", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c065h026cukuciwhak8v9", provider: "api-football", providerEntityId: "9569", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ca9bm02rkukucc192xbcy", provider: "api-football", providerEntityId: "453", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cgdff034oukucg035fvxu", provider: "api-football", providerEntityId: "25484", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9emb4f008u1suc76zoxdjo", provider: "api-football", providerEntityId: "7411", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fc8a101q01suc1ryaianx", provider: "api-football", providerEntityId: "2184", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g08pr03501suczp5u8bla", provider: "api-football", providerEntityId: "565", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fykal030p1sucxzncrg79", provider: "api-football", providerEntityId: "41", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7o5x501o86wuc95n0cejc", provider: "api-football", providerEntityId: "733", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaatnlj007vggucqxbvume1", provider: "api-football", providerEntityId: "741", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaaukcg00auggucvfxj2d08", provider: "api-football", providerEntityId: "6962", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtad1zmn034g9guco9me6agx", provider: "api-football", providerEntityId: "630", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b3q8h00amukuclpwibild", provider: "api-football", providerEntityId: "437", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cwivr045dukucj6qic48q", provider: "api-football", providerEntityId: "18310", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cy17j047zukuc2y0ykdsg", provider: "api-football", providerEntityId: "1607", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f0aio012c1suczxee2iut", provider: "api-football", providerEntityId: "1604", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g693x03gr1suc7qb5xftc", provider: "api-football", providerEntityId: "75", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7cvpj00xb6wucekiae2sc", provider: "api-football", providerEntityId: "166", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7g0m101466wuczn8qs10o", provider: "api-football", providerEntityId: "181", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8cs0p036g6wucu7bg799y", provider: "api-football", providerEntityId: "188", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtac187p00rc9gucyat0n8cj", provider: "api-football", providerEntityId: "1581", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99do5s0026vsuckknppk4v", provider: "api-football", providerEntityId: "9568", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ca0ti02qwukucs2griedd", provider: "api-football", providerEntityId: "619", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d9z5c04zoukucckd75td1", provider: "api-football", providerEntityId: "785", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f198a01521sucsgd256ec", provider: "api-football", providerEntityId: "1613", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ezg3500zz1suc0nmyk96r", provider: "api-football", providerEntityId: "498", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gg8gh041u1suckd2dev2z", provider: "api-football", providerEntityId: "336", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta75dua00gg6wucdkhd1xos", provider: "api-football", providerEntityId: "240", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8eyrw03cl6wucv0112wi2", provider: "api-football", providerEntityId: "644", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtabwivj00eg9gucqne7kzh8", provider: "api-football", providerEntityId: "340", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadoyul04n29guc5rwyjzzq", provider: "api-football", providerEntityId: "183", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaly62c08a4q0ucvcq34ht2", provider: "api-football", providerEntityId: "1320", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaegk9q06dm9guco49mq172", provider: "api-football", providerEntityId: "1012", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafah2608fo9guccm2ryqec", provider: "api-football", providerEntityId: "349", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaek1vs06lu9gucsi3yijph", provider: "api-football", providerEntityId: "4248", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ckmxw03e6ukucn9npzg1l", provider: "api-football", providerEntityId: "1608", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ejo7b003o1suc86lcm6sg", provider: "api-football", providerEntityId: "1617", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f74xj01gq1sucrbc6wm7f", provider: "api-football", providerEntityId: "996", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f4ogs01br1succa5rwjs9", provider: "api-football", providerEntityId: "397", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f7cr001ha1sucprh3nhi1", provider: "api-football", providerEntityId: "266", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f3dtw019c1sucn91zt0gt", provider: "api-football", providerEntityId: "1601", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gctt703uz1sucais9tlpj", provider: "api-football", providerEntityId: "460", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta78e8h00mt6wucw7phddy5", provider: "api-football", providerEntityId: "70", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadzrw0059b9guc6txs4dyw", provider: "api-football", providerEntityId: "5902", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadpyd004og9guc7jpra8m8", provider: "api-football", providerEntityId: "618", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafnxen09br9gucy0lysf7y", provider: "api-football", providerEntityId: "1614", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj5qi801g0q0ucj42phsgo", provider: "api-football", providerEntityId: "346", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaipfqb00boq0ucbuy1oslm", provider: "api-football", providerEntityId: "1324", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakuw6u05osq0ucw8f2slkf", provider: "api-football", providerEntityId: "4256", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d9t2904zaukucekcsk2sl", provider: "api-football", providerEntityId: "1004", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fcowh01r21succ9oxe9p5", provider: "api-football", providerEntityId: "16489", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fhd2d021h1suc35rscaqk", provider: "api-football", providerEntityId: "564", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fskd002pk1suc399h9pxo", provider: "api-football", providerEntityId: "1606", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g6hhv03ha1sucsih7ha8k", provider: "api-football", providerEntityId: "3603", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7630700i96wucu5cm7430", provider: "api-football", providerEntityId: "1610", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7qh4p01sg6wucia0j99yk", provider: "api-football", providerEntityId: "713", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7iwov01b06wucyawockxj", provider: "api-football", providerEntityId: "1011", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacoj8q02969guc62ht4zj7", provider: "api-football", providerEntityId: "600", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtad3j5b03939gucerchl300", provider: "api-football", providerEntityId: "14562", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9eyo9400y51suc4ss0ofnj", provider: "api-football", providerEntityId: "2768", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadkeb904a89gucv9d8yz5q", provider: "api-football", providerEntityId: "2746", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ez1lx00z51sucskdij8qd", provider: "api-football", providerEntityId: "2764", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ffws901xv1sucbtve8xyb", provider: "api-football", providerEntityId: "2766", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaawm3700f5ggucck1qnd3l", provider: "api-football", providerEntityId: "2748", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bgaa900zlukucsog738bh", provider: "api-football", providerEntityId: "620", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cgwwt0363ukucpnog9n74", provider: "api-football", providerEntityId: "651", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacxmtz02un9guc6wm3vxhg", provider: "api-football", providerEntityId: "2761", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtado2kr04kc9gucxh3www7e", provider: "api-football", providerEntityId: "2759", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaloitr07iiq0uc87cokpkj", provider: "api-football", providerEntityId: "1350", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtad6w5j03gt9guctf3x6m2t", provider: "api-football", providerEntityId: "53", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99f9dq005hvsucqle83b8e", provider: "api-football", providerEntityId: "2938", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtanbkaz02h0twuchqxcuou0", provider: "api-football", providerEntityId: "1369", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakz66105zlq0ucr8z79g7h", provider: "api-football", providerEntityId: "748", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bqcyq01lsukucjtx9teay", provider: "api-football", providerEntityId: "247", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj7ho901jpq0uc26mw9oid", provider: "api-football", providerEntityId: "1321", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj2wbc018rq0uc7uv0vdyl", provider: "api-football", providerEntityId: "256", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9crqku03u0ukucdvckvdqm", provider: "api-football", providerEntityId: "550", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7qn9t01sx6wucezhfm7q2", provider: "api-football", providerEntityId: "833", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajz71j03i4q0ucw58nhf2l", provider: "api-football", providerEntityId: "1368", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta852r302pl6wuci1ul5dpy", provider: "api-football", providerEntityId: "5695", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdb4eei00biu4uc6wxicp84", provider: "api-football", providerEntityId: "3702", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9i7a2p002qq4ucev668jqv", provider: "api-football", providerEntityId: "559", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtad9c8g03mi9gucb5hfy4wg", provider: "api-football", providerEntityId: "37", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fu0k202re1sucq8d8sppb", provider: "api-football", providerEntityId: "375", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cmu5e03iqukuc42d8hi7q", provider: "api-football", providerEntityId: "257", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c5bhl02glukuc5hb0ek15", provider: "api-football", providerEntityId: "560", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafrcht09le9guc17h2mekz", provider: "api-football", providerEntityId: "1358", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadl0fa04c79gucvo52037z", provider: "api-football", providerEntityId: "21265", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c5mkw02hgukucah1jysz7", provider: "api-football", providerEntityId: "572", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajov6c02r9q0uca2rv0260", provider: "api-football", providerEntityId: "2581", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakq56005daq0uc2y78g90u", provider: "api-football", providerEntityId: "320", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaocw4d0595twucej3wetlx", provider: "api-football", providerEntityId: "1367", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbj97901o2u4uclrjsddno", provider: "api-football", providerEntityId: "2318", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafdbkr08m59guclvy4x1zd", provider: "api-football", providerEntityId: "1639", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fj5c9024j1suchfo7b0lp", provider: "api-football", providerEntityId: "252", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbi3x001l7u4uckr58dfxo", provider: "api-football", providerEntityId: "1138", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta84qfk02os6wucx1oc10uz", provider: "api-football", providerEntityId: "367", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdec7tj044bg4ucpm0v9sko", provider: "api-football", providerEntityId: "2808", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdb77j300lou4ucvdmrnxyb", provider: "api-football", providerEntityId: "1176", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gcaon03tn1sucp35nm2g3", provider: "api-football", providerEntityId: "2246", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaoohro060ctwuclzxupydc", provider: "api-football", providerEntityId: "1362", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaluo5907zaq0uclh3pw9dk", provider: "api-football", providerEntityId: "1354", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajcjx001w9q0ucpnl86vrg", provider: "api-football", providerEntityId: "1389", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtalqfg107nnq0ucand49djk", provider: "api-football", providerEntityId: "1347", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtabyglv00kc9guc6gm6456i", provider: "api-football", providerEntityId: "249", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtalon6707iuq0ucv494v6ry", provider: "api-football", providerEntityId: "187", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ciasd038fukuctftuju0y", provider: "api-football", providerEntityId: "628", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtamzdw101pdtwucrry0mwbg", provider: "api-football", providerEntityId: "1353", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaffkw108rn9gucig467zgf", provider: "api-football", providerEntityId: "2589", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtanvh52040htwuc3ig276da", provider: "api-football", providerEntityId: "1333", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaiuqf900nyq0uc8pl20j4p", provider: "api-football", providerEntityId: "747", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtamjtya00gvtwuch5p56qc8", provider: "api-football", providerEntityId: "1334", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaawu9l00fygguc6thr71pv", provider: "api-football", providerEntityId: "4716", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtanzhmz049stwucgtk9x9zq", provider: "api-football", providerEntityId: "1345", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadrymm04uo9gucmjql1ori", provider: "api-football", providerEntityId: "3012", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtabvb6i00ci9gucz72g0c12", provider: "api-football", providerEntityId: "2240", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaeripr073p9gucjip5czpb", provider: "api-football", providerEntityId: "940", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajcldr01whq0ucwj1ku9ur", provider: "api-football", providerEntityId: "1844", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaja6zg01qqq0ucoidpjhwa", provider: "api-football", providerEntityId: "4265", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakw3ti05srq0ucorw2o8m0", provider: "api-football", providerEntityId: "3854", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtalv1zu080sq0ucrpd5k92y", provider: "api-football", providerEntityId: "1620", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtalk6j2079jq0uc2t7m4qtr", provider: "api-football", providerEntityId: "1342", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c5hpn02h3ukucu99bhbxk", provider: "api-football", providerEntityId: "2934", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbjlg501ptu4ucr4nhk3h0", provider: "api-football", providerEntityId: "1152", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaksdeg05iwq0uc4vfs7bqn", provider: "api-football", providerEntityId: "670", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtab2d3a00s1gguc4lafkjdc", provider: "api-football", providerEntityId: "364", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaucp9d01g0zsucr6fdmnhn", provider: "api-football", providerEntityId: "3850", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaksjs805jeq0ucq9tgcp40", provider: "api-football", providerEntityId: "253", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafssei09oo9gucksn2xwuz", provider: "api-football", providerEntityId: "2596", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakxtu805wtq0uczlamzbp3", provider: "api-football", providerEntityId: "1336", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaes6vo07639guckgp0ckgw", provider: "api-football", providerEntityId: "2170", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtak6jc6040hq0uc0pz1gcv5", provider: "api-football", providerEntityId: "250", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafdp6208nb9guc599avqe4", provider: "api-football", providerEntityId: "1373", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtamyi7201mdtwuc3wtmphxo", provider: "api-football", providerEntityId: "652", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtasb27e03k3dcucqfaxu3yk", provider: "api-football", providerEntityId: "3845", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtad668v03er9guc535y3fie", provider: "api-football", providerEntityId: "24608", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtau7jxd010czsuclvieya40", provider: "api-football", providerEntityId: "3851", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtalquwm07p8q0ucptkuna6e", provider: "api-football", providerEntityId: "1374", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacwzvb02u99guc3d1hbqxc", provider: "api-football", providerEntityId: "945", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f2e26016p1sucnfdsis41", provider: "api-football", providerEntityId: "82", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakhwpc04ryq0ucpm5q0f37", provider: "api-football", providerEntityId: "332", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtavb9we043gzsucfod0rjzo", provider: "api-football", providerEntityId: "3842", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafrl0i09lz9guccvan7h0j", provider: "api-football", providerEntityId: "251", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdb3dj4008fu4uco6czof1b", provider: "api-football", providerEntityId: "2540", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cb3kh02tkukucoauzq3ze", provider: "api-football", providerEntityId: "10511", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdb513400feu4ucldjm9qkj", provider: "api-football", providerEntityId: "2553", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8hq5m03j16wuc2fty6tc4", provider: "api-football", providerEntityId: "528", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtabuhuz00a49guce6rvuiar", provider: "api-football", providerEntityId: "1356", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g03x2034r1suc87o5mfuw", provider: "api-football", providerEntityId: "1687", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtang83102w6twucs2ixyef9", provider: "api-football", providerEntityId: "1361", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fjpk202651sucezvcf95p", provider: "api-football", providerEntityId: "3588", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaipdkx00bcq0uc7pdwrd53", provider: "api-football", providerEntityId: "184", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8gytm03gn6wucv3kxlieo", provider: "api-football", providerEntityId: "372", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtac5yas010m9guczhvamyzr", provider: "api-football", providerEntityId: "1693", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c03by0265ukuccdam2vem", provider: "api-football", providerEntityId: "10513", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gakt003p91such1gtbgep", provider: "api-football", providerEntityId: "348", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta81cdf02hl6wucqpig9ptr", provider: "api-football", providerEntityId: "401", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fdm2801td1sucd800m16w", provider: "api-football", providerEntityId: "226", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cc9w002wsukucyrt2pulg", provider: "api-football", providerEntityId: "998", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g2t7e03a11sucmbp6o8h1", provider: "api-football", providerEntityId: "60", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8n4vf03vg6wucqo47wgj4", provider: "api-football", providerEntityId: "1025", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cnytl03liukuc008pm5f3", provider: "api-football", providerEntityId: "2931", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bq38n01leukucgv6yeof7", provider: "api-football", providerEntityId: "2944", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fm2e702ay1sucuor3gxqc", provider: "api-football", providerEntityId: "449", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtarifpg01e4dcuckdar4wer", provider: "api-football", providerEntityId: "3840", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtailtq4001uq0ucjpdiuksz", provider: "api-football", providerEntityId: "947", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdcz6kx00lfg4ucfc54ztk6", provider: "api-football", providerEntityId: "2810", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtac6y2a013i9guc4zm8tgbj", provider: "api-football", providerEntityId: "511", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbgppw01gfu4ucqfgwcf9g", provider: "api-football", providerEntityId: "2554", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtae2gtf05gd9guc6axhtog1", provider: "api-football", providerEntityId: "8157", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaf4o1p07zv9gucu13j45s8", provider: "api-football", providerEntityId: "366", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d6hzu04rpukucib3yez8s", provider: "api-football", providerEntityId: "607", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8gnzn03fp6wucfhvuv817", provider: "api-football", providerEntityId: "899", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaf9cgk08bt9gucxprslta1", provider: "api-football", providerEntityId: "946", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fu8r102ru1sucn5qla7bq", provider: "api-football", providerEntityId: "522", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafo70h09cn9gucfgptvfpu", provider: "api-football", providerEntityId: "1297", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbc1kh011zu4ucfbrzkwzx", provider: "api-football", providerEntityId: "2348", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbu9iu02miu4uc2xp8wp4e", provider: "api-football", providerEntityId: "2546", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7d6ak00xz6wucriz517zk", provider: "api-football", providerEntityId: "943", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bx8hy01ywukuc51st5ka5", provider: "api-football", providerEntityId: "2865", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ggcup04231sucummnbkm2", provider: "api-football", providerEntityId: "10509", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9b9m7b00l9ukucxxbqpido", provider: "api-football", providerEntityId: "2940", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtab0g4h00odggucesa9cgsf", provider: "api-football", providerEntityId: "9580", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d4pm404muukucu587ifbe", provider: "api-football", providerEntityId: "724", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta81az002hg6wuc4x6uaugx", provider: "api-football", providerEntityId: "509", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj2qf20184q0uc8l63l1l7", provider: "api-football", providerEntityId: "2172", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fqxa602li1sucnp2tf669", provider: "api-football", providerEntityId: "242", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaefavh06af9guc87vf4cbt", provider: "api-football", providerEntityId: "15550", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g27g6038q1sucj499174o", provider: "api-football", providerEntityId: "1612", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta81tl902iv6wuc7v07zgh7", provider: "api-football", providerEntityId: "1578", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9i85860056q4ucwhcjsucg", provider: "api-football", providerEntityId: "948", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f3jfs019s1sucbsth7o0u", provider: "api-football", providerEntityId: "762", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gckxt03uc1sucuecpuwpx", provider: "api-football", providerEntityId: "227", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbw5vo02rcu4ucbpopru0q", provider: "api-football", providerEntityId: "2562", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7l04401gf6wucj22kdi3f", provider: "api-football", providerEntityId: "994", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta87syq02w26wuc62qo498y", provider: "api-football", providerEntityId: "715", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacixv801vf9gucho7j7qoo", provider: "api-football", providerEntityId: "649", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gg251041e1sucx37303s2", provider: "api-football", providerEntityId: "215", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtalq1bb07lyq0ucr3mmb0bg", provider: "api-football", providerEntityId: "1352", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta77hxq00lz6wuctv3703if", provider: "api-football", providerEntityId: "224", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtac33fq00va9gucgr8h9f47", provider: "api-football", providerEntityId: "463", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8r7rr04656wuc29p4qm9k", provider: "api-football", providerEntityId: "4724", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbj6gn01nku4uc01l4qepb", provider: "api-football", providerEntityId: "1158", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaeiuxv06il9gucdl9gf20a", provider: "api-football", providerEntityId: "10139", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtd9s1l302s1ogucc80xitx1", provider: "api-football", providerEntityId: "415", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacaezq01bo9gucr791k958", provider: "api-football", providerEntityId: "870", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtddqwzk02ogg4uccb8ukdn2", provider: "api-football", providerEntityId: "2361", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtddqpp902ngg4ucl56bmja9", provider: "api-football", providerEntityId: "2827", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaby9ul00jq9gucapdbciar", provider: "api-football", providerEntityId: "790", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtalz61p08bwq0ucrsje4cec", provider: "api-football", providerEntityId: "1364", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99ho3e00aivsuchz4fddri", provider: "api-football", providerEntityId: "8097", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaebvjk06289gucpchbinqe", provider: "api-football", providerEntityId: "834", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7p1n501ot6wucievbl1x4", provider: "api-football", providerEntityId: "174", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtabvjod00d69gucsmcsum94", provider: "api-football", providerEntityId: "1338", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9by8hf021jukucpa6u2ifp", provider: "api-football", providerEntityId: "27751", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gjazn048n1suceaf19zvf", provider: "api-football", providerEntityId: "64", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafm5ob098u9gucdbf2zysj", provider: "api-football", providerEntityId: "3476", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajhyra0291q0uck0t451rg", provider: "api-football", providerEntityId: "1351", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta80lmx02fp6wucigy8ri2u", provider: "api-football", providerEntityId: "185", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaeim2406i09guc8r5zeaup", provider: "api-football", providerEntityId: "110", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdcjmw604nxu4ucvhfb7q5q", provider: "api-football", providerEntityId: "1174", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadx0r7056x9guc9ksl857a", provider: "api-football", providerEntityId: "3479", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacliuq02239gucwoehu7sa", provider: "api-football", providerEntityId: "1660", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaiv2mt00ovq0ucxcv1hdth", provider: "api-football", providerEntityId: "22652", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtala2jc06oaq0ucavlsuum9", provider: "api-football", providerEntityId: "1337", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtan0pqf01rztwuc2gblf54h", provider: "api-football", providerEntityId: "1376", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7is7w01ao6wuchv2tf1x7", provider: "api-football", providerEntityId: "21371", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gj2j404811suc2ug3rreg", provider: "api-football", providerEntityId: "557", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafqru109jj9guc7jq86lfx", provider: "api-football", providerEntityId: "255", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g6uam03i51sucz15erw00", provider: "api-football", providerEntityId: "535", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c855e02ngukucsdi32174", provider: "api-football", providerEntityId: "1579", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtddtjcl02tpg4uc5rtb7ymj", provider: "api-football", providerEntityId: "1183", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bnlby01f5ukucgmmocwwz", provider: "api-football", providerEntityId: "8007", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtavbknd044ozsucq193ttis", provider: "api-football", providerEntityId: "653", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbu4pe02lnu4ucrhftmxvc", provider: "api-football", providerEntityId: "2319", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtanjzzq035wtwucgpaok8fr", provider: "api-football", providerEntityId: "3463", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaizht800zeq0uce81lc2mk", provider: "api-football", providerEntityId: "512", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbxr7h02xau4uczq733s5y", provider: "api-football", providerEntityId: "2321", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fzbbw032l1sucyjc9m0lx", provider: "api-football", providerEntityId: "517", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdd4gkj00ztg4uc5vyqrqeh", provider: "api-football", providerEntityId: "2564", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtan4apd021atwucaiwxux8y", provider: "api-football", providerEntityId: "1832", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaeqqm507169gucj4t3uz7c", provider: "api-football", providerEntityId: "3475", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj7s9501kpq0ucenrlswot", provider: "api-football", providerEntityId: "3477", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtal2swh068jq0ucuuwpr61j", provider: "api-football", providerEntityId: "1298", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c2tw402bvukucfeh3zjp2", provider: "api-football", providerEntityId: "26064", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtauvmrq02wlzsuceruvv04b", provider: "api-football", providerEntityId: "7763", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajv0g3038eq0ucjj68fixe", provider: "api-football", providerEntityId: "3478", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtddsop302rsg4ucwooft5u0", provider: "api-football", providerEntityId: "1162", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdd1v0u00tzg4uchfj5c38d", provider: "api-football", providerEntityId: "2369", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtantmat03w1twucsi5qnfg2", provider: "api-football", providerEntityId: "3473", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdevhs0013go4ucxmmkd60h", provider: "api-football", providerEntityId: "3706", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakuew205n6q0ucfkjqrmms", provider: "api-football", providerEntityId: "19008", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbjbje01ocu4uc30lcuwl3", provider: "api-football", providerEntityId: "1131", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtbpdgt2009zpkuc9j70jvc8", provider: "api-football", providerEntityId: "7179", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbu5bw02lsu4ucqlfi5rra", provider: "api-football", providerEntityId: "1136", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gh9jj043c1sucxc7o1tmo", provider: "api-football", providerEntityId: "2762", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g4cqq03dh1suche82tzng", provider: "api-football", providerEntityId: "2750", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cs7mo03v8ukucnogrtspz", provider: "api-football", providerEntityId: "554", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bz9pu0247ukuc4km26s5y", provider: "api-football", providerEntityId: "440", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8mc5h03t76wuc1xcckl1f", provider: "api-football", providerEntityId: "6231", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f304w018b1suc2qi4p0rz", provider: "api-football", providerEntityId: "473", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cubo703z9ukucrpx79w95", provider: "api-football", providerEntityId: "457", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cv6c1041mukucgw4krc7u", provider: "api-football", providerEntityId: "740", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtabvizy00d29gucp0207a7h", provider: "api-football", providerEntityId: "474", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9emlg5009j1suc9q02xqfs", provider: "api-football", providerEntityId: "176", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtainaxh006nq0ucf9su0alt", provider: "api-football", providerEntityId: "345", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8a0g1030h6wuc555pky7z", provider: "api-football", providerEntityId: "1313", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fpjko02i71suc1n4vg7ma", provider: "api-football", providerEntityId: "830", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtanfgqg02svtwucwipjecx7", provider: "api-football", providerEntityId: "1363", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7gjoa015k6wuc3lcsrf46", provider: "api-football", providerEntityId: "442", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaax7xk00gzggucbfrl6kcs", provider: "api-football", providerEntityId: "745", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8bu1h035j6wuc7raft888", provider: "api-football", providerEntityId: "1359", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g5rov03fj1sucbnlbwf5f", provider: "api-football", providerEntityId: "571", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c36ob02cpukucthf36hos", provider: "api-football", providerEntityId: "1602", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gbfxs03rb1sucba3c2z3i", provider: "api-football", providerEntityId: "836", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d64k404qrukuciefnks2l", provider: "api-football", providerEntityId: "1137", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8f9sh03de6wucz1a10eg2", provider: "api-football", providerEntityId: "67", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaixn4n00vkq0ucvcdhmr92", provider: "api-football", providerEntityId: "1343", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f01ag011r1such278vxtp", provider: "api-football", providerEntityId: "5648", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafd6kr08ls9gucqrpr74a8", provider: "api-football", providerEntityId: "99", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bm4cg01czukucfs1msgd4", provider: "api-football", providerEntityId: "569", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadtsus04y69gucjei61lpr", provider: "api-football", providerEntityId: "1319", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtad9h1b03my9guc4wuuwdah", provider: "api-football", providerEntityId: "1398", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99pcss0081ugucjtiubogy", provider: "api-football", providerEntityId: "2929", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaodccp05aotwucorfolwau", provider: "api-football", providerEntityId: "1372", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ctt1l03xwukuc8lenbxr0", provider: "api-football", providerEntityId: "400", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta86ymj02tq6wuc4pqiaef1", provider: "api-football", providerEntityId: "2599", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gj6s9048d1suc57xz5ijf", provider: "api-football", providerEntityId: "601", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fb5sa01n71sucpno81qof", provider: "api-football", providerEntityId: "840", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbjar901o6u4ucj1rvth2c", provider: "api-football", providerEntityId: "1153", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f2tf4017s1suciptoicpw", provider: "api-football", providerEntityId: "478", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9c9lml02pqukuc0gpmw98t", provider: "api-football", providerEntityId: "742", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaimh37003mq0uc5ih7ha5d", provider: "api-football", providerEntityId: "1348", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtabznhw00mg9gucfcq10inl", provider: "api-football", providerEntityId: "1431", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtak1xt403onq0uctzl5tex7", provider: "api-football", providerEntityId: "73", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7wm2e026d6wucln3bd2bj", provider: "api-football", providerEntityId: "781", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f4q9k01bw1sucien6vcpg", provider: "api-football", providerEntityId: "1595", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f6to801ft1sucrx0vevk2", provider: "api-football", providerEntityId: "2767", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9argto00852kuc9swyyo6x", provider: "api-football", providerEntityId: "2933", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d673b04qxukucubb4o4qm", provider: "api-football", providerEntityId: "54", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtabuy1k00b69guc1qoo6qyh", provider: "api-football", providerEntityId: "350", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacexou01m39gucynjo734q", provider: "api-football", providerEntityId: "21263", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8r2lh045s6wucm614fcq9", provider: "api-football", providerEntityId: "476", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g1l5h03731sucg6okeerh", provider: "api-football", providerEntityId: "69", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8r47t045x6wucb8sr5vbz", provider: "api-football", providerEntityId: "158", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaf53h408199guce0i13a3r", provider: "api-football", providerEntityId: "2598", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtar9o7x00uadcucn5t8ujdn", provider: "api-football", providerEntityId: "1365", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7prxq01qn6wuc6w16t532", provider: "api-football", providerEntityId: "254", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj7g9101jkq0uc6eoh8qm0", provider: "api-football", providerEntityId: "57", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9dbcp00530ukuc978k6epm", provider: "api-football", providerEntityId: "631", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bp4lm01ivukuctkh0mv6m", provider: "api-football", providerEntityId: "1605", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt99g4op007cvsuczkv6zx11", provider: "api-football", providerEntityId: "1616", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ejrxu003z1sucnozbmz5o", provider: "api-football", providerEntityId: "46", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9blzlt01cmukuce30x0ys7", provider: "api-football", providerEntityId: "553", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g1nas03791sucxdn17dcy", provider: "api-football", providerEntityId: "17265", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadwffo054y9guc2b4wevjs", provider: "api-football", providerEntityId: "1301", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtain4ca005wq0ucwi9qzsp9", provider: "api-football", providerEntityId: "333", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtab04cq00nbggucj44trfuk", provider: "api-football", providerEntityId: "5686", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d8ti704wpukuc0f1lftnu", provider: "api-football", providerEntityId: "534", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9d5ozt04pnukucjvtr9e4u", provider: "api-football", providerEntityId: "759", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fg8lp01yo1sucnu94mml8", provider: "api-football", providerEntityId: "848", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakafzp049gq0uc9j6mt92a", provider: "api-football", providerEntityId: "371", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fnk4802en1suc6xwupz45", provider: "api-football", providerEntityId: "1615", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9coo9v03ncukuc1p8t7tdc", provider: "api-football", providerEntityId: "327", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj1slr014xq0ucx596oa88", provider: "api-football", providerEntityId: "6230", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtac0v6d00q69gucrw4qqrb8", provider: "api-football", providerEntityId: "178", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj30jv0194q0uc9c9192z8", provider: "api-football", providerEntityId: "177", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbhwel01jyu4uchsk2vt90", provider: "api-football", providerEntityId: "1179", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaefzby06cl9gucfi28fqqm", provider: "api-football", providerEntityId: "1357", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7aatk00sh6wuccgit4cnh", provider: "api-football", providerEntityId: "731", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadbie403r69guc8i5jaff0", provider: "api-football", providerEntityId: "2073", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fuw9r02t41sucr8r7izyg", provider: "api-football", providerEntityId: "319", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaff2lj08qb9guck5hk7h0s", provider: "api-football", providerEntityId: "4686", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fzol0033r1sucmlrlg5v4", provider: "api-football", providerEntityId: "837", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ezc8n00zr1sucls9e16lz", provider: "api-football", providerEntityId: "723", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaq5l2u07dwtwuct0z4rbpy", provider: "api-football", providerEntityId: "1299", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fd4vn01s91sucd67af7m0", provider: "api-football", providerEntityId: "567", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtasibf0045edcuctlcmft8x", provider: "api-football", providerEntityId: "1360", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajfw6y024pq0uch9czj4mx", provider: "api-football", providerEntityId: "4259", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaavh8v00dlggucz57ag7qk", provider: "api-football", providerEntityId: "1394", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtabx56400ga9gucix1nagtp", provider: "api-football", providerEntityId: "744", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7vubp024a6wuchdxg3pr0", provider: "api-football", providerEntityId: "43", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacinut01uo9gucchzv06ph", provider: "api-football", providerEntityId: "90", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta84yyr02pb6wucp6o4dd1l", provider: "api-football", providerEntityId: "101", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9by1yo0211ukucq2ndd64f", provider: "api-football", providerEntityId: "608", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacop5d029q9gucn8a4tfrw", provider: "api-football", providerEntityId: "1014", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtalgz5r0741q0uccz5qipv2", provider: "api-football", providerEntityId: "1379", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacvyx002r69gucvb2s04lf", provider: "api-football", providerEntityId: "15516", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtarf9sf018gdcucm52o81ho", provider: "api-football", providerEntityId: "1349", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7gtil016f6wuchdzbx341", provider: "api-football", providerEntityId: "3491", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtafi94m08yj9gucyarm0w4g", provider: "api-football", providerEntityId: "1621", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fassu01mb1sucpydqnigx", provider: "api-football", providerEntityId: "844", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cglge0355ukuc8zucd5ft", provider: "api-football", providerEntityId: "1596", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f4w1201ca1suc6e3mjuhm", provider: "api-football", providerEntityId: "637", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7kt4l01fx6wucbjic0u5t", provider: "api-football", providerEntityId: "736", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakrzd305hmq0ucs201d5ys", provider: "api-football", providerEntityId: "3843", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaixjo800v4q0ucyoxl5xq9", provider: "api-football", providerEntityId: "1028", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtal3caj06akq0uc7tutpyuh", provider: "api-football", providerEntityId: "4268", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9givzk047h1suc1su5qp9n", provider: "api-football", providerEntityId: "76", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cxkce046tukucmn94dbth", provider: "api-football", providerEntityId: "456", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtan22iu01vytwuctklgr4mw", provider: "api-football", providerEntityId: "9342", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gmveh04g51sucavbz57d1", provider: "api-football", providerEntityId: "2994", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtabt2aj00689gucz5xsb4ow", provider: "api-football", providerEntityId: "632", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fev0c01v61sucey3saogq", provider: "api-football", providerEntityId: "1063", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fnatq02e01suc9p686l9u", provider: "api-football", providerEntityId: "407", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9et2d100o11sucf7q53drj", provider: "api-football", providerEntityId: "537", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g0q40036a1sucf4huty4w", provider: "api-football", providerEntityId: "1335", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta87q6y02vs6wucyrgx8myg", provider: "api-football", providerEntityId: "398", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtancojd02ldtwucvczd87r3", provider: "api-football", providerEntityId: "766", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta745ee00em6wuce645xdqf", provider: "api-football", providerEntityId: "363", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajmdmt02kcq0ucoiwt4cm4", provider: "api-football", providerEntityId: "2143", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gmg1d04f01suc8qnom138", provider: "api-football", providerEntityId: "1026", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8dq7i038z6wucpv90ntvr", provider: "api-football", providerEntityId: "433", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajdrlt0206q0uc0z8crbr9", provider: "api-football", providerEntityId: "1439", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8du9503966wucdca6xccc", provider: "api-football", providerEntityId: "405", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9f63l701dw1sucqduy7tiw", provider: "api-football", providerEntityId: "1599", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9cb8ts02tyukucm5t96k7k", provider: "api-football", providerEntityId: "1393", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta82xlx02k86wuc1pyt4wit", provider: "api-football", providerEntityId: "545", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajdm1v01zqq0ucmi5mdb3f", provider: "api-football", providerEntityId: "396", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fjjd1025l1suc2x5mn4bc", provider: "api-football", providerEntityId: "1611", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9bmhg601duukucz3f2n9mp", provider: "api-football", providerEntityId: "2928", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ceuqx031fukucr1ciwv4v", provider: "api-football", providerEntityId: "2936", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtac7paf015z9gucxgvakvl4", provider: "api-football", providerEntityId: "102", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtank2cp0368twucv5mnxbqr", provider: "api-football", providerEntityId: "1370", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9em38200871suc4gq54eqh", provider: "api-football", providerEntityId: "1007", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9frrst02ng1suclxtzblkf", provider: "api-football", providerEntityId: "1346", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta78pzr00nn6wuc1vpix6yy", provider: "api-football", providerEntityId: "230", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtanbst502i0twucewrxuf00", provider: "api-football", providerEntityId: "2592", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtad3ftv038v9gucua91s5so", provider: "api-football", providerEntityId: "635", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8p2os03zr6wucnik6ubs8", provider: "api-football", providerEntityId: "1013", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7ikz301a06wucil8oe6eo", provider: "api-football", providerEntityId: "434", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9eusm000qz1suc2p799l7d", provider: "api-football", providerEntityId: "544", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaeqnvq070z9gucz7xxhud4", provider: "api-football", providerEntityId: "863", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8310902kf6wuccviyn2mn", provider: "api-football", providerEntityId: "735", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtajacjl01r3q0ucoln9ozh2", provider: "api-football", providerEntityId: "325", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaipmcr00c2q0ucecng9ajr", provider: "api-football", providerEntityId: "341", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8473702nb6wuc8xzte98i", provider: "api-football", providerEntityId: "406", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta75w8300hs6wucjkqzibbq", provider: "api-football", providerEntityId: "377", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtailivt000tq0ucqczt0613", provider: "api-football", providerEntityId: "1386", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9erilr00k71sucf20y9qzh", provider: "api-football", providerEntityId: "3573", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtamharv00a8twucutqpacvu", provider: "api-football", providerEntityId: "2159", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaey26z07ks9gucvla6fpk6", provider: "api-football", providerEntityId: "370", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaask8g006cggucg08p3g81", provider: "api-football", providerEntityId: "556", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fbyv801pb1suclq6egkkw", provider: "api-football", providerEntityId: "4665", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta7bt9v00ut6wucuow4dhrv", provider: "api-football", providerEntityId: "331", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtde2dld03h1g4ucw79u2b95", provider: "api-football", providerEntityId: "17760", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9ekavf005d1succjrrm0kn", provider: "api-football", providerEntityId: "93", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaed1kz065d9gucvlzmezg6", provider: "api-football", providerEntityId: "326", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtac366800vn9gucx02t41lx", provider: "api-football", providerEntityId: "5254", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdb9yj100w0u4uc6tjgbb7r", provider: "api-football", providerEntityId: "2315", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaffy1c08sk9guc6onot5mr", provider: "api-football", providerEntityId: "2149", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9fy8gt02zp1sucu833qo00", provider: "api-football", providerEntityId: "997", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9gmgqz04f41sucrf6quydc", provider: "api-football", providerEntityId: "329", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g8avo03lo1sucm70gs09q", provider: "api-football", providerEntityId: "720", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj0b9c011sq0ucavcle71p", provider: "api-football", providerEntityId: "6886", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaoqfmf064stwucr8e89sw9", provider: "api-football", providerEntityId: "1381", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmta8k1gs03nz6wuc2wneld3p", provider: "api-football", providerEntityId: "722", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacc9p401g09guc31k8kxdq", provider: "api-football", providerEntityId: "1304", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaei6d006gr9gucsza5zl0s", provider: "api-football", providerEntityId: "2070", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtad6p2703g79guc056ughlz", provider: "api-football", providerEntityId: "939", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaellgh06pb9gucy1lpdj6k", provider: "api-football", providerEntityId: "3472", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtaj6j7401gzq0ucghuul7jw", provider: "api-football", providerEntityId: "74", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtak2mwt03qjq0ucxumww8rp", provider: "api-football", providerEntityId: "942", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtakijdb04u6q0ucjczur7os", provider: "api-football", providerEntityId: "944", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdb3jpr009fu4uc4kd4bz14", provider: "api-football", providerEntityId: "2323", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtacp3tt02b09gucz5y7w5ji", provider: "api-football", providerEntityId: "15130", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmt9g6s4v03hz1suc6hyhymy7", provider: "api-football", providerEntityId: "2945", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdb1q6c001au4uc8qjynwmi", provider: "api-football", providerEntityId: "1157", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdetf4700xpo4ucd8dfbv5l", provider: "api-football", providerEntityId: "22266", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdbi05601kmu4uczyqmxvs3", provider: "api-football", providerEntityId: "1182", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtadm6rl04fz9guc7w4m4ind", provider: "api-football", providerEntityId: "527", assetType: "CREST" },
  { entityType: "CLUB", entityId: "cmtdboic3025ku4ucdf0w7wcq", provider: "api-football", providerEntityId: "2807", assetType: "CREST" },
  { entityType: "LEAGUE", entityId: "cmt7hnpph0000z0ucroxfcazy", provider: "api-football", providerEntityId: "78", assetType: "LOGO" },
  { entityType: "LEAGUE", entityId: "cmt94s5bs000m5gucea56g6vg", provider: "api-football", providerEntityId: "61", assetType: "LOGO" },
  { entityType: "LEAGUE", entityId: "cmt987w77005exoucgs0iro0p", provider: "api-football", providerEntityId: "135", assetType: "LOGO" },
  { entityType: "LEAGUE", entityId: "cmtd9cvkm019boguc5jeujodz", provider: "api-football", providerEntityId: "88", assetType: "LOGO" },
  { entityType: "LEAGUE", entityId: "cmt99do1v0025vsucfwh0wtco", provider: "api-football", providerEntityId: "253", assetType: "LOGO" },
  { entityType: "LEAGUE", entityId: "cmt99o0480055ugucogcv1tys", provider: "api-football", providerEntityId: "94", assetType: "LOGO" },
  { entityType: "LEAGUE", entityId: "cmt9cn4x903jhukuctl70f0n1", provider: "api-football", providerEntityId: "40", assetType: "LOGO" },
  { entityType: "LEAGUE", entityId: "cmt9d9yzg04znukuczx9cgidr", provider: "api-football", providerEntityId: "79", assetType: "LOGO" },
  { entityType: "LEAGUE", entityId: "cmt9c850x02nfukucwm8657h5", provider: "api-football", providerEntityId: "136", assetType: "LOGO" },
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
      // Provider IDs remain reserved across history: never recreate/revive a blocked identity.
      if (providerOwner && providerOwner.status !== "VERIFIED") throw new BrandWriteAbort("IDENTITY_CONFLICT", "PROVIDER_IDENTITY_NOT_VERIFIED")
      let identity = await tx.findIdentityByLocal(candidate)
      if (providerOwner && providerOwner.id !== identity?.id) throw new BrandWriteAbort("IDENTITY_CONFLICT", "PROVIDER_LOCAL_IDENTITY_CONFLICT")
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
