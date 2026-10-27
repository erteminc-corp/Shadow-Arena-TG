// Developer-only tests. NOT required to run or publish the game.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import worker,{validateInitData} from './worker.mjs';
const sql=new DatabaseSync(':memory:');
const DB={prepare(query){return {values:[],bind(...v){this.values=v;return this;},async first(){return sql.prepare(query).get(...this.values)||null;},async run(){return sql.prepare(query).run(...this.values);},query};},async batch(items){sql.exec('BEGIN');try{const r=[];for(const s of items)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={BOT_TOKEN:'test-only-not-a-real-token',WEBHOOK_SECRET:'test-webhook-secret',ADMIN_SECRET:'test-admin-secret',GAME_ORIGIN:'https://game.example',GAME_URL:'https://game.example/ashfall/',PAY_SUPPORT:'@developer',DB};
const calls=[];globalThis.fetch=async(url,opts)=>{calls.push({method:url.split('/').pop(),data:JSON.parse(opts.body)});return Response.json({ok:true,result:url.endsWith('createInvoiceLink')?'https://t.me/$test':true});};
const pending=[];const ctx={waitUntil(p){pending.push(p);}};
function init(id=42,date=Math.floor(Date.now()/1000)){const p=new URLSearchParams({auth_date:String(date),user:JSON.stringify({id,language_code:'uk'})});const check=[...p.entries()].sort().map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest();p.set('hash',createHmac('sha256',secret).update(check).digest('hex'));return p.toString();}
async function request(path,body,headers={}){return worker.fetch(new Request('https://worker.example'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:env.GAME_ORIGIN,...headers},body:JSON.stringify(body)}),env,ctx);}
let count=0;const check=(v,msg)=>{assert.ok(v,msg);count++;};
check(await validateInitData(init(),env.BOT_TOKEN)===42,'valid initData');await assert.rejects(()=>validateInitData(init().replace('42','43'),env.BOT_TOKEN));count++;await assert.rejects(()=>validateInitData(init(42,1),env.BOT_TOKEN));count++;
let r=await request('/admin',{action:'setup'},{Origin:'https://worker.example',Authorization:'Bearer '+env.ADMIN_SECRET});check(r.status===200,'setup');
check(calls.some(c=>c.method==='setWebhook'&&c.data.secret_token===env.WEBHOOK_SECRET),'authenticated webhook configured');
r=await request('/invoice',{amount:10,initData:init(),agree:true},{Origin:'https://evil.example'});check(r.status===403,'CORS rejects wrong origin');
r=await request('/invoice',{amount:11,initData:init(),agree:true});check(r.status===400,'amount allowlist');
r=await request('/invoice',{amount:10,initData:'bad',agree:true});check(r.status===401,'bad authentication');
r=await request('/invoice',{amount:10,initData:init(),agree:true});const invoice=await r.json();check(r.status===200&&invoice.url.startsWith('https://t.me/'),'invoice created');
check(calls.find(c=>c.method==='createInvoiceLink').data.currency==='XTR','XTR currency');
let update={update_id:1,pre_checkout_query:{id:'q1',from:{id:42},currency:'XTR',total_amount:10,invoice_payload:invoice.id}};
r=await request('/webhook',update);check(r.status===403,'webhook rejects missing secret');
const wh={'X-Telegram-Bot-Api-Secret-Token':env.WEBHOOK_SECRET};r=await request('/webhook',update,wh);check(r.status===200&&calls.at(-1).data.ok===true,'precheckout');
await request('/webhook',update,wh);check(calls.at(-1).data.ok===true,'same checkout idempotent');
await request('/webhook',{...update,pre_checkout_query:{...update.pre_checkout_query,id:'q2'}},wh);check(calls.at(-1).data.ok===false,'second checkout denied');
r=await request('/status',{initData:init(),id:invoice.id});check((await r.json()).paid===false,'precheckout not proof of payment');
update={update_id:2,message:{from:{id:42},successful_payment:{currency:'XTR',total_amount:10,invoice_payload:invoice.id,telegram_payment_charge_id:'charge-1'}}};
await request('/webhook',update,wh);await request('/webhook',update,wh);check(sql.prepare('SELECT COUNT(*) AS n FROM payments').get().n===1,'duplicate payment deduplicated');
r=await request('/status',{initData:init(),id:invoice.id});check((await r.json()).paid===true,'server confirmation');
r=await request('/status',{initData:init(43),id:invoice.id});check((await r.json()).paid===false,'payment owner protected');
await request('/webhook',{update_id:3,message:{from:{id:42,language_code:'uk'},chat:{id:42},text:'/paysupport'}},wh);check(calls.at(-1).method==='sendMessage'&&calls.at(-1).data.text.includes('@developer'),'support command');
for(let i=0;i<6;i++)r=await request('/invoice',{amount:25,initData:init(),agree:true});check(r.status===429,'rate limit');
await Promise.all(pending);console.log(`PASS: ${count} payment checks (mock Telegram + real SQLite; no live transactions).`);
