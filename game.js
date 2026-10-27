/* SHADOW ARENA: ASHFALL — original Canvas 2D runtime, no build step. */
'use strict';
(() => {
const $=s=>document.querySelector(s), canvas=$('#game'),ctx=canvas.getContext('2d',{alpha:false}),screen=$('#screen'),hud=$('#hud'),touch=$('#touch');
const tg=window.Telegram?.WebApp;const supported=v=>!!tg?.isVersionAtLeast?.(v);
let prefs={lang:'en',sound:true,quality:'balanced',auto:true,best:0,runs:0,total:0,bestTime:0},storageOK=true;
const rawLang=tg?.initDataUnsafe?.user?.language_code||navigator.language||'en';prefs.lang=rawLang.startsWith('uk')?'uk':rawLang.startsWith('ru')?'ru':rawLang.startsWith('es')?'es-419':'en';
try{const stored=JSON.parse(localStorage.getItem('ashfall-v1')||'null');if(stored)Object.assign(prefs,stored);}catch{storageOK=false;}
if(!ASH_LANGS[prefs.lang])prefs.lang='en';if(!['high','balanced','performance'].includes(prefs.quality))prefs.quality='balanced';
const t=k=>ASH_TEXT[prefs.lang][k]||ASH_TEXT.en[k]||k;
function save(){try{localStorage.setItem('ashfall-v1',JSON.stringify(prefs));}catch{storageOK=false;}}
const art={},audio={};let ac,screenName='loading',settingsBack='home',langBack='home',state='menu',game=null,ready=false,last=0,acc=0,clock=0,slowFrames=0,frameSamples=0,frameSum=0;
let W=0,H=0,scale=1,ox=0,oy=0,quality=prefs.quality,shake=0,toastTimer;
const keys=new Set(),stick={x:0,y:0,id:null},pointerCap=matchMedia('(pointer:coarse)').matches;let touchMode=pointerCap;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),hypot=Math.hypot,rand=(a,b)=>a+Math.random()*(b-a),TAU=Math.PI*2;
const B={l:38,r:442,t:104,b:598};
class Pool{constructor(n){this.items=Array.from({length:n},()=>({active:false}));}take(data){const o=this.items.find(x=>!x.active);if(!o)return null;Object.keys(o).forEach(k=>{if(k!=='active')delete o[k];});Object.assign(o,data,{active:true});return o;}clear(){this.items.forEach(o=>o.active=false);}count(){return this.items.reduce((n,o)=>n+!!o.active,0);}}
const enemies=new Pool(22),shots=new Pool(160),fx=new Pool(240),corpses=new Pool(24);
const upgradeIds=['blood','swift','spark','vital','ghost','iron'];
const icons={blood:'M18 4L24 14 20 35 14 43 12 30 15 15Z M8 28L26 31 M16 36L14 48',swift:'M4 14L18 4 12 22 28 15 16 36 23 30 10 48',spark:'M18 3L22 19 33 25 22 31 18 47 14 31 3 25 14 19Z M18 18L18 32',vital:'M18 3C15 14 5 22 5 31C5 47 31 47 31 31C31 22 21 14 18 3Z M11 32L25 32 M18 25L18 39',ghost:'M6 44L9 20Q18 2 27 20L30 44 24 40 18 46 12 40Z M13 22L15 25 M23 22L21 25',iron:'M18 3L32 10 29 31 18 46 7 31 4 10Z M18 11L18 36 M11 20L25 20'};
function icon(id){return `<svg viewBox="0 0 36 50" fill="none" stroke="#d6bc87" stroke-width="1.6" stroke-linejoin="round"><path d="${icons[id]||icons.blood}"/></svg>`;}
function weaponIcon(id){return id==='blade'?`<svg viewBox="0 0 60 100"><defs><linearGradient id="steel"><stop stop-color="#657487"/><stop offset=".5" stop-color="#e8edf2"/><stop offset="1" stop-color="#798394"/></linearGradient></defs><path d="M29 4L38 19 32 71 25 71 23 19Z" fill="url(#steel)"/><path d="M16 70Q30 78 44 70M29 73L29 93" stroke="#c49c6d" stroke-width="5"/><path d="M29 19L29 65" stroke="#88e8f7"/></svg>`:`<svg viewBox="0 0 60 100"><path d="M28 34L25 94" stroke="#8b6d59" stroke-width="5"/><path d="M12 10Q-2 36 28 42Q59 27 44 9L35 29 21 29Z" fill="#77819a"/><path d="M28 3Q9 21 28 32Q48 23 28 3" fill="#e39865"/><path d="M28 15Q21 25 28 27Q35 24 28 15" fill="#fff3c2"/></svg>`;}
const btn=(label,action,cls='')=>`<button class="${cls}" data-action="${action}">${t(label)}</button>`;
function panel(body,cls=''){screen.innerHTML=`<div class="panel ${cls}">${body}</div>`;}
function show(name){screenName=name;document.documentElement.lang=prefs.lang;hud.hidden=!(game&&['playing','paused','upgrade','dying','victory'].includes(state));touch.hidden=state!=='playing'||!touchMode;
 if(name==='home'){state='menu';game=null;enemies.clear();shots.clear();fx.clear();corpses.clear();hud.hidden=true;touch.hidden=true;panel(`<div class="eyebrow">${t('title')}</div><h1>SHADOW ARENA<span>ASHFALL</span></h1><img class="hero-art" src="warden.png" alt="Ash Warden"><div class="menu">${btn('play','choose','primary')}<div class="menu small">${btn('settings','settings')}${btn('how','how')}${btn('records','records')}${btn('language','language')}</div>${btn('support','support','quiet')}</div><div class="footer">${t('version')}</div>`,'home');}
 else if(name==='choose')panel(`<div class="eyebrow">ASH WARDEN</div><h2>${t('choose')}</h2><div class="weapon-grid">${['blade','staff'].map(id=>`<button class="weapon" data-action="start-${id}">${weaponIcon(id)}<b>${t(id)}</b><p>${t(id+'Desc')}</p></button>`).join('')}</div>${btn('back','home','back quiet')}`);
 else if(name==='settings')panel(`<h2>${t('settings')}</h2><div class="row">${t('sound')}<button data-action="sound">${t(prefs.sound?'on':'off')}</button></div><label class="row">${t('graphics')}<select id="quality">${['high','balanced','performance'].map(q=>`<option value="${q}" ${q===prefs.quality?'selected':''}>${t(q)}</option>`).join('')}</select></label><div class="row">${t('auto')}<button data-action="auto">${t(prefs.auto?'on':'off')}</button></div><div class="menu" style="margin-top:20px">${btn('language','language')}${btn('fullscreen','fullscreen')}${btn('support','support','quiet')}${btn('back','settings-back','quiet')}</div>`);
 else if(name==='language')panel(`<h2>${t('language')}</h2><div class="lang-list">${Object.entries(ASH_LANGS).map(([id,label])=>`<button data-action="lang-${id}" ${id===prefs.lang?'class="primary"':''}>${label}</button>`).join('')}</div>${btn('back','lang-back','back quiet')}`);
 else if(name==='how')panel(`<h2>${t('how')}</h2><p>${t('howText')}</p><div class="rule"></div>${btn('back','home','back')}`);
 else if(name==='records')panel(`<h2>${t('records')}</h2><div class="stats">${[[prefs.best,'best'],[prefs.runs,'runs'],[prefs.total,'total'],[formatTime(prefs.bestTime),'time']].map(([v,k])=>`<p><span class="stat">${v}</span>${t(k)}</p>`).join('')}</div><p>${t(storageOK?'saved':'storage')}</p>${btn('back','home','back')}`);
 else if(name==='pause')panel(`<div class="eyebrow">${t('wave')} ${game.wave}</div><h2>${t('pause')}</h2><div class="menu">${btn('resume','resume','primary')}${btn('settings','settings')}${btn('menu','exit')}</div>`);
 else if(name==='exit')panel(`<h2>${t('pause')}</h2><p>${t('confirmMenu')}</p><div class="menu">${btn('no','resume','primary')}${btn('yes','abandon')}</div>`);
 else if(name==='upgrade')panel(`<div class="eyebrow">${t('clear')} · ${game.wave}</div><h2>${t('blessing')}</h2><p>${t('pick')}</p><div class="cards">${game.choices.map(id=>`<button class="card" data-action="upgrade-${id}">${icon(id)}<span><strong>${t(id)}</strong><small>${t(id+'Desc')}</small></span></button>`).join('')}</div>`);
 else if(name==='death')panel(`<div class="eyebrow">ASH WARDEN</div><h2>${t('fallen')}</h2><div class="stats">${[[game.wave,'wave'],[game.kills,'kills'],[formatTime(game.time),'time'],[prefs.best,'best']].map(([v,k])=>`<p><span class="stat">${v}</span>${t(k)}</p>`).join('')}</div><div class="menu">${btn('retry','choose','primary')}${btn('menu','home')}</div>`);
 else if(name==='support')panel(`<h2>${t('support')}</h2><p>${t('donate')}</p><label class="check"><input id="agree" type="checkbox"> ${t('terms')}</label><div class="support-amounts">${[10,25,50,100].map(n=>`<button data-action="donate-${n}" disabled>${n} ⭐</button>`).join('')}</div>${btn('cancel','support-back','back quiet')}`);
 else if(name==='playing'){screen.innerHTML='';touch.hidden=!touchMode;hud.hidden=false;}
 else if(name==='loading')panel(`<h2>ASHFALL</h2><p>${t('loading')}</p>`);
 else if(name==='loadError'||name==='fatal')panel(`<h2>ASHFALL</h2><p>${t(name)}</p>${btn('reload','reload')}`);
}
let supportBack='home',busyPayment=false;
screen.addEventListener('change',e=>{if(e.target.id==='quality'){prefs.quality=e.target.value;quality=prefs.quality;resize();save();}if(e.target.id==='agree')screen.querySelectorAll('[data-action^="donate-"]').forEach(b=>b.disabled=!e.target.checked);});
screen.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el||el.disabled)return;unlockAudio();sound('menu');const a=el.dataset.action;
 if(a.startsWith('start-'))start(a.slice(6));else if(a.startsWith('lang-')){prefs.lang=a.slice(5);save();show('language');updateHUD();}
 else if(a.startsWith('upgrade-'))chooseUpgrade(a.slice(8));else if(a.startsWith('donate-'))donate(Number(a.slice(7)));
 else if(a==='settings'){settingsBack=screenName==='pause'?'pause':'home';show(a);}else if(a==='language'){langBack=screenName;show(a);}
 else if(a==='settings-back')show(settingsBack);else if(a==='lang-back')show(langBack);else if(a==='sound'){prefs.sound=!prefs.sound;save();show('settings');}
 else if(a==='auto'){prefs.auto=!prefs.auto;quality=prefs.quality;resize();save();show('settings');}
 else if(a==='fullscreen')fullscreen();else if(a==='resume')resume();else if(a==='abandon'){record();show('home');}
 else if(a==='support'){supportBack=screenName;show(a);}else if(a==='support-back'&&!busyPayment)show(supportBack);
 else if(a==='reload')location.reload();else show(a);
});
hud.addEventListener('click',e=>{if(e.target.closest('button'))pause();});
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
function formatTime(v){return `${Math.floor(v/60)}:${String(Math.floor(v%60)).padStart(2,'0')}`;}
function unlockAudio(){if(!prefs.sound)return;try{ac??=new(window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();}catch{/* Audio is optional on browsers without Web Audio. */}}
function sound(id){if(!prefs.sound||!ac||ac.state!=='running'||!audio[id])return;const s=ac.createBufferSource();s.buffer=audio[id];const gain=ac.createGain();gain.gain.value=.65;s.connect(gain);gain.connect(ac.destination);s.onended=()=>{s.disconnect();gain.disconnect();};s.start();}
function resetInput(){keys.clear();stick.x=stick.y=0;stick.id=null;$('#stick i').style.transform='';}
function pause(){if(state==='playing'){state='paused';resetInput();show('pause');}}
function resume(){if(!game||busyPayment)return;state='playing';resetInput();last=performance.now();acc=0;show('playing');}
function record(){if(!game||game.recorded)return;game.recorded=true;prefs.runs++;prefs.total+=game.kills;prefs.best=Math.max(prefs.best,game.wave);prefs.bestTime=Math.max(prefs.bestTime,game.time);save();}
function start(weapon){unlockAudio();enemies.clear();shots.clear();fx.clear();corpses.clear();resetInput();quality=prefs.quality;resize();game={weapon,wave:0,kills:0,time:0,spawnTimer:0,remaining:0,waveKills:0,waveTotal:0,choices:[],recorded:false,transition:0,up:Object.fromEntries(upgradeIds.map(k=>[k,0])),hero:{x:240,y:380,hp:100,maxhp:100,r:13,face:1,vx:0,vy:0,dirX:0,dirY:-1,phase:0,flash:0,attack:0,attackTimer:.25,dash:0,dashCD:0,inv:1,death:0}};state='playing';nextWave();show('playing');updateHUD();}
function nextWave(){game.wave++;game.waveKills=0;game.waveTotal=game.wave%5===0?1+Math.min(8,Math.floor(game.wave/5)*2):Math.min(42,5+game.wave*2);game.remaining=game.waveTotal;game.spawnTimer=.6;game.bossSpawned=false;game.transition=0;game.hero.inv=Math.max(game.hero.inv,.7);shots.clear();if(game.wave%5===0)toast(t('incoming'));else toast(`${t('wave')} ${game.wave}`);}
function spawnEnemy(kind,x,y){const w=game.wave,m=1+(w-1)*.105;const spec={gloom:[26,75,10,12,54],husk:[85,34,20,21,88],archer:[38,48,12,14,76],herald:[480,33,25,32,126]}[kind];return enemies.take({kind,x,y,hp:spec[0]*m,maxhp:spec[0]*m,speed:spec[1]*(1+Math.min(.25,w*.006)),damage:spec[2]*(1+(w-1)*.055),r:spec[3],size:spec[4],phase:rand(0,6),face:1,flash:0,attack:0,cd:kind==='herald'?2:rand(.7,1.4),wind:0,spawn:1,mode:0,targetX:x,targetY:y,charging:0,kx:0,ky:0});}
function spawn(){let kind;if(game.wave%5===0&&!game.bossSpawned){kind='herald';game.bossSpawned=true;}else{const r=Math.random();kind=game.wave<2?'gloom':game.wave<3?(r<.75?'gloom':'husk'):r<.48?'gloom':r<.73?'husk':'archer';}
 let x,y;for(let tries=0;tries<20;tries++){const side=Math.floor(rand(0,4));x=side<2?(side===0?B.l+12:B.r-12):rand(B.l+20,B.r-20);y=side>=2?(side===2?B.t+12:B.b-12):rand(B.t+20,B.b-20);if(hypot(x-game.hero.x,y-game.hero.y)>155)break;}
 if(spawnEnemy(kind,x,y)){game.remaining--;game.spawnTimer=Math.max(.35,1.15-game.wave*.025);}}
function damageEnemy(e,n,sourceX,sourceY,chain=true){if(!e.active||e.spawn>0)return;e.hp-=n;e.flash=.12;e.attack=.1;const d=hypot(e.x-sourceX,e.y-sourceY)||1;if(e.kind!=='herald'){e.kx=(e.x-sourceX)/d*(e.kind==='husk'?30:100);e.ky=(e.y-sourceY)/d*(e.kind==='husk'?30:100);}number(e.x,e.y-28,Math.round(n),'#f6dfb2');burst(e.x,e.y-20,'#a7d9ed',5);sound('hit');
 if(chain&&game.up.spark){let other=null,dist=125;for(const o of enemies.items){const d=hypot(o.x-e.x,o.y-e.y);if(o.active&&o!==e&&o.spawn<=0&&d<dist){other=o;dist=d;}}if(other){fx.take({type:'arc',x:e.x,y:e.y-18,tx:other.x,ty:other.y-18,life:.22,max:.22,color:'#b59eff'});damageEnemy(other,8+game.up.spark*6,e.x,e.y,false);}}
 if(e.hp<=0){e.active=false;game.kills++;game.waveKills++;corpses.take({...e,active:true,life:.6,max:.6});burst(e.x,e.y-20,e.kind==='herald'?'#c89cff':'#a7a5d5',e.kind==='herald'?32:12);sound('kill');if(e.kind==='herald')shake=5;}}
function damageHero(n){const h=game.hero;if(h.inv>0||state!=='playing')return;h.hp=Math.max(0,h.hp-n);h.inv=.7;h.flash=.18;shake=3;number(h.x,h.y-40,Math.round(n),'#ff8a8d');burst(h.x,h.y-20,'#b84662',8);sound('hit');if(h.hp<=0){state='dying';game.transition=1.1;h.death=0;touch.hidden=true;record();sound('death');}}
function burst(x,y,color,n){const cap=quality==='high'?220:quality==='balanced'?110:35;n=Math.ceil(n*(quality==='high'?1:quality==='balanced'?.6:.25));for(let i=0;i<n&&fx.count()<cap;i++){let a=rand(0,TAU),v=rand(20,130);fx.take({type:'particle',x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.2,.6),max:.6,color,size:rand(1,3)});}}
function number(x,y,value,color){fx.take({type:'number',x,y,text:String(value),life:.65,max:.65,color});}
function shoot(x,y,tx,ty,enemy,damage,speed=200){const d=hypot(tx-x,ty-y)||1;return shots.take({x,y,px:x,py:y,vx:(tx-x)/d*speed,vy:(ty-y)/d*speed,enemy,damage,r:enemy?6:7,life:3});}
function dash(){if(state!=='playing'||game.hero.dashCD>0)return;unlockAudio();const h=game.hero;const mx=stick.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),my=stick.y+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0),len=hypot(mx,my);if(len>.1){h.dirX=mx/len;h.dirY=my/len;if(Math.abs(mx)>.1)h.face=mx<0?-1:1;}h.dash=.19;h.inv=Math.max(h.inv,.26);h.dashCD=Math.max(1.5,4-.35*game.up.ghost);sound('dash');burst(h.x,h.y-15,'#a5cbf7',12);}
function chooseUpgrade(id){if(state!=='upgrade'||!game.choices.includes(id))return;game.up[id]++;const h=game.hero;if(id==='vital')h.hp=Math.min(h.maxhp,h.hp+h.maxhp*.35);if(id==='iron'){h.maxhp+=20;h.hp=Math.min(h.maxhp,h.hp+20);}state='playing';nextWave();show('playing');sound('wave');}
function advanceEnemy(e,dt){const h=game.hero;e.spawn=Math.max(0,e.spawn-dt);if(e.spawn>0)return;e.flash=Math.max(0,e.flash-dt);e.attack=Math.max(0,e.attack-dt);e.cd-=dt;e.phase+=dt*7;const dx=h.x-e.x,dy=h.y-e.y,d=hypot(dx,dy)||1;e.face=dx<0?-1:1;
 if(e.charging>0){e.charging-=dt;e.x+=e.cx*390*dt;e.y+=e.cy*390*dt;if(hypot(e.x-h.x,e.y-h.y)<e.r+h.r)damageHero(e.damage*1.3);}
 else if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.attack=.35;
  if(e.kind==='archer'){shoot(e.x,e.y-15,e.targetX,e.targetY,true,e.damage,175);}
  else if(e.kind==='herald'&&e.mode===1){for(let i=0;i<12;i++){const a=i*TAU/12+e.aim;shoot(e.x,e.y-20,e.x+Math.cos(a)*100,e.y-20+Math.sin(a)*100,true,e.damage*.7,135+Math.min(45,game.wave));}}
  else if(e.kind==='herald'&&e.mode===2){e.charging=.6;e.cx=Math.cos(e.aim);e.cy=Math.sin(e.aim);}
  else {const hx=h.x-e.x,hy=h.y-e.y,range=e.kind==='herald'?105:e.kind==='husk'?64:39,ang=Math.atan2(hy,hx);if(hypot(hx,hy)<range&&Math.cos(ang-e.aim)>.25)damageHero(e.damage);fx.take({type:'slash',x:e.x,y:e.y,angle:e.aim,r:range,life:.2,max:.2,color:'#f58787'});}
  e.cd=e.kind==='herald'?Math.max(1.2,2.2-game.wave*.015):e.kind==='archer'?2:1.25;
 }}else{
  let move=1;if(e.kind==='archer'){move=d<155?-1:d<230?0:1;if(e.cd<=0&&d<320){e.wind=.7;e.targetX=h.x;e.targetY=h.y;e.aim=Math.atan2(dy,dx);move=0;}}
  else if(e.kind==='herald'){if(e.cd<=0){e.mode=(e.mode+1)%3;e.wind=e.mode===2?1: .85;e.targetX=h.x;e.targetY=h.y;e.aim=Math.atan2(dy,dx);move=0;}}
  else if(d<(e.kind==='husk'?55:33)&&e.cd<=0){e.wind=e.kind==='husk'?.65:.32;e.aim=Math.atan2(dy,dx);move=0;}
  if(d<e.r+h.r+5&&move>0)move=0;e.x+=dx/d*e.speed*dt*move;e.y+=dy/d*e.speed*dt*move;
 }
 e.x+=e.kx*dt;e.y+=e.ky*dt;e.kx*=Math.exp(-10*dt);e.ky*=Math.exp(-10*dt);e.x=clamp(e.x,B.l,B.r);e.y=clamp(e.y,B.t,B.b);
}
function tick(dt){if(!game)return;const h=game.hero;
 if(state==='dying'){game.transition-=dt;h.death+=dt;if(game.transition<=0){state='dead';show('death');}updateEffects(dt);return;}
 if(state==='victory'){game.transition-=dt;h.phase+=dt*4;updateEffects(dt);if(game.transition<=0){state='upgrade';game.choices=upgradeIds.filter(id=>!(id==='swift'&&game.up.swift>=10)&&!(id==='ghost'&&game.up.ghost>=8)).sort(()=>Math.random()-.5).slice(0,3);show('upgrade');}return;}
 if(state!=='playing')return;game.time+=dt;h.inv=Math.max(0,h.inv-dt);h.flash=Math.max(0,h.flash-dt);h.attack=Math.max(0,h.attack-dt);h.dashCD=Math.max(0,h.dashCD-dt);h.attackTimer-=dt;
 let mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+stick.x,my=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+stick.y;const length=hypot(mx,my);if(length>1){mx/=length;my/=length;}if(length>.1){h.dirX=mx/(hypot(mx,my)||1);h.dirY=my/(hypot(mx,my)||1);if(Math.abs(mx)>.1)h.face=mx<0?-1:1;}
 h.vx=mx*132;h.vy=my*132;h.phase+=dt*(length>.1?12:3);
 if(h.dash>0){h.dash-=dt;h.vx=h.dirX*560;h.vy=h.dirY*560;if(Math.random()<.65)fx.take({type:'ghost',x:h.x,y:h.y,face:h.face,phase:h.phase,life:.24,max:.24,color:'#a6bcea'});}
 h.x=clamp(h.x+h.vx*dt,B.l+5,B.r-5);h.y=clamp(h.y+h.vy*dt,B.t+5,B.b-5);
 game.spawnTimer-=dt;if(game.remaining>0&&game.spawnTimer<=0&&enemies.count()<20)spawn();
 let nearest=null,near=Infinity;for(const e of enemies.items){if(!e.active)continue;advanceEnemy(e,dt);const d=hypot(e.x-h.x,e.y-h.y);if(e.spawn<=0&&d<near){near=d;nearest=e;}}
 // Soft symmetric separation: no invisible collision walls or overlapping enemy stacks.
 for(let i=0;i<enemies.items.length;i++){const a=enemies.items[i];if(!a.active)continue;for(let j=i+1;j<enemies.items.length;j++){const b=enemies.items[j];if(!b.active)continue;const dx=b.x-a.x,dy=b.y-a.y,d=hypot(dx,dy)||.01,min=(a.r+b.r)*.8;if(d<min){const f=(min-d)*.5;a.x=clamp(a.x-dx/d*f,B.l,B.r);a.y=clamp(a.y-dy/d*f,B.t,B.b);b.x=clamp(b.x+dx/d*f,B.l,B.r);b.y=clamp(b.y+dy/d*f,B.t,B.b);}}}
 if(nearest&&h.attackTimer<=0&&near<(game.weapon==='blade'?96:320)){
  const angle=Math.atan2(nearest.y-h.y,nearest.x-h.x);h.attack=.28;h.aim=angle;h.face=Math.cos(angle)<0?-1:1;h.attackTimer=(game.weapon==='blade'?.7:.78)/(1+Math.min(1.2,game.up.swift*.12));const damage=(game.weapon==='blade'?30:25)*(1+game.up.blood*.18);
  if(game.weapon==='blade'){fx.take({type:'slash',x:h.x,y:h.y,angle,r:98,life:.22,max:.22,color:'#b9edff'});for(const e of enemies.items){if(e.active&&hypot(e.x-h.x,e.y-h.y)<98+e.r&&Math.cos(Math.atan2(e.y-h.y,e.x-h.x)-angle)>-.15)damageEnemy(e,damage,h.x,h.y);}sound('blade');}
  else{shoot(h.x,h.y-16,nearest.x,nearest.y-16,false,damage,325);sound('fire');}
 }
 for(const b of shots.items){if(!b.active)continue;b.life-=dt;b.px=b.x;b.py=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.life<=0||b.x<15||b.x>465||b.y<75||b.y>650){b.active=false;continue;}
  if(b.enemy){if(hypot(b.x-h.x,b.y-(h.y-12))<b.r+h.r){damageHero(b.damage);b.active=false;burst(b.x,b.y,'#ce8cff',5);}}
  else{for(const e of enemies.items){if(e.active&&e.spawn<=0&&hypot(b.x-e.x,b.y-(e.y-12))<b.r+e.r){damageEnemy(e,b.damage,h.x,h.y);burst(b.x,b.y,'#efb47f',10);b.active=false;break;}}}
 }
 updateEffects(dt);if(game.remaining===0&&enemies.count()===0&&state==='playing'){state='victory';game.transition=1;shots.clear();touch.hidden=true;sound('wave');toast(t('clear'));}
}
function updateEffects(dt){for(const f of fx.items){if(!f.active)continue;f.life-=dt;if(f.life<=0){f.active=false;continue;}if(f.type==='particle'){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.96;f.vy*=.96;}if(f.type==='number')f.y-=26*dt;}for(const c of corpses.items){if(c.active){c.life-=dt;if(c.life<=0)c.active=false;}}shake=Math.max(0,shake-dt*18);}
function updateHUD(){if(!game)return;const h=game.hero,boss=enemies.items.find(e=>e.active&&e.kind==='herald');
 if(!$('#health-value'))hud.innerHTML='<div class="hud-top"><div class="health-wrap"><div class="health-label"><span id="health-name"></span><span id="health-value"></span></div><div class="meter"><i id="health-fill"></i></div></div><button class="hud-pause">Ⅱ</button></div><div class="hud-bottom"><span id="wave-value"></span><span id="dash-value"></span><span id="time-value"></span></div><div class="progress"><i id="wave-fill"></i></div><div id="upgrades"></div><div id="boss-hud" class="bossbar"><span id="boss-name"></span><div class="meter"><i id="boss-fill"></i></div></div>';
 $('#health-name').textContent=t('health');$('#health-value').textContent=`${Math.ceil(h.hp)} / ${h.maxhp}`;$('#health-fill').style.width=`${h.hp/h.maxhp*100}%`;$('.hud-pause').setAttribute('aria-label',t('pause'));$('#wave-value').textContent=`${t('wave')} ${game.wave} · ${game.waveKills}/${game.waveTotal}`;$('#dash-value').textContent=h.dashCD>0?t('dash')+' '+h.dashCD.toFixed(1)+t('seconds'):t('ready');$('#time-value').textContent=formatTime(game.time);$('#wave-fill').style.width=`${game.waveKills/game.waveTotal*100}%`;const badges=upgradeIds.filter(k=>game.up[k]).map(k=>`<span title="${t(k)}" aria-label="${t(k)} ${game.up[k]}">${icon(k)} ${game.up[k]}</span>`).join('');if($('#upgrades').innerHTML!==badges)$('#upgrades').innerHTML=badges;$('#boss-hud').hidden=!boss;if(boss){$('#boss-name').textContent=t('boss');$('#boss-fill').style.width=`${Math.max(0,boss.hp/boss.maxhp*100)}%`;}$('#dash').style.opacity=h.dashCD>0?'.45':'1';$('#dash').textContent=h.dashCD>0?Math.ceil(h.dashCD):'↟';$('#dash').setAttribute('aria-label',t('dash'));}

