import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { test } from "node:test"
import { getCountryFlag } from "../../../lib/countryFlags"
import { displayNationality } from "../../../lib/i18n/countries"

// Nationality names from the read-only coverage audit; no DB dependency.
const expected: [string, string][] = [
  [
    "England",
    "GB-ENG"
  ],
  [
    "Germany",
    "DE"
  ],
  [
    "Argentina",
    "AR"
  ],
  [
    "Spain",
    "ES"
  ],
  [
    "France",
    "FR"
  ],
  [
    "Italy",
    "IT"
  ],
  [
    "Holland",
    "NL"
  ],
  [
    "Korea Republic",
    "KR"
  ],
  [
    "United States",
    "US"
  ],
  [
    "Norway",
    "NO"
  ],
  [
    "Sweden",
    "SE"
  ],
  [
    "Denmark",
    "DK"
  ],
  [
    "China PR",
    "CN"
  ],
  [
    "Brazil",
    "BR"
  ],
  [
    "Republic of Ireland",
    "IE"
  ],
  [
    "Poland",
    "PL"
  ],
  [
    "Portugal",
    "PT"
  ],
  [
    "Belgium",
    "BE"
  ],
  [
    "Romania",
    "RO"
  ],
  [
    "Saudi Arabia",
    "SA"
  ],
  [
    "Austria",
    "AT"
  ],
  [
    "Turkey",
    "TR"
  ],
  [
    "Australia",
    "AU"
  ],
  [
    "Scotland",
    "GB-SCT"
  ],
  [
    "Switzerland",
    "CH"
  ],
  [
    "Uruguay",
    "UY"
  ],
  [
    "India",
    "IN"
  ],
  [
    "Colombia",
    "CO"
  ],
  [
    "Chile",
    "CL"
  ],
  [
    "Croatia",
    "HR"
  ],
  [
    "Paraguay",
    "PY"
  ],
  [
    "Wales",
    "GB-WLS"
  ],
  [
    "Nigeria",
    "NG"
  ],
  [
    "Morocco",
    "MA"
  ],
  [
    "Senegal",
    "SN"
  ],
  [
    "Côte d'Ivoire",
    "CI"
  ],
  [
    "Ghana",
    "GH"
  ],
  [
    "Ecuador",
    "EC"
  ],
  [
    "Serbia",
    "RS"
  ],
  [
    "Japan",
    "JP"
  ],
  [
    "Peru",
    "PE"
  ],
  [
    "Greece",
    "GR"
  ],
  [
    "Venezuela",
    "VE"
  ],
  [
    "Czech Republic",
    "CZ"
  ],
  [
    "Ukraine",
    "UA"
  ],
  [
    "Canada",
    "CA"
  ],
  [
    "Bolivia",
    "BO"
  ],
  [
    "Cameroon",
    "CM"
  ],
  [
    "Mali",
    "ML"
  ],
  [
    "Finland",
    "FI"
  ],
  [
    "Kosovo",
    "XK"
  ],
  [
    "Albania",
    "AL"
  ],
  [
    "Hungary",
    "HU"
  ],
  [
    "Algeria",
    "DZ"
  ],
  [
    "Iceland",
    "IS"
  ],
  [
    "Bosnia and Herzegovina",
    "BA"
  ],
  [
    "Slovakia",
    "SK"
  ],
  [
    "Slovenia",
    "SI"
  ],
  [
    "New Zealand",
    "NZ"
  ],
  [
    "Congo DR",
    "CD"
  ],
  [
    "Jamaica",
    "JM"
  ],
  [
    "Guinea",
    "GN"
  ],
  [
    "Gambia",
    "GM"
  ],
  [
    "Georgia",
    "GE"
  ],
  [
    "Tunisia",
    "TN"
  ],
  [
    "Suriname",
    "SR"
  ],
  [
    "Cape Verde Islands",
    "CV"
  ],
  [
    "Mexico",
    "MX"
  ],
  [
    "Burkina Faso",
    "BF"
  ],
  [
    "Cyprus",
    "CY"
  ],
  [
    "Angola",
    "AO"
  ],
  [
    "Guinea-Bissau",
    "GW"
  ],
  [
    "Montenegro",
    "ME"
  ],
  [
    "Bulgaria",
    "BG"
  ],
  [
    "Israel",
    "IL"
  ],
  [
    "North Macedonia",
    "MK"
  ],
  [
    "Sierra Leone",
    "SL"
  ],
  [
    "Togo",
    "TG"
  ],
  [
    "Russia",
    "RU"
  ],
  [
    "Iraq",
    "IQ"
  ],
  [
    "Luxembourg",
    "LU"
  ],
  [
    "Azerbaijan",
    "AZ"
  ],
  [
    "South Africa",
    "ZA"
  ],
  [
    "Zimbabwe",
    "ZW"
  ],
  [
    "Indonesia",
    "ID"
  ],
  [
    "Costa Rica",
    "CR"
  ],
  [
    "Curaçao",
    "CW"
  ],
  [
    "Haiti",
    "HT"
  ],
  [
    "Gabon",
    "GA"
  ],
  [
    "Comoros",
    "KM"
  ],
  [
    "Panama",
    "PA"
  ],
  [
    "Kenya",
    "KE"
  ],
  [
    "Syria",
    "SY"
  ],
  [
    "United Arab Emirates",
    "AE"
  ],
  [
    "Honduras",
    "HN"
  ],
  [
    "Equatorial Guinea",
    "GQ"
  ],
  [
    "Dominican Republic",
    "DO"
  ],
  [
    "Egypt",
    "EG"
  ],
  [
    "Benin",
    "BJ"
  ],
  [
    "Armenia",
    "AM"
  ],
  [
    "Zambia",
    "ZM"
  ],
  [
    "Latvia",
    "LV"
  ],
  [
    "Trinidad and Tobago",
    "TT"
  ],
  [
    "Estonia",
    "EE"
  ],
  [
    "Grenada",
    "GD"
  ],
  [
    "Malta",
    "MT"
  ],
  [
    "Hong Kong",
    "HK"
  ],
  [
    "Lithuania",
    "LT"
  ],
  [
    "Uganda",
    "UG"
  ],
  [
    "Iran",
    "IR"
  ],
  [
    "Madagascar",
    "MG"
  ],
  [
    "Liberia",
    "LR"
  ],
  [
    "Mauritania",
    "MR"
  ],
  [
    "Guyana",
    "GY"
  ],
  [
    "Moldova",
    "MD"
  ],
  [
    "Central African Republic",
    "CF"
  ],
  [
    "El Salvador",
    "SV"
  ],
  [
    "Faroe Islands",
    "FO"
  ],
  [
    "Philippines",
    "PH"
  ],
  [
    "Uzbekistan",
    "UZ"
  ],
  [
    "St. Kitts and Nevis",
    "KN"
  ],
  [
    "Antigua and Barbuda",
    "AG"
  ],
  [
    "Mozambique",
    "MZ"
  ],
  [
    "Montserrat",
    "MS"
  ],
  [
    "Tanzania",
    "TZ"
  ],
  [
    "St. Lucia",
    "LC"
  ],
  [
    "Libya",
    "LY"
  ],
  [
    "Burundi",
    "BI"
  ],
  [
    "Guatemala",
    "GT"
  ],
  [
    "Palestine",
    "PS"
  ],
  [
    "Cuba",
    "CU"
  ],
  [
    "Belarus",
    "BY"
  ],
  [
    "Malaysia",
    "MY"
  ],
  [
    "Rwanda",
    "RW"
  ],
  [
    "Lebanon",
    "LB"
  ],
  [
    "Jordan",
    "JO"
  ],
  [
    "Namibia",
    "NA"
  ],
  [
    "Pakistan",
    "PK"
  ],
  [
    "Bermuda",
    "BM"
  ],
  [
    "Barbados",
    "BB"
  ],
  [
    "Sri Lanka",
    "LK"
  ],
  [
    "Gibraltar",
    "GI"
  ],
  [
    "Thailand",
    "TH"
  ],
  [
    "Niger",
    "NE"
  ],
  [
    "Malawi",
    "MW"
  ],
  [
    "Vanuatu",
    "VU"
  ],
  [
    "Tajikistan",
    "TJ"
  ],
  [
    "Bangladesh",
    "BD"
  ],
  [
    "Andorra",
    "AD"
  ],
  [
    "Somalia",
    "SO"
  ],
  [
    "Chad",
    "TD"
  ],
  [
    "Afghanistan",
    "AF"
  ],
  [
    "Liechtenstein",
    "LI"
  ]
]

