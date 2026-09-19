export const GOALKEEPER_ATTRIBUTE_FIELDS = [
  "diving",
  "handling",
  "kicking",
  "positioning",
  "reflexes",
] as const

export type GoalkeeperAttributeField = typeof GOALKEEPER_ATTRIBUTE_FIELDS[number]

export type GoalkeeperAttributeValues = Readonly<Record<GoalkeeperAttributeField, number>>

export type GoalkeeperAttributePatch = Readonly<
  Partial<Record<GoalkeeperAttributeField, number>>
>

export type PlayerGoalkeeperAttributes = GoalkeeperAttributeValues & Readonly<{
  provider: string
  observedAt: string
}>
