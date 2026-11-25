import type { LoanPresentation } from "../../lib/jointTransferLoanSync"

const styles = `
.loan-context{border:1px solid #344b3d;border-radius:14px;padding:20px;background:#142219;color:#eee9d8;min-width:0;overflow-wrap:anywhere}
.loan-context *{box-sizing:border-box}.loan-context h3{font-size:22px;line-height:1.25;margin:6px 0 12px}.loan-context .loan-context-kicker{font-size:12px;color:#b5c8bb;margin:0}
.loan-context .loan-context-club{font-size:18px;font-weight:650;margin:8px 0}.loan-context .loan-context-badge{display:inline-block;color:#adf0bd;background:#253c2c;border:1px solid #41634c;border-radius:7px;padding:6px 10px;font-size:13px;margin:0 0 10px}
.loan-context .loan-context-dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;margin:18px 0}.loan-context .loan-context-dl>div{min-width:0}.loan-context dt{font-size:12px;color:#b4c5b8}.loan-context dd{margin:3px 0 0;font-size:14px}
.loan-context .loan-context-note{font-size:12px;color:#c3c7b5;margin:12px 0 0}.loan-context .loan-context-national{font-size:13px;margin:8px 0;color:#c3dacb}.loan-context a{color:#a7e6b8;text-decoration:underline}.loan-context a:focus-visible{outline:2px solid #b5f3c6;outline-offset:3px}
@media(max-width:640px){.loan-context{padding:16px}.loan-context h3{font-size:20px}.loan-context .loan-context-dl{grid-template-columns:1fr;gap:12px}.loan-context .loan-context-badge{max-width:100%;white-space:normal}}
`
/** Include once in the owning page/layout when this candidate is connected to runtime. */
export function LoanContextStyles() { return <style>{styles}</style> }

