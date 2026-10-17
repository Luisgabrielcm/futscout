import Form from "next/form"
import Link from "next/link"
import { t, localizedHref, type LocaleProps } from "../../lib/i18n"

const shortcuts = [
  ["Volante promissor", "/jogadores?position=VOL&maxAge=23&minPotential=85"],
  ["Ponta rápido", "/jogadores?position=PE&minPace=90"],
  ["Zagueiro barato", "/jogadores?position=ZAG&maxValue=20000000"],
  ["Meia criativo", "/jogadores?position=MEI&minPassing=85&minDribbling=85"],
] as const

export default function HomeSearch({ locale = "pt" }: LocaleProps = {}) {
  return (
    <>
      <Form action={localizedHref(locale, "/jogadores")} prefetch={false}
        className="searchBox" role="search" aria-label={t(locale, "Pesquisar jogador, clube ou nacionalidade")}>
        <input
          type="search"
          name="search"
          maxLength={200}
          enterKeyHint="search"
          aria-label={t(locale, "Pesquisar jogador, clube ou nacionalidade")}
          placeholder={t(locale, "Pesquise jogador, clube ou nacionalidade...")}
        />
        <button type="submit" className="uiButton uiButtonPrimary">
          {t(locale, "Buscar")}
        </button>
      </Form>
      <div className="examples">
        <span>{t(locale, "Exemplos:")}</span>
        {shortcuts.map(([label, path]) => (
          <Link key={path} href={localizedHref(locale, path)} prefetch={false}>
            {t(locale, label)}
          </Link>
        ))}
      </div>
    </>
  )
}
