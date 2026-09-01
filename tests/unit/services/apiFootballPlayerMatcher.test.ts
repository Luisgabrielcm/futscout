import assert from "node:assert/strict"
import test from "node:test"

import {
  calculateNameScore,
  canAutomaticallySave,
  classifyMatchConfidence,
  type ApiFootballPlayerMatchClassification,
} from "../../../services/apiFootballPlayerMatcherCore"

function candidate({
  name,
  firstname,
  lastname,
}: {
  name?: string | null
  firstname?: string | null
  lastname?: string | null
}) {
  return {
    player: {
      name,
      firstname,
      lastname,
    },
  }
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
