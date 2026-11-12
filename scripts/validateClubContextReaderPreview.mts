/** Local A/B browser verification. Synthetic economics; no Production connections. */
import assert from 'node:assert/strict'
import { readFile, writeFile, open } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { Pool } from 'pg'
import { clubContextReadEaIds, clubContextReadPilot } from '../lib/clubContextReadGate'
const playwrightModule='file:///C:/Users/Antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium } = await import(playwrightModule)
const folder='audit/output/club-contexts-readers-preview'
const target=JSON.parse(await readFile(`${folder}/target.private.json`,'utf8'))
assert.equal(target.fixtureOnly,true); assert.match(target.url,/^postgresql:\/\/clubctxread_\d+@127\.0\.0\.1:54339\/clubctxreadpreview_\d+$/)
const db=new Pool({connectionString:target.url,max:1})
assert.equal((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on')
async function fingerprint(){
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows
 const result:Record<string,unknown>={}
 for(const {tablename} of tables){assert.match(tablename,/^[A-Za-z_][A-Za-z0-9_]*$/)
 result[tablename]=(await db.query(`SELECT count(*)::int AS rows, md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) h FROM "${tablename}" t) x`)).rows[0]}
 return result
}
const before=await fingerprint()
const env:NodeJS.ProcessEnv={NODE_ENV:'development'}
for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','HOMEDRIVE','HOMEPATH','PATHEXT'])if(process.env[key])env[key]=process.env[key]
Object.assign(env,{DATABASE_URL:target.url,DIRECT_URL:'postgresql://unused@127.0.0.1:1/unused',NEXT_TELEMETRY_DISABLED:'1',VERCEL_ENV:'preview',CLUB_CONTEXTS_READ_PRODUCTION_ENABLED:'0',CLUB_CONTEXTS_READ_EA_IDS:clubContextReadEaIds.join(','),CLUB_CONTEXTS_READ_PILOT_HASH:clubContextReadPilot.manifestHash})
let server:ReturnType<typeof spawn>|undefined
async function start(enabled:boolean){
 const log=await open(`${folder}/server-${enabled?'on':'off'}.log`,'a')
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3144'],{env:{...env,CLUB_CONTEXTS_READ_ENABLED:enabled?'1':'0'},windowsHide:true,stdio:['ignore',log.fd,log.fd],detached:true})
 server.unref(); await log.close()
 for(let i=0;i<90;i++){try{const r=await fetch('http://127.0.0.1:3144/pt/jogadores/fixture-218191');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,1000))}
 throw Error('LOCAL_PREVIEW_START_TIMEOUT')
}
function stop(){if(server?.pid)spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});server=undefined}
const browser=await chromium.launch({channel:'msedge',headless:true})
const baseline:Record<string,unknown>={};const checks:unknown[]=[]
try{
 for(const enabled of [false,true]){
 await start(enabled)
 for(const width of enabled?[1365,390]:[1365]){
 const context=await browser.newContext({viewport:{width,height:1000}})
 await context.route('**/*',(route:{request():{url():string};continue():Promise<void>;abort():Promise<void>})=>new URL(route.request().url()).origin==='http://127.0.0.1:3144'?route.continue():route.abort())
 const page=await context.newPage()
 for(const eaId of [...clubContextReadEaIds,'999999999'])for(const real of [false,true]){
 const slug=eaId==='999999999'?'unrelated-homonym':`fixture-${eaId}`
 const path=`/pt/jogadores/${slug}${real?'/vida-real':''}`
 const response=await page.goto(`http://127.0.0.1:3144${path}`,{waitUntil:'networkidle'});assert.equal(response?.status(),200,path)
 const main=await page.locator('main').innerText()
 await writeFile(`${folder}/last-page.txt`,main)
 const economics=await page.locator('.playerHeader dl.careerFields').allInnerTexts()
 const stats=await page.locator('.playerHeaderStat').allInnerTexts()
 const key=`${eaId}:${real}`
 if(!enabled)baseline[key]={economics,stats,main}
 else{
 const saved=baseline[key] as {economics:string[];stats:string[];main:string}
 assert.deepEqual(economics,saved.economics);assert.deepEqual(stats,saved.stats)
 if(eaId==='999999999'){assert.equal(await page.locator('.playerClubContexts').count(),0);assert.equal(main,saved.main)}
 else{
 const contexts=await page.locator('.playerClubContexts').first().innerText()
 assert.match(contexts,/NG - FA/);assert.match(contexts,eaId==='225964'?/Flamengo/:/Palmeiras/)
 assert.match(contexts,/No jogo · FC27/);assert.match(contexts,/vida real/i)
 assert.match(contexts,/não comprova ausência de contrato real/)
 assert.match(contexts,/Data do elenco não comprovada/)
 assert.match(contexts,/12\/11\/2026/)
 assert.match(contexts,/fonte|consultad|observad/i)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${path} ${width}`)
 await page.screenshot({path:`${folder}/synthetic-${eaId}-${real?'real':'game'}-${width}.png`,fullPage:true})
 }
 checks.push({eaId,page:real?'real':'game',width,economicsUnchanged:true,scoped:true})
 }
 }
 await context.close()
 }
 if(!enabled)stop()
 }
 assert.deepEqual(await fingerprint(),before)
 await writeFile(`${folder}/validation.json`,JSON.stringify({status:'READER_PREVIEW_VALIDATED',preview:'http://127.0.0.1:3144',fixtureOnly:true,economics:'SYNTHETIC_FIXTURES_NOT_REAL_PLAYER_VALUES',databaseUnchanged:true,readOnly:true,productionConnections:0,productionActivation:false,checks,serverPid:server?.pid},null,2))
 console.log('READER_PREVIEW_VALIDATED: 20 scoped page/viewport checks; all table hashes unchanged; Preview kept on port 3144')
}catch(error){stop();throw error}finally{await browser.close();await db.end()}