export default function PlayerLoanContext({ value, playerName, variant = "profile", locale = "pt", showPlayerName = true }: {
  value: LoanPresentation; playerName: string; variant?: "card" | "profile"; locale?: "pt" | "en"; showPlayerName?: boolean
}) {
  const pt = locale === "pt"
  const shownDate = (date: string | null) => date ? pt ? date.split("-").reverse().join("/") : date : pt ? "Não informada" : "Not documented"
  const employmentOnly = value.realFreeAgent || value.context === "REAL" && ["FREE_AGENT", "RETIRED"].includes(value.clubState)
  const status = employmentOnly ? value.clubState === "RETIRED" ? pt ? "Aposentadoria confirmada" : "Retirement confirmed"
    : pt ? "Jogador sem clube" : "Player without a club"
    : value.loanStatus === "ACTIVE_IN_SNAPSHOT" ? pt ? "Emprestado neste snapshot" : "On loan in this snapshot"
    : value.loanStatus === "ACTIVE" ? pt ? "Empréstimo ativo" : "Active loan"
    : value.loanStatus === "PENDING_VERIFICATION" ? pt ? "Situação atual em verificação" : "Current status under review"
    : value.loanStatus === "RETURN_CONFIRMED" ? pt ? "Retorno confirmado" : "Return confirmed"
    : value.loanStatus === "PERMANENT_CONFIRMED" ? pt ? "Compra definitiva confirmada" : "Permanent purchase confirmed"
    : value.loanStatus === "ENDED_CONFIRMED" ? pt ? "Empréstimo encerrado" : "Loan ended"
    : pt ? "Sem empréstimo documentado neste contexto" : "No loan documented in this context"
  const purchase = value.purchase?.kind
  const terms = purchase === "OPTION" ? pt ? "Opção de compra documentada" : "Purchase option documented"
    : purchase === "OBLIGATION" ? pt ? "Obrigação de compra documentada" : "Purchase obligation documented"
    : purchase === "CONDITIONAL_OBLIGATION" ? pt ? "Obrigação de compra condicionada" : "Conditional purchase obligation"
    : purchase === "NONE_CONFIRMED" ? pt ? "Ausência de cláusula confirmada" : "Absence of purchase terms confirmed"
    : pt ? "Não documentada" : "Not documented"
  const clubLabel = value.realFreeAgent ? pt ? "Jogador sem clube" : "Player without a club"
    : locale === "en" && value.clubState !== "CLUB" ? { FREE_AGENT: "Free agent", RETIRED: "Retired", UNKNOWN: "Unknown club", NOT_IN_SQUAD: "Not found in this squad" }[value.clubState] : value.clubLabel
  return <section className="loan-context" aria-label={`${playerName} — ${value.displayContext}`}>
    <p className="loan-context-kicker">{value.displayContext === "FUTSCOUT_PROJECTED" ? pt ? "Elenco projetado FutScout" : "FutScout projected roster"
      : value.context === "REAL" ? pt ? "Vida real" : "Real life" : "EA FC 27"}</p>
    {showPlayerName && <h3>{playerName}</h3>}
    <p className="loan-context-club">{clubLabel}</p>
    {value.loanBadge && value.parentClub && <p className="loan-context-badge">{pt ? "Emprestado pelo" : "On loan from"} {value.parentClub.name}</p>}
    {value.nationalTeams.length > 0 && <p className="loan-context-national">{pt ? "Seleção no squad:" : "National team in squad:"} {value.nationalTeams.map(t => t.name).join(", ")}</p>}
    {variant === "profile" && <>
      <dl className="loan-context-dl">
        <div><dt>{pt ? "Clube atual neste contexto" : "Current club in this context"}</dt><dd>{clubLabel}</dd></div>
        {!employmentOnly && <div><dt>{pt ? "Origem do empréstimo documentado" : "Documented loan parent"}</dt><dd>{value.loanParties?.parentClub.name ?? (pt ? "Não documentada" : "Not documented")}</dd></div>}
        <div><dt>Status</dt><dd>{status}</dd></div>
        {!employmentOnly && <><div><dt>{pt ? "Início do empréstimo" : "Loan start"}</dt><dd>{shownDate(value.loanDates?.startsAt ?? null)}</dd></div>
        <div><dt>{pt ? "Término do empréstimo" : "Loan end"}</dt><dd>{value.loanDates?.endsAt ? shownDate(value.loanDates.endsAt)
          : value.loanDates?.endSeason ? `${pt ? "Temporada" : "Season"} ${value.loanDates.endSeason} — ${pt ? "data exata não confirmada" : "exact date unconfirmed"}` : shownDate(null)}</dd></div>
        <div><dt>{pt ? "Compra definitiva" : "Permanent purchase"}</dt><dd>{terms}{value.purchase?.condition && ` — ${value.purchase.condition}`}</dd></div></>}
      </dl>
      {value.mainContractClub && <p className="loan-context-note">{pt ? "O vínculo principal pertence ao clube de origem na evidência consultada. As datas do empréstimo não representam o término desse contrato." : "The main registration belongs to the parent club in the consulted evidence. Loan dates do not establish the end of that contract."}</p>}
      {purchase === "OBLIGATION" && !value.purchase?.condition && <p className="loan-context-note">{pt ? "Condições de acionamento da compra não confirmadas nesta evidência." : "Purchase trigger conditions are not confirmed in this evidence."}</p>}
      {value.evidence && <p className="loan-context-note"><a href={value.evidence.url} target="_blank" rel="noreferrer">{pt ? "Fonte" : "Source"}</a>{" · "}{pt ? "Evidência:" : "Evidence:"} {shownDate(value.evidence.evidenceDate)}{" · "}{pt ? "Consulta:" : "Consulted:"} {shownDate(value.evidence.consultedAt.slice(0, 10))}
        {value.evidence.snapshot && <>{" · "}{pt ? "Elenco:" : "Roster:"} {value.evidence.snapshot.version}{value.evidence.snapshot.effectiveAt === null ? pt ? " — data efetiva não comprovada" : " — effective date unconfirmed" : null}</>}</p>}
    </>}
    {value.loanStatus === "PENDING_VERIFICATION" && <p className="loan-context-note">{pt ? "Nenhum retorno ou compra foi presumido. O último clube conhecido foi preservado." : "No return or purchase was inferred. The last known club was preserved."}</p>}
    {value.displayContext === "FUTSCOUT_PROJECTED" && <p className="loan-context-note">{pt ? "Projeção FutScout; não corresponde a um squad oficial." : "FutScout projection; not an official squad."}</p>}
  </section>
}
