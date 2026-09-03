import assert from "node:assert/strict"
import test from "node:test"

import {
  API_FOOTBALL_PLAYER_MIN_AUTO_SAVE_MARGIN,
  calculateMatchConfidence,
  calculateNameScore,
  canAutomaticallySave,
  classifyMatchConfidence,
  evaluateApiFootballPlayerCandidateRanking,
  evaluateApiFootballPlayerRoster,
  type ApiFootballPlayerMatchClassification,
} from "../../../services/apiFootballPlayerMatcherCore"

function candidate({
  id,
  name,
  firstname,
  lastname,
}: {
  id?: number
  name?: string | null
  firstname?: string | null
  lastname?: string | null
}) {
  return {
    player: {
      id,
      name,
      firstname,
      lastname,
    },
  }
}

type EvaluatedCandidate = {
  apiFootballId: number
  nameScore: number
  birthMatches: boolean
  nationalityMatches: boolean
  clubMatches: boolean
  confidence: number
  classification: ApiFootballPlayerMatchClassification
  canAutoSave: boolean
}

function evaluatedCandidate({
  apiFootballId,
  nameScore,
  birthMatches = true,
  nationalityMatches = true,
  clubMatches = true,
}: {
  apiFootballId: number
  nameScore: number
  birthMatches?: boolean
  nationalityMatches?: boolean
  clubMatches?: boolean
}): EvaluatedCandidate {
  const confidence = calculateMatchConfidence({
    nameScore,
    birthMatches,
    nationalityMatches,
    clubMatches,
  })
  const classification = classifyMatchConfidence(confidence)

  return {
    apiFootballId,
    nameScore,
    birthMatches,
    nationalityMatches,
    clubMatches,
    confidence,
    classification,
    canAutoSave: canAutomaticallySave({
      classification,
      birthMatches,
      clubMatches,
      nameScore,
    }),
  }
}

type NameCandidate = ReturnType<typeof candidate>

function evaluateNameRoster(
  target: string,
  roster: readonly NameCandidate[]
) {
  return evaluateApiFootballPlayerRoster(
    roster,
    (currentCandidate) => {
      const apiFootballId = currentCandidate.player.id

      if (apiFootballId === undefined) {
        return null
      }

      return evaluatedCandidate({
        apiFootballId,
        nameScore: calculateNameScore(target, currentCandidate),
      })
    }
  )
}

test("atribui 100 para nome exato", () => {
  const score = calculateNameScore(
    "Kylian Mbappe",
    candidate({
      name: "Kylian Mbappe",
      firstname: "Kylian",
      lastname: "Mbappe",
    })
  )

  assert.equal(score, 100)
})

test("atribui 100 para nome completo exato", () => {
  const score = calculateNameScore(
    "Kylian Mbappe",
    candidate({
      name: "K. Mbappe",
      firstname: "Kylian",
      lastname: "Mbappe",
    })
  )

  assert.equal(score, 100)
})

test("atribui 90 para inclusão válida", () => {
  const score = calculateNameScore(
    "Joao Felix",
    candidate({
      name: "Joao Felix Sequeira",
      firstname: "Joao Felix",
      lastname: "Sequeira",
    })
  )

  assert.equal(score, 90)
})

test("pontua correspondência por tokens", () => {
  const score = calculateNameScore(
    "Alpha Beta Gamma Delta",
    candidate({
      name: "Alpha Gamma",
      firstname: "Beta",
      lastname: "X",
    })
  )

  assert.equal(score, 90)
})

test("atribui zero quando não há correspondência", () => {
  const score = calculateNameScore(
    "Kylian Mbappe",
    candidate({
      name: "Erling Haaland",
      firstname: "Erling",
      lastname: "Haaland",
    })
  )

  assert.equal(score, 0)
})

test("atribui zero quando o nome FutScout está vazio", () => {
  const score = calculateNameScore(
    "",
    candidate({
      name: "Kylian Mbappe",
      firstname: "Kylian",
      lastname: "Mbappe",
    })
  )

  assert.equal(score, 0)
})

test("usa o nome completo quando apiName está vazio", () => {
  const score = calculateNameScore(
    "Kylian Mbappe",
    candidate({
      name: "",
      firstname: "Kylian",
      lastname: "Mbappe",
    })
  )

  assert.equal(score, 100)
})

