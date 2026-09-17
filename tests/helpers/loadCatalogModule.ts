import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import * as jsxRuntime from "react/jsx-runtime"
import * as i18n from "../../lib/i18n"
import * as i18nConfig from "../../lib/i18n/config"
import * as i18nMetadata from "../../lib/i18n/metadata"
import * as i18nPresentation from "../../lib/i18n/presentation"
import * as i18nServer from "../../lib/i18n/server"
import * as i18nBrowser from "../../lib/i18n/browser"
import * as clubExperience from "../../lib/i18n/clubExperience"
import * as connectedNavigation from "../../lib/connectedNavigation"
import * as clubRating from "../../lib/clubRating"
import * as catalogParams from "../../lib/playerCatalogParams"
import * as countries from "../../lib/i18n/countries"
import * as profileText from "../../lib/i18n/playerProfile"
import * as playStyleAssets from "../../lib/playStyleAssets"
import * as clubPitchLayout from "../../lib/clubPitchLayout"
import * as playerProfilePositions from "../../lib/playerProfilePositions"
import * as visualRevision from "../../lib/i18n/visualRevision"
import * as playerHistory from "../../lib/i18n/playerHistory"
import * as playerExperience from "../../lib/i18n/playerExperience"
import * as nationalityDirectory from "../../lib/nationalityDirectory"
import * as careerPresentation from "../../lib/playerCareerPresentation"
import * as visualAssets from "../../lib/visualAssets"
import * as assetPipeline from "../../lib/assetPipeline"
import * as countryFlags from "../../lib/countryFlags"
import * as React from "react"
import { createElement, type ReactNode } from "react"

// Compile TSX in memory using React's automatic runtime, without starting Next.
// Every runtime dependency must be supplied explicitly: no DB/env/network imports.
export function loadCatalogModule<T>(path: string, dependencies: Record<string, unknown>): T {
  const fileName = resolve(path)
  const { outputText } = ts.transpileModule(readFileSync(fileName, "utf8"), {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const compiledModule = { exports: {} }
  const allowed: Record<string, unknown> = { "react/jsx-runtime": jsxRuntime, ...dependencies }
  const requireFake = (name: string): unknown => {
    // Shared presentation functions run for real. This explicit allowlist has
    // no DB/env loading/network modules; operational dependencies remain fakes.
    const presentation: Record<string, unknown> = {
      "lib/i18n": i18n, "lib/i18n/config": i18nConfig,
      "lib/i18n/metadata": i18nMetadata, "lib/i18n/presentation": i18nPresentation,
      "lib/i18n/server": i18nServer,
      "lib/i18n/browser": i18nBrowser,
      "lib/i18n/clubExperience": clubExperience,
      "lib/connectedNavigation": connectedNavigation,
      "lib/clubRating": clubRating,
      "lib/playerCatalogParams": catalogParams,
      "lib/i18n/countries": countries,
      "lib/i18n/playerProfile": profileText,
      "lib/playStyleAssets": playStyleAssets,
      "lib/clubPitchLayout": clubPitchLayout,
      "lib/playerProfilePositions": playerProfilePositions,
      "lib/i18n/visualRevision": visualRevision,
      "lib/i18n/playerHistory": playerHistory,
      "lib/i18n/playerExperience": playerExperience,
      "lib/nationalityDirectory": nationalityDirectory,
      "lib/playerCareerPresentation": careerPresentation,
      "lib/visualAssets": visualAssets,
      "lib/assetPipeline": assetPipeline,
      "lib/countryFlags": countryFlags,
    }
    const pureName = name.replace(/^(?:\.\.\/)+/, "")
    if (Object.hasOwn(presentation, pureName)) return presentation[pureName]
    // Shared UI runs for real, with a strict finite list, never services.
    const component = name.split("/").at(-1)
    if (!Object.hasOwn(allowed, name) && component && ["PlayerImage", "CountryFlag", "CatalogPagination", "NationalityDirectory", "PlayerCareer", "PlayerHistory", "PlayerCurrentStatistics", "PlayerExperienceNav", "LeagueLogo", "ClubLogo", "ClubBadge"].includes(component)) {
      return loadCatalogModule(`app/components/${component}.tsx`, { react: React })
    }
    if (name === "next/link" && !Object.hasOwn(allowed, name)) return function TestLink({ children, href, ...props }: { children: ReactNode; href: string; prefetch?: boolean }) {
      const attributes = { ...props }
      delete attributes.prefetch
      return createElement("a", { ...attributes, href }, children)
    }
    if (!Object.hasOwn(allowed, name)) throw new Error("Unmocked dependency: " + name)
    return allowed[name]
  }
  runInNewContext(outputText, {
    module: compiledModule, exports: compiledModule.exports, require: requireFake,
  }, { timeout: 5000 })
  return compiledModule.exports as T
}
