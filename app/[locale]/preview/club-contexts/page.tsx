import { readFile } from "node:fs/promises"
import { notFound } from "next/navigation"
import PlayerClubContexts from "../../../components/PlayerClubContexts"
import { validateClubContexts, type ClubContexts } from "../../../../lib/clubContexts"
import { requireLocale } from "../../../../lib/i18n/server"

export const dynamic = "force-dynamic"
export const metadata = { title: "Revisão de vínculos", robots: { index: false, follow: false } }

/** Private, file-backed UI preview. No DB connection or production credentials. */
export default async function ClubContextsPreview({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.VERCEL_ENV === "production" || process.env.CLUB_CONTEXTS_PREVIEW_ENABLED !== "1" ||
      !process.env.CLUB_CONTEXTS_PREVIEW_FILE) notFound()
  const locale = requireLocale((await params).locale)
  const proposals = JSON.parse(await readFile(process.env.CLUB_CONTEXTS_PREVIEW_FILE, "utf8")) as
    { name: string; eaPlayerId: string; contexts: ClubContexts }[]
  return <main className="playerPage" style={{ maxWidth: "900px", margin: "auto", padding: "2rem" }}>
    <h1>{locale === "en" ? "Club relationship review" : "Revisão de vínculos dos jogadores"}</h1>
    <p>{locale === "en" ? "Isolated preview · proposals only" : "Preview isolado · propostas sem publicação"}</p>
    {proposals.map(proposal => {
      validateClubContexts(proposal.contexts, proposal.eaPlayerId)
      return <section key={proposal.eaPlayerId} className="profileSection" style={{ padding: "1.5rem", marginBlock: "1rem" }}>
        <h2>{proposal.name}</h2><small>ID EA {proposal.eaPlayerId}</small>
        <PlayerClubContexts contexts={proposal.contexts} locale={locale} />
      </section>
    })}
  </main>
}