function resize(){const r=$('#shell').getBoundingClientRect();W=r.width;H=r.height;const dpr=Math.min(devicePixelRatio||1,quality==='high'?2:quality==='balanced'?1.5:1);const maxPixels=quality==='high'?2600000:quality==='balanced'?1600000:850000;const ratio=Math.min(dpr,Math.sqrt(maxPixels/(W*H)));canvas.width=Math.max(1,Math.round(W*ratio));canvas.height=Math.max(1,Math.round(H*ratio));scale=Math.min(W/480,H/720);ox=(W-480*scale)/2;oy=(H-720*scale)/2;}
function safeArea(){if(tg){const a=tg.safeAreaInset||{},b=tg.contentSafeAreaInset||{};document.documentElement.style.setProperty('--safe-top',`${(a.top||0)+(b.top||0)}px`);document.documentElement.style.setProperty('--safe-bottom',`${Math.max(a.bottom||0,b.bottom||0)}px`);}resize();}
function fullscreen(){try{if(supported('8.0')&&tg?.requestFullscreen){tg.requestFullscreen();}else if(document.documentElement.requestFullscreen){document.documentElement.requestFullscreen().catch(()=>toast(t('unsupported')));}else toast(t('unsupported'));}catch{toast(t('unsupported'));}}
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
// Articulated cut-out rig. Regions are clipped from the original painted sprites;
// the hood/torso, arms, cloak and two legs have independent pivots and motion.
function rig(kind,x,y,size,phase,face=1,action=0,flash=0,alpha=1,death=0,moving=true){const img=art[kind];if(!img)return;const ih=img.height,iw=img.width,w=size*iw/ih,h=size;ctx.save();ctx.translate(x,y);ctx.scale(face,1);ctx.globalAlpha=alpha;
 if(death){ctx.rotate(death*.85);ctx.scale(1,Math.max(.1,1-death*.65));}
 const stride=moving?Math.sin(phase):Math.sin(phase)*.18,bob=moving?Math.abs(Math.sin(phase))*1.5:Math.sin(phase)*.8;
 ctx.translate(0,-bob);ctx.filter='brightness(1.3)';if(flash>0)ctx.filter='brightness(2.7) saturate(.4)';
 function piece(x0,y0,x1,y1,px,py,angle,dx=0,dy=0){ctx.save();ctx.translate((px-.5)*w+dx,(py-1)*h+dy);ctx.rotate(angle);ctx.beginPath();ctx.rect((x0-px)*w,(y0-py)*h,(x1-x0)*w+.25,(y1-y0)*h+.25);ctx.clip();ctx.drawImage(img,-px*w,-py*h,w,h);ctx.restore();}
 // Lower cloak and legs sway in opposite phases, maintaining the torso seam.
 piece(0,.62,.5,1,.35,.62,stride*.045,0,Math.max(0,stride)*1.4);
 piece(.5,.62,1,1,.66,.62,-stride*.045,0,Math.max(0,-stride)*1.4);
 piece(0,.25,.28,.62,.26,.31,stride*.035-action*.55);
 piece(.74,.25,1,.62,.76,.31,-stride*.035+action*.7);
 piece(.28,.25,.74,.62,.5,.4,Math.sin(phase*.5)*.009);
 piece(0,0,1,.25,.5,.23,Math.sin(phase*.6)*.012);
 ctx.filter='none';ctx.restore();}
