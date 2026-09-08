# Local nationality flags

Additional artwork: [flag-icons v7.5.0](https://github.com/lipis/flag-icons/tree/v7.5.0/flags/4x3).
MIT license by Panayiotis Lipiridis, retained in LICENSE.flag-icons.
Only the 147 SVGs referenced by FutScout were copied; no dependency, runtime CDN or script.
SVG content is unchanged. The existing de/fr/gb-eng/it/nl/no SVGs were preserved.
Codes use ISO 3166-1 alpha-2 except GB-ENG/GB-SCT/GB-WLS (constituent countries)
and XK (user-assigned Kosovo). Mapping is explicit in lib/countryFlags.ts.

## Read-only coverage snapshot

2026-09-08: DISTINCT nationality with player counts, PostgreSQL READ ONLY transaction.
156 nationalities, 16,228 players. No personal identifiers or credentials included.
Before: 6 nationalities, 4,702 players (28.97%).
After: 153 nationalities, 16,138 players (99.45%).

Text fallback retained deliberately:
- Northern Ireland (72): no assumption about which sporting/civic flag to use.
- Congo (15): do not infer Republic vs Democratic Republic from the abbreviated name.
- Chinese Taipei (3): do not substitute Taiwan's national flag for the sporting designation.

Other unknown/null values remain text-only. Future nationalities require explicit mapping
and a licensed local asset; missing/broken files retain the readable name.

| Persisted nationality | Players | Local code |
| --- | ---: | --- |
| England | 1411 | GB-ENG |
| Germany | 1122 | DE |
| Argentina | 979 | AR |
| Spain | 843 | ES |
| France | 843 | FR |
| Italy | 531 | IT |
| Holland | 410 | NL |
| Korea Republic | 400 | KR |
| United States | 400 | US |
| Norway | 385 | NO |
| Sweden | 375 | SE |
| Denmark | 364 | DK |
| China PR | 352 | CN |
| Brazil | 343 | BR |
| Republic of Ireland | 339 | IE |
| Poland | 313 | PL |
| Portugal | 302 | PT |
| Belgium | 285 | BE |
| Romania | 273 | RO |
| Saudi Arabia | 270 | SA |
| Austria | 266 | AT |
| Turkey | 259 | TR |
| Australia | 257 | AU |
| Scotland | 254 | GB-SCT |
| Switzerland | 232 | CH |
| Uruguay | 210 | UY |
| India | 206 | IN |
| Colombia | 177 | CO |
| Chile | 154 | CL |
| Croatia | 153 | HR |
| Paraguay | 152 | PY |
| Wales | 139 | GB-WLS |
| Nigeria | 130 | NG |
| Morocco | 121 | MA |
| Senegal | 119 | SN |
| Côte d'Ivoire | 118 | CI |
| Ghana | 116 | GH |
| Ecuador | 107 | EC |
| Serbia | 100 | RS |
| Japan | 99 | JP |
| Peru | 99 | PE |
| Greece | 95 | GR |
| Venezuela | 94 | VE |
| Czech Republic | 88 | CZ |
| Ukraine | 83 | UA |
| Canada | 80 | CA |
| Northern Ireland | 72 | Text fallback |
| Bolivia | 69 | BO |
| Cameroon | 68 | CM |
| Mali | 68 | ML |
| Finland | 63 | FI |
| Kosovo | 61 | XK |
| Albania | 57 | AL |
| Hungary | 54 | HU |
| Algeria | 54 | DZ |
| Iceland | 54 | IS |
| Bosnia and Herzegovina | 54 | BA |
| Slovakia | 52 | SK |
| Slovenia | 51 | SI |
| New Zealand | 51 | NZ |
| Congo DR | 41 | CD |
| Jamaica | 40 | JM |
| Guinea | 37 | GN |
| Gambia | 36 | GM |
| Georgia | 29 | GE |
| Tunisia | 29 | TN |
| Suriname | 29 | SR |
| Cape Verde Islands | 27 | CV |
| Mexico | 27 | MX |
| Burkina Faso | 25 | BF |
| Cyprus | 24 | CY |
| Angola | 22 | AO |
| Guinea-Bissau | 22 | GW |
| Montenegro | 21 | ME |
| Bulgaria | 20 | BG |
| Israel | 18 | IL |
| North Macedonia | 17 | MK |
| Sierra Leone | 16 | SL |
| Togo | 16 | TG |
| Russia | 16 | RU |
| Congo | 15 | Text fallback |
| Iraq | 15 | IQ |
| Luxembourg | 14 | LU |
| Azerbaijan | 14 | AZ |
| South Africa | 14 | ZA |
| Zimbabwe | 14 | ZW |
| Indonesia | 14 | ID |
| Costa Rica | 12 | CR |
| Curaçao | 12 | CW |
| Haiti | 12 | HT |
| Gabon | 11 | GA |
| Comoros | 11 | KM |
| Panama | 11 | PA |
| Kenya | 10 | KE |
| Syria | 10 | SY |
| United Arab Emirates | 10 | AE |
| Honduras | 10 | HN |
| Equatorial Guinea | 9 | GQ |
| Dominican Republic | 9 | DO |
| Egypt | 9 | EG |
| Benin | 9 | BJ |
| Armenia | 9 | AM |
| Zambia | 8 | ZM |
| Latvia | 8 | LV |
| Trinidad and Tobago | 8 | TT |
| Estonia | 7 | EE |
| Grenada | 7 | GD |
| Malta | 7 | MT |
| Hong Kong | 7 | HK |
| Lithuania | 7 | LT |
| Uganda | 7 | UG |
| Iran | 6 | IR |
| Madagascar | 6 | MG |
| Liberia | 6 | LR |
| Mauritania | 6 | MR |
| Guyana | 6 | GY |
| Moldova | 5 | MD |
| Central African Republic | 4 | CF |
| El Salvador | 4 | SV |
| Faroe Islands | 4 | FO |
| Philippines | 4 | PH |
| Uzbekistan | 4 | UZ |
| St. Kitts and Nevis | 4 | KN |
| Antigua and Barbuda | 4 | AG |
| Mozambique | 4 | MZ |
| Montserrat | 3 | MS |
| Tanzania | 3 | TZ |
| St. Lucia | 3 | LC |
| Libya | 3 | LY |
| Burundi | 3 | BI |
| Guatemala | 3 | GT |
| Chinese Taipei | 3 | Text fallback |
| Palestine | 3 | PS |
| Cuba | 2 | CU |
| Belarus | 2 | BY |
| Malaysia | 2 | MY |
| Rwanda | 2 | RW |
| Lebanon | 2 | LB |
| Jordan | 2 | JO |
| Namibia | 1 | NA |
| Pakistan | 1 | PK |
| Bermuda | 1 | BM |
| Barbados | 1 | BB |
| Sri Lanka | 1 | LK |
| Gibraltar | 1 | GI |
| Thailand | 1 | TH |
| Niger | 1 | NE |
| Malawi | 1 | MW |
| Vanuatu | 1 | VU |
| Tajikistan | 1 | TJ |
| Bangladesh | 1 | BD |
| Andorra | 1 | AD |
| Somalia | 1 | SO |
| Chad | 1 | TD |
| Afghanistan | 1 | AF |
| Liechtenstein | 1 | LI |
