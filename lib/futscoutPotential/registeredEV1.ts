import { calculateFutscoutPotentialEV1 } from "./modelEV1"
import { POTENTIAL_INPUT_CONTRACT } from "./fingerprint"
import { FUTSCOUT_POTENTIAL_E_V1 } from "./types"

/** Source artifact recipe is frozen in docs/futscout-potential-writer-contract.md. */
export const FUTSCOUT_E_V1_REGISTRATION = Object.freeze({
  version: FUTSCOUT_POTENTIAL_E_V1,
  artifactHash: "e6971c191436110477728714cdd9f09648bf2c0d776b78aef63863092d21b216",
  inputContractVersion: POTENTIAL_INPUT_CONTRACT,
  calculate: calculateFutscoutPotentialEV1,
})
