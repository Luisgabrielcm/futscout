import {
  GOALKEEPER_ATTRIBUTE_FIELDS,
  type GoalkeeperAttributeField,
  type PlayerGoalkeeperAttributes,
} from "../types/goalkeeperAttributes"

export type GoalkeeperScoutAnalysis = Readonly<{
  strongest: ReadonlyArray<{ field: GoalkeeperAttributeField; value: number }>
  lowest: ReadonlyArray<{ field: GoalkeeperAttributeField; value: number }>
}>

export function generateGoalkeeperScoutAnalysis(
  attributes: PlayerGoalkeeperAttributes | null,
): GoalkeeperScoutAnalysis | null {
  if (!attributes) return null

  const values = GOALKEEPER_ATTRIBUTE_FIELDS.map((field) => ({
    field,
    value: attributes[field],
  }))
  if (values.some(({ value }) => !Number.isInteger(value) || value < 0 || value > 99)) return null

  const strongest = [...values]
    .sort((left, right) => right.value - left.value || left.field.localeCompare(right.field))
    .slice(0, 2)
  const lowest = [...values]
    .sort((left, right) => left.value - right.value || left.field.localeCompare(right.field))
    .slice(0, 2)

  return { strongest, lowest }
}