function drawWeapon(h){ctx.save();ctx.translate(h.x,h.y-26);let angle=game.weapon==='blade'?(h.attack>0?(h.aim||0)-1+(1-h.attack/.28)*2:1.15*h.face):-.2*h.face;ctx.rotate(angle);ctx.translate(14,0);
 if(game.weapon==='staff'){ctx.strokeStyle='#95745f';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,22);ctx.lineTo(0,-23);ctx.stroke();ctx.strokeStyle='#b2a9b6';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-25,7,0,Math.PI);ctx.stroke();ellipse(0,-27,4,7,'#ffc88d');}
 else{const steel=ctx.createLinearGradient(0,-2,0,3);steel.addColorStop(0,'#526c83');steel.addColorStop(.5,'#d6e4ed');steel.addColorStop(1,'#7893a8');ctx.fillStyle=steel;ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(27,-1.5);ctx.lineTo(34,0);ctx.lineTo(27,2);ctx.lineTo(0,2);ctx.closePath();ctx.fill();ctx.strokeStyle='#8bdae2';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(26,0);ctx.stroke();ctx.fillStyle='#c5a479';ctx.fillRect(-1,-6,3,13);ctx.fillStyle='#5a3d3d';ctx.fillRect(-10,-2,10,4);}ctx.restore();}
