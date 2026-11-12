import type { ClubContexts } from "../../lib/clubContexts"
import type { Locale } from "../../lib/i18n"

export default function PlayerClubContexts({ contexts, locale = "pt" }: { contexts: ClubContexts; locale?: Locale }) {
  const en = locale === "en"
  const { game, real } = contexts
  const day = (date: string) => new Intl.DateTimeFormat(en ? "en-GB" : "pt-BR", { timeZone: "UTC" }).format(new Date(date))
  const gameName = game.status === "CLUB" ? game.club!.name : game.status === "NG_FA" ? "NG - FA" : en ? "Unknown" : "Não identificado"
  const realName = real?.status === "CLUB" ? real.club!.name : real?.status === "FREE_AGENT" ?
    en ? "Confirmed free agent" : "Agente livre confirmado" : real?.status === "RETIRED" ?
      en ? "Retired" : "Aposentado" : en ? "Not confirmed" : "Não confirmado"
  return <div className="playerClubContexts" style={{ display: "grid", gap: "0.75rem", marginBlock: "0.75rem" }}>
    <div><span className="catalogContextLabel">{en ? "In game" : "No jogo"} · {game.snapshot.gameVersion}</span>
      <div><strong>{gameName}</strong></div>
      <small>{game.snapshot.approvedForCareer ? en ? "Career reference" : "Referência do modo carreira" :
        en ? "Snapshot under review" : "Snapshot em revisão"} · {game.snapshot.effectiveAt ? day(game.snapshot.effectiveAt) :
          en ? "Roster date unconfirmed" : "Data do elenco não comprovada"}</small>
      <div><small><a href={game.snapshot.sourceUrl} target="_blank" rel="noreferrer">{
        game.snapshot.origin === "THIRD_PARTY_TEMPLATE" ? en ? "Third-party template" : "Template de terceiro" :
        game.snapshot.origin === "EA_RATINGS" ? "EA Ratings" : en ? "Squad file" : "Arquivo de elenco"}</a></small></div>
      {game.status === "NG_FA" && <p>{en ? "This game label does not confirm real free agency." : "Este vínculo no jogo não comprova ausência de contrato real."}</p>}
    </div>
    <div><span className="catalogContextLabel">{en ? "Real-world club" : "Clube na vida real"}</span>
      <div><strong>{realName}</strong></div>
      {real && <small><a href={real.sourceUrl} target="_blank" rel="noreferrer">{en ? "Source" : "Fonte"}</a> · {real.evidenceKind === "CACHED_SOURCE_REVIEW" ? en ? "Evidence reviewed" : "Evidência revisada" : en ? "Observed" : "Consultado"} {day(real.observedAt)}
        {real.effectiveAt && <> · {en ? "Effective" : "Vigência"} {day(real.effectiveAt)}</>}</small>}
    </div>
  </div>
}
