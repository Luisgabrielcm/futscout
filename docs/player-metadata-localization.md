# Lote 7.1A — metadata localization

## Reproduction and deployment boundary

The reported URL was https://futscout.vercel.app/pt/jogadores/marc-andre-ter-stegen,
the production application, not the immutable Preview for beta-next.
The observed production page displayed Germany in header and quick profile,
English PlayStyles and the old goalkeeper layout. The master source prints
the canonical nationality directly in CountryFlag and PlayerQuickProfile.
In contrast, beta-next at bdf345a already passes the route locale to the shared
displayNationality helper and rendered Alemanha in both places locally.
This is a version/environment discrepancy, not a demonstrated pt/pt-BR or
mapper regression in beta-next. Production must not be updated by this task.

## Real remaining paths corrected

- PlayerCard and the older PlayerOverview printed persisted form directly.
- SquadList had its own form translations in the club dictionary.
- LeagueCard and the league detail page filtered absent countries but then
  printed the remaining canonical text without localization.

All form presentation now uses displayForm; the redundant club translations
were removed. Known values: Péssima / Very poor, Ruim / Poor, Normal / Normal,
Boa / Good, Excelente / Excellent. Null stays null before each surface's
existing empty-state rendering; unknown source text is preserved, not inferred.
The mapper, DTO and persisted values are unchanged.

League country text now uses the existing displayNationality helper after
the existing placeholder filter. No database filters, aliases, slugs, flag
identities or canonical PlayStyle keys changed.

## Public-surface audit

Header -> CountryFlag -> displayNationality; quick profile and PlayerInfo use
the helper directly. Country list/detail/metadata use its countryName re-export.
Club/country squads use CountryFlag. League cards/detail now use the same helper.
PlayerCard, FavoritesView and comparison have no nationality text to translate;
favorites reuse PlayerCard for form. Home, player search and directory lists
also reuse PlayerCard. Free-text search/chips retain user input and are not
silently rewritten into a different query. PlayStyles were rechecked without
changing their existing presentation/Plus/filter contract.

## Actual country coverage

The existing audit fixture contains 153 recognized unambiguous identities.
Programmatic tests verify nonempty PT/EN names, repeated-call determinism,
name/code equivalence and the original local flag. 117 have different PT/EN
display text. 36 have the same CLDR spelling in both languages; these are not
153 distinct translations and are not unknown-country fallbacks:

Argentina; China PR (display China); Portugal; Chile; Senegal; Peru; Venezuela;
Mali; Kosovo; Congo DR (display Congo - Kinshasa); Jamaica; Suriname; Angola;
Montenegro; Israel; Togo; Costa Rica; Curaçao; Haiti; Honduras; Benin; Malta;
Uganda; Madagascar; El Salvador; Montserrat; Burundi; Guatemala; Cuba; Barbados;
Sri Lanka; Gibraltar; Vanuatu; Bangladesh; Andorra; Liechtenstein.

This list is asserted in the Node test environment so a runtime/ICU change
requires review rather than silently changing the coverage claim. Explicit
matrix expectations include Germany, Spain, France, England, Italy,
Netherlands, Norway, Brazil and Japan.

Outside those 153 identities, Northern Ireland -> Irlanda do Norte and Chinese
Taipei -> Taipei Chinesa remain text-only. Congo remains deliberately ambiguous
and unknown names preserve source text. Display labels never supply URL keys:
Germany links to /pt/selecoes/de or /en/selecoes/de and uses /flags/de.svg.

No database write, schema/migration, sync, operational API, master merge or
Production deployment is part of this change.