function render(time){ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.fillStyle='#080b12';ctx.fillRect(0,0,W,H);if(!ready)return;
 ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);if(shake>0&&state==='playing')ctx.translate(rand(-shake,shake),rand(-shake,shake));ctx.drawImage(art.arena,0,0,480,720);
 const vignette=ctx.createRadialGradient(240,350,90,240,350,405);vignette.addColorStop(0,'#080b1200');vignette.addColorStop(1,'#080b12cc');ctx.fillStyle=vignette;ctx.fillRect(0,0,480,720);
 // Low-frequency floor lights and mist stay below combat silhouettes.
 if(quality!=='performance'){ctx.globalCompositeOperation='screen';for(let i=0;i<3;i++){const gx=100+i*140+Math.sin(time*.13+i)*24,gy=230+Math.cos(time*.17+i)*130;const g=ctx.createRadialGradient(gx,gy,0,gx,gy,125);g.addColorStop(0,'#7385ae0b');g.addColorStop(1,'#52639400');ctx.fillStyle=g;ctx.fillRect(gx-125,gy-125,250,250);}ctx.globalCompositeOperation='source-over';}
 if(game){const h=game.hero;
  for(const e of enemies.items){if(!e.active)continue;if(e.spawn>0){ctx.strokeStyle=`rgba(177,128,230,${.5+Math.sin(e.spawn*20)*.2})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y,e.r+12,e.r*.5+6,0,0,TAU);ctx.stroke();}if(e.wind>0){ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle='#ed496b30';ctx.strokeStyle='#ff8a9bb0';ctx.lineWidth=1.5;
   if(e.kind==='herald'&&e.mode===1){ctx.beginPath();ctx.arc(0,0,60+Math.sin(e.wind*8)*5,0,TAU);ctx.fill();ctx.stroke();for(let i=0;i<12;i++){ctx.rotate(TAU/12);ctx.fillRect(20,-2,60,4);}}
   else if((e.kind==='herald'&&e.mode===2)||e.kind==='archer'){ctx.rotate(e.aim);ctx.fillRect(0,-(e.kind==='archer'?4:22),e.kind==='archer'?300:270,e.kind==='archer'?8:44);ctx.strokeRect(0,-(e.kind==='archer'?4:22),e.kind==='archer'?300:270,e.kind==='archer'?8:44);}
   else{ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,e.kind==='herald'?105:e.kind==='husk'?64:39,e.aim-1.3,e.aim+1.3);ctx.closePath();ctx.fill();ctx.stroke();}ctx.restore();}}
  for(const c of corpses.items)if(c.active)rig(c.kind,c.x,c.y,c.size,c.phase,c.face,0,0,c.life/c.max,1-c.life/c.max);
  for(const f of fx.items)if(f.active&&f.type==='ghost')rig('warden',f.x,f.y,82,f.phase,f.face,0,0,f.life/f.max*.28);
  const actors=enemies.items.filter(e=>e.active);actors.push({...h,kind:'warden',size:82,hero:true});actors.sort((a,b)=>a.y-b.y);
  for(const e of actors){const alpha=e.spawn>0?1-e.spawn:.99;ellipse(e.x,e.y+1,e.r*(quality==='performance'?1:1.15),e.r*.36,'#0008');rig(e.kind,e.x,e.y,e.size,e.phase,e.face,e.hero?(state==='victory'?.45:e.attack):e.attack,e.flash,alpha,e.hero?h.death:0,e.hero?hypot(h.vx,h.vy)>1:!e.wind);if(e.hero){drawWeapon(h);if(h.inv>0&&h.dash>0){ctx.strokeStyle='#9dc9e6aa';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(h.x,h.y-23,23,37,0,0,TAU);ctx.stroke();}}else if(e.hp<e.maxhp&&e.kind!=='herald'){ctx.fillStyle='#12141dcc';ctx.fillRect(e.x-17,e.y-e.size-8,34,3);ctx.fillStyle='#a78bb7';ctx.fillRect(e.x-17,e.y-e.size-8,34*Math.max(0,e.hp/e.maxhp),3);}}
  for(const b of shots.items){if(!b.active)continue;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillStyle=b.enemy?'#a66be077':'#f3ad6d77';ctx.beginPath();ctx.moveTo(-18,0);ctx.lineTo(0,-5);ctx.lineTo(6,0);ctx.lineTo(0,5);ctx.fill();ellipse(0,0,b.r,b.r*.8,b.enemy?'#c499f7':'#ffe2aa');ellipse(1,0,2.5,2.5,'#fff1df');ctx.restore();}
  for(const f of fx.items){if(!f.active||f.type==='ghost')continue;ctx.save();ctx.globalAlpha=Math.min(1,f.life/f.max*1.7);ctx.fillStyle=f.color;ctx.strokeStyle=f.color;
   if(f.type==='particle'){ctx.translate(f.x,f.y);ctx.rotate(f.life*5);ctx.fillRect(-f.size/2,-f.size/2,f.size,f.size*2);}
   else if(f.type==='number'){ctx.font='bold 13px Georgia';ctx.textAlign='center';ctx.shadowColor='#080b12';ctx.shadowBlur=4;ctx.fillText(f.text,f.x,f.y);}
   else if(f.type==='arc'){ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo((f.x+f.tx)/2+8,(f.y+f.ty)/2-8);ctx.lineTo(f.tx,f.ty);ctx.stroke();}
   else if(f.type==='slash'){const progress=1-f.life/f.max;ctx.lineWidth=6*(1-progress)+1;ctx.beginPath();ctx.arc(f.x,f.y,f.r*(.75+progress*.25),f.angle-1.25+progress*.7,f.angle+1.2+progress*.3);ctx.stroke();ctx.lineWidth=1;ctx.globalAlpha*=.4;ctx.beginPath();ctx.arc(f.x,f.y,f.r*.72,f.angle-1,f.angle+1);ctx.stroke();}ctx.restore();}
 }
 const ashCount=quality==='high'?42:quality==='balanced'?20:5;for(let i=0;i<ashCount;i++){const ax=(i*91.7+Math.sin(time*.3+i)*20)%480,ay=(i*63.3-time*(5+i%4)+72000)%720;ctx.fillStyle=i%3===0?'#dbb58b55':'#b5c3de33';ctx.fillRect(ax,ay,1,i%3===0?2:1);}
 ctx.restore();
}
let hudTimer=0;
function frame(now){try{const elapsed=Math.min(.1,(now-last)/1000||0);last=now;const running=['playing','dying','victory'].includes(state);if(running){acc+=elapsed;let steps=0;while(acc>=1/60&&steps<6){tick(1/60);acc-=1/60;steps++;}clock+=elapsed;}else{acc=0;if(state==='menu')clock+=elapsed;}
 if(state==='playing'&&prefs.auto){frameSum+=elapsed;frameSamples++;if(frameSamples>=240){if(frameSum/frameSamples>.026)slowFrames++;else slowFrames=0;if(slowFrames>=2&&quality!=='performance'){quality=quality==='high'?'balanced':'performance';resize();slowFrames=0;}frameSum=0;frameSamples=0;}}
 render(clock);hudTimer+=elapsed;if(hudTimer>.1&&game){hudTimer=0;updateHUD();}requestAnimationFrame(frame);
 }catch(e){console.error(e);state='error';show('fatal');}}
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&state==='playing')e.preventDefault();if(e.code==='Escape'){if(state==='playing')pause();else if(screenName==='pause')resume();return;}if(e.code==='Space'&&!e.repeat)dash();keys.add(e.code);if(state==='playing'&&touchMode){touchMode=false;touch.hidden=true;}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{resetInput();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();pause();}last=performance.now();acc=0;});window.addEventListener('resize',resize);
window.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!touchMode){touchMode=true;if(state==='playing')touch.hidden=false;}unlockAudio();},{passive:true});
const joy=$('#stick');function moveStick(e){if(stick.id!==e.pointerId)return;const r=joy.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,d=hypot(dx,dy)||1,limit=r.width*.34,m=Math.min(d,limit);stick.x=dx/d*m/limit;stick.y=dy/d*m/limit;$('#stick i').style.transform=`translate(${stick.x*limit}px,${stick.y*limit}px)`;}
joy.addEventListener('pointerdown',e=>{if(stick.id!==null)return;stick.id=e.pointerId;joy.setPointerCapture(e.pointerId);moveStick(e);e.preventDefault();});joy.addEventListener('pointermove',moveStick);for(const event of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(event,e=>{if(stick.id===e.pointerId){stick.id=null;stick.x=stick.y=0;$('#stick i').style.transform='';}});$('#dash').addEventListener('pointerdown',e=>{e.preventDefault();dash();});
async function donate(amount){if(busyPayment)return;const endpoint=window.ASHFALL_CONFIG?.donationEndpoint;if(!endpoint||!tg?.initData||!supported('6.1')||!tg.openInvoice){toast(t('unavailable'));return;}busyPayment=true;screen.querySelectorAll('button').forEach(b=>b.disabled=true);toast(t('invoice'));
 try{const base=endpoint.replace(/\/$/,'');const res=await fetch(base+'/invoice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount,initData:tg.initData,language:prefs.lang,agree:true}),signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('Invoice unavailable');const data=await res.json();if(!/^https:\/\/t\.me\//.test(data.url))throw Error('Invalid invoice');
 await new Promise(resolve=>{tg.openInvoice(data.url,status=>{(async()=>{if(status==='cancelled')toast(t('cancelled'));else if(status==='failed')toast(t('failed'));else{toast(t('pending'));for(let i=0;i<10;i++){const r=await fetch(base+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:tg.initData,id:data.id}),signal:AbortSignal.timeout(8000)});if(r.ok&&(await r.json()).paid){toast(t('thanks'));break;}await new Promise(ok=>setTimeout(ok,1500));}}})().catch(()=>toast(t('pending'))).finally(resolve);});});
 }catch{toast(t('unavailable'));}finally{busyPayment=false;if(screenName==='support')show('support');}}
async function boot(){show('loading');try{await Promise.all(['arena','warden','gloom','husk','archer','herald'].map(name=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{art[name]=im;resolve();};im.onerror=reject;im.src=name+(name==='arena'?'.webp':'.png');})));ready=true;resize();show('home');if(!storageOK)toast(t('storage'));}catch{show('loadError');}
 // Decode short original WAV effects without requiring an unlocked AudioContext.
 try{const decode=new(window.AudioContext||window.webkitAudioContext)();await Promise.all(['blade','fire','dash','hit','kill','wave','menu','death'].map(async name=>{try{const r=await fetch(name+'.wav');audio[name]=await decode.decodeAudioData(await r.arrayBuffer());}catch{/* Missing audio never blocks gameplay. */}}));await decode.close();}catch{/* Silent play is supported. */}}
try{if(tg){tg.ready();tg.expand();if(supported('7.7'))tg.disableVerticalSwipes?.();tg.onEvent('viewportChanged',safeArea);if(supported('8.0')){tg.onEvent('safeAreaChanged',safeArea);tg.onEvent('contentSafeAreaChanged',safeArea);tg.onEvent('deactivated',pause);}tg.BackButton?.onClick(()=>{if(state==='playing')pause();else if(screenName==='pause')resume();else if(state==='menu')show('home');});if(supported('6.1'))tg.BackButton?.show();}}catch(e){console.info('Telegram fallback:',e.message);}
safeArea();boot();requestAnimationFrame(frame);
// Explicit opt-in QA harness; never enabled by normal game URLs.
if(new URLSearchParams(location.search).get('qa')==='1')window.ASH_QA={start,tick,dash,pause,resume,chooseUpgrade,damageHero,damageEnemy,spawnEnemy,nextWave,show,get game(){return game;},get state(){return state;},get pools(){return{enemies,shots,fx};},get prefs(){return prefs;},get ready(){return ready;},setState(v){state=v;},setLang(v){prefs.lang=v;show(screenName);},render};
})();
