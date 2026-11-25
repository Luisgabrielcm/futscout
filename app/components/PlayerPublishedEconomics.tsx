import { connection } from "next/server"
import { canReadRealEconomics } from "../../lib/realEconomicReadGate"
import { visualText } from "../../lib/i18n/visualRevision"
import { publicClause, publicContractUntil, publicEconomicOverlay } from "../../lib/publicEconomicOverlay"
import { researchWage } from "../../lib/researchEconomic"
import { wagePresentation } from "../../lib/wagePublication"
import { manualWage, readManualEconomics } from "../../services/adminEconomic.server"
import { readResearchEconomics } from "../../services/researchEconomicRead.server"

export default async function PlayerPublishedEconomics({ playerId, eaId, locale }: {
  playerId: string; eaId?: string | null; locale: "pt" | "en"
}) {
  if (!canReadRealEconomics(eaId, globalThis.process?.env ?? {})) return null
  await connection()
  const [manualRows, researchRows] = await Promise.all([readManualEconomics([playerId]), readResearchEconomics([playerId])])
  const manual = manualRows.get(playerId), research = researchRows.get(playerId)
  const economic = publicEconomicOverlay(manual, research)
  const selectedWage = manualWage(playerId, manual) ?? researchWage(playerId, research)
  const wage = wagePresentation(selectedWage, playerId, locale)
  return <section className="profileSection" data-real-economics="published">
    <h2>{locale === "pt" ? "Salário e contrato" : "Salary and contract"}</h2>
    <dl className="careerFields">
      <div><dt>{wage?.title ?? visualText(locale, "weeklySalary")}</dt><dd>{wage?.value ?? "—"}
        {wage && <small className="mutedText" style={{ display: "block" }}>{wage.label} · {wage.detail}</small>}
        {selectedWage?.sourceUrl && <a href={selectedWage.sourceUrl} target="_blank" rel="noopener noreferrer">{locale === "pt" ? "Fonte" : "Source"}</a>}
      </dd></div>
      <div><dt>{visualText(locale, "contractUntil")}</dt><dd>{publicContractUntil(economic, locale)}</dd></div>
      <div><dt>{visualText(locale, "releaseClause")}</dt><dd>{publicClause(economic, locale)}
        {economic.clause?.status === "YES" && economic.clause.conditions &&
          <small className="mutedText releaseClauseConditions" style={{ display: "block" }}>{economic.clause.conditions}</small>}
      </dd></div>
    </dl>
  </section>
}
