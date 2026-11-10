"use client"
import { useEffect, useRef, useState } from "react"
import type { ManualSection } from "../../lib/adminEconomic"
import styles from "./AdminPanel.module.css"

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
  const [query, setQuery] = useState("")
  const [matches, setMatches] = useState<Match[]>([])
  const [searched, setSearched] = useState(false)
  const [player, setPlayer] = useState<Player | null>(null)
  const [salary, setSalary] = useState(emptySalary)
  const [contract, setContract] = useState(emptyContract)
  const [clause, setClause] = useState(emptyClause)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const pendingSave = useRef<{ key: string; requestId: string } | null>(null)

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
        body: JSON.stringify({ owner, password }) })
      setPassword("")
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
      setSearched(true)
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
    const expectedRevision = player.sections[section]?.revision ?? 0
    const key = JSON.stringify([player.id, player.externalId, section, payload, rollbackTo ?? null, expectedRevision])
    if (pendingSave.current?.key !== key) pendingSave.current = { key, requestId: crypto.randomUUID() }
    try {
      const response = await fetch(`/admin/api/players/${encodeURIComponent(player.id)}`, { method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ eaId: player.externalId, section, payload, rollbackTo, expectedRevision,
          requestId: pendingSave.current.requestId }) })
      if (!response.ok) throw Error(await response.text() || "Salvamento não confirmado.")
      await open(player.id)
      pendingSave.current = null
      setMessage("Alteração confirmada no banco. A próxima leitura pública usará a nova revisão.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Salvamento não confirmado.") }
    finally { setBusy(false) }
  }
  async function logout() {
    await fetch("/admin/api/logout", { method: "POST", headers: { "x-csrf-token": csrf() } })
    setAuthorized(false); setPlayer(null); setMatches([]); setSearched(false)
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Área restrita · FutScout</p>
          <h1 className={styles.title}>Painel do proprietário</h1>
          <p className={styles.subtitle}>Gerencie salários, contratos e cláusulas com histórico de cada edição.</p>
        </div>
        {authorized && <button className={styles.secondaryButton} type="button" onClick={logout}>Sair</button>}
      </header>

      {message && <p className={styles.notice} role="status">{message}</p>}

      {!authorized ? <section className={`${styles.card} ${styles.loginCard}`}>
        <h2 className={styles.cardTitle}>Acessar painel</h2>
        <p className={styles.cardDescription}>Entre com a conta exclusiva do proprietário.</p>
        <form className={styles.form} onSubmit={login}>
          <label className={styles.field}>Conta do proprietário
            <input className={styles.input} required autoComplete="username" value={owner} onChange={e => setOwner(e.target.value)} />
          </label>
          <label className={styles.field}>Senha
            <input className={styles.input} required type="password" minLength={16} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <button className={styles.primaryButton} disabled={busy}>Entrar</button>
        </form>
      </section> : <div className={styles.workspace}>
        <section className={styles.card}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>01 · Catálogo</p>
              <h2 className={styles.cardTitle}>Encontrar jogador</h2>
              <p className={styles.cardDescription}>Busque por nome, nome sem acento ou ID EA.</p>
            </div>
          </div>
          <form className={styles.searchForm} onSubmit={search}>
            <label className={styles.field}>Nome ou ID EA
              <input className={styles.input} placeholder="Ex.: Mbappé, mbappe ou 231747" minLength={2} maxLength={80}
                value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            <button className={styles.primaryButton} disabled={busy || query.trim().length < 2} type="submit">
              {busy ? "Buscando…" : "Buscar jogador"}
            </button>
          </form>
          {searched && <p className={styles.resultCount} aria-live="polite">
            {matches.length ? `${matches.length} jogador${matches.length === 1 ? " encontrado" : "es encontrados"}. Selecione um para editar.`
              : "Nenhum jogador encontrado. Tente o nome completo ou o ID EA."}
          </p>}
          {matches.length > 0 && <ul className={styles.resultList}>
            {matches.map(m => <li key={m.id}>
              <button className={styles.resultButton} type="button" onClick={() => void open(m.id).catch(() => setMessage("Não foi possível abrir o jogador."))}>
                <span>{m.name}</span><span className={styles.resultId}>EA {m.externalId} <span aria-hidden="true">→</span></span>
              </button>
            </li>)}
          </ul>}
        </section>

        {!player ? <section className={styles.emptyState}>
          <span className={styles.emptyIcon} aria-hidden="true">↗</span>
          <h2>Selecione um jogador</h2>
          <p>As opções de salário, contrato e cláusula aparecerão aqui depois da busca.</p>
        </section> : <div className={styles.editor}>
          <div className={styles.playerHeading}>
            <div><p className={styles.eyebrow}>02 · Edição manual</p><h2>{player.name}</h2><p>Jogador EA {player.externalId}</p></div>
            <a className={styles.secondaryButton} href={`/pt/jogadores/${encodeURIComponent(player.slug)}`} target="_blank" rel="noreferrer">Ver perfil público ↗</a>
          </div>
          <div className={styles.editorGrid}>
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Salário semanal</h3>
              <p className={styles.cardDescription}>Informe apenas dados conhecidos. Salve esta seção separadamente.</p>
              <div className={styles.form}>
                <label className={styles.field}>EUR por semana
                  <input className={styles.input} type="number" min="0.01" step="0.01" value={salary.weeklyEur} onChange={e => setSalary({ ...salary, weeklyEur: e.target.value })} />
                </label>
                <div className={styles.fieldRow}>
                  <label className={styles.field}>Tributação
                    <select className={styles.input} value={salary.taxType} onChange={e => setSalary({ ...salary, taxType: e.target.value })}><option value="UNKNOWN">Desconhecida</option><option value="GROSS">Bruto</option><option value="NET">Líquido</option></select>
                  </label>
                  <label className={styles.field}>Composição
                    <select className={styles.input} value={salary.composition} onChange={e => setSalary({ ...salary, composition: e.target.value })}><option value="UNKNOWN">Desconhecida</option><option value="BASE">Fixo</option><option value="GUARANTEED">Garantido</option><option value="TOTAL">Total</option></select>
                  </label>
                </div>
                <button className={styles.primaryButton} type="button" disabled={busy} onClick={() => void save("SALARY")}>Salvar salário</button>
              </div>
            </section>
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Contrato</h3>
              <p className={styles.cardDescription}>Registre as datas com a precisão disponível.</p>
              <div className={styles.form}>
                <label className={styles.field}>Início
                  <input className={styles.input} type="date" value={contract.start} onChange={e => setContract({ ...contract, start: e.target.value })} />
                </label>
                <label className={styles.field}>Vencimento
                  <input className={styles.input} type="date" value={contract.until} onChange={e => setContract({ ...contract, until: e.target.value })} />
                </label>
                <label className={styles.field}>Renovação
                  <input className={styles.input} type="date" value={contract.renewed} onChange={e => setContract({ ...contract, renewed: e.target.value })} />
                </label>
                <button className={styles.primaryButton} type="button" disabled={busy} onClick={() => void save("CONTRACT")}>Salvar contrato</button>
              </div>
            </section>
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Cláusula de rescisão</h3>
              <p className={styles.cardDescription}>“Desconhecido” não significa que o jogador não possua cláusula.</p>
              <div className={styles.form}>
                <label className={styles.field}>Situação
                  <select className={styles.input} value={clause.status} onChange={e => setClause({ ...clause, status: e.target.value })}><option value="UNKNOWN">Desconhecida</option><option value="YES">Sim</option><option value="NO">Não</option></select>
                </label>
                {clause.status === "YES" && <>
                  <div className={styles.fieldRow}>
                    <label className={styles.field}>Valor, se conhecido
                      <input className={styles.input} type="number" min="0.01" step="0.01" value={clause.amount} onChange={e => setClause({ ...clause, amount: e.target.value })} />
                    </label>
                    <label className={styles.field}>Moeda
                      <select className={styles.input} value={clause.currency} onChange={e => setClause({ ...clause, currency: e.target.value })}><option>EUR</option><option>GBP</option><option>USD</option></select>
                    </label>
                  </div>
                  <label className={styles.field}>Condições
                    <textarea className={styles.input} rows={3} value={clause.conditions} onChange={e => setClause({ ...clause, conditions: e.target.value })} />
                  </label>
                  <label className={styles.field}>Validade
                    <input className={styles.input} type="date" value={clause.validUntil} onChange={e => setClause({ ...clause, validUntil: e.target.value })} />
                  </label>
                </>}
                <button className={styles.primaryButton} type="button" disabled={busy} onClick={() => void save("CLAUSE")}>Salvar cláusula</button>
              </div>
            </section>
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Histórico manual</h3>
              <p className={styles.cardDescription}>Restaure uma revisão anterior sem apagar o histórico.</p>
              {player.history.length ? <ul className={styles.historyList}>{player.history.map(h => <li key={h.id}>
                <div><strong>{h.section}</strong><span>Revisão {h.revision} · {h.action} · {new Date(h.createdAt).toLocaleString("pt-BR")}</span></div>
                <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => void save(h.section, h.id)}>Restaurar</button>
              </li>)}</ul> : <p className={styles.emptyHistory}>Nenhuma edição manual anterior para este jogador.</p>}
            </section>
          </div>
        </div>}
      </div>}
    </div>
  </main>
}
