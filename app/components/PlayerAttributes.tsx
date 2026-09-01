import type { PlayerAttributes as PlayerAttributesType } from "../../types/player"
import { getAttributeLevel } from "../../utils/getAttributeLevel"

type PlayerAttributesProps = {
   attributes: PlayerAttributesType
}

export default function PlayerAttributes({
  attributes,
}: PlayerAttributesProps) {
  const attributeGroups = [
    {
      label: "Ritmo",
      value: attributes.pace.overall,
      subAttributes: [
        {
          label: "Aceleração",
          value: attributes.pace.acceleration,
        },
        {
          label: "Velocidade",
          value: attributes.pace.sprintSpeed,
        },
      ],
    },

    {
      label: "Finalização",
      value: attributes.shooting.overall,
      subAttributes: [
        {
          label: "Posicionamento",
          value: attributes.shooting.positioning,
        },
        {
          label: "Finalização",
          value: attributes.shooting.finishing,
        },
        {
          label: "Força do chute",
          value: attributes.shooting.shotPower,
        },
        {
          label: "Chutes de longe",
          value: attributes.shooting.longShots,
        },
        {
          label: "Voleios",
          value: attributes.shooting.volleys,
        },
        {
          label: "Pênaltis",
          value: attributes.shooting.penalties,
        },
      ],
    },

    {
      label: "Passe",
      value: attributes.passing.overall,
      subAttributes: [
        {
          label: "Visão",
          value: attributes.passing.vision,
        },
        {
          label: "Cruzamento",
          value: attributes.passing.crossing,
        },
        {
          label: "Falta",
          value: attributes.passing.freeKickAccuracy,
        },
        {
          label: "Passe curto",
          value: attributes.passing.shortPassing,
        },
        {
          label: "Passe longo",
          value: attributes.passing.longPassing,
        },
        {
          label: "Curva",
          value: attributes.passing.curve,
        },
      ],
    },

    {
      label: "Drible",
      value: attributes.dribbling.overall,
      subAttributes: [
        {
          label: "Agilidade",
          value: attributes.dribbling.agility,
        },
        {
          label: "Equilíbrio",
          value: attributes.dribbling.balance,
        },
        {
          label: "Reações",
          value: attributes.dribbling.reactions,
        },
        {
          label: "Controle de bola",
          value: attributes.dribbling.ballControl,
        },
        {
          label: "Drible",
          value: attributes.dribbling.dribbling,
        },
        {
          label: "Compostura",
          value: attributes.dribbling.composure,
        },
      ],
    },

    {
      label: "Defesa",
      value: attributes.defending.overall,
      subAttributes: [
        {
          label: "Interceptações",
          value: attributes.defending.interceptions,
        },
        {
          label: "Cabeceio",
          value: attributes.defending.headingAccuracy,
        },
        {
          label: "Consciência defensiva",
          value: attributes.defending.defensiveAwareness,
        },
        {
          label: "Desarme em pé",
          value: attributes.defending.standingTackle,
        },
        {
          label: "Carrinho",
          value: attributes.defending.slidingTackle,
        },
      ],
    },

    {
      label: "Físico",
      value: attributes.physical.overall,
      subAttributes: [
        {
          label: "Impulsão",
          value: attributes.physical.jumping,
        },
        {
          label: "Resistência",
          value: attributes.physical.stamina,
        },
        {
          label: "Força",
          value: attributes.physical.strength,
        },
        {
          label: "Agressividade",
          value: attributes.physical.aggression,
        },
      ],
    },
  ]

  return (
    <section className="playerAttributes">
      <div className="attributesHeader">
        <span>ATRIBUTOS</span>
        <h2>Desempenho do jogador</h2>
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
                  <strong>{attribute.value}</strong>
                </div>

                <div className="attributeBar">
                  <div
                    className={`attributeBarFill ${getAttributeLevel(
                      attribute.value
                    )}`}
                    style={{
                      width: `${attribute.value}%`,
                    }}
                  />
                </div>
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
                    <strong>{subAttribute.value}</strong>
                  </div>

                  <div className="subAttributeBar">
                    <div
                      className={`subAttributeBarFill ${getAttributeLevel(
                        subAttribute.value
                      )}`}
                      style={{
                        width: `${subAttribute.value}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}