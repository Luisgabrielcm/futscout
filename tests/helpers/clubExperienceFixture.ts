import * as React from "react"
import * as assets from "../../lib/visualAssets"
import * as flags from "../../lib/countryFlags"
import { formatCurrency } from "../../utils/formatCurrency"
import { loadCatalogModule } from "./loadCatalogModule"

export const { default: Image } = loadCatalogModule<typeof import("../../app/components/PlayerImage")>("app/components/PlayerImage.tsx", { react: React, "../../lib/visualAssets": assets })
export const { default: Flag } = loadCatalogModule<typeof import("../../app/components/CountryFlag")>("app/components/CountryFlag.tsx", { "../../lib/countryFlags": flags, "./PlayerImage": Image })
export const clubComponents = loadCatalogModule<typeof import("../../app/components/ClubExperience")>("app/components/ClubExperience.tsx", {
  "./PlayerImage": Image, "./CountryFlag": Flag, "../../utils/formatCurrency": { formatCurrency },
})
