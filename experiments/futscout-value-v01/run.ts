import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, isAbsolute, sep } from 'node:path'
import { assertTrainingLicense, sha256, type Artifact } from './engine'
import { evaluateFrozenDataset, EXPECTED_MANIFEST_HASH, trainFrozenDataset, verifyFrozenSplits } from './pipeline'

const DATA = resolve('audit/output/futscout-economic-dataset-v1-20261008')
const CODE = resolve('experiments/futscout-value-v01')
function demand(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code) }
const json = (x: unknown) => JSON.stringify(x, null, 2) + '\n'
function auditPath(value: string | undefined) {
  demand(value, 'EXPLICIT_AUDIT_DIRECTORY_REQUIRED')
  const full = resolve(value), root = resolve('audit/output')
  const inside = (parent: string) => { const r = relative(parent, full); return r === '' || (r !== '..' && !r.startsWith('..' + sep) && !isAbsolute(r)) }
  demand(full !== root && inside(root) && !inside(DATA), 'OUTPUT_MUST_BE_SEPARATE_AUDIT_DIRECTORY')
  return full
}
function codeHashes() {
  return Object.fromEntries(['engine.ts', 'pipeline.ts', 'run.ts', 'hybrid.ts', 'VALIDATION.md'].map(f => [f, sha256(readFileSync(join(CODE, f)))]))
}
export function runCommand(args: string[]) {
  if (args.length === 1 && args[0] === 'check') return { status: 'FROZEN_INPUTS_VERIFIED', ...verifyFrozenSplits(DATA) }
  demand(['train', 'evaluate'].includes(args[0]), 'COMMAND_CHECK_TRAIN_OR_EVALUATE_REQUIRED')
  assertTrainingLicense('LIVE_FOOTBALL') // Before file creation, loading labels, fitting or evaluation.
  if (args[0] === 'train') {
    demand(args.length === 2, 'TRAIN_REQUIRES_NEW_AUDIT_DIRECTORY')
    const out = auditPath(args[1]); demand(!existsSync(out), 'ATTEMPT_EXISTS')
    const artifacts = trainFrozenDataset(DATA)
    mkdirSync(out)
    const hashes: Record<string, string> = {}
    for (const key of ['A', 'B'] as const) {
      const body = json(artifacts[key]); writeFileSync(join(out, `${key}.json`), body, { flag: 'wx' }); hashes[key] = sha256(body)
    }
    writeFileSync(join(out, 'training.manifest.json'), json({ datasetManifestHash: EXPECTED_MANIFEST_HASH, artifacts: hashes, code: codeHashes(), evaluationExecuted: false, publicationApproved: false }), { flag: 'wx' })
    return { status: 'OFFLINE_ARTIFACTS_FROZEN', directory: out, hashes }
  }
  demand(args.length === 3, 'EVALUATE_REQUIRES_TRAINING_AND_NEW_REPORT_DIRECTORIES')
  const training = auditPath(args[1]), out = auditPath(args[2]); demand(!existsSync(out), 'REPORT_EXISTS')
  const manifestBytes = readFileSync(join(training, 'training.manifest.json'))
  const manifest = JSON.parse(manifestBytes.toString()) as { datasetManifestHash: string; artifacts: Record<string, string>; code: Record<string, string> }
  demand(manifest.datasetManifestHash === EXPECTED_MANIFEST_HASH, 'TRAINING_MANIFEST_MISMATCH')
  for (const [f, h] of Object.entries(codeHashes())) demand(manifest.code[f] === h, 'CODE_OR_PREREGISTRATION_CHANGED')
  const artifacts = {} as { A: Artifact; B: Artifact }
  for (const key of ['A', 'B'] as const) {
    const body = readFileSync(join(training, `${key}.json`)); demand(sha256(body) === manifest.artifacts[key], 'ARTIFACT_FILE_CHANGED')
    artifacts[key] = JSON.parse(body.toString())
  }
  const report = evaluateFrozenDataset(DATA, artifacts)
  mkdirSync(out)
  writeFileSync(join(out, 'evaluation.json'), json({ trainingManifestHash: sha256(manifestBytes), datasetManifestHash: EXPECTED_MANIFEST_HASH, report, publicationApproved: false }), { flag: 'wx' })
  return { status: 'EVALUATED_WITHOUT_FITTING_OR_SELECTION', directory: out }
}
if (require.main === module) {
  try { console.log(JSON.stringify(runCommand(process.argv.slice(2)))) }
  catch (error) { console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'OFFLINE_COMMAND_FAILED'); process.exitCode = 1 }
}
