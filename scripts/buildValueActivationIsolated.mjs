// Reproducible build with no inherited database destination or API credentials.
// Webpack is the documented alternative to the local Turbopack CSS worker panic.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const env = { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '',
  SITE_URL: 'https://futscout.invalid',
  DATABASE_URL: 'postgresql://build_disabled:build_disabled@127.0.0.1:9/futscout_build_disabled?connect_timeout=1',
  DIRECT_URL: 'postgresql://build_disabled:build_disabled@127.0.0.1:9/futscout_build_disabled?connect_timeout=1',
  API_FOOTBALL_KEY: '', FOOTYSTATS_API_KEY: '', LIVE_FOOTBALL_API_KEY: '' }
for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'])
  if (process.env[key]) env[key] = process.env[key]
env.Path = `${path.dirname(process.execPath)}${path.delimiter}${process.env.Path ?? process.env.PATH ?? ''}`
if (process.argv.length !== 2) throw Error('ISOLATED_BUILD_ACCEPTS_NO_OVERRIDES')
fs.mkdirSync('audit/output', { recursive: true })
const log = fs.createWriteStream('audit/output/value-final-activation-webpack-build.log')
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'],
  { env, cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log.write(chunk); process.stdout.write(chunk) })
child.on('error', error => { console.error(error.code); process.exitCode = 1; log.end() })
child.on('exit', code => { console.log(`ISOLATED_BUILD_EXIT=${code}`); process.exitCode = code ?? 1; log.end() })