test("atribui zero quando ambos os nomes da API estão vazios", () => {
  const score = calculateNameScore(
    "Kylian Mbappe",
    candidate({
      name: "",
      firstname: null,
      lastname: null,
    })
  )

  assert.equal(score, 0)
})

test("normaliza acentos e capitalização", () => {
  const score = calculateNameScore(
    "Kylian Mbappé",
    candidate({
      name: "KYLIAN MBAPPE",
      firstname: "Kylian",
      lastname: "Mbappe",
    })
  )

  assert.equal(score, 100)
})

test("classifica 74 como MATCH FRACO", () => {
  assert.equal(classifyMatchConfidence(74), "MATCH FRACO")
})

test("classifica 75 como REVISAR", () => {
  assert.equal(classifyMatchConfidence(75), "REVISAR")
})

test("classifica 89 como REVISAR", () => {
  assert.equal(classifyMatchConfidence(89), "REVISAR")
})

test("classifica 90 como MATCH FORTE", () => {
  assert.equal(classifyMatchConfidence(90), "MATCH FORTE")
})

function autoSaveInput(
  overrides: Partial<{
    classification: ApiFootballPlayerMatchClassification
    birthMatches: boolean
    clubMatches: boolean
    nameScore: number
  }> = {}
) {
  return {
    classification: "MATCH FORTE" as ApiFootballPlayerMatchClassification,
    birthMatches: true,
    clubMatches: true,
    nameScore: 80,
    ...overrides,
  }
}

test("permite auto-save no caminho positivo", () => {
  assert.equal(canAutomaticallySave(autoSaveInput()), true)
})

test("impede auto-save quando a classificação não é forte", () => {
  assert.equal(
    canAutomaticallySave(autoSaveInput({ classification: "REVISAR" })),
    false
  )
})

test("impede auto-save quando o nascimento não coincide", () => {
  assert.equal(
    canAutomaticallySave(autoSaveInput({ birthMatches: false })),
    false
  )
})

test("impede auto-save quando o clube não coincide", () => {
  assert.equal(
    canAutomaticallySave(autoSaveInput({ clubMatches: false })),
    false
  )
})

test("impede auto-save com nameScore 79", () => {
  assert.equal(canAutomaticallySave(autoSaveInput({ nameScore: 79 })), false)
})

test("permite auto-save com nameScore 80", () => {
  assert.equal(canAutomaticallySave(autoSaveInput({ nameScore: 80 })), true)
})

test(
  "não atribui score quando full name está vazio e o nome da API não corresponde",
  () => {
    const score = calculateNameScore(
      "Kylian Mbappé",
      candidate({
        name: "Completely Different",
        firstname: null,
        lastname: null,
      })
    )

    assert.equal(score, 0)
  }
)

test("não autoriza auto-save em empate forte perfeito", () => {
  const first = evaluatedCandidate({ apiFootballId: 101, nameScore: 100 })
  const second = evaluatedCandidate({ apiFootballId: 202, nameScore: 100 })

  const ranking = evaluateApiFootballPlayerCandidateRanking([first, second])

  assert.equal(first.confidence, 100)
  assert.equal(second.confidence, 100)
  assert.equal(first.canAutoSave, true)
  assert.equal(second.canAutoSave, true)
  assert.equal(ranking.top1?.apiFootballId, 101)
  assert.equal(ranking.margin, 0)
  assert.equal(ranking.ambiguous, true)
  assert.equal(ranking.canAutoSave, false)
})

test("bloqueia auto-save nas duas ordens de um empate forte", () => {
  const first = evaluatedCandidate({ apiFootballId: 101, nameScore: 100 })
  const second = evaluatedCandidate({ apiFootballId: 202, nameScore: 100 })

  const firstOrder = evaluateApiFootballPlayerCandidateRanking([first, second])
  const reversedOrder = evaluateApiFootballPlayerCandidateRanking([
    second,
    first,
  ])

  assert.equal(firstOrder.top1?.apiFootballId, 101)
  assert.equal(reversedOrder.top1?.apiFootballId, 202)
  assert.equal(firstOrder.ambiguous, true)
  assert.equal(reversedOrder.ambiguous, true)
  assert.equal(firstOrder.canAutoSave, false)
  assert.equal(reversedOrder.canAutoSave, false)
})

