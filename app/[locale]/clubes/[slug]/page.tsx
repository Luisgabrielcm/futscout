import { t, localizedHref } from "../../../../lib/i18n"
import { requireLocale } from "../../../../lib/i18n/server"
import { localizedMetadata } from "../../../../lib/i18n/metadata"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getClubBySlug, getClubRatings, getClubRoster } from "../../../../services/clubService"
import { getPlayers } from "../../../../services/playerService"
import { parsePlayerCatalogParams, playerCatalogQuery } from "../../../../lib/playerCatalogParams"
import { clubText, CLUB_TABS, SQUAD_SORTS } from "../../../../lib/i18n/clubExperience"
import { ClubRatingPanel, ClubPitch, SquadSort, SquadList } from "../../../components/ClubExperience"
import type { CatalogSearchParams } from "../../../../lib/playerCatalogParams"
import { DirectoryBadge, DirectoryNav, DirectoryPagination } from "../../../components/DirectoryCatalog"

type Props = { params: Promise<{ slug: string; locale?: string }>; searchParams: Promise<CatalogSearchParams> }

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const locale = requireLocale((await params).locale ?? "pt")
  const club = await getClubBySlug((await params).slug)
  if (!club) return localizedMetadata(locale, `/clubes/${encodeURIComponent((await params).slug)}`, t(locale, "Clube não encontrado"), true)
  return localizedMetadata(locale, `/clubes/${encodeURIComponent(club.slug)}`, t(locale, "clubDetailTitle", { name: club.name }))
}

export default async function ClubPage({ params, searchParams }: Props) {
  const locale = requireLocale((await params).locale ?? "pt")
  // Check existence before rendering; no inherited loading boundary/soft 404.
  const club = await getClubBySlug((await params).slug)
  if (!club) notFound()
  const query = await searchParams
  const rawTab = Array.isArray(query.tab) ? query.tab[0] : query.tab
  const tab = CLUB_TABS.find(value => value === rawTab) ?? "overview"
  const parsed = parsePlayerCatalogParams(query)
  const filters = { search: parsed.search, page: parsed.page, sort: SQUAD_SORTS.find(value => value === parsed.sort) ?? "overall-desc" as const }
  const roster = tab === "squad" ? await getPlayers(filters, { clubId: club.id }) : null
  const overview = tab === "overview" ? await Promise.all([getClubRoster(club.id), getClubRatings([{ id: club.id, total: club._count.players }])]) : null
  const path = localizedHref(locale, `/clubes/${encodeURIComponent(club.slug)}`)
  return <main className="playersPage directoryPage clubProfilePage">
    <DirectoryNav locale={locale} />
    <nav className="entityBreadcrumb" aria-label={t(locale, "Catálogo FutScout")}><Link href={localizedHref(locale, "/clubes")} className="backButton">{t(locale, "← Todos os clubes")}</Link><span aria-hidden="true">›</span><span aria-current="page">{club.name}</span></nav>
    <header className="playersPageHeader directoryHeader clubProfileHero">
      <DirectoryBadge locale={locale} name={club.name} imageUrl={club.imageUrl} />
      <div><span className="sectionEyebrow">FUTSCOUT · {clubText(locale, "squad")}</span><h1>{club.name}</h1>
        <p><Link href={localizedHref(locale, `/ligas/${encodeURIComponent(club.league.slug)}`)}>{club.league.name}</Link></p>
        <p>{club._count.players} {t(locale, "jogadores cadastrados")}</p>
      </div>
    </header>
    {overview && <ClubRatingPanel locale={locale} rating={overview[1].get(club.id)!} />}
    <nav className="clubTabs" aria-label={t(locale, "Clubes")}>{CLUB_TABS.map(value => <Link key={value}
      prefetch={false} aria-current={tab === value ? "page" : undefined} href={`${path}?tab=${value}`}>{clubText(locale, value)}{value !== "overview" && value !== "squad" && <span className="tabUpcoming" aria-hidden="true">·</span>}</Link>)}</nav>
    {overview && <ClubPitch locale={locale} players={overview[0]} squadHref={`${path}?tab=squad`} information={<section className="clubInfoPanel">
      <h2>{clubText(locale, "information")}</h2><dl>
        <div><dt>{clubText(locale, "name")}</dt><dd>{club.name}</dd></div>
        <div><dt>{clubText(locale, "league")}</dt><dd><Link href={localizedHref(locale, `/ligas/${encodeURIComponent(club.league.slug)}`)}>{club.league.name}</Link></dd></div>
        <div><dt>{clubText(locale, "country")}</dt><dd>—</dd></div>
        <div><dt>{clubText(locale, "registered")}</dt><dd>{club._count.players}</dd></div>
      </dl>
    </section>} />}
    {roster && <section className="directorySection" aria-labelledby="roster-title">
      <h2 id="roster-title">{t(locale, "Elenco")}</h2>
      <p>{roster.total} {t(locale, "jogadores cadastrados")}</p>
      <SquadSort locale={locale} tab="squad" {...filters} />
      <SquadList locale={locale} players={roster.players} />
      <DirectoryPagination locale={locale} {...roster} label={t(locale, "Paginação do elenco")} href={(page) => `${path}?tab=squad&${playerCatalogQuery({ ...filters, page })}`} />
    </section>}
    {!overview && !roster && <section className="directorySection"><h2>{clubText(locale, tab)}</h2><p className="playersEmpty">{clubText(locale, "soon")}</p></section>}
  </main>
}
