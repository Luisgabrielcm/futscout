# Economic data v1 (not activated)

- State is immutable, content-addressed per player/provider/context/field/version.
- Observation records every successful consultation; a unique requestId prevents accidental replay.
- Current selects an observation of the same player/field using explicit Serializable CAS.
- HIGH/MATCHED identity and explicit provider/context/field authorization are mandatory.
- No provider is authorized by default. The Live Football adapter is NOT a data license.
- No API calls, clocks, ambient credentials, selection heuristic or legacy fallback.
- Missing, explicit null and monetary zero remain distinct. Monetary amounts are exact decimals.
- Observed time is not effective time. Unknown effective time remains null.
- Contract MONTH/YEAR precision uses a first-day storage anchor, not a claim that the source supplied a day.
- WAGE_WEEKLY accepts WEEK only; other source periods require a future explicit conversion adapter.
- Metadata permits only sanitized source/sourceVersion/evidenceRef identifiers, never raw responses or URLs.
- Legacy Player.marketValue/marketCurrency, services, filters and UI remain unchanged.
- PostgreSQL CHECKs/triggers/composite FKs in the migration supplement the Prisma schema.

Unit: `npx tsx --test tests/unit/services/playerEconomicData.test.ts`

Opt-in native test: `npx tsx tests/integration/playerEconomicNative.ts`.
Creates/proves/removes a fresh PostgreSQL 14 loopback cluster; never loads dotenv or a production URL.
