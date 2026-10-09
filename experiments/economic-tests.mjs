import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const mode = process.argv[2]
const dirs = ['futscout-value-v01', 'futscout-wage-v01', 'futscout-contract-clause-v01']
if (!['unit', 'scientific'].includes(mode)) throw new Error('MODE_UNIT_OR_SCIENTIFIC_REQUIRED')
if (mode === 'scientific') {
  const required = [
    'futscout-economic-dataset-v1-20261008/dataset.manifest.json',
    'salarysport-wage-sample-preflight-20261008/selection.json',
    'contract-evidence-pilot-20261008/selection.json', 'contract-evidence-pilot-20261008/evidence.json',
  ]
  if (required.some(p => !existsSync(resolve('audit/output', p)))) {
    console.error('SCIENTIFIC_BLOCKED: authorized local artifacts required; no tests passed or substituted.')
    process.exit(2)
  }
}
const files = mode === 'unit'
  ? dirs.flatMap(d => readdirSync(resolve('experiments', d)).filter(f => f.endsWith('.test.ts')).map(f => resolve('experiments', d, f)))
  : [resolve('experiments/economic-scientific.ts'), resolve('experiments/futscout-contract-clause-v01/evidence-adapter.scientific.ts')]
const child = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit', windowsHide: true })
if (child.error) throw child.error
process.exit(child.status ?? 1)
