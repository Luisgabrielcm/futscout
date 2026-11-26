import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { parsePrivateEstimateScope } from '../../../lib/economicData/privateEstimateScope'
const entry={playerId:'synthetic-player',eaId:'9000001',contentHash:'a'.repeat(64),method:'B_PARTIAL_CONTEXT'}
const digest=(s:string)=>createHash('sha256').update(s).digest('hex')
const raw=JSON.stringify({version:1,entries:[entry]})
test('disabled by default',()=>assert.deepEqual(parsePrivateEstimateScope(),[]))
test('exact deployment scope',()=>assert.deepEqual(parsePrivateEstimateScope(raw,digest(raw)),[entry]))
test('rejects absent or changed digest',()=>{assert.throws(()=>parsePrivateEstimateScope(raw));assert.throws(()=>parsePrivateEstimateScope(raw,'0'.repeat(64)))})
test('rejects duplicate identity and data fields',()=>{for(const entries of [[entry,entry],[{...entry,amount:1}],[{...entry,method:'LIVE_FOOTBALL'}],[{...entry,eaId:9000001}]]){const s=JSON.stringify({version:1,entries});assert.throws(()=>parsePrivateEstimateScope(s,digest(s)))}})
test('rejects empty and oversized scopes',()=>{for(const s of [JSON.stringify({version:1,entries:[]}),raw+' '.repeat(8192)])assert.throws(()=>parsePrivateEstimateScope(s,digest(s)))})
