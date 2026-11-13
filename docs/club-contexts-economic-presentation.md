# ECONOMIC_PRESENTATION_CHANGED: CSS readiness race

## Exact cause

The removed candidate `dpl_Eh1hZxW9pDBtxN3NyLgNiPQ82yCU` failed on the
first page, Gustavo Gómez / EA. The smoke loop starts with EA ID 218191 and
stopped before recording its first successful check. Its receipt contains:

- actual hash: `314e527c76efe206c88d3b50a3d03c8804732e58bf7501857587e9da0075c25f`
- approved hash: `240bb48a5b22bd7992f1acc1362f375c6749e906e0520ad0232fd1170e3d0f78`

The switch from networkidle to document commit and visible elements allowed
capture before stylesheet loading completed. `allInnerTexts()` reads rendered
`innerText`, whose block separators depend on CSS. The selector named economic
also includes OVR and potential cards and the catalog club/league list.

Using only the already approved protected Preview
`dpl_9PYyAKCxTLaxPFQz9WP5mhSHUU8T`, delaying stylesheet requests reproduced
both historical hashes exactly, without changing any DOM field values:

| Selected block | Before stylesheet | With stylesheet |
| --- | --- | --- |
| OVR | `OVR EA78Explorar OVR EA ≥ 78` | `OVR EA\n78\nExplorar OVR EA ≥ 78` |
| Potential | `POTENCIAL—Não informado` | `POTENCIAL\n—\nNão informado` |
| Market value | `—` | `—` |
| Weekly salary | `—` | `—` |
| Contract until | `—` | `—` |
| Release clause | `—` | `—` |

Only line separators in the OVR and potential cards changed. No numeric
potential, wage, contract, clause, market value or monetary formatting changed.
The candidate did not retain its raw text, so the field-level reconstruction is
established by exact reproduction of its hash, the approved screenshot and
the unchanged protected-data receipts, rather than a fabricated candidate capture.

There are no application, reader, mapper or economic-service changes between
the approved Preview source c59a427 and candidate source e059ccf: their diff
contains only operational scripts, documentation and CI. The race was introduced
by validation readiness, not by the Club Contexts reader or a different economic
configuration. The reviewed deployment overrides differ between Preview and
Production, but no environment/value change is needed to explain the exact hashes.

## Minimal correction

`navigateProfile` now waits for the page's stylesheet links to have loaded
stylesheets, within the existing single timeout budget, after the HTTP/status
and visible-profile gates. It then captures content as before. It does not wait
for unrelated requests or change the approved hashes, selectors or economic data.
Missing/failed stylesheets remain a failure; there is no timeout increase.

## Validation

- Local browser regression reproduces the exact failed/approved hashes with
  delayed CSS and checks the corrected capture. A changed salary still produces
  a different hash; missing CSS times out. A pending auxiliary fetch remains open
  without blocking success.
- Existing HTTP 500, missing-context and incomplete-profile negative tests pass.
- Economic-only regression on the existing protected Preview: four approved
  IDs 218191, 225964, 261176, 83924 plus excluded control 116024, EA and Vida real
  (10 pages), all match the approved desktop hashes with delayed CSS. Field text
  and hashes were saved in private local evidence; no new deployment was created.
- The two browser regressions are wired into the existing focused CI job.

The already confirmed four selections and 14 protected hash groups are reused;
no global/database audits are repeated. No database writes, migrations, imports,
deployments, promotions, shared settings or values were changed. Readers remain
off publicly, and `beta-next:false` is unchanged. The fix is ready for PR/CI and
integration before a separately authorized candidate validation.
