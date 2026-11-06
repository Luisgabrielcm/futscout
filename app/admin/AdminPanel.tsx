"use client"
import { useEffect, useState } from "react"
import type { ManualSection } from "../../lib/adminEconomic"

type Match = { id: string; externalId: string; name: string; slug: string }
type Revision = { id: string; section: ManualSection; revision: number; action: string; createdAt: string }
type Player = Match & { sections: Partial<Record<ManualSection, { revision: number; payload: Record<string, unknown> }>>; history: Revision[] }
const csrf = () => document.cookie.split(";").map(x => x.trim()).find(x => x.startsWith("fs_owner_csrf="))?.split("=")[1] ?? ""
const emptySalary = { weeklyEur: "", taxType: "UNKNOWN", composition: "UNKNOWN" }
const emptyContract = { start: "", until: "", renewed: "" }
const emptyClause = { status: "UNKNOWN", amount: "", currency: "EUR", conditions: "", validUntil: "" }

export default function AdminPanel() {
  const [authorized, setAuthorized] = useState(false)
  const [owner, setOwner] = useState("")
  const [password, setPassword] = useState("")
  const [totp, setTotp] = useState("")
  const [query, setQuery] = useState("")
  const [matches, setMatches] = useState<Match[]>([])
  const [player, setPlayer] = useState<Player | null>(null)
  const [salary, setSalary] = useState(emptySalary)
  const [contract, setContract] = useState(emptyContract)
  const [clause, setClause] = useState(emptyClause)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => { void fetch("/admin/api/players", { cache: "no-store" }).then(r => setAuthorized(r.ok)).catch(() => setAuthorized(false)) }, [])
  async function open(id: string) {
    const response = await fetch(`/admin/api/players/${encodeURIComponent(id)}`, { cache: "no-store" })
    if (!response.ok) throw Error("Não foi possível abrir o jogador.")
    const item = (await response.json()).player as Player
    setPlayer(item)
    const s = item.sections.SALARY?.payload
    setSalary({ weeklyEur: String(s?.weeklyEur ?? ""), taxType: String(s?.taxType ?? "UNKNOWN"), composition: String(s?.composition ?? "UNKNOWN") })
    const c = item.sections.CONTRACT?.payload
    setContract({ start: String(c?.start ?? ""), until: String(c?.until ?? ""), renewed: String(c?.renewed ?? "") })
    const cl = item.sections.CLAUSE?.payload
    setClause({ status: String(cl?.status ?? "UNKNOWN"), amount: String(cl?.amount ?? ""), currency: String(cl?.currency ?? "EUR"),
      conditions: String(cl?.conditions ?? ""), validUntil: String(cl?.validUntil ?? "") })
  }
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("")
    try {
      const response = await fetch("/admin/api/login", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner, password, totp }) })
      setPassword(""); setTotp("")
      if (!response.ok) throw Error("Credenciais inválidas ou acesso indisponível.")
      setAuthorized(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha de acesso.") }
    finally { setBusy(false) }
  }
  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("")
    try {
      const response = await fetch(`/admin/api/players?q=${encodeURIComponent(query)}`, { cache: "no-store" })
      if (!response.ok) throw Error("Busca indisponível.")
      setMatches((await response.json()).players as Match[])
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha de busca.") }
    finally { setBusy(false) }
  }
  async function save(section: ManualSection, rollbackTo?: string) {
    if (!player) return
    setBusy(true); setMessage("")
    const payload = section === "SALARY" ? salary : section === "CONTRACT"
      ? { start: contract.start || null, until: contract.until || null, renewed: contract.renewed || null }
      : clause.status === "YES" ? { ...clause, amount: clause.amount || null, currency: clause.amount ? clause.currency : null,
          conditions: clause.conditions || null, validUntil: clause.validUntil || null }
      : { status: clause.status, amount: null, currency: null, conditions: null, validUntil: null }
    try {
      const response = await fetch(`/admin/api/players/${encodeURIComponent(player.id)}`, { method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ eaId: player.externalId, section, payload, rollbackTo, expectedRevision: player.sections[section]?.revision ?? 0,
          requestId: crypto.randomUUID() }) })
      if (!response.ok) throw Error(await response.text() || "Salvamento não confirmado.")
      await open(player.id)
      setMessage("Alteração confirmada no banco. A próxima leitura pública usará a nova revisão.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Salvamento não confirmado.") }
    finally { setBusy(false) }
  }
  async function logout() {
    await fetch("/admin/api/logout", { method: "POST", headers: { "x-csrf-token": csrf() } })
    setAuthorized(false); setPlayer(null); setMatches([])
  }

  return <main style={{ maxWidth: 920, margin: "2rem auto", padding: "1rem", color: "#f4f1e8" }}>
    <h1>Painel privado FutScout</h1>
    {!authorized ? <form onSubmit={login} style={{ display: "grid", gap: 12, maxWidth: 380 }}>
      <label>Conta do proprietário<input required autoComplete="username" value={owner} onChange={e => setOwner(e.target.value)} /></label>
      <label>Senha<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Código MFA<input required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" value={totp} onChange={e => setTotp(e.target.value)} /></label>
      <button disabled={busy}>Entrar</button>
    </form> : <>
      <button type="button" onClick={logout}>Sair</button>
      <form onSubmit={search} style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "1rem 0" }}>
        <input aria-label="Nome ou ID EA" placeholder="Nome ou ID EA" minLength={2} maxLength={80} value={query} onChange={e => setQuery(e.target.value)} />
        <button disabled={busy}>Buscar</button>
      </form>
      <ul>{matches.map(m => <li key={m.id}><button type="button" onClick={() => void open(m.id).catch(() => setMessage("Não foi possível abrir o jogador."))}>{m.name} · EA {m.externalId}</button></li>)}</ul>
      {player && <div style={{ display: "grid", gap: 24 }}>
        <h2>{player.name} · EA {player.externalId}</h2>
        <a href={`/pt/jogadores/${encodeURIComponent(player.slug)}`} target="_blank" rel="noreferrer">Abrir perfil público</a>
        <section><h3>Salário semanal</h3>
          <label>EUR/semana<input type="number" min="0.01" step="0.01" value={salary.weeklyEur} onChange={e => setSalary({ ...salary, weeklyEur: e.target.value })} /></label>
          <label>Tributação<select value={salary.taxType} onChange={e => setSalary({ ...salary, taxType: e.target.value })}><option value="UNKNOWN">Desconhecida</option><option value="GROSS">Bruto</option><option value="NET">Líquido</option></select></label>
          <label>Composição<select value={salary.composition} onChange={e => setSalary({ ...salary, composition: e.target.value })}><option value="UNKNOWN">Desconhecida</option><option value="BASE">Fixo</option><option value="GUARANTEED">Garantido</option><option value="TOTAL">Total</option></select></label>
          <button type="button" disabled={busy} onClick={() => void save("SALARY")}>Salvar salário</button>
        </section>
        <section><h3>Contrato</h3>
          <label>Início<input type="date" value={contract.start} onChange={e => setContract({ ...contract, start: e.target.value })} /></label>
          <label>Vencimento<input type="date" value={contract.until} onChange={e => setContract({ ...contract, until: e.target.value })} /></label>
          <label>Renovação<input type="date" value={contract.renewed} onChange={e => setContract({ ...contract, renewed: e.target.value })} /></label>
          <button type="button" disabled={busy} onClick={() => void save("CONTRACT")}>Salvar contrato</button>
        </section>
        <section><h3>Cláusula</h3>
          <label>Situação<select value={clause.status} onChange={e => setClause({ ...clause, status: e.target.value })}><option value="UNKNOWN">Desconhecida</option><option value="YES">Sim</option><option value="NO">Não</option></select></label>
          {clause.status === "YES" && <>
            <label>Valor, se conhecido<input type="number" min="0.01" step="0.01" value={clause.amount} onChange={e => setClause({ ...clause, amount: e.target.value })} /></label>
            <label>Moeda<select value={clause.currency} onChange={e => setClause({ ...clause, currency: e.target.value })}><option>EUR</option><option>GBP</option><option>USD</option></select></label>
            <label>Condições<textarea value={clause.conditions} onChange={e => setClause({ ...clause, conditions: e.target.value })} /></label>
            <label>Validade<input type="date" value={clause.validUntil} onChange={e => setClause({ ...clause, validUntil: e.target.value })} /></label>
          </>}
          <button type="button" disabled={busy} onClick={() => void save("CLAUSE")}>Salvar cláusula</button>
        </section>
        <section><h3>Restaurar revisão anterior</h3>{player.history.map(h => <div key={h.id}>{h.section} · revisão {h.revision} · {h.action} · {new Date(h.createdAt).toLocaleString("pt-BR")}
          <button type="button" disabled={busy} onClick={() => void save(h.section, h.id)}>Restaurar esta revisão</button></div>)}</section>
      </div>}
    </>}
    {message && <p role="status">{message}</p>}
  </main>
}