test("não autoriza auto-save com margem forte de quatro pontos", () => {
  const top1 = evaluatedCandidate({ apiFootballId: 101, nameScore: 100 })
  const top2 = evaluatedCandidate({ apiFootballId: 202, nameScore: 90 })

  const ranking = evaluateApiFootballPlayerCandidateRanking([top1, top2])

  assert.equal(top1.confidence, 100)
  assert.equal(top2.confidence, 96)
  assert.equal(top1.canAutoSave, true)
  assert.equal(top2.canAutoSave, true)
  assert.equal(ranking.top1?.apiFootballId, 101)
  assert.equal(ranking.margin, 4)
  assert.equal(ranking.ambiguous, true)
  assert.equal(ranking.canAutoSave, false)
})

test("mantém vencedor forte quando ele é claramente superior", () => {
  const top1 = evaluatedCandidate({ apiFootballId: 101, nameScore: 100 })
  const top2 = evaluatedCandidate({
    apiFootballId: 202,
    nameScore: 100,
    clubMatches: false,
  })

  assert.equal(top1.confidence, 100)
  assert.equal(top2.confidence, 85)
  const ranking = evaluateApiFootballPlayerCandidateRanking([top1, top2])

  assert.equal(ranking.top1?.apiFootballId, 101)
  assert.equal(ranking.margin, 15)
  assert.equal(ranking.ambiguous, false)
  assert.equal(ranking.canAutoSave, true)
})

test("mantém candidato forte quando ele é o único candidato", () => {
  const onlyCandidate = evaluatedCandidate({
    apiFootballId: 101,
    nameScore: 100,
  })

  const ranking = evaluateApiFootballPlayerCandidateRanking([onlyCandidate])

  assert.equal(ranking.top1?.apiFootballId, 101)
  assert.equal(ranking.top2, null)
  assert.equal(ranking.margin, null)
  assert.equal(ranking.ambiguous, false)
  assert.equal(ranking.canAutoSave, true)
})

test("não autoriza auto-save quando nenhum candidato é forte", () => {
  const review = evaluatedCandidate({
    apiFootballId: 101,
    nameScore: 100,
    clubMatches: false,
  })
  const lowerReview = evaluatedCandidate({
    apiFootballId: 202,
    nameScore: 80,
    clubMatches: false,
  })

  const ranking = evaluateApiFootballPlayerCandidateRanking([
    review,
    lowerReview,
  ])

  assert.equal(review.confidence, 85)
  assert.equal(lowerReview.confidence, 77)
  assert.equal(ranking.top1?.apiFootballId, 101)
  assert.equal(ranking.canAutoSave, false)
})

test("considera margem de oito pontos ambígua", () => {
  const top1 = evaluatedCandidate({ apiFootballId: 101, nameScore: 100 })
  const top2 = evaluatedCandidate({ apiFootballId: 202, nameScore: 80 })

  const ranking = evaluateApiFootballPlayerCandidateRanking([top1, top2])

  assert.equal(top1.confidence, 100)
  assert.equal(top2.confidence, 92)
  assert.equal(ranking.margin, 8)
  assert.equal(ranking.ambiguous, true)
  assert.equal(ranking.canAutoSave, false)
})

test("aceita exatamente a margem mínima de dez pontos", () => {
  const top1 = evaluatedCandidate({ apiFootballId: 101, nameScore: 100 })
  const top2 = evaluatedCandidate({
    apiFootballId: 202,
    nameScore: 100,
    nationalityMatches: false,
  })

  const ranking = evaluateApiFootballPlayerCandidateRanking([top1, top2])

  assert.equal(API_FOOTBALL_PLAYER_MIN_AUTO_SAVE_MARGIN, 10)
  assert.equal(top1.confidence, 100)
  assert.equal(top2.confidence, 90)
  assert.equal(ranking.margin, 10)
  assert.equal(ranking.ambiguous, false)
  assert.equal(ranking.canAutoSave, true)
})

