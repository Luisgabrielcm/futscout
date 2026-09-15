import type { MultiClubIdentityAuthorizationSummary, MultiClubPreparedCandidate } from "./multiClubIdentityAuthorization"
import type { MultiClubPreflightPins } from "./multiClubIdentityPreflight"
export type MultiClubBatchPolicy = {
  id: string; approvedSummaryHash: string
  orderedClubList: MultiClubIdentityAuthorizationSummary["orderedClubList"]
  selectionOrder: MultiClubPreparedCandidate[]
  executionOrder: string[]
}
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T
function freeze<T>(value: T): Immutable<T> {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value as Immutable<T>
}
// Generated exclusively from Phase D's locally audited summary after validating its approved SHA-256.
// Deferred candidates are NOT executable. Both approved orders are independently pinned.
export const FIRST_MULTI_CLUB_BATCH = freeze({
  "id": "first-multi-club-batch-v1",
  "approvedSummaryHash": "4726c0d4560a5cff48b52155e2b979ddfba3b0feef733809cabfc00a58212a34",
  "orderedClubList": [
    {
      "clubId": "cmt988fv1006gxoucfvhe5ixq",
      "clubSlug": "atletico-de-madrid",
      "teamId": 530,
      "season": 2026
    },
    {
      "clubId": "cmt988deb006axoucsek15lnf",
      "clubSlug": "arsenal",
      "teamId": 42,
      "season": 2026
    },
    {
      "clubId": "cmt988ik5006oxoucd513b45v",
      "clubSlug": "chelsea",
      "teamId": 49,
      "season": 2026
    },
    {
      "clubId": "cmt92ovai0001hwucqa7za5jj",
      "clubSlug": "liverpool",
      "teamId": 40,
      "season": 2026
    },
    {
      "clubId": "cmt997z4k009et4ucd72b4yil",
      "clubSlug": "man-utd",
      "teamId": 33,
      "season": 2026
    }
  ],
  "selectionOrder": [
    {
      "playerId": "cmt9b35fh009hukucc7mekzvo",
      "slug": "kai-havertz",
      "providerId": 978,
      "confidence": 100,
      "margin": 85,
      "expectedUpdatedAt": "2026-08-28T17:59:56.431Z",
      "clubId": "cmt988deb006axoucsek15lnf",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt998wa000b7t4uc5spadhr2",
      "slug": "viktor-gyokeres",
      "providerId": 18979,
      "confidence": 100,
      "margin": 85,
      "expectedUpdatedAt": "2026-08-28T17:54:49.684Z",
      "clubId": "cmt988deb006axoucsek15lnf",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9aq638006h2kuckjthllnw",
      "slug": "piero-hincapie",
      "providerId": 127817,
      "confidence": 100,
      "margin": 85,
      "expectedUpdatedAt": "2026-08-28T17:58:36.048Z",
      "clubId": "cmt988deb006axoucsek15lnf",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9c86s302nmukucqldy60bg",
      "slug": "riccardo-calafiori",
      "providerId": 157052,
      "confidence": 100,
      "margin": 85,
      "expectedUpdatedAt": "2026-08-28T18:10:48.944Z",
      "clubId": "cmt988deb006axoucsek15lnf",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9by48t0217ukucgea00gsy",
      "slug": "wataru-endo",
      "providerId": 8500,
      "confidence": 100,
      "margin": 85,
      "expectedUpdatedAt": "2026-08-28T18:08:27.258Z",
      "clubId": "cmt92ovai0001hwucqa7za5jj",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt99myn10032ugucbwfv2pvd",
      "slug": "giorgi-mamardashvili",
      "providerId": 24760,
      "confidence": 100,
      "margin": 85,
      "expectedUpdatedAt": "2026-08-28T17:56:56.601Z",
      "clubId": "cmt92ovai0001hwucqa7za5jj",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9cwftj0453ukucffs03bm3",
      "slug": "joshua-zirkzee",
      "providerId": 70100,
      "confidence": 100,
      "margin": 85,
      "expectedUpdatedAt": "2026-08-28T18:17:17.594Z",
      "clubId": "cmt997z4k009et4ucd72b4yil",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9bks1t019hukuc10bzsbhc",
      "slug": "benjamin-sesko",
      "providerId": 115589,
      "confidence": 100,
      "margin": 85,
      "expectedUpdatedAt": "2026-08-28T18:05:08.496Z",
      "clubId": "cmt997z4k009et4ucd72b4yil",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9fshtr02p81sucqmquglwb",
      "slug": "patrick-dorgu",
      "providerId": 382452,
      "confidence": 100,
      "margin": 85,
      "expectedUpdatedAt": "2026-08-28T18:33:16.364Z",
      "clubId": "cmt997z4k009et4ucd72b4yil",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9bacqu00mzukuc7y0erx6h",
      "slug": "koke",
      "providerId": 50,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T18:01:49.854Z",
      "clubId": "cmt988fv1006gxoucfvhe5ixq",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9bv23u01vkukucj8lrgvke",
      "slug": "juan-musso",
      "providerId": 2465,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T18:07:39.540Z",
      "clubId": "cmt988fv1006gxoucfvhe5ixq",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9arwxc00982kuckozy1ygg",
      "slug": "robin-le-normand",
      "providerId": 47301,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T17:58:47.829Z",
      "clubId": "cmt988fv1006gxoucfvhe5ixq",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9b14xe004uukuc1fx69no0",
      "slug": "pablo-barrios",
      "providerId": 336594,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T17:59:37.703Z",
      "clubId": "cmt988fv1006gxoucfvhe5ixq",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9aosr600412kuchk4k7dco",
      "slug": "eberechi-eze",
      "providerId": 19586,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T17:58:25.677Z",
      "clubId": "cmt988deb006axoucsek15lnf",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9c5yz702i8ukucdd53h1ao",
      "slug": "robert-sanchez",
      "providerId": 18959,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T18:10:27.365Z",
      "clubId": "cmt988ik5006oxoucd513b45v",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9c248302a3ukuc618suqs7",
      "slug": "wesley-fofana",
      "providerId": 22094,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T18:09:28.658Z",
      "clubId": "cmt988ik5006oxoucd513b45v",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9bnyhh01g1ukuclb73le3y",
      "slug": "levi-colwill",
      "providerId": 152953,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T18:06:03.466Z",
      "clubId": "cmt988ik5006oxoucd513b45v",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9bxstk020cukuco6b84soe",
      "slug": "malo-gusto",
      "providerId": 161907,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T18:08:23.458Z",
      "clubId": "cmt988ik5006oxoucd513b45v",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt9cdwtw02z2ukucb07a29qq",
      "slug": "romeo-lavia",
      "providerId": 282125,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T18:12:29.512Z",
      "clubId": "cmt988ik5006oxoucd513b45v",
      "snapshotPresent": false
    },
    {
      "playerId": "cmt99q624009nuguci2t8abm6",
      "slug": "dominik-szoboszlai",
      "providerId": 1096,
      "confidence": 100,
      "margin": 75,
      "expectedUpdatedAt": "2026-08-28T17:57:28.974Z",
      "clubId": "cmt92ovai0001hwucqa7za5jj",
      "snapshotPresent": false
    }
  ],
  "executionOrder": [
    "cmt9bacqu00mzukuc7y0erx6h",
    "cmt9bv23u01vkukucj8lrgvke",
    "cmt9arwxc00982kuckozy1ygg",
    "cmt9b14xe004uukuc1fx69no0",
    "cmt9b35fh009hukucc7mekzvo",
    "cmt998wa000b7t4uc5spadhr2",
    "cmt9aq638006h2kuckjthllnw",
    "cmt9c86s302nmukucqldy60bg",
    "cmt9aosr600412kuchk4k7dco",
    "cmt9c5yz702i8ukucdd53h1ao",
    "cmt9c248302a3ukuc618suqs7",
    "cmt9bnyhh01g1ukuclb73le3y",
    "cmt9bxstk020cukuco6b84soe",
    "cmt9cdwtw02z2ukucb07a29qq",
    "cmt9by48t0217ukucgea00gsy",
    "cmt99myn10032ugucbwfv2pvd",
    "cmt99q624009nuguci2t8abm6",
    "cmt9cwftj0453ukucffs03bm3",
    "cmt9bks1t019hukuc10bzsbhc",
    "cmt9fshtr02p81sucqmquglwb"
  ]
} satisfies MultiClubBatchPolicy)
// Baseline/cache/candidate-set metadata only; never used as an executable target list.
const pins = freeze({
  "baseline": {
    "tables": {
      "Player": {
        "count": "16228",
        "hash": "df65dc0eda69a2c52edc5bb8ec5d8461"
      },
      "Club": {
        "count": "582",
        "hash": "df3175ae882032081e4e8385717da428"
      },
      "League": {
        "count": "45",
        "hash": "3cf5ca9f367dcb77940f1bd194ded616"
      },
      "PlayerAttributes": {
        "count": "16228",
        "hash": "4d98721ba56923404f12895da5677872"
      },
      "ApiFootballTeamRosterCache": {
        "count": "23",
        "hash": "7f5d66cf766bb018d2434283985cdb5a"
      },
      "ApiFootballPlayerMatchAttempt": {
        "count": "91",
        "hash": "080178c4cf4cec09edc22e981f485eff"
      },
      "SyncState": {
        "count": "2",
        "hash": "8f728496d565422cce4e01c7299bcf46"
      },
      "SyncError": {
        "count": "2",
        "hash": "5c369989fc8bb5d9f634dd554f98dc18"
      },
      "ClubOfficialLineupSnapshot": {
        "count": "3",
        "hash": "ef22bacc6c7b68d936993311f93b151f"
      }
    },
    "associated": 92
  },
  "clubs": [
    {
      "clubSlug": "atletico-de-madrid",
      "teamId": 530,
      "cacheRowHash": "8957d98677292e24ee2313c3a7b7f566"
    },
    {
      "clubSlug": "arsenal",
      "teamId": 42,
      "cacheRowHash": "fa60265a69c8587b4913f35822d99be6"
    },
    {
      "clubSlug": "chelsea",
      "teamId": 49,
      "cacheRowHash": "4827df451a489b3472e5ea1c72b54b8d"
    },
    {
      "clubSlug": "liverpool",
      "teamId": 40,
      "cacheRowHash": "4f47584917c9a0bf7d59515f9403fd72"
    },
    {
      "clubSlug": "man-utd",
      "teamId": 33,
      "cacheRowHash": "51cca4ba9381aa027a7aa6baa3499d9d"
    }
  ],
  "candidateSets": [
    {
      "clubSlug": "atletico-de-madrid",
      "autoCandidates": [
        {
          "playerId": "cmt9arkg7008e2kuc2a811psz",
          "providerId": 31
        },
        {
          "playerId": "cmt9bacqu00mzukuc7y0erx6h",
          "providerId": 50
        },
        {
          "playerId": "cmt9bv23u01vkukucj8lrgvke",
          "providerId": 2465
        },
        {
          "playerId": "cmt9an7zb000y2kucsljjn6aa",
          "providerId": 30399
        },
        {
          "playerId": "cmt9arwxc00982kuckozy1ygg",
          "providerId": 47301
        },
        {
          "playerId": "cmta73wsq00dy6wucseot6cxy",
          "providerId": 295793
        },
        {
          "playerId": "cmt9bau5800o4ukuc9zdxgwfl",
          "providerId": 323935
        },
        {
          "playerId": "cmt9b14xe004uukuc1fx69no0",
          "providerId": 336594
        }
      ]
    },
    {
      "clubSlug": "arsenal",
      "autoCandidates": [
        {
          "playerId": "cmt9b35fh009hukucc7mekzvo",
          "providerId": 978
        },
        {
          "playerId": "cmt998wa000b7t4uc5spadhr2",
          "providerId": 18979
        },
        {
          "playerId": "cmt9aosr600412kuchk4k7dco",
          "providerId": 19586
        },
        {
          "playerId": "cmt99r1ea00b2ugucdlymztfb",
          "providerId": 47311
        },
        {
          "playerId": "cmt9aol30003i2kuckowkr7f7",
          "providerId": 47315
        },
        {
          "playerId": "cmt9aq638006h2kuckjthllnw",
          "providerId": 127817
        },
        {
          "playerId": "cmt9bkc2b018fukuca9mb9ffn",
          "providerId": 136723
        },
        {
          "playerId": "cmt9c86s302nmukucqldy60bg",
          "providerId": 157052
        },
        {
          "playerId": "cmt9c7fzl02lrukuce1iqc1wg",
          "providerId": 313245
        },
        {
          "playerId": "cmt9d3hli04lbukuc1gzemfco",
          "providerId": 333682
        }
      ]
    },
    {
      "clubSlug": "chelsea",
      "autoCandidates": [
        {
          "playerId": "cmt9bkyjm019wukucbsji8ztj",
          "providerId": 1864
        },
        {
          "playerId": "cmt9c5yz702i8ukucdd53h1ao",
          "providerId": 18959
        },
        {
          "playerId": "cmt9c248302a3ukuc618suqs7",
          "providerId": 22094
        },
        {
          "playerId": "cmt9bnyhh01g1ukuclb73le3y",
          "providerId": 152953
        },
        {
          "playerId": "cmt9bxstk020cukuco6b84soe",
          "providerId": 161907
        },
        {
          "playerId": "cmt9cdwtw02z2ukucb07a29qq",
          "providerId": 282125
        },
        {
          "playerId": "cmt9cjza003ciukuc6hadx9rv",
          "providerId": 286894
        },
        {
          "playerId": "cmt9cf5970322ukucxyk4q74c",
          "providerId": 341642
        },
        {
          "playerId": "cmtad7tof03hr9guclmwsfc81",
          "providerId": 366735
        },
        {
          "playerId": "cmt9chuza037aukuchimf223u",
          "providerId": 425733
        }
      ]
    },
    {
      "clubSlug": "liverpool",
      "autoCandidates": [
        {
          "playerId": "cmt99q624009nuguci2t8abm6",
          "providerId": 1096
        },
        {
          "playerId": "cmt9by48t0217ukucgea00gsy",
          "providerId": 8500
        },
        {
          "playerId": "cmt99myn10032ugucbwfv2pvd",
          "providerId": 24760
        },
        {
          "playerId": "cmt9ao4tr002g2kucmmt09nl7",
          "providerId": 152654
        },
        {
          "playerId": "cmt9b0m8t003nukuc10emztre",
          "providerId": 206254
        },
        {
          "playerId": "cmtaowqgo06mvtwucx3ncwb74",
          "providerId": 397997
        },
        {
          "playerId": "cmtaj75cm01iwq0uc30grxuaw",
          "providerId": 452685
        }
      ]
    },
    {
      "clubSlug": "man-utd",
      "autoCandidates": [
        {
          "playerId": "cmt9br82y01noukucy75y3b2m",
          "providerId": 886
        },
        {
          "playerId": "cmt9bxeyt01zbukucphueqljf",
          "providerId": 891
        },
        {
          "playerId": "cmt9bpuja01kqukuc1m11io9u",
          "providerId": 2935
        },
        {
          "playerId": "cmt9cutpp040nukuc6jy9h1ag",
          "providerId": 19220
        },
        {
          "playerId": "cmt9cwftj0453ukucffs03bm3",
          "providerId": 70100
        },
        {
          "playerId": "cmt9bks1t019hukuc10bzsbhc",
          "providerId": 115589
        },
        {
          "playerId": "cmt9cj3an03acukuc2py8ot2b",
          "providerId": 162511
        },
        {
          "playerId": "cmt9co4cj03lzukucwyp2qtq0",
          "providerId": 284322
        },
        {
          "playerId": "cmt9fshtr02p81sucqmquglwb",
          "providerId": 382452
        },
        {
          "playerId": "cmtafkcvu09449gucgk8ggqev",
          "providerId": 402329
        }
      ]
    }
  ]
} satisfies MultiClubPreflightPins)
export const firstMultiClubBatchPolicy = (): MultiClubBatchPolicy => structuredClone(FIRST_MULTI_CLUB_BATCH) as MultiClubBatchPolicy
export const firstMultiClubPreflightPins = (): MultiClubPreflightPins => structuredClone(pins) as unknown as MultiClubPreflightPins