test("all 153 audited unambiguous nationalities map to the expected locally available SVG", () => {
  assert.equal(expected.length, 153)
  for (const [name, code] of expected) {
    const flag = getCountryFlag(name)
    assert.equal(flag?.code, code, name)
    assert.equal(flag?.iconSrc, `/flags/${code.toLowerCase()}.svg`)
    assert.equal(getCountryFlag(code)?.iconSrc, flag?.iconSrc)
    for (const locale of ["pt", "en"] as const) {
      assert.ok(displayNationality(name, locale).trim())
      assert.equal(displayNationality(name, locale), displayNationality(code, locale))
      assert.equal(displayNationality(name, locale), displayNationality(name, locale), `${name}: deterministic ${locale}`)
    }
    const svg = readFileSync(`public${flag!.iconSrc}`, "utf8")
    assert.match(svg, /<svg\b/)
    assert.doesNotMatch(svg, /<script|<foreignObject|\bon\w+=|href=["']https?:/i)
  }
  assert.equal(readdirSync("public/flags").filter((name) => name.endsWith(".svg")).length, 153)
})
test("153 recognized identities include 117 different labels and 36 deliberate shared PT/EN spellings", () => {
  const shared = expected.filter(([name]) => displayNationality(name, "pt") === displayNationality(name, "en")).map(([name]) => name)
  // Same CLDR spelling in both locales is not an untranslated fallback.
  assert.deepEqual(shared, [
    "Argentina", "China PR", "Portugal", "Chile", "Senegal", "Peru", "Venezuela", "Mali", "Kosovo", "Congo DR",
    "Jamaica", "Suriname", "Angola", "Montenegro", "Israel", "Togo", "Costa Rica", "Curaçao", "Haiti", "Honduras",
    "Benin", "Malta", "Uganda", "Madagascar", "El Salvador", "Montserrat", "Burundi", "Guatemala", "Cuba", "Barbados",
    "Sri Lanka", "Gibraltar", "Vanuatu", "Bangladesh", "Andorra", "Liechtenstein",
  ])
  assert.equal(expected.length - shared.length, 117)
})
test("ambiguous nationalities retain text fallback rather than unrelated national flags", () => {
  for (const value of ["Congo", "Northern Ireland", "Chinese Taipei", "Unknown", "GB", "France / Norway", null]) {
    assert.equal(getCountryFlag(value), null)
  }
  assert.equal(getCountryFlag("Congo DR")?.code, "CD")
  assert.equal(getCountryFlag("Scotland")?.code, "GB-SCT")
  assert.equal(getCountryFlag("Wales")?.code, "GB-WLS")
  assert.equal(getCountryFlag("Egito")?.code, "EG")
})