test("avalia candidato com nameScore 80 no roster completo", () => {
  const target = "Alpha Beta"
  const score80 = candidate({
    id: 1,
    name: "Alpha Other",
    firstname: "Alpha",
    lastname: "Other",
  })
  const evaluated = evaluateNameRoster(target, [score80])

  assert.equal(calculateNameScore(target, score80), 80)
  assert.equal(evaluated.length, 1)
  assert.equal(evaluated[0]?.nameScore, 80)
})

test("avalia score 90 por inclusão reversa", () => {
  const target = "Alexander"
  const visible = candidate({
    id: 1,
    name: "Alexander Other",
    firstname: "Alexander",
    lastname: "Other",
  })
  const hiddenScore90 = candidate({
    id: 2,
    name: "A.",
    firstname: "Alex",
    lastname: null,
  })
  const evaluated = evaluateNameRoster(target, [
    visible,
    hiddenScore90,
  ])

  assert.equal(evaluated.length, 2)
  assert.equal(evaluated[1]?.apiFootballId, 2)
  assert.equal(evaluated[1]?.nameScore, 90)
})

test("candidato nominalmente fraco não oculta candidato competitivo", () => {
  const target = "Alexander Alpha Beta"
  const visibleWeak = candidate({
    id: 1,
    name: "Beta Other",
    firstname: "Other",
    lastname: "Person",
  })
  const hiddenCompetitive = candidate({
    id: 2,
    name: "A.",
    firstname: "Alex",
    lastname: null,
  })
  const evaluated = evaluateNameRoster(target, [
    visibleWeak,
    hiddenCompetitive,
  ])
  const ranking = evaluateApiFootballPlayerCandidateRanking(evaluated)

  assert.equal(evaluated[0]?.nameScore, 50)
  assert.equal(evaluated[1]?.nameScore, 90)
  assert.equal(ranking.top1?.apiFootballId, 2)
  assert.equal(ranking.top2?.apiFootballId, 1)
})

test("margem considera todos os concorrentes fortes do roster", () => {
  const target = "Alexander Alpha Beta"
  const visibleTop1 = candidate({
    id: 1,
    name: target,
    firstname: "Alexander Alpha",
    lastname: "Beta",
  })
  const hiddenTop2 = candidate({
    id: 2,
    name: "A.",
    firstname: "Alex",
    lastname: null,
  })
  const evaluated = evaluateNameRoster(target, [visibleTop1, hiddenTop2])
  const ranking = evaluateApiFootballPlayerCandidateRanking(evaluated)

  assert.equal(ranking.top1?.confidence, 100)
  assert.equal(ranking.top2?.confidence, 96)
  assert.equal(ranking.margin, 4)
  assert.equal(ranking.ambiguous, true)
  assert.equal(ranking.canAutoSave, false)
})

test("roster vazio não produz candidato", () => {
  const evaluated = evaluateNameRoster("Completely Different", [])
  const ranking = evaluateApiFootballPlayerCandidateRanking(evaluated)

  assert.deepEqual(evaluated, [])
  assert.equal(ranking.top1, null)
  assert.equal(ranking.canAutoSave, false)
})

test("avalia todos os candidatos válidos mesmo com vários irrelevantes", () => {
  const target = "Alpha Beta"
  const relevant = candidate({
    id: 2,
    name: "Alpha Beta",
    firstname: "Alpha",
    lastname: "Beta",
  })
  const firstIrrelevant = candidate({
    id: 1,
    name: "Zulu Other",
    firstname: "Zulu",
    lastname: "Other",
  })
  const secondIrrelevant = candidate({
    id: 3,
    name: "Completely Different",
    firstname: "Completely",
    lastname: "Different",
  })
  const invalid = candidate({
    name: "Alpha Beta",
    firstname: "Alpha",
    lastname: "Beta",
  })
  const evaluated = evaluateNameRoster(target, [
    firstIrrelevant,
    relevant,
    secondIrrelevant,
    invalid,
  ])
  const ranking = evaluateApiFootballPlayerCandidateRanking(evaluated)

  assert.deepEqual(
    evaluated.map((currentCandidate) => currentCandidate.apiFootballId),
    [1, 2, 3]
  )
  assert.deepEqual(
    evaluated.map((currentCandidate) => currentCandidate.nameScore),
    [0, 100, 0]
  )
  assert.equal(ranking.top1?.apiFootballId, 2)
})
