/** Cloudflare Worker + D1. Payments ONLY. No gameplay data, no client secrets. */
const AMOUNTS=new Set([10,25,50,100]);
const enc=new TextEncoder();
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
async function mac(key,text){const k=await crypto.subtle.importKey('raw',typeof key==='string'?enc.encode(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(text)));}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(a))),y=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(b)));return x.reduce((v,n,i)=>v|(n^y[i]),0)===0;}
export async function validateInitData(raw,token,now=Math.floor(Date.now()/1000)){
 if(typeof raw!=='string'||raw.length>12000)throw Error('Unauthorized');const p=new URLSearchParams(raw);const seen=new Set();for(const [k]of p){if(seen.has(k))throw Error('Unauthorized');seen.add(k);}const hash=p.get('hash');p.delete('hash');if(!/^[0-9a-f]{64}$/.test(hash||''))throw Error('Unauthorized');
 const date=Number(p.get('auth_date'));if(!Number.isFinite(date)||date<now-3600||date>now+30)throw Error('Expired');const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');const secret=await mac('WebAppData',token);if(!await equal(hash,hex(await mac(secret,check))))throw Error('Unauthorized');
 const user=JSON.parse(p.get('user')||'null');if(!Number.isSafeInteger(user?.id)||user.id<=0)throw Error('Unauthorized');return user.id;
}
async function bot(env,method,data){const r=await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${env.TELEGRAM_TEST==='true'?'test/':''}${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});const j=await r.json();if(!r.ok||!j.ok)throw Error('Telegram request failed');return j.result;}
const schema=[
'CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, uid INTEGER NOT NULL, amount INTEGER NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, checkout TEXT, paid INTEGER NOT NULL DEFAULT 0)',
'CREATE TABLE IF NOT EXISTS payments (charge TEXT PRIMARY KEY, invoice TEXT UNIQUE NOT NULL, uid INTEGER NOT NULL, amount INTEGER NOT NULL, created INTEGER NOT NULL)',
'CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, n INTEGER NOT NULL, expires INTEGER NOT NULL)',
'CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY, created INTEGER NOT NULL)',
'CREATE INDEX IF NOT EXISTS invoice_expiry ON invoices(expires)',
'CREATE INDEX IF NOT EXISTS rate_expiry ON limits(expires)'];
async function limit(env,key,max,seconds){const now=Math.floor(Date.now()/1000),bucket=Math.floor(now/seconds),id=`${key}:${bucket}`;const row=await env.DB.prepare('INSERT INTO limits(key,n,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n').bind(id,now+seconds*2).first();return row.n<=max;}
const langOf=raw=>raw?.startsWith('uk')?'uk':raw?.startsWith('ru')?'ru':raw?.startsWith('es')?'es':'en';
const messages={en:{title:'Support ASHFALL',desc:'Voluntary support. No gameplay rewards.',support:'Payment help and refund requests: ',terms:'Support is optional and grants no game rewards. Contact payment support for questions or refunds: ',error:'This invoice is invalid or has expired. Open a new one in the game.',start:'Play SHADOW ARENA: ASHFALL using the menu button. /paysupport — payment help. /terms — support terms.'},uk:{title:'Підтримка ASHFALL',desc:'Добровільна підтримка. Без ігрових винагород.',support:'Допомога з оплатою та запити на повернення: ',terms:'Підтримка добровільна та не надає ігрових винагород. Питання й повернення: ',error:'Рахунок недійсний або прострочений. Відкрий новий у грі.',start:'Грай у SHADOW ARENA: ASHFALL через кнопку меню. /paysupport — допомога з оплатою. /terms — умови підтримки.'},ru:{title:'Поддержка ASHFALL',desc:'Добровольная поддержка. Без игровых наград.',support:'Помощь с оплатой и запросы на возврат: ',terms:'Поддержка добровольная и не даёт игровых наград. Вопросы и возвраты: ',error:'Счёт недействителен или истёк. Открой новый в игре.',start:'Играй в SHADOW ARENA: ASHFALL через кнопку меню. /paysupport — помощь с оплатой. /terms — условия поддержки.'},es:{title:'Apoyar ASHFALL',desc:'Apoyo voluntario. Sin recompensas en el juego.',support:'Ayuda con pagos y solicitudes de reembolso: ',terms:'El apoyo es opcional y no otorga recompensas. Preguntas y reembolsos: ',error:'Esta factura no es válida o venció. Abre una nueva en el juego.',start:'Juega SHADOW ARENA: ASHFALL con el botón del menú. /paysupport — ayuda con pagos. /terms — condiciones.'}};
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Timeout')),ms);})]);}finally{clearTimeout(timer);}}
async function webhook(update,env){const now=Math.floor(Date.now()/1000);
 if(update.pre_checkout_query){const q=update.pre_checkout_query,m=messages[langOf(q.from?.language_code)];let ok=false;if(q.currency==='XTR'&&AMOUNTS.has(q.total_amount)){
 try{const result=await bounded(env.DB.prepare('UPDATE invoices SET checkout=? WHERE id=? AND uid=? AND amount=? AND paid=0 AND expires>? AND (checkout IS NULL OR checkout=?) RETURNING id').bind(q.id,q.invoice_payload,q.from.id,q.total_amount,now,q.id).first(),1800);ok=!!result;}catch{ok=false;}}
 await bot(env,'answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok,...(!ok?{error_message:m.error}:{})});return;
 }
 const msg=update.message;if(!msg)return;
 if(msg.successful_payment){const p=msg.successful_payment;if(p.currency!=='XTR'||!AMOUNTS.has(p.total_amount))throw Error('Payment mismatch');const row=await env.DB.prepare('SELECT * FROM invoices WHERE id=?').bind(p.invoice_payload).first();if(!row||!row.checkout||row.uid!==msg.from.id||row.amount!==p.total_amount)throw Error('Payment mismatch');
 // D1 batch is transactional. Unique invoice/charge keys make webhook retries idempotent.
 await env.DB.batch([env.DB.prepare('INSERT INTO payments(charge,invoice,uid,amount,created) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING').bind(p.telegram_payment_charge_id,row.id,row.uid,row.amount,now),env.DB.prepare('UPDATE invoices SET paid=1 WHERE id=? AND EXISTS(SELECT 1 FROM payments WHERE invoice=? AND charge=?)').bind(row.id,row.id,p.telegram_payment_charge_id)]);return;
 }
 if(typeof msg.text!=='string'||!msg.text.startsWith('/'))return;
 const cmd=msg.text.split(/[ @]/)[0];if(!['/start','/paysupport','/support','/terms'].includes(cmd))return;
 if(!await limit(env,`cmd:${msg.from.id}`,6,60))return;
 const inserted=await env.DB.prepare('INSERT OR IGNORE INTO updates(id,created) VALUES(?,?) RETURNING id').bind(update.update_id,now).first();if(!inserted)return;
 const m=messages[langOf(msg.from.language_code)],text=cmd==='/start'?m.start:(cmd==='/terms'?m.terms:m.support)+env.PAY_SUPPORT;
 try{await bot(env,'sendMessage',{chat_id:msg.chat.id,text});}catch(e){await env.DB.prepare('DELETE FROM updates WHERE id=?').bind(update.update_id).run();throw e;}
}
const adminPage=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>ASHFALL · Payments setup</title><style>body{background:#111725;color:#ddd;font:16px system-ui;max-width:620px;margin:30px auto;padding:20px}input,button{display:block;box-sizing:border-box;width:100%;padding:12px;margin:12px 0;background:#222d40;color:white;border:1px solid #607080}pre{white-space:pre-wrap;word-break:break-word}</style><h1>ASHFALL · Stars</h1><p>Only the owner should use this page. Enter ADMIN_SECRET, never BOT_TOKEN.</p><input id="key" type="password" autocomplete="off" placeholder="ADMIN_SECRET"><button data-action="setup">Initialize database + register webhook</button><button data-action="status">Webhook status + Stars balance</button><input id="uid" placeholder="Refund: Telegram user ID"><input id="charge" placeholder="Refund: payment charge ID"><button data-action="refund">Refund this payment</button><pre id="out"></pre><script>document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{const action=b.dataset.action;if(action==='refund'&&!confirm('Refund the specified Stars payment?'))return;b.disabled=true;try{const r=await fetch('/admin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+document.querySelector('#key').value},body:JSON.stringify({action,user_id:Number(document.querySelector('#uid').value),charge:document.querySelector('#charge').value})});document.querySelector('#out').textContent=JSON.stringify(await r.json(),null,2)}catch{document.querySelector('#out').textContent='Request failed'}finally{b.disabled=false}})</script>`;
export default {
 async fetch(request,env,ctx){const url=new URL(request.url),origin=request.headers.get('Origin');const cors=origin===env.GAME_ORIGIN?{'Access-Control-Allow-Origin':env.GAME_ORIGIN,'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}:{};
 if(url.pathname==='/admin'&&request.method==='GET')return new Response(adminPage,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"}});
 if(request.method==='OPTIONS')return new Response(null,{status:origin===env.GAME_ORIGIN?204:403,headers:cors});
 if(request.method!=='POST')return json({error:'Not found'},404);
 if(Number(request.headers.get('Content-Length')||0)>16000)return json({error:'Too large'},413,cors);
 if(!env.BOT_TOKEN||!env.WEBHOOK_SECRET||!env.DB||!env.GAME_ORIGIN||!env.PAY_SUPPORT)return json({error:'Unavailable'},503,cors);
 try{
  if(url.pathname==='/webhook'){
   if(!await equal(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),env.WEBHOOK_SECRET))return json({error:'Forbidden'},403);
   const text=await request.text();if(text.length>16000)return json({error:'Too large'},413);await webhook(JSON.parse(text),env);return json({ok:true});
  }
  if(url.pathname==='/admin'){
   if(!env.ADMIN_SECRET||!await equal(request.headers.get('Authorization'),`Bearer ${env.ADMIN_SECRET}`))return json({error:'Forbidden'},403);
   // Browser Origin must be the Worker's own origin; CLI requests without Origin also work.
   if(origin&&origin!==url.origin)return json({error:'Forbidden'},403);
   const body=await request.json();if(body.action==='setup'){
    if(!/^https:\/\//.test(env.GAME_ORIGIN)||!/^https:\/\//.test(env.GAME_URL||''))return json({error:'HTTPS configuration required'},400);
    await env.DB.batch(schema.map(s=>env.DB.prepare(s)));
    await bot(env,'setWebhook',{url:url.origin+'/webhook',secret_token:env.WEBHOOK_SECRET,allowed_updates:['message','pre_checkout_query'],drop_pending_updates:false});
    await bot(env,'setMyCommands',{commands:[{command:'start',description:'Play ASHFALL'},{command:'paysupport',description:'Payment help and refund requests'},{command:'support',description:'Contact support'},{command:'terms',description:'Voluntary support terms'}]});
    await bot(env,'setChatMenuButton',{menu_button:{type:'web_app',text:'PLAY',web_app:{url:env.GAME_URL}}});return json({ok:true,test:env.TELEGRAM_TEST==='true'});
   }if(body.action==='status'){const webhook=await bot(env,'getWebhookInfo',{}),balance=await bot(env,'getMyStarBalance',{});return json({webhook,balance});}
   if(body.action==='refund'){
    const payment=await env.DB.prepare('SELECT uid FROM payments WHERE charge=?').bind(body.charge).first();if(!payment||payment.uid!==body.user_id)return json({error:'Payment not found'},404);
    await bot(env,'refundStarPayment',{user_id:payment.uid,telegram_payment_charge_id:body.charge});return json({ok:true});
   }return json({error:'Unknown action'},400);
  }
  if(!['/invoice','/status'].includes(url.pathname))return json({error:'Not found'},404,cors);
  if(origin!==env.GAME_ORIGIN)return json({error:'Forbidden origin'},403,cors);
  const text=await request.text();if(text.length>16000)return json({error:'Too large'},413,cors);const data=JSON.parse(text);let uid;try{uid=await validateInitData(data.initData,env.BOT_TOKEN);}catch{return json({error:'Reopen the Mini App to authenticate'},401,cors);}
  if(!await limit(env,`api:${uid}`,url.pathname==='/invoice'?5:40,60))return json({error:'Rate limited'},429,cors);
  if(url.pathname==='/status'){const row=await env.DB.prepare('SELECT paid FROM invoices WHERE id=? AND uid=?').bind(String(data.id||''),uid).first();return json({paid:row?.paid===1},200,cors);}
  if(!AMOUNTS.has(data.amount)||data.agree!==true)return json({error:'Invalid donation'},400,cors);
  const now=Math.floor(Date.now()/1000),id=crypto.randomUUID(),m=messages[langOf(data.language)];await env.DB.prepare('INSERT INTO invoices(id,uid,amount,created,expires) VALUES(?,?,?,?,?)').bind(id,uid,data.amount,now,now+1800).run();
  let link;try{link=await bot(env,'createInvoiceLink',{title:m.title,description:m.desc,payload:id,currency:'XTR',provider_token:'',prices:[{label:m.title,amount:data.amount}]});}catch{await env.DB.prepare('DELETE FROM invoices WHERE id=? AND checkout IS NULL').bind(id).run();return json({error:'Telegram unavailable'},502,cors);}
  // Retain payment identifiers for refund support; remove expired unpaid requests and transient limits.
  ctx.waitUntil(env.DB.batch([env.DB.prepare('DELETE FROM limits WHERE expires<?').bind(now),env.DB.prepare('DELETE FROM updates WHERE created<?').bind(now-86400*7),env.DB.prepare('DELETE FROM invoices WHERE paid=0 AND expires<?').bind(now-86400*7)]).catch(()=>{}));
  return json({url:link,id},200,cors);
 }catch{return json({error:'Service temporarily unavailable'},503,cors);}
 }
};
