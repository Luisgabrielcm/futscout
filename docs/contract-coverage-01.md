# Contract coverage 01

Base: `origin/beta-next` at `4e92e3d`. No Production access, migration, paid API,
new source registration, permission change or real contract import was performed.
Value and its private bindings are not dependencies of this delivery.

## Evidence and real coverage

The existing pilot documents twelve historical review drafts, four with official
explicit expiry evidence and no documented conflict that are candidates for
manual review. `EVIDENCE_ADAPTER.md` records unresolved club IDs, per-record
observation times, season context, identity approval and reuse rights. The actual
frozen pilot artifacts remain private/unavailable in this checkout. Source
publication dates cannot replace missing observation times. None of the twelve
drafts is promoted or treated as a verified current contract by this change.

**Real contracts newly verified here: 0. New contracts made publicly available:
0.** The historical 16,228-player inventory is not a newly queried denominator.
There is no real before/after coverage claim or assumption that the four review
candidates will all become eligible.

## Concrete implementation

The immutable evidence catalog and existing economic schema accept DAY, MONTH
and YEAR. However, `proposeContractWrite` and its durable proposal/plan check
previously rejected every date short of a full day. Even an explicit, reviewed
official statement of “June 2027” could not reach the existing economic writer.

`proposeContractWriteWithPrecision` now reuses the same registry, immutable
catalog, record-bound review, fingerprint, writer contract and reconciliation.
It accepts real-world explicit MONTH/YEAR dates in a new v0.2 namespace. DAY
evidence retains the exact v0.1 proposal/request namespace, including when passed
through the new entry point, avoiding a new request for unchanged DAY evidence.
The original DAY-only API and its historical hashes remain intact.

| Source fact | Economic storage | Preserved precision |
| --- | --- | --- |
| `2027-06-30` | `2027-06-30` | DAY |
| `2027-06` | `2027-06-01` | MONTH |
| `2027` | `2027-01-01` | YEAR |

The first-day values are **existing schema storage anchors**, never inferred
expiry days. A future public reader must retain precision and display `June 2027`
or `2027`, never the storage-only day. No public date projection is activated.
Unknown dates still abstain, and EA_CAREER is rejected by the new entry point.
No estimated term, seasonal end, duration, option exercise or clause becomes an
expiry date. Clause/option/transfer/termination events remain unsupported by the
expiry bridge, and their evidence remains in the immutable catalog separately.

The existing durable coordinator now compares both storage anchor **and source
precision** against its frozen plan. Reinterpreting a YEAR as an exact DAY fails
before journal creation or dispatch. History-only writes, original consultation
and effective timestamps, identity/provider IDs, source version, catalog evidence
references, reviewed club/season context, uncertainty handling, read-back and
idempotent restart remain enforced. No automatic current selection or retry is
introduced.

## Source and update mechanism

Priority sources remain official club/league/federation contract or renewal
announcements with explicit terms, or a properly licensed feed. Publicly visible
text alone does not establish storage/publication rights, player identity or
current club context. No real source's rights were newly verified or granted here.
SoFIFA and EA FC are not used as contract sources.

The reusable path is: authorized captured evidence → immutable catalog → reviewed
identity/club/season/observation attestation → precision-aware proposal → existing
frozen plan/durable coordinator → existing economic writer/read-back. Existing
source registry operation gates distinguish access/storage/history from
publication/commercial use. Internal preparation does not authorize publication.
The exact original source text/URL, options and rights remain catalog evidence;
the economic state retains its catalog reference and original timestamps.

Automated evidence ingestion can feed this path in bounded batches using the
existing offline planner/checkpoint architecture. There is **no live source
connector or scheduled real synchronization activated** in this delivery. A
future authorized connector must preserve genuine capture evidence, detect
renewal/termination/club conflicts and respect provider budgets and source rights.

## Smallest next action

Review an existing official-expiry candidate on the host retaining the pilot:
independently prove Player/provider and Club mappings, season, genuine original
capture instant and applicable source rights. If original capture evidence cannot
establish those facts, a new separately authorized source observation is needed;
do not repair the old draft by inventing a timestamp or club ID. Retain the source
precision, then exercise the new bridge and durable coordinator on a previously
provisioned isolated target with the existing writer grant. No Value bindings are
needed. Publication additionally needs a precision-aware public projection,
rights and explicit current-selection policy/authorization; staging is not public
coverage.

## Verification

`npm run test:contract` runs all synthetic contract regression tests and is now a
required step of `npm run validate` / CI. Tests cover DAY compatibility,
MONTH/YEAR storage and provenance, original partial dates, exact read-back,
durable restart with one dispatch, precision-divergent plan rejection, unknown
dates, source rights, identity/club/time review, unsupported events and real-world
context. The entire existing contract suite remains included. These are code
regressions, not verification of any real player's expiry or source license.

Validation result: `npm run validate` passed: 2,146 application tests passed,
eight opt-in HTTP tests skipped, 57 Value tests and 123 Contract tests passed;
TypeScript, lint, build and whitespace checks passed. No native database harness
or real source consultation was executed.
