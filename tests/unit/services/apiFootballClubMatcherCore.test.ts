import assert from "node:assert/strict"
import test from "node:test"

import {
  calculateClubScore,
  getClubSearchTerm,
  normalizeClubMatcherText,
  normalizeClubName,
  rankApiFootballClubCandidates,
  selectBestApiFootballClubCandidate,
} from "../../../services/apiFootballClubMatcherCore"

function team(
  id: number | undefined,
  name: string | undefined
) {
  return {
    team: {
      id,
      name,
    },
  }
}

test("atribui 100 para igualdade exata normalizada", () => {
  assert.equal(
    calculateClubScore(
      "Real Madrid",
      "Real Madrid"
    ),
    100
  )
})

test("remove acentos na normalização textual", () => {
  assert.equal(
    normalizeClubMatcherText(
      "Atlético"
    ),
    normalizeClubMatcherText(
      "Atletico"
    )
  )
})

test("preserva a remoção dos sufixos genéricos existentes", () => {
  for (const suffix of [
    "FC",
    "CF",
    "SC",
    "AC",
    "AFC",
    "Club",
    "Football",
    "Futbol",
    "Futebol",
  ]) {
    assert.equal(
      normalizeClubName(
        `Real Madrid ${suffix}`
      ),
      "real madrid"
    )
  }
})

test("preserva a equivalência Bayern München e Bayern Munich", () => {
  assert.equal(
    calculateClubScore(
      "Bayern München",
      "Bayern Munich"
    ),
    100
  )
})

test("produz termos de busca canonicalizados", () => {
  assert.equal(
    getClubSearchTerm(
      "Man Utd"
    ),
    "manchester united"
  )
  assert.equal(
    getClubSearchTerm(
      "Paris SG"
    ),
    "paris saint germain"
  )
  assert.equal(
    getClubSearchTerm(
      "Atlético de Madrid"
    ),
    "atletico madrid"
  )
  assert.equal(
    getClubSearchTerm(
      "Bayern München"
    ),
    "Bayern"
  )
})

test("rejeita equipes femininas", () => {
  for (const candidate of [
    "Real Madrid W",
    "Real Madrid Women",
    "Real Madrid Feminino",
    "Real Madrid Femenino",
    "Real Madrid Frauen",
  ]) {
    assert.equal(
      calculateClubScore(
        "Real Madrid",
        candidate
      ),
      0
    )
  }
})

test("rejeita equipes youth e academy", () => {
  for (const candidate of [
    "Real Madrid U19",
    "Real Madrid Youth",
    "Real Madrid Academy",
  ]) {
    assert.equal(
      calculateClubScore(
        "Real Madrid",
        candidate
      ),
      0
    )
  }
})

test("rejeita equipes reserve, II e III", () => {
  for (const candidate of [
    "Real Madrid Reserve",
    "Real Madrid II",
    "Real Madrid III",
  ]) {
    assert.equal(
      calculateClubScore(
        "Real Madrid",
        candidate
      ),
      0
    )
  }
})

test("descarta candidatos sem id ou sem nome", () => {
  const ranked =
    rankApiFootballClubCandidates(
      "Real Madrid",
      [
        team(undefined, "Real Madrid"),
        team(1, undefined),
      ]
    )

  assert.deepEqual(ranked, [])
})

test("canonicaliza o conector de Atlético de Madrid como match forte", () => {
  assert.equal(
    calculateClubScore(
      "Atlético de Madrid",
      "Atletico Madrid"
    ),
    100
  )
})

test("canonicaliza o alias composto Man Utd como match forte", () => {
  assert.equal(
    calculateClubScore(
      "Man Utd",
      "Manchester United"
    ),
    100
  )
})

test("não expande Utd isoladamente", () => {
  assert.equal(
    calculateClubScore(
      "Utd",
      "Manchester United"
    ),
    0
  )
})

test("canonicaliza o alias contextual Paris SG como match forte", () => {
  assert.equal(
    calculateClubScore(
      "Paris SG",
      "Paris Saint Germain"
    ),
    100
  )
})

test("não expande SG isoladamente", () => {
  assert.equal(
    calculateClubScore(
      "SG",
      "Paris Saint Germain"
    ),
    0
  )
})

test("não cria mapping automático para Lombardia FC", () => {
  assert.equal(
    calculateClubScore(
      "Lombardia FC",
      "Completely Different"
    ),
    0
  )
})

test("não torna United persistível apenas por substring", () => {
  assert.ok(
    calculateClubScore(
      "United",
      "Newcastle United"
    ) < 90
  )
})

test("não torna Inter persistível apenas por substring", () => {
  assert.ok(
    calculateClubScore(
      "Inter",
      "Internacional"
    ) < 90
  )
})

test("não torna Manchester persistível apenas por substring", () => {
  assert.ok(
    calculateClubScore(
      "Manchester",
      "Manchester United"
    ) < 90
  )
})

test("seleciona candidato único com nome exato", () => {
  const ranked =
    rankApiFootballClubCandidates(
      "Real Madrid",
      [team(541, "Real Madrid")]
    )

  assert.equal(
    selectBestApiFootballClubCandidate(
      ranked
    )?.item.team?.id,
    541
  )
})

test("não seleciona candidato único por substring curta perigosa", () => {
  const ranked =
    rankApiFootballClubCandidates(
      "United",
      [team(34, "Newcastle United")]
    )

  assert.equal(
    selectBestApiFootballClubCandidate(
      ranked
    ),
    undefined
  )
})

test("rejeita seleção automática quando os melhores candidatos empatam", () => {
  const candidates = [
    team(541, "Real Madrid"),
    team(999, "Real Madrid CF"),
  ]

  for (const ordered of [
    candidates,
    [...candidates].reverse(),
  ]) {
    const ranked =
      rankApiFootballClubCandidates(
        "Real Madrid",
        ordered
      )

    assert.equal(
      selectBestApiFootballClubCandidate(
        ranked
      ),
      undefined
    )
  }
})
