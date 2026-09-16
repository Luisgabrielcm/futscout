# Visual revision — Lote 1

## Scope and data boundaries

This frontend batch is independent of the pending Current Club Model V2 migration.
No schema, operational provider, identity matcher, sync or persistence changes.

- A shared pagination component preserves caller-generated query strings. An
  out-of-range page consistently offers a link back to page one.
- Shared primary/secondary button classes retain action versus navigation semantics.
- Countries search runs locally over the existing aggregate, intersects the selected
  alphabet range, and matches localized/canonical names without case or accents.
  Top ten uses descending player count, then ascending slug for deterministic ties.
- Browser smoke reproduced a hydration mismatch for Hong Kong because server and
  browser ICU versions produced different labels. Country translations now use a
  shared snapshot of the existing server labels for supported ISO codes; country
  sorting uses normalized code-point order, not runtime-dependent ICU collation.
- Cards retain nullable potential/form/value, render existing EA alternate positions
  and label nationality honestly. English position labels do not change query values.
  The bounded favorites/comparison read also selects these existing fields and the
  club image, so the reduced selection DTO does not lose the same card context.

## Asset audit

`Club.imageUrl` already flows through the catalog query and player mapper. Cards
previously discarded it; they now pass it to the same image validation/fallback used
by headers. Player artwork (`player-shields`, `player-portraits`, `players`, `portraits`)
is not a club badge. A rejected or failed URL must keep a neutral initial.

The application uses native image elements, not a Next Image remote proxy; adding
`remotePatterns` would not repair these images. No new CSP/domain configuration is
required by this batch. Supplied URLs can still fail at the remote origin or browser.
No external asset was downloaded, synthesized or derived from an ID.

There is no league logo field in the existing Prisma League/public query, and no
local club/league artwork collection. League cards/pages therefore show the name,
not a fake initial logo. `LeagueLogo` accepts future supplied, validated artwork and
disappears on error. It rejects player/club artwork. Public lineup fixture DTOs carry
team and competition names/IDs, not logo URLs: this batch does not mine raw roster
caches or make network requests to fill that gap. A separately approved source and
its usage rights are needed before expanding coverage.

## Career and transfer boundaries

The public Player DTO does not expose verified salary, contract, shirt, represented
national team or an approved current real-world club. The existing catalog club is
explicitly identified as EA FC catalog context, not silently promoted to real club.
Missing career values remain `—`; absent salary is omitted from compact cards.

`PlayerCareerData` is a presentation-only preparation contract. Its optional data
is NOT wired to a new database reader in this batch. Salary requires provenance,
currency and an explicit weekly/annual period, and is never derived from market
value or transfer fee. The nationality field never establishes national-team status.

Persisted transfer observations are operational evidence, not yet a public timeline
contract: publication still needs a separately reviewed read adapter with freshness,
duplicate/revision handling and approved identity semantics. `PlayerCareer` can render
a supplied timeline, preserving raw fee/type separately; live profiles show the
unavailable state. Neither observations nor proposals establish an approved club.
No V2 table is queried by these components. International caps/history remain future
work until a verified public data contract is available.

## Verification

Tests use synthetic fixtures, real presentation modules and fake operational
dependencies. They cover nullable values, alternate positions, provenance/missing
salary, source isolation, countries search/buckets/top-ten, pagination query state,
semantic actions, localization and responsive layout contracts. Browser smoke must
also check real route rendering at desktop/tablet/390px; no operational sync/API or
database write is part of this verification.

### Final gates — 2026-09-16

- `npm test -- --test-concurrency=1`: 1,301 tests; 1,293 passed, zero failed,
  eight existing SSR 404 skips. Seventeen tests were added in this batch.
- TypeScript, lint (zero warnings), production build, Prisma schema validation
  and `git diff --check`: passed. Build/validation used non-production placeholders.
- The sandbox's existing `uv_os_get_passwd` ENOMEM prevented the test launcher;
  the approved normal-shell run passed without patches or dependency changes.
- Browser smoke covered Home, player grid/search/profile, nationalities, Manchester
  City and Premier League in PT/EN, at desktop, tablet and 390px. Query-preserving
  pagination, 44px pagination targets, keyboard focus, search/range intersection,
  reset and empty states were checked. No global horizontal overflow was observed.
- Final production retest confirmed the country hydration fix (no new console
  errors), mobile filter gaps and two-column career fields. Existing player photos
  remained functional; unavailable club/league artwork retained honest fallbacks.
- Live route rendering used existing read-only catalog queries. A connection
  diagnostic used an explicit READ ONLY transaction. No operational API, database
  write, migration, identity matching or sync was performed. The existing driver
  SSL warning was not addressed by changing connection settings.
