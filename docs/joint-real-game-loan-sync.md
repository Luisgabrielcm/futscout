# Joint REAL and FutScout game projection

This supersedes the REAL-first rollout proposed in the previous integration plan. No migration, deployment, Production write or shared configuration change is included. All new reader gates remain off; `beta-next: false` is preserved.

## Approved representation policy

The owner explicitly approved nine rules on 2026-11-16. They are versioned as `futscout-real-game-v1` in `lib/realGameProjection.ts`; the canonical policy hash is checked by preparation and reader rollout. The archived 15 November decision remains valid for **original EA observations**. Its native-evidence requirement is not falsely applied to a FutScout projection and is not silently rewritten.

- Confirmed REAL movement + confirmed player availability + destination eligible for real-player representation: project the destination club.
- Confirmed identity/game availability + destination without a licensed player squad: project FREE_AGENT. Keep the confirmed REAL club and documented loan route. This is a FutScout representation decision, not an observed EA free-agent assignment or real unemployment.
- Partial licensing requires an individual decision, bound to both EA player ID and destination club with evidence. Unknown licensing, ambiguous identity, unknown availability and UT-only evidence go to review. A club badge, kit flag or merely being registered in FutScout is insufficient.
- Preserve national memberships independently of club state, including projected free agents. Do not change `Player.clubId`, principal contracts, salary, value, potential or manual edits.
- Keep original EA squad, FutScout projection and REAL facts separately identifiable. Never invent a date, purchase option/obligation, or official EA loan.

The full owner approval and the exact source/evidence hashes live in the private preparation packet, not the public code repository. The nine approved rules are implementation policy, not a blanket license to republish third-party datasets.

## Three separate representations, one revision

1. `payload.game` and `jointTransfer.game`: immutable source-bound original EA membership and original loan observations.
2. `payload.real` and `jointTransfer.real`: confirmed REAL club, loan parent, route, dates and source.
3. `jointTransfer.futscoutProjection`: policy assessment, original EA hash, exact REAL-source hash, movement evidence, eligibility and projected membership. A source-bound GAME loan is never manufactured by copying REAL evidence.

For Echeverri the candidate has REAL Benfica on loan from City, projected FutScout Benfica on loan from City, and historical EA City without a loan in the consulted native file. The projected loan cites REAL evidence. Principal contract dates are not derived from loan dates.

When policy projects FREE_AGENT, the projected membership has no active GAME loan. The REAL loan route remains separately documented and displayed as such, with the original owner/destination. A projected free agent remains eligible for national rosters and the transfer market. Its origin filter can use the documented owner without claiming an official loan in the original squad.

## Joint preparation and persistence

`prepareJointRealGameSync` evaluates each confirmed REAL event, eligibility and projection together. It reuses the existing loan/squad planners, source hashes and compare-and-swap baseline. Pending/ambiguous IDs are isolated without blocking safe IDs. Real-only publication is not an automatic fallback. The new first rollout contains complete REAL + projected GAME pairs.

New loans, permanent transfers, proven recalls/returns and loan-to-permanent purchases have distinct event types. An expired date triggers verification, never an automatic return. Closing a previously active loan still requires terminal evidence for that exact episode. Rechecking the same facts on another day does not produce an unnecessary new revision.

`prepareJointRealGameCommit` accepts only READY pairs and reuses the existing transaction adapter. One selected immutable revision contains both representations. Each player's REAL and projected GAME change together; a transaction failure cannot expose half a pair. No automatic scheduler, paid provider call, or writer is enabled by preparation. Existing free research/caching/checkpoint logic can supply future confirmed feed updates; no real event mutates the official EA snapshot.

The 614 previously examined native loans remain historical source input. The 3,277 stored club differences remain a reused queue/reference, not 3,277 newly proven real transfers. The 56 unresolved REAL signals are not automatically processed.

## Readers, search and UI

A rollout manifest must explicitly request `gameView: "FUTSCOUT_PROJECTED"` and **both** REAL and GAME for the approved EA ID/payload hash. In addition to the existing default-off joint gate, enable `JOINT_REAL_GAME_PROJECTION_READ_ENABLED=1` and pin `JOINT_REAL_GAME_POLICY_SHA256` to the approved policy. Preview still requires the established pooled READ ONLY runtime. No flag or environment variable is changed by this work.

- Cards and profile GAME views show the projected playing club and loan parent, labeled “Elenco atualizado pelo FutScout”; no official EA update is claimed.
- Profiles expose the original EA snapshot separately as a historical reference. REAL pages retain the confirmed real club and their independent evidence.
- The catalog's Prisma filters/counts and SQL value/potential sorting use the **selected projected membership** when explicitly enabled, before pagination. Current-club and loan-origin filters are independent. Legacy controls outside the rollout keep their presentation and economic values.
- National memberships remain sourced independently from the preserved GAME national links. Free-agent market inclusion uses the selected projection's explicit FREE_AGENT state, without changing REAL employment or original squad membership.

## Gradual activation and rollback

1. Freeze the joint candidate packet, policy approval, evidence, IDs and original source hashes. Perform a fresh targeted READ ONLY preflight before any authorized write; archived timestamps/selection versions are not an operational commit plan.
2. Use an isolated non-Production database containing candidate revisions. Reuse approved infrastructure; do not create services without authorization. Confirm authentication and READ ONLY pooled runtime before a separately authorized Preview deploy.
3. Start with **one complete Echeverri pair**, then 5 complete pairs, then the 10 eligible pairs. Each step validates REAL, projected GAME, original snapshot, cards, profiles, current/origin filters, market/national memberships, economics, desktop and mobile. No REAL-only activation stage remains.
4. Expand using independently evidenced future movements and per-route eligibility. Do not promote all 614 source loans or all 3,277 differences as current transfers. Publishing requires separate operational authorization.
5. Immediate display rollback disables the new projection/joint rollout using the authorized deployment procedure. Data rollback restores each prior complete selection with an applied-hash/version check, preserving immutable evidence, the original snapshot and all economic/manual data. An intervening edit stops rollback.
