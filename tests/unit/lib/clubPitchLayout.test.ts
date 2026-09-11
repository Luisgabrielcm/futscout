import assert from "node:assert/strict"
import { test } from "node:test"
import { XI_FORMATIONS, organizeClubPitch, groupClubSquad, pitchPositions, type PitchPlayer } from "../../../lib/clubPitchLayout"

const player = (position: string, id: string, extra: Partial<PitchPlayer> = {}): PitchPlayer => ({
  id, slug: `fixture-${id}`, name: `Player ${id}`, position, secondaryPosition: null, secondaryPositions: [],
  officialOverall: 80, potential: null, marketValue: null, imageUrl: null, ...extra,
})
const roster = (index = 0) => XI_FORMATIONS[index].rows.flat().map((p, i) => player(p, String(i)))

for (const [index, formation] of XI_FORMATIONS.entries()) test(`${formation.name}: exactly 11, one GK, compatible positions and no duplicate`, () => {
  const result = organizeClubPitch(roster(index))
  assert.equal(result.formation, formation.name)
  assert.equal(result.selected.length, 11)
  assert.equal(result.selected.filter(s => s.position === "GOL").length, 1)
  assert.equal(new Set(result.selected.map(s => s.player.id)).size, 11)
  assert.ok(result.selected.every(s => s.primary && s.position === s.player.position))
  assert.deepEqual(result.rows.map(r => r.length), formation.rows.map(r => r.length))
})
test("primary-position fit outranks a stronger secondary candidate", () => {
  const entries = roster()
  const extra = player("MEI", "strong-secondary", { secondaryPositions: ["PE"], officialOverall: 99 })
  const result = organizeClubPitch([...entries, extra])
  assert.equal(result.selected.find(s => s.position === "PE")!.player.id, "0")
  assert.ok(result.selected.every(s => s.primary))
})
test("accepts explicit secondary and legacy secondary; no greedy assignment strands a slot", () => {
  for (const secondary of [{ secondaryPositions: ["VOL"] }, { secondaryPosition: "VOL" }]) {
    const entries = roster()
    entries[3] = player("MC", "flex", { ...secondary, officialOverall: 99 })
    entries[4] = player("MC", "fixed")
    const result = organizeClubPitch(entries)
    assert.equal(result.selected.length, 11)
    assert.equal(result.selected.find(s => s.position === "VOL")!.player.id, "flex")
    assert.equal(result.selected.filter(s => !s.primary).length, 1)
  }
})
test("equal positional fit maximizes total EA OVR, not potential or market value", () => {
  const entries = roster()
  const stronger = player("ATA", "stronger", { officialOverall: 90 })
  const richer = player("ATA", "richer", { potential: 99, marketValue: BigInt(999000000) })
  const result = organizeClubPitch([...entries, stronger, richer])
  assert.equal(result.selected.find(s => s.position === "ATA")!.player.id, "stronger")
})
test("ties use stable name/id and fixed formation order, independent of input order", () => {
  const entries = [...roster(), player("ATA", "z", { name: "A" }), player("ATA", "a", { name: "A" })]
  const result = organizeClubPitch(entries)
  assert.equal(result.formation, "4-3-3")
  assert.equal(result.selected.find(s => s.position === "ATA")!.player.id, "a")
  assert.deepEqual(result, organizeClubPitch([...entries].reverse()))
  assert.deepEqual(result, organizeClubPitch([...entries.slice(4), ...entries.slice(0, 4)]))
})
test("missing fullbacks does not force a high-OVR incompatible defender", () => {
  const entries = roster().filter(p => !["LE", "LD"].includes(p.position))
  entries.push(player("ZAG", "extra", { officialOverall: 99 }))
  const result = organizeClubPitch(entries)
  assert.equal(result.formation, null)
  assert.equal(result.selected.length, 0)
  assert.equal(result.coverage, 9)
})
test("no wingers: complete compatible 3-5-2 is selected", () => {
  const entries = roster(4)
  assert.ok(entries.every(p => !["PE", "PD"].includes(p.position)))
  assert.equal(organizeClubPitch(entries).formation, "3-5-2")
})
test("coverage, missing GK, invalid OVR and fewer than 11 never fabricate a complete XI", () => {
  for (const entries of [[], roster().slice(0, 10), roster().filter(p => p.position !== "GOL"), roster().map((p, i) => i === 10 ? { ...p, officialOverall: NaN } : p)]) {
    const result = organizeClubPitch(entries)
    assert.equal(result.formation, null)
    assert.equal(result.selected.length, 0)
    assert.ok(result.coverage < 11)
  }
})
test("GK never plays outfield and outfield secondary GOL never becomes a goalkeeper", () => {
  const entries = roster().filter(p => p.position !== "PE")
  entries.push(player("GOL", "second-gk", { secondaryPositions: ["PE"], officialOverall: 99 }))
  assert.equal(organizeClubPitch(entries).formation, null)
  assert.equal(organizeClubPitch(roster().map(p => p.position === "GOL" ? { ...p, position: "MC", secondaryPositions: ["GOL"] } : p)).formation, null)
})
test("duplicate input identity cannot fill two slots and input is not mutated", () => {
  const entries = roster()
  const copy = structuredClone(entries)
  assert.deepEqual(organizeClubPitch([...entries, entries[0]]), organizeClubPitch(entries))
  assert.deepEqual(entries, copy)
})
test("formation prioritizes all-primary fit over a higher OVR secondary alternative", () => {
  const entries = roster(4)
  entries.push(player("MEI", "wing-left", { secondaryPositions: ["PE"], officialOverall: 99 }), player("MEI", "wing-right", { secondaryPositions: ["PD"], officialOverall: 99 }))
  assert.equal(organizeClubPitch(entries).formation, "3-5-2")
})
test("panel groups entire roster only by primary including unknown positions", () => {
  const entries = [...roster(), player("???", "unknown", { secondaryPositions: ["MC", "MC"], secondaryPosition: "VOL" })]
  const groups = groupClubSquad(entries)
  assert.equal(groups.flatMap(g => g.players).length, entries.length)
  assert.equal(new Set(groups.flatMap(g => g.players.map(p => p.id))).size, entries.length)
  assert.equal(groups.find(g => g.key === "otherPositions")!.players[0].id, "unknown")
  assert.deepEqual(pitchPositions(entries.at(-1)!), ["???", "MC", "VOL"])
})
test("panel orders OVR then available potential (zero before null), name and ID", () => {
  const entries = [player("MC", "null", { name: "A" }), player("MC", "zero", { potential: 0 }), player("MC", "z", { name: "Tie", potential: 90 }), player("MC", "a", { name: "Tie", potential: 90 }), player("MC", "strong", { officialOverall: 90 })]
  assert.deepEqual(groupClubSquad(entries)[0].players.map(p => p.id), ["strong", "a", "z", "zero", "null"])
  assert.equal(entries[0].potential, null)
})
