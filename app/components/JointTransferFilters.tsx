import { playerCatalogQuery, type GetPlayersParams } from "../../lib/playerCatalogParams"
import type { Locale } from "../../lib/i18n"
import { localizedHref } from "../../lib/i18n"

export default function JointTransferFilters({ params, clubs, nations, locale }: { params: GetPlayersParams;
  clubs: { id: string; name: string }[]; nations: { eaTeamId: string; name: string }[]; locale: Locale }) {
  const en = locale === "en"
  const hidden = [...new URLSearchParams(playerCatalogQuery(params))].filter(([k]) => !["page", "membershipContext", "currentClub", "parentClub", "clubState", "nationalTeam"].includes(k))
  return <form method="get" className="directoryFilters" aria-label={en ? "Club and loan context" : "Contexto de clubes e empréstimos"}>
    {hidden.map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
    <label>{en ? "Context" : "Contexto"}<select name="membershipContext" defaultValue={params.membershipContext ?? "GAME"}>
      <option value="GAME">EA FC 27</option><option value="REAL">{en ? "Real life · approved selection" : "Vida real · seleção aprovada"}</option>
    </select></label>
    {(["currentClub", "parentClub"] as const).map(key => <label key={key}>{key === "currentClub" ? en ? "Playing club" : "Clube atual" : en ? "Loan parent" : "Clube de origem do empréstimo"}
      <select name={key} defaultValue={params[key] ?? ""}><option value="">{en ? "All" : "Todos"}</option>{clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    </label>)}
    <label>{en ? "Club status in selected evidence" : "Situação na evidência selecionada"}<select name="clubState" defaultValue={params.clubState ?? ""}>
      <option value="">{en ? "All" : "Todos"}</option><option value="CLUB">{en ? "Club" : "Clube"}</option>
      <option value="FREE_AGENT">{en ? "Free agent" : "Agente livre"}</option><option value="UNKNOWN">{en ? "Unknown" : "Desconhecido"}</option><option value="NOT_IN_SQUAD">{en ? "Not in squad" : "Ausente do squad"}</option>
    </select></label>
    <label>{en ? "National team in squad" : "Seleção no squad"}<select name="nationalTeam" defaultValue={params.nationalTeam ?? ""}>
      <option value="">{en ? "All" : "Todas"}</option>{nations.map(t => <option key={t.eaTeamId} value={t.eaTeamId}>{t.name}</option>)}
    </select></label>
    <button className="uiButton uiButtonPrimary" type="submit">{en ? "Apply" : "Aplicar"}</button>
    <a className="uiButton uiButtonSecondary" href={localizedHref(locale, `/jogadores?${playerCatalogQuery({ ...params, membershipContext: "GAME", clubState: "FREE_AGENT", currentClub: undefined, parentClub: undefined, page: 1 })}`)}>{en ? "Free agents in selected squad" : "Agentes livres no squad selecionado"}</a>
  </form>
}
