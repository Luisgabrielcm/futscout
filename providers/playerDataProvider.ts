import type {
    ExternalPlayer,
} from "../types/externalPlayer"

export interface PlayerDataProvider {
  readonly source: string

  getPlayers(): Promise<
    ExternalPlayer[]
  >
}