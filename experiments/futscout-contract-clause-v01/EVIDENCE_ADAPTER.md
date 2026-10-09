# Offline evidence adapter v0.1

Scope: only the two frozen JSON artifacts in
`audit/output/contract-evidence-pilot-20261008`. No new research, source scraping,
database access, provider calls or changes to the original experimental contract.

`adaptPilot(selectionBytes, evidenceBytes)` pins both file SHA-256 values before
parsing, checks IDs/order/uniqueness and returns twelve deterministic review drafts.
`adaptEvidence` is the pure typed record converter used by tests; do not use it to
bypass the pinned-input gate. Source narratives/qualifiers stay in audit provenance,
not production metadata. No assertion of commercial reuse rights.

## Gaps and boundaries

- The frozen selection contains club names, NOT club IDs. No fuzzy club lookup or
  ID invention. `clubId=null` until independently proven mapping is authorized.
- `reviewRecordedAt` is the prior report's recording time, NOT an individual source
  observation instant. `observedAt=null`; no ambient clock or publication-date fallback.
- Explicit contract season, signedAt and providerEffectiveAt are not generally
  established; kept null. Source as-of dates and season qualifiers stay in provenance.
- The output uses ContractInput concepts but is deliberately a **ContractDraft**,
  not a complete validated ContractInput. The existing strict gate rejects it.
- Evidence classification is independent from identity confidence: an official page
  does not automatically establish a HIGH identity match. All identities await review.
- DAY/MONTH/YEAR strings preserved. Duration and seasonal end text never create dates.
  Source dates after the frozen review are rejected; future expiry is legitimate.
- Vanaken: PROVISIONAL. Almirón: 2027 guaranteed, 2028 option, holder unknown.
- Salah: terminated selected-club context. Gulácsi/Knoche/Morante: source club differs.
  Knoche's old-club INACTIVE status is not applied to his new club. Four club reviews.
- Wiemberg: an additional conflicting-report warning, not a fifth club mismatch.
- Yamal's 2023 clause remains historical audit evidence; every current clause UNKNOWN.
- Four direct official expiry drafts without documented conflict are eligible for
  **manual evidence review only**: Yamal, Kane, Lauenborg, Almirón. Morante has an
  official expiry but a club conflict; Vanaken remains provisional. Nothing is eligible
  for persistence, publication or automatic current selection.

## Reproduction

`node node_modules/tsx/dist/cli.mjs --test experiments/futscout-contract-clause-v01/contract.test.ts experiments/futscout-contract-clause-v01/evidence-adapter.test.ts`

Tests load only the frozen local artifacts and print summary plus deterministic
artifactHash. Repeated conversion returns identical output, with no writes or new
observations. Canonical output hashes are namespaced to the adapter, not substituted
for any historical economic hash. No persisted output/current is created.

Next step: independently review identity/club mappings and establish source-specific
observation timing, temporal context and applicable reuse rights. Do not repair old
evidence by inventing timestamps; a future authorized observation must be identified
as new. No migration or production integration is justified by this adapter alone.
