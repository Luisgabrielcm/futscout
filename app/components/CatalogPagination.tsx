import Link from "next/link"
import { t, type Locale } from "../../lib/i18n"

export default function CatalogPagination({ locale = "pt", page, totalPages, href, label }: {
  locale?: Locale; page: number; totalPages: number; href: (page: number) => string; label: string
}) {
  if (page > totalPages) return <p className="playersEmpty">
    {t(locale, "Esta página não tem resultados.")}{" "}<Link href={href(1)}>{t(locale, "Voltar à primeira página")}</Link>
  </p>
  if (totalPages <= 1) return null
  return <nav className="playersPagination" aria-label={label}>
    {page > 1
      ? <Link className="uiButton uiButtonSecondary paginationButton" rel="prev" href={href(page - 1)}>{t(locale, "← Anterior")}</Link>
      : <span className="uiButton uiButtonSecondary paginationButton" aria-disabled="true">{t(locale, "← Anterior")}</span>}
    <span className="paginationStatus" aria-current="page">
      <span className="paginationFull">{t(locale, "Página")} {page} {t(locale, "de")} {totalPages}</span>
      <span className="paginationCompact" aria-hidden="true">{page} / {totalPages}</span>
    </span>
    {page < totalPages
      ? <Link className="uiButton uiButtonSecondary paginationButton" rel="next" href={href(page + 1)}>{t(locale, "Próxima →")}</Link>
      : <span className="uiButton uiButtonSecondary paginationButton" aria-disabled="true">{t(locale, "Próxima →")}</span>}
  </nav>
}
