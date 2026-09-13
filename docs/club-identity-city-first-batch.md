# Manchester City: first identity batch (Lote 9, Phase F)

This prepares a future, separately authorized operation. It does not authorize or
execute a real Player/Attempt write. Real Madrid remains read-only; no API fallback.

## Selection

Full-roster matching is unchanged. Review all AUTO_MATCH rows ordered by confidence
descending, official-snapshot presence descending, margin descending, then provider
ID ascending. The ranking helper describes this order; it never chooses a batch.

The explicitly reviewed, frozen allow-list is:

1. Mateo Kovačić: 2291 / `mateo-kovacic` / `cmt9anhja001k2kucpdv04fk1`
2. Marcus Bettinelli: 19012 / `marcus-bettinelli` / `cmtadotx104mn9guckez3gz2b`
3. Joško Gvardiol: 129033 / `josko-gvardiol` / `cmt99ly0z000yugucoh1d254u`
4. Rico Lewis: 284230 / `rico-lewis` / `cmt9cy082047vukucfkwpx5xl`
5. Rayan Aït-Nouri: 21138 / `rayan-ait-nouri` / `cmt9bal8v00nkukucmpm7iiah`

The other five AUTO_MATCH rows stay AUTO_MATCH, with a DEFER action in the write
plan. Reviews/unresolved rows remain excluded. Never replace a failed member with
the sixth-ranked player. A changed candidate set requires another review; any
smaller initial batch needs an explicitly reviewed configuration and fresh envelope.

## Boundaries

- City team 50 / season 2026; 30 provider rows.
- Cache hash: `75d9ee2aba8f38d8a79382b88944f9c2`; expiry checked on every load.
- Snapshot hash: `c2ff883579915265a7338de7073a019b5e8dcc91212d95eff62459f54977acd0`.
- maxAutoWrites remains 5. No default first-five truncation for other callers.
- Summary v1 binds the ordered pending candidates, IDs, slugs, confidence, margin,
  expectedUpdatedAt, cache/snapshot/input hashes, club/season, policy and expiry.
- CLI additionally binds the full immutable batch configuration and current Git HEAD.
- Full roster/catalog evidence is recomputed before each transaction and inside it.
- The existing atomic Player + Attempt transaction is unchanged. A failure stops
  immediately; previous commits remain; indeterminate commits are never retried.
- After audited completion, a fresh envelope can authorize a no-op for the same
  batch. It cannot promote any deferred candidate. Old tokens cannot be reused.

## Read-only preflight

On clean beta-next, after the reviewed commit:

```text
npx tsx scripts/runClubPlayerIdentityPipeline.ts --preflight --club manchester-city --season 2026
```

Save the JSON envelope under ignored `audit/reports/`. Its `head` must match the
current commit. `generatedAt` and `validUntil` provide a maximum 15-minute lifetime,
also capped by cache expiry. An expired envelope needs a new read-only preflight
and separate authorization; never extend it or reuse a Barcelona token.

Future CLI write requires ALL of `--write --club manchester-city --season 2026`,
`--summary-file`, `--confirmation`, and `--expected-head`. This document is not
permission to execute that command. The write path blocks fetch, uses database
cache/snapshot only, and rejects any different batch, branch, HEAD, token or order.

## Validation

Local fake-database tests exercise the real matcher, generic adapter and atomic
transaction with ten eligible rows and the explicit five-member selection.
Dispatcher tests synthesize envelopes without DB/network. Coverage includes success,
no-op, rollback at 1/3/5, lost commit response at 1/3/5, conflict at 4, updatedAt
changes, selection/token mutations, Git gates, and expiry. No real write belongs
to this phase.
