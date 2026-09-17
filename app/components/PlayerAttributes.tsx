import { t, type Locale } from "../../lib/i18n"

import type { PlayerAttributes as PlayerAttributesType } from "../../types/player"
import { getAttributeLevel } from "../../utils/getAttributeLevel"

type PlayerAttributesProps = {
  locale?: Locale
  attributes: { [Group in keyof PlayerAttributesType]?: Partial<Record<keyof PlayerAttributesType[Group], number | null>> | null } | null
}

export default function PlayerAttributes({ locale = "pt",
  attributes,
}: PlayerAttributesProps) {
  const attributeGroups = [
    {
      label: t(locale, "Ritmo"),
      value: attributes?.pace?.overall,
      subAttributes: [
        {
          label: t(locale, "Aceleração"),
          value: attributes?.pace?.acceleration,
        },
        {
          label: t(locale, "Velocidade"),
          value: attributes?.pace?.sprintSpeed,
        },
      ],
    },

    {
      label: t(locale, "Finalização"),
      value: attributes?.shooting?.overall,
      subAttributes: [
        {
          label: t(locale, "Posicionamento"),
          value: attributes?.shooting?.positioning,
        },
        {
          label: t(locale, "Finishing"),
          value: attributes?.shooting?.finishing,
        },
        {
          label: t(locale, "Força do chute"),
          value: attributes?.shooting?.shotPower,
        },
        {
          label: t(locale, "Chutes de longe"),
          value: attributes?.shooting?.longShots,
        },
        {
          label: t(locale, "Voleios"),
          value: attributes?.shooting?.volleys,
        },
        {
          label: t(locale, "Pênaltis"),
          value: attributes?.shooting?.penalties,
        },
      ],
    },

    {
      label: t(locale, "Passe"),
      value: attributes?.passing?.overall,
      subAttributes: [
        {
          label: t(locale, "Visão"),
          value: attributes?.passing?.vision,
        },
        {
          label: t(locale, "Cruzamento"),
          value: attributes?.passing?.crossing,
        },
        {
          label: t(locale, "Falta"),
          value: attributes?.passing?.freeKickAccuracy,
        },
        {
          label: t(locale, "Passe curto"),
          value: attributes?.passing?.shortPassing,
        },
        {
          label: t(locale, "Passe longo"),
          value: attributes?.passing?.longPassing,
        },
        {
          label: t(locale, "Curva"),
          value: attributes?.passing?.curve,
        },
      ],
    },

    {
      label: t(locale, "Drible"),
      value: attributes?.dribbling?.overall,
      subAttributes: [
        {
          label: t(locale, "Agilidade"),
          value: attributes?.dribbling?.agility,
        },
        {
          label: t(locale, "Equilíbrio"),
          value: attributes?.dribbling?.balance,
        },
        {
          label: t(locale, "Reações"),
          value: attributes?.dribbling?.reactions,
        },
        {
          label: t(locale, "Controle de bola"),
          value: attributes?.dribbling?.ballControl,
        },
        {
          label: t(locale, "Drible"),
          value: attributes?.dribbling?.dribbling,
        },
        {
          label: t(locale, "Compostura"),
          value: attributes?.dribbling?.composure,
        },
      ],
    },

    {
      label: t(locale, "Defesa"),
      value: attributes?.defending?.overall,
      subAttributes: [
        {
          label: t(locale, "Interceptações"),
          value: attributes?.defending?.interceptions,
        },
        {
          label: t(locale, "Cabeceio"),
          value: attributes?.defending?.headingAccuracy,
        },
        {
          label: t(locale, "Consciência defensiva"),
          value: attributes?.defending?.defensiveAwareness,
        },
        {
          label: t(locale, "Desarme em pé"),
          value: attributes?.defending?.standingTackle,
        },
        {
          label: t(locale, "Carrinho"),
          value: attributes?.defending?.slidingTackle,
        },
      ],
    },

    {
      label: t(locale, "Físico"),
      value: attributes?.physical?.overall,
      subAttributes: [
        {
          label: t(locale, "Impulsão"),
          value: attributes?.physical?.jumping,
        },
        {
          label: t(locale, "Resistência"),
          value: attributes?.physical?.stamina,
        },
        {
          label: t(locale, "Força"),
          value: attributes?.physical?.strength,
        },
        {
          label: t(locale, "Agressividade"),
          value: attributes?.physical?.aggression,
        },
      ],
    },
  ]

  const isValue = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 99
  return (
    <section className="playerAttributes">
      <div className="attributesHeader">
        <span>{t(locale, "ATRIBUTOS")}</span>
        <h2>{t(locale, "Desempenho do jogador")}</h2>
      </div>
      <div className="attributesList">
        {attributeGroups.map((attribute) => (
          <details
            className="attributeItem"
            key={attribute.label}
          >
            <summary className="attributeSummary">
              <div className="attributeMain">
                <div className="attributeInfo">
                  <span>{attribute.label}</span>
                  <strong>{isValue(attribute.value) ? attribute.value : "—"}</strong>
                </div>

                {isValue(attribute.value) && <div className="attributeBar">
                  <div
                    className={`attributeBarFill ${getAttributeLevel(
                      attribute.value
                    )}`}
                    style={{
                      width: `${attribute.value}%`,
                    }}
                  />
                </div>}
              </div>

              <span className="attributeExpandIcon">
                +
              </span>
            </summary>

            <div className="subAttributes">
              {attribute.subAttributes.map((subAttribute) => (
                <div
                  className="subAttributeItem"
                  key={subAttribute.label}
                >
                  <div className="subAttributeInfo">
                    <span>{subAttribute.label}</span>
                    <strong>{isValue(subAttribute.value) ? subAttribute.value : "—"}</strong>
                  </div>

                  {isValue(subAttribute.value) && <div className="subAttributeBar">
                    <div
                      className={`subAttributeBarFill ${getAttributeLevel(
                        subAttribute.value
                      )}`}
                      style={{
                        width: `${subAttribute.value}%`,
                      }}
                    />
                  </div>}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
