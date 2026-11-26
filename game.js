/* ============================================================
   EARTH EMPIRE – Spiel (Steinzeit)
   Three.js (r160, three.min.js), eine Szene, Touch-Steuerung
   ============================================================ */
(function(){
'use strict';
const EE = window.EE;
const T = window.THREE;

/* ---------- kleine Helfer ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const lerp = (a,b,t) => a+(b-a)*t;
function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hash2(x,y,s){ let h=Math.sin(x*127.1+y*311.7+s*74.7)*43758.5453; return h-Math.floor(h); }
function vnoise(x,y,s){ const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi,s),b=hash2(xi+1,yi,s),c=hash2(xi,yi+1,s),d=hash2(xi+1,yi+1,s);
  return lerp(lerp(a,b,u),lerp(c,d,u),v); }
function ridged(x,y,s){ let f=0,a=.55,fr=1,w=1; for(let i=0;i<5;i++){ let n=1-Math.abs(vnoise(x*fr,y*fr,s+i*13)*2-1); n*=n; n*=w; w=clamp(n*1.7,0,1); f+=n*a; a*=.5; fr*=2.07; } return f; }
function fbm(x,y,s){ let f=0,a=.5,fr=1; for(let i=0;i<4;i++){ f+=a*vnoise(x*fr,y*fr,s+i*13); fr*=2; a*=.5; } return f; }

/* ---------- Daten ---------- */
const COLORS = [0x2f7bff,0xe23b3b,0xf2c230,0x3fbf5a,0x9b59ff,0xff8a1f,0x1fd1d1,0xff5fb0,0x8a5a2b,0xffffff,0x2b2b2b,0x7dff4a,0x1f4fa8,0xa8203a,0xc9a227,0x2e8b57,0x6a3d9a,0xff6f61];
const COLNAMES = ['Blau','Rot','Gelb','Grün','Lila','Orange','Türkis','Pink','Braun','Weiß','Schwarz','Hellgrün','Dunkelblau','Weinrot','Ocker','Waldgrün','Violett','Koralle'];
const RES = ['food','wood','stone','gold'];
const RES_DE = {food:'Nahrung',wood:'Holz',stone:'Stein',gold:'Gold',metal:'Metall',oil:'Öl'};
const BUILD = {
  tc:    {name:'Stadtzentrum', size:6, cost:{wood:250, stone:100, food:100}, time:60, hp:1200, drop:['food','wood','stone','gold'], pop:5},
  house: {name:'Hütte', size:3, cost:{wood:30}, time:14, hp:300, pop:4},
  wall:  {name:'Palisade', size:1, cost:{wood:4}, time:3, hp:250},
  gate:  {name:'Tor', size:1, cost:{wood:15}, time:8, hp:500},
  store: {name:'Lager', size:3, cost:{wood:50}, time:18, hp:500, drop:['wood','stone','gold','food']},
  road:  {name:'Weg', size:1, cost:{}, time:2.2, hp:100},
  barracks:{name:'Kriegerhütte', size:4, cost:{wood:120, stone:40}, time:35, hp:900},
  tower: {name:'Wachturm', size:3, cost:{wood:100, stone:40}, time:30, hp:800},
};
const WORKER_COST = {food:60};
const WORKER_TIME = 18;
const CARRY = 10;
const START_RES = {food:200, wood:200, stone:100, gold:50};

/* ---------- Zustand ---------- */
let G = null; // aktives Spiel

/* ============================================================
   START / STOPP
   ============================================================ */
async function start(sv){
  if(G) stop();
  EE.toast('Die Welt wird geladen …');
  await Promise.all([loadModels(EE.S.gfx|0), loadWorldMask()]);
  EE.hideMenu();
  const S = EE.S;
  const mapI = sv ? sv.map : S.map|0;
  const NX = [3840,5760,8320,12800][mapI] || 5760, HS = NX<=6000?8:16, NZ = Math.round(NX*(LAT0-LAT1)/360/TILE)*TILE;
  const byName = n => EE.CIVS.find(c=>c[0]===n);
  const civ = sv ? byName(sv.civs[0]) : (EE.CIVS[S.civ] || EE.CIVS[0]);
  const foes = sv ? sv.civs.length-1 : clamp(S.ai||3, 1, 17);
  // Gegner möglichst weit weg wählen (bei wenigen Gegnern nie Nachbarn)
  const dist = (a,b)=>{ const p=CIV_POS[a[0]]||[0,0], q=CIV_POS[b[0]]||[0,0]; let dl=Math.abs(p[0]-q[0]); return Math.hypot(dl, (p[1]-q[1])*1.3); };
  const chosen=[civ], pool=EE.CIVS.filter(c=>c!==civ);
  while(chosen.length<=foes && pool.length){
    const sc = pool.map(c=>[c, Math.min(...chosen.map(o=>dist(c,o)))]).sort((a,b)=>b[1]-a[1]);
    const pick = pool[(Math.random()*pool.length)|0];
    chosen.push(pick); pool.splice(pool.indexOf(pick),1);
  }
  const others = sv ? sv.civs.slice(1).map(byName) : chosen.slice(1);
  const gfx = S.gfx|0;
  G = { NX, NZ, HS, foes, civ, gfx, seed:sv?sv.seed:(Math.random()*1e9)|0, map:mapI, t:0, resMod:sv?sv.res:null, units:[], builds:[], res:[], deer:[],
        players:[], sel:[], selB:null, place:null, running:true, raf:0, msgT:0 };
  G.rand = rng(G.seed);
  [civ, ...others.slice(0,foes)].forEach((c,i)=>G.players.push({id:i, civ:c, res:{...START_RES}, pop:0, popCap:0, tc:null, color:COLORS[i]}));
  initDip();
  buildUI();
  initRenderer();
  genWorld();
  if(sv) applySave(sv);
  buildOverview();
  for(const b of G.builds) if(b.kind==='tc' && b.built>=1) claimRegion(b);
  buildBorders();
  G.saveT = 20;
  setTimeout(()=>{ if(G) drawMinimap(); }, 50);
  initInput();
  updateHUD(); drawPanel();
  if(G.loadCam){ Object.assign(G.camS,{x:G.loadCam.x, z:G.loadCam.z, dist:G.loadCam.d, yaw:G.loadCam.y}); EE.toast('Spielstand geladen'); }
  else if(G.players[0].tc) centerCamOn(G.players[0].tc.x, G.players[0].tc.z);
  updateCam(); updateTiles(true);
  $('#game').classList.remove('hidden');
  let last = performance.now();
  const loop = now => {
    if(!G || !G.running) return;
    if(G.inMenu){ last = now; G.raf = requestAnimationFrame(loop); return; }
    const dt = clamp((now-last)/1000, 0, .05); fpsTick(now); last = now; G.pfDeadline = performance.now() + 4;
    if(!G.paused) update(dt);
    render();
    G.raf = requestAnimationFrame(loop);
  };
  G.raf = requestAnimationFrame(loop);
  EE.toast('Die '+civ[0]+' erwachen in der Steinzeit');
  EE.music('calm');
}

/* ============================================================
   SPIELSTAND: wird automatisch gespeichert (alle 30 s, beim Menü und beim Schließen der App).
   Die Welt selbst entsteht aus dem Seed neu, gespeichert werden nur die Änderungen.
   ============================================================ */
const SAVE_KEY = 'ee_save_v1';
const resKey = (x,z) => Math.round(x*4)+','+Math.round(z*4);
const r1 = v => Math.round(v*100)/100;
function saveGame(){
  if(!G || G.over || !G.players[0].tc && !G.builds.some(b=>b.owner===0)) return;
  try{
    const res = Object.assign({}, G.resMod||{});
    for(const r of G.res) if(!r.deer && (r.amt<r.max || !r.alive)) res[resKey(r.x,r.z)] = r.alive ? Math.round(r.amt) : 0;
    const liveB = G.builds.filter(b=>!b.dead);
    const sv = { v:1, date:Date.now(), map:G.map, seed:G.seed, t:Math.round(G.t), civs:G.players.map(p=>p.civ[0]),
      res, players:G.players.map(p=>({res:p.res, ...(p.expT!=null?{expT:p.expT}:{})})),
      dip:Object.fromEntries(Object.entries(G.dip).map(([k,d])=>[k,{state:d.state, mood:Math.round(d.mood), ask:Math.round(d.ask||0)}])),
      builds:liveB.map(b=>({k:b.kind, o:b.owner, x:r1(b.x), z:r1(b.z), b:r1(b.built), hp:Math.round(b.hp), s:b.slow?1:0, r:b.recv||undefined,
        q:(b.queue||[]).length?b.queue.slice():undefined, w:b.wallId||undefined, seg:b.seg||undefined})),
      units:G.units.filter(u=>!u.dead).map(u=>({i:u.inside&&!u.inside.dead?liveB.indexOf(u.inside):undefined, sl:u.inside?u.slot:undefined, k:u.kind, o:u.owner, x:r1(u.x), z:r1(u.z), hp:Math.round(u.hp), c:u.carry&&u.carry.amt?[u.carry.type,u.carry.amt]:undefined, sx:u.sex, g:u.kind==='kid'?[u.stage,Math.round(u.grow)]:undefined})),
      cam:{x:r1(G.camS.x), z:r1(G.camS.z), d:r1(G.camS.dist), y:r1(G.camS.yaw)} };
    localStorage.setItem(SAVE_KEY, JSON.stringify(sv));
  }catch(e){ console.warn('Speichern fehlgeschlagen', e); }
}
function readSave(){ try{ const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); return s && s.v===1 ? s : null; }catch(e){ return null; } }
function applySave(sv){
  G.quiet = true;
  // Startaufbau entfernen, dann den gespeicherten Stand aufbauen
  for(const b of G.builds){ G.scene.remove(b.mesh); G.scene.remove(b.ring); for(const k of b.cells||[]) if(k>=0) G.grid[k]=0; }
  for(const u of G.units){ G.scene.remove(u.mesh); G.scene.remove(u.ring); if(u.bar) G.scene.remove(u.bar); }
  G.builds.length=0; G.units.length=0; G.reg.owner.clear();
  G.players.forEach((p,i)=>{ p.pop=0; p.popCap=0; p.tc=null; Object.assign(p, sv.players[i]||{}); p.res={...p.res}; });
  for(const [k,d] of Object.entries(sv.dip||{})) if(G.dip[k]) Object.assign(G.dip[k], d);
  let maxW = 0; const made=[];
  for(const s of sv.builds){
    let b;
    if(s.seg){ b = addWall(s.o, s.seg, s.seg.ang, s.w, s.k==='road'); maxW=Math.max(maxW,s.w|0); if(s.b>=1) finishBuilding(b); else b.built=s.b; }
    else { b = addBuilding(s.k, s.o, s.x, s.z, s.b>=1); if(s.b<1){ b.built=s.b; b.mesh.scale.y=.25+.75*s.b; } if(b.kind==='tc' && b.built>=1){ claimRegion(b); const p=G.players[b.owner]; if(!p.tc) p.tc=b; } }
    made.push(b); b.hp = s.hp; b.slow = !!s.s; if(s.r) b.recv=s.r; if(s.q) b.queue = s.q.slice();
  }
  WALL_ID = Math.max(WALL_ID, maxW+1);
  for(const s of sv.units){ G.nextSex = s.sx; const u = spawnWorker(s.o, s.x, s.z, s.k); u.hp = s.hp; if(s.g){ u.grow=s.g[1]; setStage(u,s.g[0]); } if(s.c) u.carry = {type:s.c[0], amt:s.c[1]}; if(s.i!=null && s.i>=0 && made[s.i]){ u.inside=made[s.i]; u.slot=s.sl|0; } }
  G.t = sv.t||0;
  if(sv.cam) G.loadCam = sv.cam;
  G.quiet = false;
}
function loadGame(){ const sv=readSave(); if(!sv){ EE.toast('Kein Spielstand gefunden'); return; } start(sv); }
addEventListener('pagehide', ()=>saveGame());
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) saveGame(); });

function toMenu(){
  if(!G) return;
  G.inMenu=true; G.paused=true; $('#pause').classList.add('hidden'); saveGame();
  $('#game').classList.add('hidden'); EE.ambient({wind:.3,waves:0,birds:0,fire:0}); EE.music('theme'); EE.showMenu(true);
}
function resume(){
  if(!G) return;
  EE.hideMenu(); $('#game').classList.remove('hidden'); G.inMenu=false; G.paused=false; onResize(); EE.music('calm'); EE.toast('Weiter geht’s');
}
function stop(){
  if(!G) return;
  G.running = false;
  cancelAnimationFrame(G.raf);
  window.removeEventListener('resize', onResize);
  try{ G.renderer.dispose(); G.renderer.forceContextLoss(); }catch(e){}
  $('#game').innerHTML = '';
  $('#game').classList.add('hidden');
  G = null;
  EE.ambient({wind:.3,waves:0,birds:0,fire:0});
  EE.music('theme');
  EE.showMenu();
}

/* ============================================================
   OBERFLÄCHE (HUD)
   ============================================================ */
const ICON = {
  food:'<svg viewBox="0 0 24 24"><circle cx="8" cy="14" r="5" fill="#d8323c"/><circle cx="15" cy="10" r="5" fill="#e8434d"/><circle cx="15" cy="17" r="4.5" fill="#b8262f"/><path d="M15 5q2-3 5-2" stroke="#3a7a2a" stroke-width="2" fill="none"/></svg>',
  wood:'<svg viewBox="0 0 24 24"><rect x="2" y="9" width="20" height="7" rx="3.5" fill="#9a6232"/><circle cx="20" cy="12.5" r="3.4" fill="#e2b77a"/><circle cx="20" cy="12.5" r="1.4" fill="#9a6232"/></svg>',
  stone:'<svg viewBox="0 0 24 24"><path d="M3 18l3-9 6-4 7 3 2 10z" fill="#9aa3ad"/><path d="M6 9l6-4 1 7z" fill="#c4ccd4"/></svg>',
  gold:'<svg viewBox="0 0 24 24"><path d="M3 18l3-8 6-4 7 4 2 8z" fill="#7d6a3a"/><path d="M8 11l3-2 2 3-3 2zM13 14l3-1 1 3-3 1z" fill="#ffd24a"/></svg>',
  pop:'<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" fill="#f0d3a8"/><path d="M4 21q1-8 8-8t8 8z" fill="#8a5a2b"/></svg>',
};

function buildUI(){
  const g = $('#game');
  g.innerHTML = `
  <canvas id="gc"></canvas>
  <div id="sel-box"></div>
  <div id="topbar">
    <div class="rs" id="r-food">${ICON.food}<b>0</b></div>
    <div class="rs" id="r-wood">${ICON.wood}<b>0</b></div>
    <div class="rs" id="r-stone">${ICON.stone}<b>0</b></div>
    <div class="rs" id="r-gold">${ICON.gold}<b>0</b></div>
    <div class="rs" id="r-pop">${ICON.pop}<b>0/0</b></div>
    <div class="age"><div><span>${G.civ[0]}</span> · Steinzeit</div><div class="wxi" id="wx"></div></div>
    <button class="hb" id="bPause" aria-label="Menü"><svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>
  </div>
  <canvas id="mini" width="150" height="150"></canvas>
  <button class="hb" id="bIdle" aria-label="Untätige Bauern"><svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" fill="#f0d3a8"/><path d="M4 21q1-8 8-8t8 8z" fill="#8a5a2b"/><text x="18" y="9" font-size="9" fill="#ffd24a" font-weight="700">z</text></svg><i id="idleN">0</i></button>
  <button class="hb" id="bHome" aria-label="Zur Basis"><svg viewBox="0 0 24 24"><path d="M3 12l9-8 9 8M6 10v10h12V10" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linejoin="round"/></svg></button>
  <div id="panel"></div>
  <div id="placebar" class="hidden"><span id="pCost"></span><span id="pTxt">Gebäude mit dem Finger platzieren</span><button class="pb gate hidden" id="pGate">+ Tore</button><button class="pb no" id="pNo">✕</button><button class="pb ok" id="pOk">✓</button></div>
  <div id="fps" class="hidden"></div>
  <div id="offer" class="hidden"></div>
  <div id="dip" class="hidden"><div class="dcard"><div class="dhead"><button class="dtab" data-t="rel">Beziehungen</button><button class="dtab" data-t="trade">Handel</button><button class="dtab" data-t="trib">Tribut</button><button class="dx" id="dClose" aria-label="Schließen">✕</button></div><div id="dipBody"></div></div></div>
  <div id="rotate"><div>Bitte das Handy quer halten</div></div>
  <div id="pause" class="hidden"><div class="pcard"><h2>Pause</h2>
    <button class="btn main small" id="pWeiter">Weiter</button>
    <button class="btn small" id="pSet">Einstellungen</button>
    <button class="btn small" id="pNeu">Neu starten</button>
    <button class="btn small" id="pMenu">Zum Hauptmenü</button></div></div>`;
  $('#bPause').onclick = () => { EE.click(); G.paused = true; $('#pause').classList.remove('hidden'); };
  $('#pWeiter').onclick = () => { EE.click(); G.paused = false; $('#pause').classList.add('hidden'); };
  // Hauptmenü: Spiel bleibt im Hintergrund erhalten – dort „Weiterspielen“ oder ein neues Spiel
  $('#pMenu').onclick = () => { EE.click(); toMenu(); };
  $('#pNeu').onclick = () => { EE.click(); start(); };
  // Einstellungen auch im Spiel (Grafik, Musik, FPS-Anzeige …)
  $('#pSet').onclick = () => { EE.click(); const d=document.getElementById('dSet'); d.style.zIndex=20; d.style.position='fixed'; document.body.appendChild(d); d.classList.remove('hidden');
    const done = () => { if(!d.classList.contains('hidden')) return; mo.disconnect(); if(G && (EE.S.gfx|0)!==G.gfx) applyGfx(EE.S.gfx|0); };
    const mo = new MutationObserver(done); mo.observe(d,{attributes:true, attributeFilter:['class']}); };
  $('#bIdle').onclick = () => { EE.click(); selectIdle(); };
  $('#bHome').onclick = () => { EE.click(); const tc=G.players[0].tc; if(tc){ centerCamOn(tc.x,tc.z); select([],tc); } };
  $('#pOk').onclick = confirmPlace;
  $('#pGate').onclick = ()=>{ if(G.place&&G.place.kind==='wall'){ G.place.gate=!G.place.gate; $('#pGate').classList.toggle('on',G.place.gate); EE.click(); } };
  $('#pNo').onclick = cancelPlace;
  $('#dClose').onclick = closeDip;
  $$('#dip .dtab').forEach(b=>b.onclick=()=>{ EE.click(); G.dipUI.tab=b.dataset.t; renderDip(); });
  $('#dip').addEventListener('click', e=>{ if(e.target.id==='dip') closeDip(); });
}

function updateHUD(){
  const p = G.players[0];
  for(const r of RES) $('#r-'+r+' b').textContent = Math.floor(p.res[r]);
  $('#r-pop b').textContent = p.pop+'/'+p.popCap;
  $('#r-pop').classList.toggle('full', p.pop>=p.popCap);
  const idle = G.units.filter(u=>u.owner===0 && u.state==='idle' && u.kind!=='kid' && !u.inside).length;
  $('#idleN').textContent = idle; $('#bIdle').classList.toggle('dim', idle===0);
}

function costText(c){ return Object.keys(c).map(k=>`<span class="c">${ICON[k]}${c[k]}</span>`).join(''); }
// Kosten in der Bauleiste wie in Empire Earth 2: Symbol + Menge, rot wenn es noch fehlt
function setCost(c){ const p=G.players[0], h=Object.keys(c).filter(k=>c[k]>0).map(k=>`<span class="c${p.res[k]<c[k]?' miss':''}">${ICON[k]}${c[k]}</span>`).join(''); if(G.costH!==h){ G.costH=h; $('#pCost').innerHTML=h; } }
function canPay(p,c){ return Object.keys(c).every(k=>p.res[k]>=c[k]); }
const missingTxt = (p,c) => 'Es fehlen noch '+Object.keys(c).filter(k=>p.res[k]<c[k]).map(k=>Math.ceil(c[k]-p.res[k])+' '+RES_DE[k]).join(', ');
function pay(p,c){ for(const k in c) p.res[k]-=c[k]; }

function drawPanel(){
  const el = $('#panel'); if(!el) return;
  const p = G.players[0];
  if(G.place){ el.innerHTML=''; el.className='hidden'; return; }
  if(G.selB){
    const b = G.selB, d = BUILD[b.kind];
    let h = `<div class="info"><b>${d.name}</b><small>${b.owner===0?(b.built<1?'Wird gebaut … '+Math.floor(b.built*100)+' %':'Leben '+Math.ceil(b.hp)+'/'+d.hp):'Gegner ('+COLNAMES[b.owner]+')'}</small></div>`;
    if(b.owner===0 && homeCap(b)) h += `<div class="info"><small>${residentsTxt(b)}</small></div>`;
    if(b.owner===0 && b.built>=1 && d.drop){ const R=b.recv||{}, keys=d.drop.filter(k=>k in RES_DE);
      const chip=(o)=>keys.map(k=>`<span class="c">${ICON[k]||''}${Math.floor(o[k]||0)}</span>`).join('');
      h += `<div class="store"><div><small>Hier abgegeben</small><span class="ac">${chip(R)}</span></div><div><small>Vorrat deines Volkes</small><span class="ac">${chip(G.players[0].res)}</span></div></div>`; }
    if(b.owner===0 && b.built>=1 && b.kind==='tc'){
      const q = b.queue.length, hn=helpers(b).length, tm=Math.round((trainMul(b)-1)*100);
      h += `<div class="info"><small>Tempo ${tm?'+'+tm+' %':'normal'} · Hütten im Gebiet +5 % je Hütte · Helfer +10 %</small></div>`;
      h += `<button class="ab" data-a="helpin"><span class="ai">${ICON.pop}</span>Helfer rein<span class="ac">${hn}/${HELP_MAX}</span></button>`;
      if(hn) h += `<button class="ab" data-a="helpout"><span class="ai">${ICON.pop}</span>Helfer raus<span class="ac">${hn}</span></button>`;
      h += `<button class="ab" data-a="worker"><span class="ai">${ICON.pop}</span>Bauer<span class="ac">${costText(WORKER_COST)}</span>${q?'<i class="q">'+q+'</i>':''}</button>`;
      h += `<button class="ab" data-a="dip"><span class="ai">${dipSVG()}</span>Diplomatie<span class="ac">Bündnis · Handel</span></button>`;
      h += `<button class="ab lock" data-a="age"><span class="ai"><svg viewBox="0 0 24 24"><path d="M12 3l8 9h-5v9H9v-9H4z" fill="#e8b64a"/></svg></span>Bronzezeit<span class="ac">${costText({food:500,wood:300})}</span></button>`;
      if(q) h += `<div class="bar"><div style="width:${(b.qT/WORKER_TIME*100)|0}%"></div></div>`;
    }
    if(b.owner===0 && b.built>=1 && b.kind==='wall' && b.seg) h += `<button class="ab" data-a="togate"><span class="ai"><svg viewBox="0 0 24 24"><path d="M4 21V8l8-5 8 5v13h-5v-7H9v7z" fill="#a8743e"/></svg></span>Zu Tor machen<span class="ac">${costText(BUILD.gate.cost)}</span></button>`;
    if(b.owner===0 && b.built>=1 && b.kind==='tower'){ const c=crew(b).length;
      h += `<div class="info"><small>Besatzung ${c}/${TOWER_MAX} · Krieger oben sind geschützt und schießen weiter</small></div>`;
      h += `<button class="ab" data-a="crewin"><span class="ai">${swordSVG()}</span>Krieger rein<span class="ac">${c}/${TOWER_MAX}</span></button>`;
      if(c) h += `<button class="ab" data-a="crewout"><span class="ai">${ICON.pop}</span>Alle raus<span class="ac">${c}</span></button>`;
      h += `<div class="info hint"><small>Tipp: Krieger auswählen und auf den Turm tippen</small></div>`; }
    if(b.owner===0 && b.built>=1 && b.kind==='barracks'){
      const q=b.queue.length;
      for(const k of ['club','spear','bow']) h += `<button class="ab" data-a="t-${k}"><span class="ai">${unitPic({owner:0,kind:k,hp:1,maxHp:1})}</span>${UNIT[k].name}<span class="ac">${costText(UNIT[k].cost)}</span>${q&&b.queue[0]===k?'<i class="q">'+q+'</i>':''}</button>`;
      if(q){ const qt=b.queue[0]==='worker'?WORKER_TIME:UNIT[b.queue[0]].time; h += `<div class="bar"><div style="width:${(b.qT/qt*100)|0}%"></div></div>`; }
    }
    el.innerHTML = h; el.className='';
  } else if(G.sel.length){
    const ws = G.sel.slice();
    const carry = ws.length===1 && ws[0].carry.amt>=1 ? ' · trägt '+Math.floor(ws[0].carry.amt)+' '+RES_DE[ws[0].carry.type] : '';
    const job = ws.length===1 ? ({idle:'Wartet',move:'Läuft',gather:'Sammelt',drop:'Bringt Ressourcen',build:'Baut',hunt:'Jagt'})[ws[0].state] : '';
    // Auswahl-Leiste wie in Age of Empires: kleine Figuren je Sorte, Anzahl und X zum Abwählen
    const MAXP = 16, groups = {};
    ws.forEach((u,i)=>{ (groups[u.kind]||(groups[u.kind]={n:0,list:[]})).n++; groups[u.kind].list.push(i); });
    let h = `<div class="selx"><div class="sh">`;
    for(const k in groups) h += `<b>${groups[k].n}× ${UNIT_DE[k]||k}</b>`;
    h += `<button class="sx" data-a="desel" aria-label="Auswahl aufheben">✕</button></div><div class="pics">`;
    ws.slice(0,MAXP).forEach((u,i)=>{ h += `<button class="pic${u.owner!==0?' foe':''}" data-u="${i}">${unitPic(u)}</button>`; });
    if(ws.length>MAXP) h += `<span class="more">+${ws.length-MAXP}</span>`;
    h += `</div>${ws.length===1?`<small>${job}${carry}</small>`:''}</div>`;
    if(ws[0].owner===0 && ws.every(u=>u.kind==='worker')){
      h += `<button class="ab" data-a="b-tc"><span class="ai">${hutSVG()}</span>Stadtzentrum<span class="ac">${costText(BUILD.tc.cost)}</span></button>`;
      h += `<button class="ab" data-a="b-house"><span class="ai">${hutSVG()}</span>Hütte<span class="ac">${costText(BUILD.house.cost)}</span></button>`;
      h += `<button class="ab" data-a="b-store"><span class="ai">${storeSVG()}</span>Lager<span class="ac">${costText(BUILD.store.cost)}</span></button>`;
      h += `<button class="ab" data-a="b-wall"><span class="ai">${wallSVG()}</span>Palisade<span class="ac">${costText(BUILD.wall.cost)}/Stück</span></button>`;
      h += `<button class="ab" data-a="b-road"><span class="ai">${roadSVG()}</span>Weg<span class="ac">kostenlos</span></button>`;
      h += `<button class="ab" data-a="b-barracks"><span class="ai">${swordSVG()}</span>Kriegerhütte<span class="ac">${costText(BUILD.barracks.cost)}</span></button>`;
      h += `<button class="ab" data-a="b-tower"><span class="ai">${towerSVG()}</span>Wachturm<span class="ac">${costText(BUILD.tower.cost)}</span></button>`;
    }
    el.innerHTML = h; el.className='';
  } else {
    el.innerHTML = `<div class="info hint"><b>Tipp</b><small>Ein Finger ziehen: Auswahlrahmen · Zwei Finger: Karte bewegen und zoomen</small></div>`;
    el.className='';
  }
  el.querySelectorAll('.ab').forEach(b=>b.onclick=()=>action(b.dataset.a));
  el.querySelectorAll('.sx').forEach(b=>b.onclick=()=>{ EE.click(); select([],null); });
  if(G.sel.length){ const ws=G.sel.slice(); el.querySelectorAll('.pic').forEach(b=>b.onclick=()=>{ EE.click(); const u=ws[+b.dataset.u]; if(u){ select([u],null); } }); }
}
const UNIT_DE = {worker:'Bauern'};
function unitPic(u){
  const col='#'+COLORS[u.owner].toString(16).padStart(6,'0'), f=u.sex==='f';
  return `<svg viewBox="0 0 24 28"><path d="M5 27q0-11 7-11t7 11z" fill="#8a5a2b"/><path d="M6 21l12-3v3l-12 3z" fill="${col}"/>`+
    (f?`<path d="M6.5 11q0-7 5.5-7t5.5 7v5h-2v-4h-7v4h-2z" fill="#3a2414"/>`:'')+
    `<circle cx="12" cy="10" r="4.6" fill="#e0b088"/><path d="M7.4 9q.5-5.5 4.6-5.5t4.6 5.5q-2-2.6-4.6-2.6t-4.6 2.6z" fill="#3a2414"/>`+
    `<circle cx="10.3" cy="10.3" r=".7" fill="#2a1a10"/><circle cx="13.7" cy="10.3" r=".7" fill="#2a1a10"/>`+
    (u.kind==='spear'?'<path d="M20 26L21 3" stroke="#7a5230" stroke-width="1.4"/><path d="M21 1l-1.6 3.4h3.2z" fill="#9aa3ad"/>':u.kind==='club'?'<path d="M19 26l2-12" stroke="#7a5230" stroke-width="1.8"/><path d="M18 11l5 1.5-1 3-5-1.5z" fill="#8a8f96"/>':u.kind==='bow'?'<path d="M3 6q-3 9 0 18" stroke="#7a5230" stroke-width="1.5" fill="none"/><path d="M3 6v18" stroke="#ddd" stroke-width=".5"/>':'')+`</svg><i style="width:${Math.round(20*(u.hp==null?1:u.hp/(u.maxHp||1)))}px"></i>`;
}
/* ============================================================
   VOLK: Familien, Kinder und Hütten
   Leute wohnen in Hütten (4 Plätze) oder im Stadtzentrum (5). Wo Platz ist und Nahrung da ist,
   kommen Babys zur Welt. Babys werden zu Kindern, Kinder zu Arbeitern – die müssen dann
   in eine eigene Hütte ziehen. Ohne Platz in einer Hütte arbeiten sie nicht.
   ============================================================ */
const BABY_T = 60, CHILD_T = 120, BIRTH_T = 35, BIRTH_FOOD = 50;
const homeCap = b => (b && !b.dead && b.built>=1 && (b.kind==='house'||b.kind==='tc')) ? BUILD[b.kind].pop : 0;
function occupancy(){ const m=new Map(); for(const u of G.units) if(u.home && !u.dead) m.set(u.home,(m.get(u.home)||0)+1); return m; }
function findHome(u, occ, avoid){
  let best=null, bd=1e9;
  for(const b of G.builds){ if(b.owner!==u.owner || b===avoid) continue; const c=homeCap(b); if(!c || (occ.get(b)||0)>=c) continue;
    const d=Math.hypot(b.x-u.x,b.z-u.z); if(d<bd){ bd=d; best=b; } }
  return best;
}
function residentsTxt(b){
  let a=0,k=0,y=0; for(const u of G.units) if(u.home===b && !u.dead){ if(u.kind!=='kid') a++; else if(u.stage==='baby') y++; else k++; }
  return `Bewohner: ${a} Erwachsene`+(k?`, ${k} Kind${k>1?'er':''}`:'')+(y?`, ${y} Baby${y>1?'s':''}`:'')+` (${a+k+y}/${homeCap(b)})`;
}
function setStage(u, st){
  u.stage=st; const s = st==='baby' ? .42 : st==='child' ? .68 : 1;
  u.mesh.scale.setScalar(s); u.speed = st==='baby' ? 1.1 : st==='child' ? 2.3 : UNIT.worker.speed;
}
function bornAt(b){
  const p=G.players[b.owner]; p.res.food -= BIRTH_FOOD;
  const a=G.rand()*6.28, r=b.size*.5+1;
  G.nextSex = G.rand()<.5 ? 'm' : 'f';
  const u = spawnWorker(b.owner, b.x+Math.cos(a)*r, b.z+Math.sin(a)*r, 'kid');
  u.home=b; u.grow=0; setStage(u,'baby');
  if(b.owner===0){ EE.toast(u.sex==='f' ? 'Ein Mädchen ist geboren!' : 'Ein Junge ist geboren!'); EE.sfx('trained',.5); updateHUD(); }
}
function growUp(u){
  u.kind='worker'; u.hp=u.maxHp=UNIT.worker.hp; setStage(u,null); u.stage=null;
  const old=u.home; u.home=null; u.moveOut=true; u.oldHome=old;
  const nh = findHome(u, occupancy(), old);
  if(nh){ u.home=nh; cmdMove(u, nh.x+(G.rand()-.5)*3, nh.z+nh.size*.5+1.2); }
  if(u.owner===0){ EE.toast(nh ? 'Ein Kind ist erwachsen und zieht als Bauer in eine eigene Hütte' : 'Ein Kind ist erwachsen – es braucht eine eigene Hütte!'); drawPanelSoon(); }
}
function updateKid(u,dt){
  u.grow += dt;
  if(u.stage==='baby' && u.grow>=BABY_T) setStage(u,'child');
  if(u.grow>=BABY_T+CHILD_T){ growUp(u); return; }
  if(u.state!=='idle' && u.state!=='move') u.state='idle';
  u.wanderT=(u.wanderT||0)-dt;
  if(u.state==='idle' && u.wanderT<=0){ u.wanderT = 4+G.rand()*6; const h=u.home||G.players[u.owner].tc; if(h){ const a=G.rand()*6.28, r=h.size*.5+1.5+G.rand()*(u.stage==='baby'?1.5:5); cmdMove(u, h.x+Math.cos(a)*r, h.z+Math.sin(a)*r); } }
}
// Tempo im Stadtzentrum: Hütten im selben Gebiet (+5 % je Hütte, höchstens 6) und Helfer drinnen (+10 % je Helfer, höchstens 3)
const HELP_MAX = 3;
function trainMul(b){
  if(b.kind!=='tc') return 1;
  const id=regionAt(b.x,b.z); let h=0; for(const o of G.builds) if(o.kind==='house' && o.owner===b.owner && o.built>=1 && regionAt(o.x,o.z)===id) h++;
  return 1 + .05*Math.min(6,h) + .1*helpers(b).length;
}
const helpers = b => G.units.filter(u=>u.inside===b && !u.dead);
function helperIn(b){
  if(helpers(b).length>=HELP_MAX){ EE.toast('Höchstens '+HELP_MAX+' Helfer'); return; }
  const w = G.units.filter(u=>u.owner===b.owner && u.kind==='worker' && !u.inside && !u.dead).sort((p,q)=>Math.hypot(p.x-b.x,p.z-b.z)-Math.hypot(q.x-b.x,q.z-b.z))[0];
  if(!w){ EE.toast('Kein Bauer frei'); return; }
  if(G.sel.includes(w)) G.sel=G.sel.filter(x=>x!==w);
  w.inside=b; w.state='idle'; w.path=null; w.site=null; w.target=null; w.ring.visible=false; if(w.bar) w.bar.visible=false;
}
const TOWER_MAX = 4;
const crew = b => G.units.filter(u=>u.inside===b && !u.dead);
function cmdGarrison(u,b){ u.state='garrison'; u.site=b; u.target=null; u.repath=0; moveTo(u,b.x,b.z); }
function enterTower(u,b){
  const c=crew(b); if(c.length>=TOWER_MAX){ if(u.owner===0) EE.toast('Der Wachturm ist voll'); u.state='idle'; u.site=null; return; }
  const used=new Set(c.map(o=>o.slot)); let sl=0; while(used.has(sl)) sl++;
  if(G.sel.includes(u)){ G.sel=G.sel.filter(x=>x!==u); u.ring.visible=false; drawPanelSoon(); }
  u.inside=b; u.slot=sl; u.state='idle'; u.path=null; u.site=null; u.target=null; u.cd=0; u.ring.visible=false;
  if(u.owner===0){ EE.sfx('place',.4); if(G.selB===b) drawPanelSoon(); }
}
function crewOut(b){ crew(b).forEach((u,i)=>{ u.inside=null; const a=i*1.57+.8; u.x=b.x+Math.cos(a)*(b.size*.5+1); u.z=b.z+Math.sin(a)*(b.size*.5+1); u.state='idle'; }); }
// Krieger oben auf dem Turm: stehen auf der Plattform, zielen und schießen (Bogen) oder werfen (Speer, Axt)
function updateTowerCrew(u,dt){
  const b=u.inside, m=u.mesh, U=UNIT[u.kind];
  if(b.dead){ u.inside=null; u.hp=Math.max(1,u.hp*.5); u.state='idle'; return; }
  const k=b.mesh, sx=(u.slot&1?1:-1)*(k.slotX||.55), sz=(u.slot&2?1:-1)*(k.slotZ||.55);
  u.x=b.x+sx; u.z=b.z+sz;
  m.position.set(u.x, k.position.y+(k.platY||4.9)*k.scale.y, u.z);
  const R = U.ranged ? 14 : 10;
  u.scanT=(u.scanT||0)-dt; if(u.scanT<=0){ u.scanT=.5; if(!alive(u.target) || Math.hypot(u.target.x-u.x,u.target.z-u.z)>R+(u.target.size?u.target.size*.5:0)) u.target=nearestFoe(u,R); }
  const t=u.target; u.working=false;
  if(b.built>=1 && alive(t)){ u.working=true; u.face=Math.atan2(t.x-u.x,t.z-u.z); u.cd-=dt;
    if(u.cd<=0){ u.cd=U.cd*(U.ranged?1:1.4); const dmg=(t.size?U.atk*Math.max(U.bld,.3):U.atk)*(U.ranged?1.3:.75)*(.85+G.rand()*.3); shootArrow(u,t,dmg,m.position.y+1.3); } }
  let df=u.face-m.rotation.y; df=Math.atan2(Math.sin(df),Math.cos(df)); m.rotation.y+=df*Math.min(1,dt*8);
  u.phase+=dt*(u.working?6:2);
  if(m.isRigged){ const shoot=u.working && U.ranged; if(m.bowK) setBowSlot(m, shoot); if(!G.farView && m.visible) poseRig(m, shoot?'shoot':u.working?'work':'idle', shoot?1-clamp(u.cd/U.cd,0,1):u.phase); }
  if(m.load) m.load.visible=false;
}
function helpersOut(b){ for(const u of helpers(b)){ u.inside=null; const a=G.rand()*6.28; u.x=b.x+Math.cos(a)*(b.size*.5+1); u.z=b.z+Math.sin(a)*(b.size*.5+1); autoJob(u); } }
function updatePopulation(dt){
  G.popT=(G.popT||0)-dt; if(G.popT>0) return; G.popT=1;
  const occ=occupancy();
  // ohne Zuhause: Hütte suchen
  let homeless=0;
  for(const u of G.units){ if(u.dead) continue;
    if(u.home && (u.home.dead || !homeCap(u.home))) u.home=null;
    if(!u.home){ const h=findHome(u, occ, u.oldHome && !u.oldHome.dead ? u.oldHome : null); if(h){ u.home=h; occ.set(h,(occ.get(h)||0)+1); if(u.homeless){ u.homeless=false; if(u.kind==='worker' && u.state==='idle') autoJob(u); } } else { u.homeless=true; if(u.owner===0) homeless++; } }
    if(u.moveOut && u.state==='idle'){ u.moveOut=false; if(u.home) autoJob(u); }
  }
  if(homeless){ G.hlT=(G.hlT||0)-1; if(G.hlT<=0){ G.hlT=25; EE.toast(homeless+(homeless>1?' Leute haben':' Person hat')+' keine Hütte und arbeitet nicht – baue Hütten!'); } }
  // Neue leere Hütte: ein Paar aus einem vollen Haus zieht ein
  for(const h of G.builds){
    if(h.kind!=='house' || !homeCap(h) || (occ.get(h)||0)>0) continue;
    const src=G.builds.find(b=>b.owner===h.owner && b!==h && (occ.get(b)||0)>=3 && G.units.some(u=>u.home===b && u.sex==='m' && u.kind!=='kid') && G.units.some(u=>u.home===b && u.sex==='f' && u.kind!=='kid'));
    if(!src) continue;
    const pair=[G.units.find(u=>u.home===src && u.sex==='m' && u.kind!=='kid' && !u.dead), G.units.find(u=>u.home===src && u.sex==='f' && u.kind!=='kid' && !u.dead)];
    for(const u of pair){ u.home=h; }
    occ.set(src,(occ.get(src)||0)-2); occ.set(h,2);
    if(h.owner===0) EE.toast('Ein Paar ist in die neue Hütte gezogen');
  }
  // Geburten
  for(const b of G.builds){
    const c=homeCap(b); if(!c) continue;
    b.birthT = (b.birthT==null ? BIRTH_T*(.5+G.rand()) : b.birthT) - 1;
    if(b.birthT>0) continue; b.birthT = BIRTH_T*(.8+G.rand()*.4);
    const p=G.players[b.owner]; if((occ.get(b)||0)>=c || p.res.food<BIRTH_FOOD+20) continue;
    let m=0,f=0, here=0; for(const u of G.units) if(u.owner===b.owner && u.kind!=='kid' && !u.dead){ if(u.sex==='f') f++; else m++; if(u.home===b) here++; }
    if(!m || !f || !here) continue;
    bornAt(b); occ.set(b,(occ.get(b)||0)+1);
  }
}
/* ============================================================
   KRIEGER & KAMPF (Steinzeit): Krieger sind Höhlenmenschen mit Waffen
   ============================================================ */
const UNIT = {
  worker:{name:'Bauer', hp:40, atk:2, range:.9, cd:1.3, speed:3.1, bld:.2},
  club:  {name:'Axtkrieger', hp:95, atk:9, range:1.1, cd:1.15, speed:3.0, bld:.6, cost:{food:50,wood:20}, time:12, weapon:'w_axe', wlen:.5},
  spear: {name:'Speerträger', hp:85, atk:7, range:1.7, cd:1.0, speed:3.2, bld:.4, cost:{food:45,wood:30}, time:12, weapon:'w_spear', wlen:1.35},
  bow:   {name:'Bogenschütze', hp:55, atk:6, range:9, cd:1.7, speed:3.0, bld:.25, cost:{food:40,wood:45}, time:14, weapon:'w_bow', wlen:1.0, ranged:true},
};
UNIT_DE.club='Axtkrieger'; UNIT_DE.spear='Speerträger'; UNIT_DE.bow='Bogenschützen';
const isSoldier = u => u.kind!=='worker' && u.kind!=='kid';
UNIT.kid = {name:'Kind', hp:25, atk:0, range:.6, cd:2, speed:2.3, bld:0}; UNIT_DE.kid='Kinder';
function attachWeapon(g, kind){
  const U=UNIT[kind], m=MODELS[U.weapon]; if(!m || !g.rig) return;
  const sk=g.children[0], s=sk.scale.x, bb=m.geo.boundingBox, L=bb.max.y-bb.min.y;
  const w=new T.Mesh(m.geo, m.mat); w.castShadow=true;
  const k=U.wlen/L/s; w.scale.setScalar(k);
  if(kind==='bow'){ g.bowK=k; g.bowL=L; g.bowS=s; g.weapon=w; setBowSlot(g,false); if(g.club) g.club.visible=false; return; }
  else { const grip = kind==='spear' ? .35 : .12; w.rotation.set(kind==='spear'?.15:1.25,0,0);
    // Griffpunkt der Waffe genau in die Hand legen (Verschiebung in gedrehter Richtung)
    w.position.copy(new T.Vector3(0,bb.min.y+L*grip,0).applyEuler(w.rotation).multiplyScalar(-k)).add(g.palmR); g.rig.handR.add(w); }
  g.weapon=w;
  if(g.club) g.club.visible=false;
}
// Bogen: auf dem Rücken getragen, nur beim Schießen senkrecht in der linken Hand
const BOW_T = {back:{p:[0,.95,-.2], r:[0,0,.55]}, hand:{r:[Math.PI/2,-Math.PI/2,0]}};
function setBowSlot(g, inHand){
  const w=g.weapon; if(!w || g.bowInHand===inHand) return; g.bowInHand=inHand;
  if(w.parent) w.parent.remove(w);
  const bb=w.geometry.boundingBox, mid=new T.Vector3(0,(bb.min.y+bb.max.y)/2,0);
  if(inHand){ w.scale.setScalar(g.bowK); w.rotation.set(...BOW_T.hand.r); w.position.copy(mid.applyEuler(w.rotation).multiplyScalar(-g.bowK)).add(g.palmL); g.rig.handL.add(w); }
  else { const ws=g.bowK*g.bowS; w.scale.setScalar(ws); w.rotation.set(...BOW_T.back.r); w.position.set(...BOW_T.back.p).add(mid.applyEuler(w.rotation).multiplyScalar(-ws)); g.add(w); }
}
function makeSoldier(kind, color){
  const key = MODELS.warrior ? 'warrior' : (Math.random()<.5?'cavem':'cavef');
  const g = makeRigged(key, 1.5, color); if(!g) return makeWorker(color);
  g.rig.hips.userData.y0 = g.rig.hips.position.y; g.userData.key=key;
  attachWeapon(g, kind);
  return g;
}
// Lebensbalken über der Figur
const BAR_GEO = new T.PlaneGeometry(1,1);
function makeBar(){
  const g=new T.Group();
  const bg=new T.Sprite(new T.SpriteMaterial({color:0x220000, depthTest:false})); bg.scale.set(.9,.11,1);
  const fg=new T.Sprite(new T.SpriteMaterial({color:0x5fe36a, depthTest:false})); fg.scale.set(.86,.07,1); fg.center.set(0,.5); fg.position.x=-.43;
  bg.renderOrder=8; fg.renderOrder=9; g.add(bg); g.add(fg); g.fg=fg; g.visible=false; return g;
}
function updateBar(u){
  if(!u.bar){ u.bar=makeBar(); G.scene.add(u.bar); }
  const f=clamp(u.hp/u.maxHp,0,1), show=!G.farView && (u.ring.visible || f<.999);
  u.bar.visible=show; if(!show) return;
  u.bar.position.set(u.x, u.mesh.position.y+2.05, u.z); u.bar.quaternion.copy(G.cam.quaternion); u.bar.fg.scale.x=.86*f;
  u.bar.fg.material.color.setHex(f>.5?0x5fe36a:f>.25?0xf2c230:0xe23b3b);
}
const alive = t => t && t.hp>0 && !t.dead;
function cmdAttack(u,t){ u.state='attack'; u.target=t; u.site=null; u.path=null; u.repath=0; }
function nearestFoe(u, R){
  let best=null, bd=R;
  for(const o of G.units){ if(!alive(o) || o.inside || !hostile(u.owner,o.owner)) continue; const d=Math.hypot(o.x-u.x,o.z-u.z); if(d<bd){ bd=d; best=o; } }
  if(best) return best;
  for(const b of G.builds){ if(!alive(b) || b.kind==='road' || !hostile(u.owner,b.owner)) continue; const d=Math.hypot(b.x-u.x,b.z-u.z)-b.size*.5; if(d<bd){ bd=d; best=b; } }
  return best;
}
const arrows=[];
function shootArrow(u,t,dmg,yStart){
  const m=new T.Mesh(new T.CylinderGeometry(.015,.015,.7,4), mat(0x5a3818)); m.rotation.x=Math.PI/2;
  const g=new T.Group(); g.add(m); const y0=yStart!=null?yStart:getH(u.x,u.z)+1.3; g.position.set(u.x,y0,u.z); G.scene.add(g);
  arrows.push({g, x0:u.x, z0:u.z, y0, t, dmg, k:0, src:u, len:Math.max(1,Math.hypot(t.x-u.x,t.z-u.z))});
}
function updateArrows(dt){
  for(let i=arrows.length-1;i>=0;i--){ const a=arrows[i]; a.k += dt*22/a.len;
    const tx=a.t.x, tz=a.t.z, ty=getH(tx,tz)+(a.t.size?1.2:1.0), k=Math.min(1,a.k);
    a.g.position.set(lerp(a.x0,tx,k), lerp(a.y0,ty,k)+Math.sin(k*Math.PI)*a.len*.12, lerp(a.z0,tz,k));
    a.g.lookAt(tx, ty, tz);
    if(a.k>=1){ G.scene.remove(a.g); arrows.splice(i,1); if(alive(a.t)) damage(a.t, a.dmg, a.src); }
  }
}
function damage(t, dmg, src){
  if(t.inside && t.inside.kind==='tower' && alive(t.inside)){ t=t.inside; dmg*=.35; }
  if(!t.size) bloodFx(t.x,t.z,5+(G.rand()*4|0), G.rand()<.35?.35:0);
  if(src && G.reg && friendlyLand(src.owner, src.x, src.z)) dmg *= 1.15; // Heimvorteil wie in EE2
  t.hp -= dmg;
  if(t.size){ if(t.owner===0 && !G.alarmT){ G.alarmT=8; EE.toast('Deine '+BUILD[t.kind].name+' wird angegriffen!'); EE.sfx('error',.6); } if(t.hp<=0) destroyBuilding(t); return; }
  if(t.owner===0 && !G.alarmT){ G.alarmT=8; EE.toast('Deine Leute werden angegriffen!'); EE.vib(40); }
  if(t.hp<=0){ killUnit(t); return; }
  if(isSoldier(t) && (t.state==='idle' || t.state==='move' && t.owner!==0) && src && alive(src)) cmdAttack(t, src);
}
// Blut: Spritzer bei Treffern und eine Lache am Boden, die langsam verblasst
const BLOOD = {parts:[], pools:[]};
function bloodFx(x,z,n,pool){
  if(!G || G.farView) return;
  if(!BLOOD.geo){ BLOOD.geo=new T.IcosahedronGeometry(.05,0); BLOOD.mat=new T.MeshBasicMaterial({color:0x8a0b0b}); BLOOD.pgeo=new T.CircleGeometry(.5,10); BLOOD.pgeo.rotateX(-Math.PI/2); }
  const y=getH(x,z);
  for(let i=0;i<n && BLOOD.parts.length<80;i++){ const m=new T.Mesh(BLOOD.geo,BLOOD.mat); m.position.set(x,y+.9+G.rand()*.3,z); const s=.6+G.rand()*.9; m.scale.setScalar(s); G.scene.add(m);
    const a=G.rand()*6.28, v=.8+G.rand()*1.6; BLOOD.parts.push({m, vx:Math.cos(a)*v, vz:Math.sin(a)*v, vy:1+G.rand()*1.8}); }
  if(pool && BLOOD.pools.length<40){ const mat=new T.MeshBasicMaterial({color:0x5e0606, transparent:true, opacity:.85, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2});
    const m=new T.Mesh(BLOOD.pgeo, mat); const s=pool*(.7+G.rand()*.5); m.scale.set(s,1,s*(.7+G.rand()*.5)); m.rotation.y=G.rand()*6.28; m.position.set(x+(G.rand()-.5)*.3,y+.03,z+(G.rand()-.5)*.3); G.scene.add(m); BLOOD.pools.push({m,t:0}); }
}
function updateBlood(dt){
  for(let i=BLOOD.parts.length-1;i>=0;i--){ const p=BLOOD.parts[i], m=p.m; p.vy-=9.8*dt; m.position.x+=p.vx*dt; m.position.z+=p.vz*dt; m.position.y+=p.vy*dt;
    if(m.position.y<getH(m.position.x,m.position.z)){ G.scene.remove(m); BLOOD.parts.splice(i,1); } }
  for(let i=BLOOD.pools.length-1;i>=0;i--){ const p=BLOOD.pools[i]; p.t+=dt; if(p.t>20){ p.m.material.opacity=.85*(1-(p.t-20)/10); if(p.t>30){ G.scene.remove(p.m); p.m.material.dispose(); BLOOD.pools.splice(i,1); } } }
}
function hit(u,t){
  const U=UNIT[u.kind]; const dmg = (t.size ? U.atk*U.bld : U.atk) * (.85+G.rand()*.3);
  if(U.ranged) shootArrow(u,t,dmg); else { damage(t,dmg,u); sfxAt('chop',u.x,u.z,.6); }
}
function killUnit(u){
  bloodFx(u.x,u.z,10,.8);
  u.dead=true; u.hp=0; const i=G.units.indexOf(u); if(i>=0) G.units.splice(i,1);
  G.players[u.owner].pop = Math.max(0, G.players[u.owner].pop-1);
  if(G.sel.includes(u)){ G.sel=G.sel.filter(x=>x!==u); drawPanelSoon(); }
  u.ring.visible=false; if(u.bar) u.bar.visible=false;
  const m=u.mesh; let t=0; const fall=()=>{ if(!G) return; t+=.016; m.rotation.x=-Math.min(1,t*2.2)*Math.PI/2; m.position.y = getH(u.x,u.z)+.12 - Math.max(0,t-1.6)*.6;
    if(t<2.6) requestAnimationFrame(fall); else { G.scene.remove(m); G.scene.remove(u.ring); if(u.bar) G.scene.remove(u.bar); } }; fall();
  if(u.owner===0) updateHUD();
}
// Gebäude zerbrechen bei 0 Leben in Einzelteile: das Modell wird in Brocken zerlegt,
// die wegfliegen, aufschlagen, abprallen, rollen und liegen bleiben
const DEBRIS = {list:[], dust:[]};
function shatterBuilding(b){
  const root=b.mesh; root.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(root), size=box.getSize(new T.Vector3()), ctr=box.getCenter(new T.Vector3());
  const N = b.kind==='wall'||b.kind==='gate' ? 2 : G.gfx===0 ? 3 : 4, NY=N+1;
  const cx=size.x/N||1, cy=size.y/NY||1, cz=size.z/N||1, made=[];
  root.traverse(o=>{
    if(!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes.position || !o.visible) return;
    let g=o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    const P=g.attributes.position.array, Nn=g.attributes.normal&&g.attributes.normal.array, U=g.attributes.uv&&g.attributes.uv.array, C=g.attributes.color&&g.attributes.color.array;
    const bk=new Map();
    for(let t=0;t<P.length/9;t++){ const i=t*9, mx=(P[i]+P[i+3]+P[i+6])/3, my=(P[i+1]+P[i+4]+P[i+7])/3, mz=(P[i+2]+P[i+5]+P[i+8])/3;
      const key=Math.min(N-1,Math.floor((mx-box.min.x)/cx))+','+Math.min(NY-1,Math.floor((my-box.min.y)/cy))+','+Math.min(N-1,Math.floor((mz-box.min.z)/cz));
      let a=bk.get(key); if(!a){ a=[]; bk.set(key,a); } a.push(t); }
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    for(const tris of bk.values()){
      const n=tris.length*3, pos=new Float32Array(n*3), nor=Nn?new Float32Array(n*3):null, uv=U?new Float32Array(n*2):null, col=C?new Float32Array(n*3):null;
      let sx=0,sy=0,sz=0;
      tris.forEach((t,j)=>{ for(let v=0;v<3;v++){ const si=t*3+v, di=j*3+v; pos[di*3]=P[si*3]; pos[di*3+1]=P[si*3+1]; pos[di*3+2]=P[si*3+2]; sx+=P[si*3]; sy+=P[si*3+1]; sz+=P[si*3+2];
        if(nor){ nor[di*3]=Nn[si*3]; nor[di*3+1]=Nn[si*3+1]; nor[di*3+2]=Nn[si*3+2]; } if(uv){ uv[di*2]=U[si*2]; uv[di*2+1]=U[si*2+1]; } if(col){ col[di*3]=C[si*3]; col[di*3+1]=C[si*3+1]; col[di*3+2]=C[si*3+2]; } } });
      sx/=n; sy/=n; sz/=n; let r=0;
      for(let k=0;k<n;k++){ pos[k*3]-=sx; pos[k*3+1]-=sy; pos[k*3+2]-=sz; r=Math.max(r, Math.abs(pos[k*3+1])); }
      const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.BufferAttribute(pos,3)); if(nor) geo.setAttribute('normal',new T.BufferAttribute(nor,3)); else geo.computeVertexNormals();
      if(uv) geo.setAttribute('uv',new T.BufferAttribute(uv,2)); if(col) geo.setAttribute('color',new T.BufferAttribute(col,3));
      const m=new T.Mesh(geo, mat); m.position.set(sx,sy,sz); m.castShadow=G.gfx>0; m.frustumCulled=true; G.scene.add(m);
      // Wucht: nach außen und oben, oben liegende Teile fliegen weiter; dazu zufälliges Drehen
      const dx=sx-ctr.x, dz=sz-ctr.z, dl=Math.hypot(dx,dz)||1, hgt=(sy-box.min.y)/(size.y||1), push=1.2+G.rand()*2.2+hgt*2;
      made.push({m, vx:dx/dl*push+(G.rand()-.5), vy:1+G.rand()*2.5+hgt*1.5, vz:dz/dl*push+(G.rand()-.5),
        wx:(G.rand()-.5)*6, wy:(G.rand()-.5)*4, wz:(G.rand()-.5)*6, r:Math.max(.08,Math.min(r,.6)), t:0, rest:false, delay:hgt*.25*G.rand()});
    }
    g.dispose();
  });
  DEBRIS.list.push(...made);
  while(DEBRIS.list.length>700){ const d=DEBRIS.list.shift(); G.scene.remove(d.m); d.m.geometry.dispose(); }
  // Staubwolke
  if(!DEBRIS.dmat){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'), gr=x.createRadialGradient(32,32,2,32,32,31); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.5,'rgba(255,255,255,.5)'); gr.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=gr; x.fillRect(0,0,64,64);
    DEBRIS.dmat=new T.SpriteMaterial({map:new T.CanvasTexture(c), color:0xa89478, transparent:true, opacity:.55, depthWrite:false}); }
  for(let i=0;i<(G.gfx===0?4:9);i++){ const sp=new T.Sprite(DEBRIS.dmat.clone()); const a=G.rand()*6.28, rr=G.rand()*b.size*.4; sp.position.set(ctr.x+Math.cos(a)*rr, box.min.y+.5+G.rand()*size.y*.4, ctr.z+Math.sin(a)*rr); sp.scale.setScalar(1.5); G.scene.add(sp); DEBRIS.dust.push({s:sp,t:0,vx:Math.cos(a)*.8,vz:Math.sin(a)*.8}); }
  G.scene.remove(root);
}
function updateDebris(dt){
  for(let i=DEBRIS.list.length-1;i>=0;i--){ const d=DEBRIS.list[i], m=d.m; d.t+=dt;
    if(d.t<d.delay) continue;
    if(!d.rest){
      d.vy-=9.8*dt; m.position.x+=d.vx*dt; m.position.y+=d.vy*dt; m.position.z+=d.vz*dt;
      m.rotation.x+=d.wx*dt; m.rotation.y+=d.wy*dt; m.rotation.z+=d.wz*dt;
      const gy=getH(m.position.x,m.position.z)+d.r*.45;
      if(m.position.y<gy){ m.position.y=gy;
        if(d.vy<-1.2){ d.vy=-d.vy*.28; d.vx*=.55; d.vz*=.55; d.wx*=.5; d.wy*=.5; d.wz*=.5; }   // aufschlagen und abprallen
        else { d.vy=0; d.vx*=.86; d.vz*=.86; d.wx*=.8; d.wz*=.8; d.wy*=.8; }                     // rutschen/rollen
        if(Math.hypot(d.vx,d.vz)<.12 && Math.abs(d.vy)<.2){ d.rest=true; d.restT=d.t; } }
    } else if(d.t-d.restT>40){ m.position.y-=dt*.08; if(d.t-d.restT>52){ G.scene.remove(m); m.geometry.dispose(); DEBRIS.list.splice(i,1); } }
  }
  for(let i=DEBRIS.dust.length-1;i>=0;i--){ const p=DEBRIS.dust[i]; p.t+=dt; const s=p.s; s.position.x+=p.vx*dt; s.position.z+=p.vz*dt; s.position.y+=dt*.4; s.scale.setScalar(1.5+p.t*1.6); s.material.opacity=.55*Math.max(0,1-p.t/3.5); if(p.t>3.5){ G.scene.remove(s); s.material.dispose(); DEBRIS.dust.splice(i,1); } }
}
function destroyBuilding(b){
  b.dead=true; b.hp=0; const i=G.builds.indexOf(b); if(i>=0) G.builds.splice(i,1);
  for(const k of b.cells) if(k>=0) G.grid[k]=0;
  const p=G.players[b.owner], d=BUILD[b.kind];
  if(b.built>=1 && d.pop) p.popCap=Math.max(0,p.popCap-d.pop);
  if(b===p.tc) p.tc=G.builds.find(o=>o.owner===b.owner && o.kind==='tc' && o.built>=1) || null;
  if(b.kind==='tc'){ releaseRegion(b); buildBorders(); }
  if(G.selB===b){ G.selB=null; drawPanelSoon(); }
  b.ring.visible=false; removePiles(b); if(b.bar) G.scene.remove(b.bar); sfxAt('build',b.x,b.z,1); EE.sfx('place',.5);
  G.scene.remove(b.ring);
  if(b.kind==='road' || b.quietRemove) G.scene.remove(b.mesh); else { shatterBuilding(b); sfxAt('chop',b.x,b.z,1); }
  if(b.owner===0 && !b.quietRemove) EE.toast(d.name+' wurde zerstört');
  checkEnd();
}
function checkEnd(){
  if(G.over) return;
  const has = i => G.builds.some(b=>b.owner===i && b.kind!=='road') || G.units.some(u=>u.owner===i);
  if(!has(0)){ G.over=true; try{localStorage.removeItem(SAVE_KEY)}catch(e){} setTimeout(()=>{ EE.toast('Niederlage – dein Volk ist untergegangen'); EE.sfx('error'); }, 400); return; }
  for(let i=1;i<G.players.length;i++){ const p=G.players[i]; if(!p.out && !has(i)){ p.out=true; EE.toast('Die '+p.civ[0]+' sind besiegt!'); EE.sfx('fanfare',.8); } }
  if(G.players.slice(1).every(p=>p.out)){ G.over=true; try{localStorage.removeItem(SAVE_KEY)}catch(e){} setTimeout(()=>{ EE.toast('Sieg! Alle Gegner sind besiegt'); EE.sfx('fanfare'); }, 600); }
}
// KI: Kriegerhütte bauen, Krieger ausbilden, im Krieg angreifen
function updateAIWar(p, mine, tc){
  const d=G.dip[p.id], atWar = d && d.state==='enemy';
  const barr = G.builds.find(b=>b.owner===p.id && b.kind==='barracks');
  const workers = mine.filter(u=>u.kind==='worker').length;
  if(!barr && workers>=8 && p.res.wood>=120 && p.res.stone>=40 && !G.builds.some(b=>b.owner===p.id && b.built<1)){
    for(let t=0;t<25;t++){ const a=G.rand()*6.28, r=10+G.rand()*6; const x=tc.x+Math.cos(a)*r, z=tc.z+Math.sin(a)*r;
      if(validPlace('barracks',x,z,p.id)){ p.res.wood-=120; p.res.stone-=40; const b=addBuilding('barracks',p.id,x,z,false); mine.filter(u=>u.kind==='worker').slice(0,3).forEach(w=>cmdBuild(w,b)); break; } }
  }
  if(barr && barr.built>=1 && barr.queue.length<2 && p.pop<p.popCap){
    const army = mine.filter(isSoldier).length, want = atWar ? 6+Math.floor(G.t/240) : 3;
    if(army<want){ const k=['club','spear','bow'][(G.rand()*3)|0], c=UNIT[k].cost; if(canPay(p,c)){ pay(p,c); barr.queue.push(k); } }
  }
  // Wachturm vor der Stadt bauen und mit 2 Kriegern besetzen
  const tower = G.builds.find(b=>b.owner===p.id && b.kind==='tower');
  if(!tower && barr && barr.built>=1 && G.t>420 && canPay(p,BUILD.tower.cost) && !G.builds.some(b=>b.owner===p.id && b.built<1)){
    for(let t=0;t<25;t++){ const a=G.rand()*6.28, r=9+G.rand()*6, x=tc.x+Math.cos(a)*r, z=tc.z+Math.sin(a)*r;
      if(validPlace('tower',x,z,p.id)){ pay(p,BUILD.tower.cost); const b=addBuilding('tower',p.id,x,z,false); mine.filter(u=>u.kind==='worker').slice(0,2).forEach(w=>cmdBuild(w,b)); break; } } }
  if(tower && tower.built>=1 && crew(tower).length<2){ const s=mine.find(u=>isSoldier(u) && u.state==='idle' && !u.inside); if(s) cmdGarrison(s,tower); }
  // Land erweitern: neues Stadtzentrum am Rand des Gebiets
  p.expT = (p.expT ?? (300 + G.rand()*240)) - 1.5;
  if(p.expT<=0 && workers>=10 && canPay(p, BUILD.tc.cost) && !G.builds.some(b=>b.owner===p.id && b.kind==='tc' && b.built<1)){
    p.expT = 240 + G.rand()*200;
    const cand=[]; for(const [id,ow] of G.reg.owner) if(ow===p.id) for(const n of regNeighbors(id)) if(regOwner(n.id)<0) cand.push(n);
    for(let t=0;t<40 && cand.length;t++){ const n=cand[(G.rand()*cand.length)|0], a=G.rand()*6.28, r=G.rand()*REG_S*.3, x=n.x+Math.cos(a)*r, z=n.z+Math.sin(a)*r;
      if(rawLand(x,z)<.7) continue;
      if(validPlace('tc',x,z,p.id)){ pay(p, BUILD.tc.cost); const b=addBuilding('tc',p.id,x,z,false); mine.filter(u=>u.kind==='worker').slice(0,4).forEach(w=>cmdBuild(w,b)); break; } }
  }
  // Angriff: nur im Krieg und frühestens nach 8 Minuten
  const soldiers = mine.filter(u=>isSoldier(u) && !u.inside && u.state!=='garrison');
  p.waveT = (p.waveT ?? (480 + G.rand()*120)) - 1.5;
  if(atWar && p.waveT<=0 && soldiers.length>=4){
    p.waveT = 240 + G.rand()*120;
    const targets = G.builds.filter(b=>b.owner===0 && b.kind!=='road');
    if(targets.length){ const t = targets.sort((a,b)=>Math.hypot(a.x-tc.x,a.z-tc.z)-Math.hypot(b.x-tc.x,b.z-tc.z))[0];
      soldiers.forEach(s=>cmdAttack(s,t)); EE.toast('Die '+p.civ[0]+' greifen an!'); EE.sfx('error',.8); EE.vib(60); }
  }
  // Verteidigung: Krieger greifen Feinde nahe der eigenen Stadt an
  for(const s of soldiers){ if(s.state==='idle'){ const f=nearestFoe(s, 18); if(f && Math.hypot(f.x-tc.x,f.z-tc.z)<30) cmdAttack(s,f); } }
}

const swordSVG = () => '<svg viewBox="0 0 24 24"><path d="M5 4l10 10M19 4L9 14M7 13l-3 3 2 2 3-3M17 13l3 3-2 2-3-3" stroke="#e8b64a" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
const towerSVG = () => '<svg viewBox="0 0 24 24"><path d="M7 22l2-12h6l2 12M9 14h6M8.4 18h7.2" stroke="#a86d36" stroke-width="1.8" fill="none"/><rect x="6" y="6" width="12" height="4" fill="#c9a46a" stroke="#5a3818"/><path d="M8 6V3M16 6V3" stroke="#5a3818" stroke-width="1.6"/></svg>';
const roadSVG = () => '<svg viewBox="0 0 24 24"><path d="M8 22L11 2h2l3 20z" fill="#b08a58"/><path d="M12 4v3M12 10v3M12 16v3" stroke="#f3e2b8" stroke-width="1.4"/><circle cx="6" cy="18" r="1.3" fill="#9aa3ad"/><circle cx="18" cy="9" r="1" fill="#9aa3ad"/></svg>';
const wallSVG = () => '<svg viewBox="0 0 24 24"><path d="M3 21V8l2-3 2 3v13M9 21V7l2-3 2 3v14M15 21V8l2-3 2 3v13" fill="#a86d36" stroke="#5a3818"/><path d="M2 12h20M2 17h20" stroke="#5a3818" stroke-width="1.6"/></svg>';
const hutSVG = () => '<svg viewBox="0 0 24 24"><path d="M12 3L3 18h18z" fill="#c9a46a"/><path d="M12 3L8 18h8z" fill="#8a5a2b"/></svg>';
const storeSVG = () => '<svg viewBox="0 0 24 24"><rect x="3" y="15" width="18" height="4" fill="#8a5a2b"/><rect x="4" y="10" width="7" height="5" rx="2" fill="#a86d36"/><rect x="12" y="11" width="8" height="4" rx="2" fill="#a86d36"/><path d="M8 10l2-4 3 3z" fill="#9aa3ad"/></svg>';

function action(a){
  const p = G.players[0];
  EE.click();
  if(a==='worker'){
    const b = G.selB;
    if(b.queue.length>=5){ EE.toast('Warteschlange voll'); return; }
    if(!canPay(p,WORKER_COST)){ EE.toast('Nicht genug Nahrung'); EE.sfx('error'); return; }
    pay(p,WORKER_COST); b.queue.push('worker'); EE.vib(15);
  } else if(a==='age'){ EE.toast('Die Bronzezeit kommt im nächsten Update');
  } else if(a.startsWith('t-')){ const k=a.slice(2), b=G.selB, c=UNIT[k].cost;
    if(b.queue.length>=5){ EE.toast('Warteschlange voll'); return; }
    if(!canPay(p,c)){ EE.toast('Nicht genug Rohstoffe'); EE.sfx('error'); return; }
    pay(p,c); b.queue.push(k); EE.vib(15);
  } else if(a==='helpin'){ helperIn(G.selB); drawPanel();
  } else if(a==='helpout'){ helpersOut(G.selB); drawPanel();
  } else if(a==='crewin'){ const b=G.selB, free=TOWER_MAX-crew(b).length-G.units.filter(u=>u.state==='garrison'&&u.site===b).length;
    if(free<=0){ EE.toast('Der Wachturm ist voll'); return; }
    const s=G.units.filter(u=>u.owner===0 && isSoldier(u) && !u.inside && !u.dead && u.state!=='garrison').sort((p,q)=>(p.state==='idle'?0:50)+Math.hypot(p.x-b.x,p.z-b.z)-(q.state==='idle'?0:50)-Math.hypot(q.x-b.x,q.z-b.z)).slice(0,free);
    if(!s.length){ EE.toast('Keine Krieger frei – bilde welche in der Kriegerhütte aus'); return; }
    s.forEach(u=>cmdGarrison(u,b)); EE.toast(s.length+' Krieger '+(s.length>1?'gehen':'geht')+' in den Wachturm');
  } else if(a==='crewout'){ crewOut(G.selB); drawPanel();
  } else if(a==='togate'){ const w=G.selB; if(!canPay(p,BUILD.gate.cost)){ EE.sfx('error'); EE.toast('Tor: '+missingTxt(p,BUILD.gate.cost)); return; }
    pay(p,BUILD.gate.cost); w.quietRemove=true; destroyBuilding(w); G.scene.remove(w.ring);
    const g=addWall(0, {...w.seg, gate:true}, w.seg.ang, w.wallId, false);
    G.units.filter(u=>u.owner===0 && u.kind==='worker' && !u.inside && !u.dead).sort((a,b)=>Math.hypot(a.x-g.x,a.z-g.z)-Math.hypot(b.x-g.x,b.z-g.z)).slice(0,2).forEach(u=>cmdBuild(u,g));
    G.selB=null; EE.toast('Tor wird gebaut'); EE.sfx('place');
  } else if(a==='b-tc'){ if(!canPay(p,BUILD.tc.cost)){ EE.sfx('error'); EE.toast('Stadtzentrum: '+missingTxt(p,BUILD.tc.cost)); return; } startPlace('tc');
  } else if(a==='b-wall'){ startWall('wall');
  } else if(a==='b-road'){ startWall('road');
  } else if(a==='dip'){ openDip('rel');
  } else if(a.startsWith('b-')){
    const kind = a.slice(2);
    if(!canPay(p,BUILD[kind].cost)){ EE.sfx('error'); EE.toast(BUILD[kind].name+': '+missingTxt(p,BUILD[kind].cost)); return; }
    startPlace(kind);
  }
  updateHUD(); drawPanel();
}

/* ============================================================
   DIPLOMATIE & HANDEL (wie in Empire Earth 2): Bündnis, Neutral, Krieg, Tribut, Rohstoffhandel
   Neutrale und verbündete Völker greifen nicht an.
   ============================================================ */
const DIP_DE = {ally:'Verbündet', neutral:'Neutral', enemy:'Krieg'};
const RES_VAL = {food:1, wood:1, stone:1.3, gold:2};
const dipSVG = () => '<svg viewBox="0 0 24 24"><path d="M2 11l4-4 4 2 3-2 4 1 5 4-3 3-2-1-4 4q-1 1-2 0l-6-5z" fill="#e8b64a"/><path d="M9 13l2 2M11 11l3 3M13 10l3 3" stroke="#7a4a12" stroke-width="1.3" stroke-linecap="round"/></svg>';
function initDip(){
  G.dip = {};
  for(let i=1;i<G.players.length;i++) G.dip[i] = {state:'enemy', mood:Math.round((G.rand()-.5)*40), ask:120+G.rand()*200};
  G.dipUI = {tab:'rel', who:1, give:'wood', get:'gold', amt:100};
}
const hostile = (a,b) => { if(a===b) return false; const o=a===0?b:b===0?a:-1; if(o<0) return true; return G.dip[o].state==='enemy'; };
function setDip(i, st, quiet){
  const d=G.dip[i], p=G.players[i];
  d.state=st;
  if(!quiet){ EE.toast(p.civ[0]+': '+(st==='ally'?'Wir sind jetzt Verbündete!':st==='neutral'?'Frieden – wir lassen uns in Ruhe.':'Krieg!')); EE.sfx(st==='enemy'?'error':'done', .8); }
  if(G.dipOpen) renderDip();
}
function propose(i, st){
  const d=G.dip[i], p=G.players[i]; EE.click();
  if(st===d.state) return;
  if(st==='enemy'){ d.mood=Math.max(-100,d.mood-40); setDip(i,'enemy'); return; }
  const need = st==='ally' ? 35 : -10;
  const bonus = (G.rand()-.5)*14;
  if(d.mood+bonus >= need){ d.mood=Math.min(100,d.mood+5); setDip(i,st); }
  else { d.mood=Math.max(-100,d.mood-3); EE.toast(p.civ[0]+' lehnen ab'+(st==='ally'?' – ein Geschenk (Tribut) könnte helfen':' – vielleicht mit einem Tribut')); EE.sfx('error',.6); if(G.dipOpen) renderDip(); }
}
function sendTribute(i, res, amt){
  const me=G.players[0], p=G.players[i], d=G.dip[i]; EE.click();
  if(me.res[res]<amt){ EE.toast('Nicht genug '+RES_DE[res]); EE.sfx('error'); return; }
  me.res[res]-=amt; p.res[res]+=amt;
  d.mood = Math.min(100, d.mood + Math.round(amt*RES_VAL[res]/6));
  EE.toast(amt+' '+RES_DE[res]+' an '+p.civ[0]+' geschickt – Stimmung steigt'); EE.sfx('confirm');
  updateHUD(); renderDip();
}
function demandTribute(i, res, amt){
  const me=G.players[0], p=G.players[i], d=G.dip[i]; EE.click();
  const weaker = p.pop < me.pop*.9 || d.state==='ally';
  if(weaker && d.mood > -25 && p.res[res]>=amt){ p.res[res]-=amt; me.res[res]+=amt; d.mood=Math.max(-100,d.mood-22); EE.toast(p.civ[0]+' zahlen '+amt+' '+RES_DE[res]+' – aber sie sind verärgert'); EE.sfx('confirm'); }
  else { d.mood=Math.max(-100,d.mood-12); EE.toast(p.civ[0]+' weigern sich zu zahlen'); EE.sfx('error',.6); }
  updateHUD(); renderDip();
}
function tradeQuote(i, give, get, amt){
  const d=G.dip[i]; if(give===get) return 0;
  const fair = amt*RES_VAL[give]/RES_VAL[get];
  const rate = (d.state==='ally'?.9:.75) * (1 + d.mood/500);
  return Math.max(0, Math.floor(fair*rate));
}
function doTrade(i, give, get, amt){
  const me=G.players[0], p=G.players[i], d=G.dip[i]; EE.click();
  if(d.state==='enemy'){ EE.toast('Mit Feinden kann man nicht handeln'); EE.sfx('error'); return; }
  if(d.mood < -30){ EE.toast(p.civ[0]+' wollen gerade nicht mit dir handeln'); EE.sfx('error'); return; }
  const q = tradeQuote(i,give,get,amt);
  if(me.res[give]<amt){ EE.toast('Nicht genug '+RES_DE[give]); EE.sfx('error'); return; }
  if(p.res[get]<q){ EE.toast(p.civ[0]+' haben nur '+Math.floor(p.res[get])+' '+RES_DE[get]); EE.sfx('error'); return; }
  me.res[give]-=amt; p.res[give]+=amt; me.res[get]+=q; p.res[get]-=q; d.mood=Math.min(100,d.mood+2);
  EE.toast('Handel: '+amt+' '+RES_DE[give]+' gegen '+q+' '+RES_DE[get]); EE.sfx('confirm');
  updateHUD(); renderDip();
}
function openDip(tab){ G.dipOpen=true; G.dipUI.tab=tab||G.dipUI.tab; G.paused=true; $('#dip').classList.remove('hidden'); renderDip(); }
function closeDip(){ G.dipOpen=false; G.paused=false; $('#dip').classList.add('hidden'); EE.click(); }
function moodTxt(m){ return m>=50?'freundlich':m>=15?'wohlgesonnen':m>-15?'zurückhaltend':m>-50?'misstrauisch':'feindselig'; }
function renderDip(){
  const el=$('#dipBody'); if(!el || !G.dipOpen) return;
  const U=G.dipUI, me=G.players[0];
  $$('#dip .dtab').forEach(b=>b.classList.toggle('on', b.dataset.t===U.tab));
  const col=i=>'#'+COLORS[i].toString(16).padStart(6,'0');
  const civBtns = (onlyPeace)=> G.players.slice(1).map(p=>`<button class="dciv${U.who===p.id?' on':''}${onlyPeace&&G.dip[p.id].state==='enemy'?' off':''}" data-w="${p.id}"><i style="background:${col(p.id)}"></i>${p.civ[0]}</button>`).join('');
  const resBtns = (k)=> RES.map(r=>`<button class="dres${U[k]===r?' on':''}" data-${k}="${r}">${ICON[r]}<span>${RES_DE[r]}</span></button>`).join('');
  const amtBtns = [50,100,200,500].map(a=>`<button class="damt${U.amt===a?' on':''}" data-amt="${a}">${a}</button>`).join('');
  let h='';
  if(U.tab==='rel'){
    h += `<p class="dnote">Neutrale und verbündete Völker greifen nicht an. Mit Tributen steigt die Stimmung.</p><div class="drows">`;
    for(const p of G.players.slice(1)){ const d=G.dip[p.id];
      h += `<div class="drow"><i style="background:${col(p.id)}"></i><div class="dn"><b>${p.civ[0]}</b><small>${moodTxt(d.mood)}</small><span class="mood"><s style="width:${(d.mood+100)/2}%"></s></span></div>
        <div class="dst">${['ally','neutral','enemy'].map(s=>`<button class="${s}${d.state===s?' on':''}" data-p="${p.id}" data-s="${s}">${DIP_DE[s]}</button>`).join('')}</div></div>`; }
    h += `</div>`;
  } else if(U.tab==='trade'){
    const q = tradeQuote(U.who,U.give,U.get,U.amt), p=G.players[U.who], d=G.dip[U.who];
    h += `<div class="dlab">Handelspartner</div><div class="dline">${civBtns(true)}</div>
      <div class="dlab">Du gibst</div><div class="dline">${resBtns('give')}</div>
      <div class="dlab">Du bekommst</div><div class="dline">${resBtns('get')}</div>
      <div class="dlab">Menge</div><div class="dline">${amtBtns}</div>
      <div class="deal">${d.state==='enemy'?'Mit Feinden wird nicht gehandelt – schließe erst Frieden.':U.give===U.get?'Wähle zwei verschiedene Rohstoffe.':`${U.amt} ${RES_DE[U.give]} → <b>${q} ${RES_DE[U.get]}</b> <small>(${p.civ[0]} haben ${Math.floor(p.res[U.get])})</small>`}
      <button class="btn main small" id="dTrade"${d.state==='enemy'||U.give===U.get?' disabled':''}>Handeln</button></div>`;
  } else {
    const p=G.players[U.who];
    h += `<div class="dlab">Volk</div><div class="dline">${civBtns(false)}</div>
      <div class="dlab">Rohstoff</div><div class="dline">${resBtns('give')}</div>
      <div class="dlab">Menge</div><div class="dline">${amtBtns}</div>
      <div class="deal">Du hast ${Math.floor(me.res[U.give])} ${RES_DE[U.give]} · Stimmung der ${p.civ[0]}: ${moodTxt(G.dip[U.who].mood)}
      <button class="btn small" id="dDemand">Fordern</button><button class="btn main small" id="dSend">Schenken</button></div>`;
  }
  el.innerHTML=h;
  el.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>propose(+b.dataset.p, b.dataset.s));
  el.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{ EE.click(); U.who=+b.dataset.w; renderDip(); });
  el.querySelectorAll('[data-give]').forEach(b=>b.onclick=()=>{ EE.click(); U.give=b.dataset.give; renderDip(); });
  el.querySelectorAll('[data-get]').forEach(b=>b.onclick=()=>{ EE.click(); U.get=b.dataset.get; renderDip(); });
  el.querySelectorAll('[data-amt]').forEach(b=>b.onclick=()=>{ EE.click(); U.amt=+b.dataset.amt; renderDip(); });
  const t=$('#dTrade'); if(t) t.onclick=()=>doTrade(U.who,U.give,U.get,U.amt);
  const s=$('#dSend'); if(s) s.onclick=()=>sendTribute(U.who,U.give,U.amt);
  const dm=$('#dDemand'); if(dm) dm.onclick=()=>demandTribute(U.who,U.give,U.amt);
}
// Stimmung ändert sich langsam; freundliche Völker bieten von selbst ein Bündnis an
function updateDip(dt){
  if(!G.dip) return;
  for(const k in G.dip){ const d=G.dip[k];
    d.mood += dt*(d.state==='ally'?.08:d.state==='enemy'?-.04:.02) - d.mood*dt*.002;
    d.mood = clamp(d.mood,-100,100);
    d.ask -= dt;
    if(d.ask<=0){ d.ask = 150+G.rand()*200;
      if(!G.offer && d.state!=='ally' && d.mood>(d.state==='enemy'?5:30)) showOffer(+k, d.state==='enemy'?'neutral':'ally'); }
  }
}
function showOffer(i, st){
  const p=G.players[i]; G.offer={i,st};
  const el=$('#offer'); el.innerHTML=`<span><i style="background:#${COLORS[i].toString(16).padStart(6,'0')}"></i>${p.civ[0]} bieten ${st==='ally'?'ein Bündnis':'Frieden'} an</span><button class="pb no" id="oNo">✕</button><button class="pb ok" id="oYes">✓</button>`;
  el.classList.remove('hidden'); EE.sfx('fanfare',.5);
  const done=(yes)=>{ el.classList.add('hidden'); G.offer=null; if(yes){ setDip(i,st); G.dip[i].mood=Math.min(100,G.dip[i].mood+10); } else { G.dip[i].mood-=8; EE.click(); } };
  $('#oYes').onclick=()=>done(true); $('#oNo').onclick=()=>done(false);
  clearTimeout(G.offerT); G.offerT=setTimeout(()=>{ if(G && G.offer) done(false); }, 25000);
}

/* ============================================================
   RENDERER & KAMERA
   ============================================================ */
function initRenderer(){
  const c = $('#gc');
  const r = new T.WebGLRenderer({canvas:c, antialias:G.gfx>=1, powerPreference:'high-performance'});
  r.setPixelRatio(Math.min(window.devicePixelRatio||1, [1.5,1.5,2][G.gfx]));
  r.shadowMap.enabled = G.gfx>=1;
  r.shadowMap.type = T.PCFSoftShadowMap; r.shadowMap.autoUpdate = false;
  r.outputColorSpace = T.SRGBColorSpace;
  G.renderer = r;
  const sc = new T.Scene();
  sc.background = new T.Color(0x9fd3ff);
  sc.fog = new T.Fog(0x9fd3ff, 60, 140);
  G.scene = sc;
  G.cam = new T.PerspectiveCamera(42, 1, .5, 400);
  G.camS = { x:0, z:0, dist:27, yaw:-.6, pitch:.95 };
  G.hemi = new T.HemisphereLight(0xdff2ff, 0x5a6b3a, 1.1); sc.add(G.hemi);
  const sun = new T.DirectionalLight(0xfff1d6, 2.1);
  sun.castShadow = G.gfx>=1;
  const sz = G.gfx>=2 ? 2048 : 1024;
  sun.shadow.mapSize.set(sz,sz);
  const sc2 = sun.shadow.camera; sc2.left=-40; sc2.right=40; sc2.top=40; sc2.bottom=-40; sc2.near=1; sc2.far=140;
  sun.shadow.bias = -.0006; sun.shadow.normalBias = .03;
  sc.add(sun); sc.add(sun.target);
  G.sun = sun;
  onResize();
  window.addEventListener('resize', onResize);
}
function onResize(){
  if(!G) return;
  const w = window.innerWidth, h = window.innerHeight;
  G.renderer.setSize(w,h,false);
  G.cam.aspect = w/h; G.cam.updateProjectionMatrix();
  G.W = w; G.H = h;
}
function updateCam(){
  const s = G.camS;
  s.x = clamp(s.x,-G.NX/2+6,G.NX/2-6); s.z = clamp(s.z,-G.NZ/2+6,G.NZ/2-6);
  const maxD = Math.max(G.NX,G.NZ)*1.05;
  s.dist = clamp(s.dist, G.camMin||5, maxD);
  const far = clamp((s.dist-45)/(maxD-45),0,1);
  const pitch = lerp(.95, 1.38, far);
  const y = Math.max(getH(s.x,s.z), WATER_Y);
  const hd = Math.cos(pitch)*s.dist, yaw = s.yaw*(1-far);
  G.cam.position.set(s.x+Math.sin(yaw)*hd, y+Math.sin(pitch)*s.dist, s.z+Math.cos(yaw)*hd);
  G.cam.far = s.dist*4+200; G.cam.near = clamp(s.dist*.02,.5,40); G.cam.updateProjectionMatrix();
  G.cam.lookAt(s.x, y, s.z);
  const fv = G.gfx===0 ? .7 : 1; G.scene.fog.near = (s.dist*1.6+20)*fv; G.scene.fog.far = (s.dist*4+120)*fv;
  G.sun.position.set(s.x+30, y+55, s.z+18);
  G.sun.target.position.set(s.x, y, s.z);
  const shadows = G.gfx>=1 && s.dist<60;
  if(G.sun.castShadow!==shadows){ G.sun.castShadow=shadows; }
  G.farView = s.dist>55;
}
function centerCamOn(x,z){ G.camS.x=x; G.camS.z=z+4; }


/* ============================================================
   WELTKARTE
   ============================================================ */
const LAT0 = 76, LAT1 = -56;              // Kartenausschnitt (Breitengrade)
const CIV_POS = { 'Osmanen':[32.5,39.5], 'Römer':[12.5,42], 'Griechen':[22,39], 'Ägypter':[31,27], 'Babylonier':[44.5,33],
  'Germanen':[10,51], 'Briten':[-1.5,52.5], 'Franken':[2.5,47], 'Wikinger':[10,60.5], 'Mongolen':[105,47],
  'Chinesen':[113,34], 'Japaner':[138,36], 'Koreaner':[127.5,37], 'Azteken':[-99,19.5], 'Inka':[-72,-13.5],
  'Maya':[-89.5,17.5], 'Russen':[37.5,55.7], 'Zulu':[31,-28.5] };
// Wüsten [lonMin, lonMax, latMin, latMax]
const DESERTS = [[-17,34,15,31],[34,58,14,31],[50,66,25,34],[68,76,24,30],[76,92,36,42],[92,116,37,47],[118,146,-32,-18],
  [17,25,-27,-19],[-118,-104,29,37],[-72,-68,-28,-17],[55,66,39,45]];
// Gebirge [lon, lat, rLon, rLat, Höhe]
const MOUNTAINS = [[86,31,11,4,6],[76,36,5,3,5],[96,30,4,4,4.5],[10.5,46.4,5,1.3,3.2],[-74,-15,3,10,4.5],[-70,-32,2.2,10,4.5],[-77,-2,2.5,6,4],
  [-71,-45,2,7,3.4],[-113,45,6,9,3.6],[-122,55,4,6,3],[59,58,2,8,2.5],[44,42.5,4,1.3,3.2],[-3,32,7,2,2.6],[39,10,3,4,2.8],[30,-2,3,4,2],
  [102,35,7,3,3.3],[83,43,7,2,3.2],[71,38,3,2,3.6],[24,46,4,2,2],[14,62,4,4,2.2],[138,36,1.5,2,2.4],[148,-34,2,6,2],[-80,37,4,6,1.8],[-104,24,3,6,2.6]];
// Rohstoff-Vorkommen [Art, lonMin, lonMax, latMin, latMax, Anzahl]
const DEPOSITS = [
  ['oil',45,55,20,30,5],['oil',44,48,30,36,3],['oil',49,54,38,45,3],['oil',65,80,58,66,4],['oil',-103,-94,28,34,3],['oil',-72,-64,7,11,2],
  ['oil',4,9,4,7,2],['oil',15,25,26,31,3],['oil',-118,-110,52,58,2],['oil',110,125,40,48,2],
  ['gold',25,30,-28,-24,4],['gold',-122,-119,37,40,3],['gold',-140,-135,62,65,2],['gold',-3,0,5,8,3],['gold',-78,-70,-15,-8,3],
  ['gold',118,123,-32,-28,3],['gold',110,135,55,62,3],['gold',20,26,44,47,2],
  ['metal',57,62,50,65,4],['metal',-71,-68,-28,-20,3],['metal',-45,-42,-21,-18,2],['metal',17,22,65,68,2],['metal',25,29,-12,-10,3],
  ['metal',116,120,-24,-21,3],['metal',-93,-88,46,48,2],['metal',110,118,30,40,3],['metal',33,36,34,35.5,2],['metal',8,14,49,52,2]];
let WMASK = null, WMW = 0, WMH = 0;
function loadWorldMask(){
  if(WMASK) return Promise.resolve();
  return new Promise(res=>{
    const img = new Image();
    img.onload = ()=>{ const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const x=c.getContext('2d'); x.drawImage(img,0,0);
      const d=x.getImageData(0,0,c.width,c.height).data; WMW=c.width; WMH=c.height; WMASK=new Float32Array(WMW*WMH);
      for(let i=0;i<WMASK.length;i++) WMASK[i]=d[i*4]/255; res(); };
    img.onerror = ()=>res();
    img.src = window.EE_WORLD || 'weltkarte.png?v=134';
  });
}
function landAt(lon,lat){
  if(!WMASK) return 0;
  const fx=(lon+180)/360*(WMW-1), fy=(LAT0-lat)/(LAT0-LAT1)*(WMH-1);
  const x0=clamp(Math.floor(fx),0,WMW-2), y0=clamp(Math.floor(fy),0,WMH-2), tx=clamp(fx-x0,0,1), ty=clamp(fy-y0,0,1);
  const a=WMASK[y0*WMW+x0], b=WMASK[y0*WMW+x0+1], c=WMASK[(y0+1)*WMW+x0], d=WMASK[(y0+1)*WMW+x0+1];
  return lerp(lerp(a,b,tx),lerp(c,d,tx),ty);
}
const toLon = x => (x+G.NX/2)/G.NX*360-180;
const toLat = z => LAT0-(z+G.NZ/2)/G.NZ*(LAT0-LAT1);
const fromLon = lon => (lon+180)/360*G.NX-G.NX/2;
const fromLat = lat => (LAT0-lat)/(LAT0-LAT1)*G.NZ-G.NZ/2;
function inBox(lon,lat,b,soft){ const cx=(b[0]+b[1])/2, cy=(b[2]+b[3])/2, rx=(b[1]-b[0])/2+soft, ry=(b[3]-b[2])/2+soft;
  const d=Math.max(Math.abs(lon-cx)/rx, Math.abs(lat-cy)/ry); return clamp((1-d)/(soft/Math.max(rx,ry)+.001),0,1); }
function desertAt(lon,lat){ let v=0; const w=(vnoise(lon*.09,lat*.09,77)-.5)*9+(vnoise(lon*.4,lat*.4,79)-.5)*2.5, w2=(vnoise(lon*.09+5,lat*.09,78)-.5)*6; for(const b of DESERTS){ v=Math.max(v, inBox(lon+w,lat+w2,b,3)); } return v; }
function mountainAt(lon,lat){ let v=0; for(const m of MOUNTAINS){ const d=Math.hypot((lon-m[0])/m[2],(lat-m[1])/m[3]); if(d<1) v=Math.max(v,(1-d*d)*m[4]); } return v; }
function coldAt(lat){ return clamp((Math.abs(lat)-55)/12,0,1); }
// Tropischer Regenwald [lonMin, lonMax, latMin, latMax]: Amazonas, Mittelamerika, Karibik, Kongo, Westafrika, Südostasien, Indonesien, Neuguinea …
const JUNGLES = [[-79,-44,-15,6],[-92,-77,7,18],[-85,-60,11,22],[8,31,-6,6],[-13,9,4,9],[95,108,-8,20],[108,125,-9,10],[125,152,-10,0],
  [73,77,8,16],[88,97,20,28],[47,51,-25,-12],[142,147,-19,-11]];
function jungleAt(lon,lat){ let v=0; for(const b of JUNGLES) v=Math.max(v, inBox(lon,lat,b,2)); return v; }
// Klima an einer Stelle: Wüste, Dschungel, Kälte (Sibirien, Kanada, Hochgebirge), sonst mild
function climateAt(x,z){
  const lon=toLon(x), lat=toLat(z), ds=desertAt(lon,lat), jg=jungleAt(lon,lat)*(1-ds);
  const cold=Math.max(coldAt(lat), lon>50&&lat>48?clamp((lat-48)/6,0,1):0, lon<-52&&lat>50?clamp((lat-50)/6,0,1):0, clamp((mountainAt(lon,lat)-2.6)/1.4,0,1));
  return {ds, jg, cold, lat, lon};
}

/* ============================================================
   WELT
   ============================================================ */
let H_SEED = 1;
function rawH(x,z){
  const lon=toLon(x), lat=toLat(z);
  const m = landAt(lon,lat);
  let h = WATER_Y + (m-.5)*3.2;
  if(m>.5){
    const land = clamp((m-.5)*4,0,1);
    h += land*(fbm(x*.05+50, z*.05+50, H_SEED)*1.8 + (fbm(x*.15,z*.15,H_SEED+7)-.5)*.6);
    // sanfte Hügellandschaft im Flachland
    const hl = fbm(x*.011+9, z*.011+9, H_SEED+31); h += land*hl*hl*2.4;
    // Gebirge: Grate, Gipfel und Täler (geriffeltes Rauschen) statt runder Buckel
    const mt = mountainAt(lon,lat);
    if(mt>0){ const rg = ridged(x*.085, z*.085, H_SEED+21), rg2 = ridged(x*.21+3, z*.21+3, H_SEED+41);
      const m2 = Math.min(mt, 1.2) + Math.max(0, mt-1.2)*.55, mm = clamp(mt*1.5,0,1);
      h += land*(m2*.9 + mm*Math.pow(rg,1.5)*m2*8.5 + mm*rg2*m2*1.1); }
    const ds = desertAt(lon,lat);
    if(ds>0) h += ds*land*Math.sin(x*.9+Math.sin(z*.35)*2)*.12;   // Dünen
  }
  for(const b of G.bases){ const d=Math.hypot(x-b.x,z-b.z);
    if(d<7) h = lerp(h, b.h, clamp((7-d)/2,0,1));                            // Stadtplatz immer Land
    else if(d<18 && h>WATER_Y+.1) h = lerp(h, b.h, clamp((18-d)/7,0,1)*.85); // vorhandenes Land großzügig einebnen
  }
  const e = Math.min(x+G.NX/2, G.NX/2-x, z+G.NZ/2, G.NZ/2-z);
  if(e<3) h = Math.min(h, WATER_Y-1);
  return h;
}
function tileH(t,x,z){
  const gx=clamp((x-t.x0)/HSF,0,TN-.0001), gz=clamp((z-t.z0)/HSF,0,TN-.0001), ix=gx|0, iz=gz|0, fx=gx-ix, fz=gz-iz, n=TN+1, a=t.h;
  const k=iz*n+ix;
  return lerp(lerp(a[k],a[k+1],fx), lerp(a[k+n],a[k+n+1],fx), fz);
}
function getH(x,z){
  if(G.tiles){ const ti=Math.floor((x+G.NX/2)/TILE), tj=Math.floor((z+G.NZ/2)/TILE);
    if(ti>=0&&tj>=0&&ti<G.tnx&&tj<G.tnz){ const t=G.tiles[tj*G.tnx+ti]; if(t) return tileH(t,x,z); } }
  return coarseH(x,z);
}
function coarseH(x,z){
  const s=G.hs, gx=(x+G.NX/2)/s, gz=(z+G.NZ/2)/s, n=G.hnx;
  const ix=clamp(Math.floor(gx),0,G.hnx-2), iz=clamp(Math.floor(gz),0,G.hnz-2);
  const fx=clamp(gx-ix,0,1), fz=clamp(gz-iz,0,1), a=G.hm;
  const h00=a[iz*n+ix], h10=a[iz*n+ix+1], h01=a[(iz+1)*n+ix], h11=a[(iz+1)*n+ix+1];
  return lerp(lerp(h00,h10,fx), lerp(h01,h11,fx), fz);
}
const WATER_Y = -.55;
/* ---------- Welt in Kacheln: feine Höhen (alle 2 Einheiten) entstehen erst, wenn sie gebraucht werden ---------- */
const TILE = 64, HSF = 2, TN = TILE/HSF;
function ensureTile(ti,tj){
  if(ti<0||tj<0||ti>=G.tnx||tj>=G.tnz) return null;
  const id=tj*G.tnx+ti; let t=G.tiles[id]; if(t) return t;
  const n=TN+1, A=n+2, x0=ti*TILE-G.NX/2, z0=tj*TILE-G.NZ/2;
  const ha=new Float32Array(A*A);
  for(let j=0;j<A;j++) for(let i=0;i<A;i++) ha[j*A+i]=rawH(x0+(i-1)*HSF, z0+(j-1)*HSF);
  const h=new Float32Array(n*n);
  for(let j=0;j<n;j++) for(let i=0;i<n;i++) h[j*n+i]=ha[(j+1)*A+i+1];
  t={ti,tj,id,x0,z0,h,ha,mesh:null};
  G.tiles[id]=t; G.tileCount=(G.tileCount||0)+1;
  // Raster für Wegfindung (Wasser, Rand, steile Hänge)
  const NX=G.NX, NZ=G.NZ, gi0=ti*TILE, gj0=tj*TILE;
  for(let cj=0;cj<TILE;cj++) for(let ci=0;ci<TILE;ci++){
    const gi=gi0+ci, gj=gj0+cj, x=x0+ci+.5, z=z0+cj+.5, hh=tileH(t,x,z);
    const edge = gi<2||gj<2||gi>NX-3||gj>NZ-3;
    const steep = Math.abs(tileH(t,x+.5,z)-tileH(t,x-.5,z))+Math.abs(tileH(t,x,z+.5)-tileH(t,x,z-.5)) > 2.2;
    if(hh<WATER_Y+.15 || edge || steep) G.grid[gj*NX+gi]=1;
  }
  return t;
}
function ensureArea(x0,z0,x1,z1){
  const a=Math.floor((Math.min(x0,x1)+G.NX/2)/TILE), b=Math.floor((Math.max(x0,x1)+G.NX/2)/TILE);
  const c=Math.floor((Math.min(z0,z1)+G.NZ/2)/TILE), d=Math.floor((Math.max(z0,z1)+G.NZ/2)/TILE);
  for(let j=c;j<=d;j++) for(let i=a;i<=b;i++) ensureTile(i,j);
}

function genChunk(ci,cj){
  const NX=G.NX, NZ=G.NZ, CH=G.CH;
  if(ci<0||cj<0||ci*CH>=NX||cj*CH>=NZ) return;
  const key=ci+','+cj; if(G.chunks.has(key)) return; G.chunks.add(key);
  const R = rng((G.seed ^ (ci*73856093) ^ (cj*19349663))>>>0);
  const x0=ci*CH-NX/2, z0=cj*CH-NZ/2;
  // schnell prüfen, ob überhaupt Land im Chunk ist
  let land=0; for(let k=0;k<9;k++){ if(rawLand(x0+((k%3)+.5)*CH/3, z0+(((k/3)|0)+.5)*CH/3)>.55) land++; }
  if(!land) return;
  const saveR=G.rand; G.rand=R;
  const tries = Math.round(CH*CH/13);
  for(let i=0;i<tries;i++){
    const x=x0+R()*CH, z=z0+R()*CH;
    if(rawLand(x,z)<.7) continue;
    const bd = G.bases.reduce((m,b)=>Math.min(m,Math.hypot(b.x-x,b.z-z)),1e9); if(bd<12) continue;
    const lon=toLon(x), lat=toLat(z), ds=desertAt(lon,lat), cold=coldAt(lat), mt=mountainAt(lon,lat);
    const forest = fbm(x*.03,z*.03,H_SEED+40);
    const r = R();
    if(ds>.5){ if(r<.02) placeCluster('tree',x,z,3,1.5); else if(r<.05) placeCluster('stone',x,z,2,1); }
    else if(bd>24 && forest>.6 && cold<.85 && r<.2 && getH(x,z)<WATER_Y+11) placeCluster('tree',x,z,G.gfx===0?3+(R()*4|0):5+(R()*6|0),(3+R()*3)*2.1);
    else if(bd>18 && r<.008 && cold<.85 && getH(x,z)<WATER_Y+11) placeCluster('tree',x,z,1,3);
    else if(r<.05) placeCluster('bush',x,z,3,1.6);
    else if(r<.075 && mt>.4) placeCluster('stone',x,z,3,1.5);
    else if(r<.085) placeCluster('gold',x,z,2,1.2);
    else if(r<.13 && cold<.9) spawnDeer(x,z);
  }
  addDecorChunk(x0,z0,CH,R);
  const dl=G.depo && G.depo[key]; if(dl){ for(const d of dl) placeCluster(d.type, d.x, d.z, d.type==='oil'?1:3, 1.6); delete G.depo[key]; }
  G.rand=saveR;
  if(G.farView){ for(const r of G.res) if(r.mesh && !r.mesh.inst && r.mesh.visible) r.mesh.visible=false; }
}
function updateChunks(){
  if(!G.chunks || G.farView) return;
  const CH=G.CH, ci=Math.floor((G.camS.x+G.NX/2)/CH), cj=Math.floor((G.camS.z+G.NZ/2)/CH);
  // so weit füllen, wie man sehen kann – nächste Stücke zuerst, eins pro Aufruf (kein Ruckeln)
  const fx=(G.camS.x+G.NX/2)/CH, fz=(G.camS.z+G.NZ/2)/CH, rad=Math.min(5, Math.ceil(G.scene.fog.far*.9/CH));
  let best=null, bd=1e9;
  for(let dj=-rad;dj<=rad;dj++) for(let di=-rad;di<=rad;di++){ const i=ci+di, j=cj+dj, key=i+','+j; if(G.chunks.has(key)) continue;
    const d=Math.hypot(i+.5-fx, j+.5-fz); if(d<=rad+.5 && d<bd){ bd=d; best=[i,j]; } }
  if(best){ genChunk(best[0],best[1]); G.chunkT=.03; }
}
function rawLand(x,z){ const m=landAt(toLon(x),toLat(z)); return m; }
function genWorld(){
  const NX=G.NX, NZ=G.NZ, R=G.rand; H_SEED=(G.seed%997)+1;
  // Startorte der Zivilisationen (echte Orte, bei Platzmangel etwas verschoben)
  G.bases = [];
  const nP = G.players.length;
  const minD = Math.max(40, Math.round(NX/360*(nP<=2 ? 12 : nP<=4 ? 9 : nP<=8 ? 7 : 5)));
  const landFrac=(x,z,r)=>{ let n=0; for(let i=0;i<24;i++){ const a=i/24*6.283, rr=r*(i%2?1:.55); if(rawLand(x+Math.cos(a)*rr, z+Math.sin(a)*rr)>.55) n++; } return n/24; };
  G.players.forEach(p=>{
    const ll = CIV_POS[p.civ[0]] || [0,30];
    let bx=fromLon(ll[0]), bz=fromLat(ll[1]), found=false;
    for(let r=0;r<Math.max(60,minD*2.5) && !found;r+=2){
      for(let k=0;k<Math.max(1,r*3);k++){
        const a=k/Math.max(1,r*3)*Math.PI*2, x=bx+Math.cos(a)*r, z=bz+Math.sin(a)*r;
        if(rawLand(x,z)<(r<6?.5:.7)) continue;
        if(landFrac(x,z,13) < (r<28?.78:r<45?.6:.4)) continue;
        if(Math.abs(x)>NX/2-10||Math.abs(z)>NZ/2-10) continue;
        if(G.bases.some(b=>Math.hypot(b.x-x,b.z-z)<minD)) continue;
        bx=x; bz=z; found=true; break;
      }
    }
    G.bases.push({x:Math.round(bx), z:Math.round(bz), h:0});
  });
  const saveB = G.bases; G.bases = [];
  saveB.forEach(b=>{ b.h = Math.max(WATER_Y+.7, rawH(b.x,b.z)); });
  G.bases = saveB;
  // Höhenkarte
  G.hs = G.HS; G.hnx = NX/G.hs+1; G.hnz = NZ/G.hs+1;
  G.hm = new Float32Array(G.hnx*G.hnz);
  for(let j=0;j<G.hnz;j++) for(let i=0;i<G.hnx;i++) G.hm[j*G.hnx+i] = rawH(i*G.hs-NX/2, j*G.hs-NZ/2);
  // Raster für Wegfindung: wird kachelweise gefüllt, sobald eine Gegend gebraucht wird
  G.grid = new Uint8Array(NX*NZ); G.road = new Uint8Array(NX*NZ);
  initRegions();
  G.tnx = NX/TILE; G.tnz = NZ/TILE; G.tiles = new Array(G.tnx*G.tnz); G.tileCount=0; G.tileMeshes=[];
  const PW=320; G.pfW=PW; G.pfG = new Float32Array(PW*PW); G.pfF = new Int32Array(PW*PW); G.pfS = new Uint32Array(PW*PW); G.pfC = new Uint32Array(PW*PW); G.pfStamp = 0;
  G.bases.forEach(b=>ensureArea(b.x-90,b.z-90,b.x+90,b.z+90));
  buildTerrain();
  buildWater();
  // Spieler: Stadtzentrum, Arbeiter, faire Startressourcen
  G.players.forEach((p,i)=>{
    const b = G.bases[i];
    p.tc = addBuilding('tc', i, b.x, b.z, true);
    for(let k=0;k<4;k++){ const a=k/4*Math.PI*2+.4; G.nextSex=k%2?'f':'m'; spawnWorker(i, b.x+Math.cos(a)*4.2, b.z+Math.sin(a)*4.2).home=p.tc; }
    const ang = R()*Math.PI*2;
    placeCluster('bush', b.x+Math.cos(ang)*8, b.z+Math.sin(ang)*8, 6, 2.6, 6.5);
    placeCluster('stone', b.x+Math.cos(ang+2)*10, b.z+Math.sin(ang+2)*10, 3, 1.6, 6.5);
    placeCluster('gold', b.x+Math.cos(ang+3.3)*11, b.z+Math.sin(ang+3.3)*11, 3, 1.6, 6.5);
    placeCluster('tree', b.x+Math.cos(ang+4.6)*17, b.z+Math.sin(ang+4.6)*17, 22, 9, 8.5);
    for(let k=0;k<4;k++) spawnDeer(b.x+Math.cos(ang+1)*15+R()*4, b.z+Math.sin(ang+1)*15+R()*4);
  });
  // Natur entsteht in Chunks (Stücken): zuerst rund um alle Städte, der Rest beim Hinschauen
  G.chunks = new Set(); G.CH = TILE;
  // Rohstoffe an echten Orten (werden gesetzt, sobald die Gegend entsteht)
  G.depo = {};
  for(const d of DEPOSITS){
    const n = Math.max(1, Math.round(d[5]*Math.sqrt(NX/320)));
    for(let k=0;k<n;k++) for(let t=0;t<25;t++){
      const lon=d[1]+R()*(d[2]-d[1]), lat=d[3]+R()*(d[4]-d[3]), x=fromLon(lon), z=fromLat(lat);
      if(rawLand(x,z)<.7) continue;
      const key=Math.floor((x+NX/2)/TILE)+','+Math.floor((z+NZ/2)/TILE); (G.depo[key]||(G.depo[key]=[])).push({type:d[0],x,z}); break;
    }
  }
  G.bases.forEach(b=>{ const ci=Math.floor((b.x+NX/2)/G.CH), cj=Math.floor((b.z+NZ/2)/G.CH); for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++) genChunk(ci+di,cj+dj); });
  buildMinimapBase();
}

/* ---------- Gelände ---------- */
/* ---------- Boden-Texturen (nahtlos, selbst erzeugt; können durch Bilder ersetzt werden) ---------- */
function tileNoise(size, cells, seed){
  const out=new Float32Array(size*size), P=cells;
  const hv=(i,j)=>hash2(((i%P)+P)%P, ((j%P)+P)%P, seed);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const fx=x/size*P, fy=y/size*P, i=Math.floor(fx), j=Math.floor(fy), u=fx-i, v=fy-j;
    const su=u*u*(3-2*u), sv=v*v*(3-2*v);
    out[y*size+x]=lerp(lerp(hv(i,j),hv(i+1,j),su),lerp(hv(i,j+1),hv(i+1,j+1),su),sv);
  }
  return out;
}
function fbmTile(size, seed){ const a=tileNoise(size,4,seed), b=tileNoise(size,8,seed+1), c=tileNoise(size,16,seed+2), d=tileNoise(size,32,seed+3), o=new Float32Array(size*size);
  for(let i=0;i<o.length;i++) o[i]=a[i]*.45+b[i]*.28+c[i]*.17+d[i]*.1; return o; }
function makeGroundTex(kind){
  const S=256, cv=document.createElement('canvas'); cv.width=cv.height=S; const x=cv.getContext('2d'), img=x.createImageData(S,S);
  const n=fbmTile(S, {grass:11,dirt:23,sand:37,rock:51,snow:67}[kind]);
  const pal={grass:[[70,120,40],[112,160,62]], dirt:[[104,78,50],[150,118,80]], sand:[[205,166,104],[236,206,146]], rock:[[96,94,90],[150,148,140]], snow:[[214,224,236],[250,252,255]]}[kind];
  for(let i=0;i<S*S;i++){ const t=n[i], o=i*4, xx=i%S, yy=(i/S)|0;
    let v=t;
    if(kind==='sand') v = t*.6 + .4*(.5+.5*Math.sin((xx+Math.sin(yy/S*Math.PI*4)*10)/S*Math.PI*2*10));
    if(kind==='rock') v = Math.abs(t-.5)<.03 ? .05 : t;
    img.data[o]=lerp(pal[0][0],pal[1][0],v); img.data[o+1]=lerp(pal[0][1],pal[1][1],v); img.data[o+2]=lerp(pal[0][2],pal[1][2],v); img.data[o+3]=255; }
  x.putImageData(img,0,0);
  const rnd=rng(kind.length*977);
  if(kind==='grass'){ for(let i=0;i<2600;i++){ const px=rnd()*S, py=rnd()*S, l=3+rnd()*5, a=-Math.PI/2+(rnd()-.5)*.9; const g=110+rnd()*80|0;
      x.strokeStyle=`rgba(${g*.45|0},${g},${g*.35|0},.55)`; x.lineWidth=1; x.beginPath(); x.moveTo(px,py); x.lineTo(px+Math.cos(a)*l,py+Math.sin(a)*l); x.stroke(); } }
  if(kind==='dirt'||kind==='sand'){ for(let i=0;i<(kind==='dirt'?260:90);i++){ const px=rnd()*S, py=rnd()*S, r=.8+rnd()*2.2, g=kind==='dirt'?(120+rnd()*70|0):(190+rnd()*50|0);
      x.fillStyle=`rgba(${g},${g*.88|0},${g*.72|0},.85)`; x.beginPath(); x.arc(px,py,r,0,7); x.fill(); } }
  if(kind==='rock'){ for(let i=0;i<70;i++){ const px=rnd()*S, py=rnd()*S; x.strokeStyle='rgba(40,40,40,.35)'; x.lineWidth=1; x.beginPath(); x.moveTo(px,py); for(let k=0;k<4;k++) x.lineTo(px+(rnd()-.5)*30,py+(rnd()-.5)*30); x.stroke(); }
      for(let i=0;i<90;i++){ x.fillStyle='rgba(80,110,50,.35)'; x.beginPath(); x.arc(rnd()*S,rnd()*S,1+rnd()*3,0,7); x.fill(); } }
  const t=new T.CanvasTexture(cv); t.wrapS=t.wrapT=T.RepeatWrapping; t.colorSpace=T.SRGBColorSpace; t.anisotropy=4; t.generateMipmaps=true; t.minFilter=T.LinearMipmapLinearFilter;
  return t;
}
function groundW(x,z,h,out,o){
  const lon=toLon(x), lat=toLat(z);
  let sand=0;
  const n1 = fbm(x*.07,z*.07,H_SEED+3);
  let dirt = clamp((n1-.62)*3,0,.6);
  const ds = desertAt(lon,lat); sand = Math.max(sand, ds);
  for(const b of G.bases){ const d=Math.hypot(x-b.x,z-b.z); if(d<9) dirt=Math.max(dirt, clamp((9-d)/5,0,1)*.85); }
  if(h<WATER_Y+.45) sand = Math.max(sand, clamp((WATER_Y+.45-h)/.4,0,1));
  const rock = clamp((h-(WATER_Y+3.6))/3,0,1)*.85;
  const cold = coldAt(lat);
  const sn = WATER_Y + 14 + (vnoise(x*.08,z*.08,5)-.5)*4;
  // Sibirien und Nordkanada: Schneedecke mit grünen Flecken
  const sib = lon>45&&lat>52 ? clamp((lat-52)/5,0,1) : lon<-55&&lat>54 ? clamp((lat-54)/5,0,1) : 0;
  const snow = Math.max(clamp((h-sn)/1.2,0,1), cold>.55 ? clamp((cold-.55)*2.5,0,1) : 0, sib*clamp(.55+(vnoise(x*.05,z*.05,17)-.5)*1.6,0,1));
  let rest = 1;
  const ws = snow*rest; rest -= ws;
  const wr = rock*rest; rest -= wr;
  const wsa = sand*rest; rest -= wsa;
  const wd = dirt*rest; rest -= wd;
  out.wA[o*4]=rest; out.wA[o*4+1]=wd; out.wA[o*4+2]=wsa; out.wA[o*4+3]=wr; out.wB[o]=ws;
  const v = .9+hash2(x,z,9)*.2, tn = cold*.25;
  out.tint[o*3]=v*(1-tn*.4); out.tint[o*3+1]=v; out.tint[o*3+2]=v*(1+tn*.3);
}
const TERRAIN_T = {value:0};
function terrainMat(coarse){
  const tex = G.groundTex;
  const mt = new T.MeshLambertMaterial({vertexColors:true});
  const tk2 = (coarse ? 'terrainC' : 'terrainF') + G.gfx; mt.customProgramCacheKey = () => tk2;
  mt.onBeforeCompile = sh => {
    for(const k in tex) sh.uniforms['t_'+k] = {value:tex[k]};
    sh.uniforms.uTime = TERRAIN_T;
    if(coarse){ sh.uniforms.tCov={value:G.covTex}; sh.uniforms.uCov={value:new T.Vector4(G.tnx,G.tnz,G.NX,G.NZ)}; }
    sh.vertexShader = 'attribute vec4 aW;\nattribute float aS;\nvarying vec4 vW;\nvarying float vS;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vW=aW; vS=aS; vWP=position; vWN=normalize(objectNormal);');
    sh.fragmentShader = 'uniform sampler2D t_grass,t_dirt,t_sand,t_rock,t_snow;\nuniform float uTime;\n'+(coarse?'uniform sampler2D tCov;\nuniform vec4 uCov;\n':'')+'varying vec4 vW;\nvarying float vS;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.fragmentShader
      .replace('void main() {', 'void main() {\n'+(coarse?` vec2 tcv = floor((vWP.xz + uCov.zw*.5)/${TILE}.0);
 if(texture2D(tCov, (tcv+.5)/uCov.xy).r > .5) discard;
`:''))
      .replace('#include <map_fragment>', `
        vec2 uv1 = vWP.xz*.28, uv2 = vWP.xz*.061 + vec2(.37,.11);
        ${G.gfx===0 ? `vec3 cg = texture2D(t_grass,uv1).rgb, cd = texture2D(t_dirt,uv1).rgb, cs = texture2D(t_sand,uv1*.7).rgb, cr = texture2D(t_rock,uv1*.8).rgb;` : `
        vec3 cg = mix(texture2D(t_grass,uv1).rgb, texture2D(t_grass,uv2).rgb, .45);
        vec3 cd = mix(texture2D(t_dirt,uv1).rgb, texture2D(t_dirt,uv2).rgb, .4);
        vec3 cs = mix(texture2D(t_sand,uv1*.7).rgb, texture2D(t_sand,uv2).rgb, .4);
        vec3 cr = mix(texture2D(t_rock,uv1*.8).rgb, texture2D(t_rock,uv2).rgb, .4);`}
        vec3 cn = texture2D(t_snow,uv1*.6).rgb;
        vec3 ground = cg*vW.x + cd*vW.y + cs*vW.z + cr*vW.w + cn*vS;
        // steile Hänge: Fels, Schnee rutscht ab
        float steep = 1.0 - smoothstep(.62, .86, normalize(vWN).y);
        ground = mix(ground, cr*vec3(.92,.9,.88), steep*.92);
        // nasser Sand und Brandung an der Küste (scheint durch das Wasser)
        float wl = vWP.y - (${WATER_Y.toFixed(2)});
        ground *= mix(1.0, .72, (1.0-smoothstep(.02, .35, wl)) * step(-1.2, wl));
        float nz = texture2D(t_grass, vWP.xz*.05 + uTime*.01).g;
        float band = smoothstep(-.22, -.04, wl) * (1.0-smoothstep(-.01, .06, wl));
        float wave = .5 + .5*sin(wl*26.0 - uTime*2.2 + nz*9.0);
        ground = mix(ground, vec3(1.0,1.04,1.06), band * smoothstep(.6, .95, wave) * .7);
        ground = mix(ground, ground*vec3(.55,.75,.85), 1.0-smoothstep(-1.4, -.05, wl));
        diffuseColor.rgb *= ground;`);
  };
  return mt;
}
function buildTerrain(){
  const NX=G.NX, NZ=G.NZ;
  G.groundTex = { grass:makeGroundTex('grass'), dirt:makeGroundTex('dirt'), sand:makeGroundTex('sand'), rock:makeGroundTex('rock'), snow:makeGroundTex('snow') };
  // Abdeckung: welche Kacheln schon fein gezeichnet werden
  G.covData = new Uint8Array(G.tnx*G.tnz);
  G.covTex = new T.DataTexture(G.covData, G.tnx, G.tnz, T.RedFormat, T.UnsignedByteType);
  G.covTex.magFilter = G.covTex.minFilter = T.NearestFilter; G.covTex.needsUpdate = true;
  // grobe Welt in Blöcken (nur sichtbare Blöcke werden gezeichnet)
  const cmat = terrainMat(true), B = 48; G.coarse = [];
  const W = G.hnx, Hh = G.hnz, NA = new Float32Array(W*Hh*3);
  for(let j=0;j<Hh;j++) for(let i=0;i<W;i++){ const hl=G.hm[j*W+Math.max(0,i-1)], hr=G.hm[j*W+Math.min(W-1,i+1)], hd=G.hm[Math.max(0,j-1)*W+i], hu=G.hm[Math.min(Hh-1,j+1)*W+i];
    let nx=hl-hr, ny=2*G.hs, nz=hd-hu; const L=Math.hypot(nx,ny,nz); const k=(j*W+i)*3; NA[k]=nx/L; NA[k+1]=ny/L; NA[k+2]=nz/L; }
  for(let bj=0;bj<Hh-1;bj+=B) for(let bi=0;bi<W-1;bi+=B){
    const i1=Math.min(W-1,bi+B), j1=Math.min(Hh-1,bj+B), w=i1-bi+1, hgt=j1-bj+1, n=w*hgt;
    const P=new Float32Array(n*3), N=new Float32Array(n*3), A={wA:new Float32Array(n*4), wB:new Float32Array(n), tint:new Float32Array(n*3)}, I=[];
    for(let j=0;j<hgt;j++) for(let i=0;i<w;i++){ const gi=bi+i, gj=bj+j, k=j*w+i, x=gi*G.hs-NX/2, z=gj*G.hs-NZ/2, h=G.hm[gj*W+gi];
      P[k*3]=x; P[k*3+1]=h; P[k*3+2]=z; const s=(gj*W+gi)*3; N[k*3]=NA[s]; N[k*3+1]=NA[s+1]; N[k*3+2]=NA[s+2]; groundW(x,z,h,A,k); }
    for(let j=0;j<hgt-1;j++) for(let i=0;i<w-1;i++){ const a=j*w+i, b=a+1, c=a+w, d=c+1; I.push(a,c,b, b,c,d); }
    const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.BufferAttribute(P,3)); geo.setAttribute('normal',new T.BufferAttribute(N,3));
    geo.setAttribute('aW',new T.BufferAttribute(A.wA,4)); geo.setAttribute('aS',new T.BufferAttribute(A.wB,1)); geo.setAttribute('color',new T.BufferAttribute(A.tint,3));
    geo.setIndex(I); geo.computeBoundingSphere();
    const m=new T.Mesh(geo,cmat); m.receiveShadow=true; G.scene.add(m);
    G.coarse.push({m, cx:(bi+w/2)*G.hs-NX/2, cz:(bj+hgt/2)*G.hs-NZ/2, r:Math.hypot(w,hgt)*G.hs*.5});
  }
  G.terrain = G.coarse[0].m;
  G.tileMat = terrainMat(false);
  const skirt = new T.Mesh(new T.PlaneGeometry(NX*6,NZ*6), new T.MeshLambertMaterial({color:0x0e3558}));
  skirt.rotation.x = -Math.PI/2; skirt.position.y = WATER_Y-2.5; G.scene.add(skirt);
}
// feine Kachel als Mesh (mit Schürze nach unten, damit an den Rändern keine Ritzen entstehen)
function tileMesh(t){
  const n=TN+1, A=n+2, cnt=n*n+4*n;
  const P=new Float32Array(cnt*3), N=new Float32Array(cnt*3), O={wA:new Float32Array(cnt*4), wB:new Float32Array(cnt), tint:new Float32Array(cnt*3)};
  for(let j=0;j<n;j++) for(let i=0;i<n;i++){
    const k=j*n+i, x=t.x0+i*HSF, z=t.z0+j*HSF, h=t.h[k];
    P[k*3]=x; P[k*3+1]=h; P[k*3+2]=z;
    const hl=t.ha[(j+1)*A+i], hr=t.ha[(j+1)*A+i+2], hd=t.ha[j*A+i+1], hu=t.ha[(j+2)*A+i+1];
    let nx=hl-hr, ny=2*HSF, nz=hd-hu; const L=Math.hypot(nx,ny,nz); N[k*3]=nx/L; N[k*3+1]=ny/L; N[k*3+2]=nz/L;
    groundW(x,z,h,O,k);
  }
  const edges=[[],[],[],[]]; for(let i=0;i<n;i++){ edges[0].push(i); edges[1].push((n-1)*n+i); edges[2].push(i*n); edges[3].push(i*n+n-1); }
  let v=n*n; const idx=[];
  for(let j=0;j<n-1;j++) for(let i=0;i<n-1;i++){ const a=j*n+i, b=a+1, c=a+n, d=c+1; idx.push(a,c,b, b,c,d); }
  edges.forEach((E,ei)=>{
    const s0=v;
    for(const k of E){ P[v*3]=P[k*3]; P[v*3+1]=P[k*3+1]-3; P[v*3+2]=P[k*3+2]; for(let q=0;q<3;q++){ N[v*3+q]=N[k*3+q]; O.tint[v*3+q]=O.tint[k*3+q]; } for(let q=0;q<4;q++) O.wA[v*4+q]=O.wA[k*4+q]; O.wB[v]=O.wB[k]; v++; }
    for(let q=0;q<n-1;q++){ const a=E[q], b=E[q+1], c=s0+q, d=s0+q+1; idx.push(a,b,c, b,d,c, a,c,b, b,c,d); }
  });
  const geo=new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(P,3)); geo.setAttribute('normal', new T.BufferAttribute(N,3));
  geo.setAttribute('aW', new T.BufferAttribute(O.wA,4)); geo.setAttribute('aS', new T.BufferAttribute(O.wB,1)); geo.setAttribute('color', new T.BufferAttribute(O.tint,3));
  geo.setIndex(idx); geo.computeBoundingSphere();
  const m=new T.Mesh(geo, G.tileMat); m.receiveShadow=true;
  return m;
}
function showTile(t){
  if(t.mesh) return; t.mesh=tileMesh(t); G.scene.add(t.mesh); G.tileMeshes.push(t);
  G.covData[t.id]=255; G.covTex.needsUpdate=true;
}
function hideTile(t){
  if(!t.mesh) return; G.scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh=null;
  G.covData[t.id]=0; G.covTex.needsUpdate=true;
}
// Alles, was ganz im Nebel liegt, wird nicht gezeichnet (spart viel Leistung, sieht gleich aus)
function cullFar(){
  const s=G.camS, R=G.scene.fog.far+8, R2=R*R, cx=s.x, cz=s.z;
  const vis=(x,z,r)=>{ const dx=x-cx, dz=z-cz, rr=R+(r||0); return dx*dx+dz*dz < rr*rr; };
  batchesUpdate();
  if(G.coarse) for(const c of G.coarse) c.m.visible = vis(c.cx,c.cz,c.r);
  for(const t of G.tileMeshes) if(t.mesh){ const v=vis(t.x0+TILE/2, t.z0+TILE/2, TILE*.75); if(t.mesh.visible!==v){ t.mesh.visible=v; G.covData[t.id]=v?255:0; G.covTex.needsUpdate=true; } }
  const R7=R*.7; for(const r of G.res) if(r.alive && r.mesh && !r.mesh.inst){ const dx=r.x-cx, dz=r.z-cz; r.mesh.visible = !G.farView && dx*dx+dz*dz < R7*R7; }
  for(const d of G.deer) if(d.alive && d.mesh) d.mesh.visible = vis(d.x,d.z,2);
  for(const u of G.units) u.mesh.visible = !G.farView && vis(u.x,u.z,2);
  for(const b of G.builds) b.mesh.visible = vis(b.x,b.z,b.size+4);
}
function updateTiles(force){
  const s=G.camS, R=clamp(s.dist*2.4+70, 110, 300)*(G.gfx===0?.7:1);
  const ci=(s.x+G.NX/2)/TILE, cj=(s.z+G.NZ/2)/TILE, r=Math.ceil(R/TILE);
  const want=[];
  for(let dj=-r;dj<=r;dj++) for(let di=-r;di<=r;di++){
    const i=Math.floor(ci)+di, j=Math.floor(cj)+dj; if(i<0||j<0||i>=G.tnx||j>=G.tnz) continue;
    const d=Math.hypot(i+.5-ci, j+.5-cj)*TILE; if(d>R+TILE*.7) continue;
    const t=G.tiles[j*G.tnx+i]; if(t && t.mesh) continue;
    want.push([d,i,j]);
  }
  want.sort((a,b)=>a[0]-b[0]);
  const budget = force ? 1e9 : 3, t0=performance.now();
  for(let k=0;k<want.length && k<budget;k++){ const t=ensureTile(want[k][1],want[k][2]); if(t) showTile(t); if(!force && performance.now()-t0>5) break; }
  // weit entfernte Kacheln wieder freigeben (die Höhen bleiben gespeichert)
  if(G.tileMeshes.length>260){
    G.tileMeshes.sort((a,b)=>Math.hypot(b.ti+.5-ci,b.tj+.5-cj)-Math.hypot(a.ti+.5-ci,a.tj+.5-cj));
    while(G.tileMeshes.length>200){ const t=G.tileMeshes.shift(); if(Math.hypot(t.ti+.5-ci,t.tj+.5-cj)*TILE < R+TILE){ G.tileMeshes.push(t); break; } hideTile(t); }
  }
}
function waterNormalTex(){
  const S=256, h=fbmTile(S, 313), h2=tileNoise(S,24,517), cv=document.createElement('canvas'); cv.width=cv.height=S;
  const x=cv.getContext('2d'), img=x.createImageData(S,S);
  const H=(i,j)=>{ i=(i+S)%S; j=(j+S)%S; return h[j*S+i]*1.0 + h2[j*S+i]*.35; };
  for(let j=0;j<S;j++) for(let i=0;i<S;i++){ const dx=(H(i+1,j)-H(i-1,j))*6, dz=(H(i,j+1)-H(i,j-1))*6, L=Math.hypot(dx,1,dz), o=(j*S+i)*4;
    img.data[o]=(-dx/L*.5+.5)*255; img.data[o+1]=(-dz/L*.5+.5)*255; img.data[o+2]=(1/L*.5+.5)*255; img.data[o+3]=255; }
  x.putImageData(img,0,0);
  const t=new T.CanvasTexture(cv); t.wrapS=t.wrapT=T.RepeatWrapping; t.colorSpace=T.NoColorSpace; t.anisotropy=4;
  return t;
}
function waterDepthTex(){
  const W=G.hnx, H=G.hnz, d=new Uint8Array(W*H*4);
  for(let i=0;i<W*H;i++){ const dep=clamp((WATER_Y-G.hm[i])/6,0,1); d[i*4]=dep*255; d[i*4+3]=255; }
  const t=new T.DataTexture(d, W, H, T.RGBAFormat, T.UnsignedByteType);
  t.magFilter=t.minFilter=T.LinearFilter; t.needsUpdate=true; return t;
}
function buildWater(){
  const NX=G.NX, NZ=G.NZ;
  const geo = new T.PlaneGeometry(NX*1.4, NZ*1.6, 96, 48);
  geo.rotateX(-Math.PI/2);
  const U = T.UniformsUtils.merge([T.UniformsLib.fog, {
    uTime:{value:0}, tN:{value:null}, tD:{value:null}, uWorld:{value:new T.Vector2(NX,NZ)},
    uSun:{value:new T.Vector3(30,55,18).normalize()},
    cShallow:{value:new T.Color(0x35c6c0)}, cDeep:{value:new T.Color(0x0b3f74)}, cSkyH:{value:new T.Color(0xcfeaff)}, cSkyZ:{value:new T.Color(0x5aa6e6)}, cSun:{value:new T.Color(0xfff1d6)} }]);
  U.tN.value = waterNormalTex(); U.tD.value = waterDepthTex();
  const mt = new T.ShaderMaterial({ uniforms:U, transparent:true, fog:true, depthWrite:false, defines: G.gfx===0 ? {LOWQ:1} : {},
    vertexShader:`
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      uniform float uTime; uniform sampler2D tN, tD; uniform vec2 uWorld; uniform vec3 uSun;
      uniform vec3 cShallow, cDeep, cSkyH, cSkyZ, cSun;
      varying vec3 vW;
      #include <fog_pars_fragment>
      vec3 nmap(vec2 uv){ return texture2D(tN, uv).xyz*2.0-1.0; }
      void main(){
        vec2 p = vW.xz;
        float depth = texture2D(tD, (p + uWorld*.5)/uWorld).r * 6.0;
        // Wellen: zwei Normalen-Ebenen, die gegeneinander ziehen, dazu große Dünung
        vec3 n1 = nmap(p*.045 + vec2(uTime*.045, uTime*.028));
        #ifdef LOWQ
        vec3 n2 = vec3(0.0), n3 = vec3(0.0);
        #else
        vec3 n2 = nmap(p*.11 + vec2(-uTime*.06, uTime*.07));
        vec3 n3 = nmap(p*.012 + vec2(uTime*.012, -uTime*.016));
        #endif
        // laufende Wellenzüge (sichtbare Bewegung): drei Richtungen, Steigung als Normale
        vec2 d1=vec2(.83,.55), d2=vec2(-.42,.91), d3=vec2(.2,-.98);
        float k1=.55, k2=.9, k3=.33;
        vec2 sw = d1*cos(dot(p,d1)*k1 - uTime*1.6)*.32 + d2*cos(dot(p,d2)*k2 - uTime*2.1)*.2 + d3*cos(dot(p,d3)*k3 - uTime*1.2)*.26;
        float calm = .35 + .65*smoothstep(.1, 1.2, depth);   // am Ufer flacher
        vec3 N = normalize(vec3((n1.x+n2.x*.7+n3.x*1.2)*.55 + sw.x*calm, 1.0, (n1.y+n2.y*.7+n3.y*1.2)*.55 + sw.y*calm));
        vec3 V = normalize(cameraPosition - vW);
        float fres = .03 + .97*pow(1.0-max(dot(N,V),0.0), 5.0);
        vec3 Rf = reflect(-V, N);
        vec3 sky = mix(cSkyH, cSkyZ, clamp(Rf.y*1.6,0.0,1.0));
        float dk = smoothstep(.15, 1.35, depth);
        // Tropen (z. B. Malediven, Karibik): helles türkises Wasser, zum Rand der Tropen hin fließender Übergang
        float lat = 76.0 - (p.y + uWorld.y*.5)/uWorld.y*132.0;
        float trop = 1.0 - smoothstep(20.0, 30.0, abs(lat));
        vec3 shallowC = mix(cShallow, vec3(.42,.93,.9), trop);
        vec3 deepC = mix(cDeep, vec3(.05,.48,.72), trop*.85);
        dk = mix(dk, smoothstep(.4, 2.2, depth), trop);       // in den Tropen bleibt es länger hell
        vec3 body = mix(shallowC, deepC, dk);
        float sss = max(dot(N, uSun),0.0);
        vec3 col = body*(.55+.45*sss);
        col = mix(col, sky, clamp(fres*1.15,0.0,.85));
        float spec = pow(max(dot(Rf, uSun),0.0), 220.0)*3.0 + pow(max(dot(Rf, uSun),0.0), 28.0)*.18;
        col += cSun*spec;
        // Schaum auf flachem Wasser
        float fn = texture2D(tN, p*.07 + vec2(uTime*.02,0.0)).z;
        float foam = (1.0-smoothstep(.03, .3, depth)) * smoothstep(.62, .9, fn + .25*sin(uTime*1.5 + p.x*.3 + p.y*.2));
        // Brandung: Schaumstreifen laufen aufs Ufer zu und verlaufen
        float surf = sin(depth*16.0 + uTime*2.0 + fn*3.0);
        foam = max(foam, (1.0-smoothstep(.05, .7, depth)) * smoothstep(.75, .98, surf) * (.6+.4*fn));
        col = mix(col, vec3(1.0), foam*.4);
        // klares Wasser: am Rand sieht man den Boden, in den Tropen besonders weit hinaus
        float a = mix(mix(.4, .12, trop), .95, smoothstep(.0, mix(1.2, 3.0, trop), depth));
        a = max(a, fres*mix(.9, .6, trop));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  G.waterU = U.uTime;
  const w = new T.Mesh(geo, mt);
  w.position.y = WATER_Y; w.renderOrder = 2; G.scene.add(w); G.water = w;
}

/* ---------- Materialien & Modelle ---------- */
const MAT = {};
function mat(hex, extra){ const k=hex+(extra?JSON.stringify(extra):''); return MAT[k] || (MAT[k]=new T.MeshLambertMaterial(Object.assign({color:hex, flatShading:true}, extra||{}))); }
function mesh(geo, m, x,y,z){ const o=new T.Mesh(geo,m); o.position.set(x||0,y||0,z||0); o.castShadow=true; o.receiveShadow=true; return o; }
const GEO = {};
function geos(){
  if(GEO.ok) return; GEO.ok=1;
  GEO.trunk = new T.CylinderGeometry(.13,.2,1.2,6);
  GEO.cone = new T.ConeGeometry(.9,1.6,7);
  GEO.cone2 = new T.ConeGeometry(.68,1.3,7);
  GEO.ball = new T.IcosahedronGeometry(.85,0);
  GEO.bush = new T.IcosahedronGeometry(.62,0);
  GEO.berry = new T.SphereGeometry(.1,6,4);
  GEO.rock = new T.DodecahedronGeometry(.8,0);
  GEO.nug = new T.OctahedronGeometry(.16,0);
  GEO.box = new T.BoxGeometry(1,1,1);
  GEO.ring = new T.RingGeometry(.5,.56,32); GEO.ring.rotateX(-Math.PI/2);
  GEO.head = new T.IcosahedronGeometry(.19,1);
  GEO.limb = new T.CylinderGeometry(.065,.06,.42,5); GEO.limb.translate(0,-.21,0);
  GEO.body = new T.CylinderGeometry(.17,.23,.52,7);
  GEO.flame = new T.ConeGeometry(.22,.6,5);
}

function makeTree(R){
  geos();
  const g = new T.Group();
  const kind = R();
  g.add(mesh(GEO.trunk, mat(0x7a4d28), 0,.6,0));
  if(kind<.6){
    const c = [0x2f7a3a,0x3a8a3c,0x2a6b34][(R()*3)|0];
    g.add(mesh(GEO.cone, mat(c), 0,1.6,0));
    g.add(mesh(GEO.cone2, mat(c), 0,2.35,0));
  } else {
    const c = [0x5a9c3a,0x6aa842,0x4c8a30][(R()*3)|0];
    const b = mesh(GEO.ball, mat(c), 0,1.75,0); b.scale.set(1,1.1,1); g.add(b);
  }
  const s = .85+R()*.5; g.scale.set(s,s,s); g.rotation.y = R()*6.28;
  return g;
}
// Viele kleine Teile (Beeren, Goldnuggets) zu EINER Geometrie verschmelzen = 1 Zeichenaufruf statt 15
function mergeParts(parts){ const P=[], N=[];
  for(const [geo,m] of parts){ const g=geo.index?geo.toNonIndexed():geo.clone(); g.applyMatrix4(m); P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); g.dispose(); }
  const out=new T.BufferGeometry(); out.setAttribute('position',new T.Float32BufferAttribute(P,3)); out.setAttribute('normal',new T.Float32BufferAttribute(N,3)); out.computeBoundingSphere(); return out; }
const PART_CACHE={};
function partsVariant(key, n, make){ const a=PART_CACHE[key]||(PART_CACHE[key]=[]); if(a.length<n){ a.push(make(a.length)); } return a[(Math.random()*n)|0] || a[0]; }
function makeBush(R){
  const F=flora(), g=new T.Group();
  const m=new T.Mesh(F.geo.bush[(R()*2)|0], F.mat); m.castShadow=true; m.receiveShadow=true; m.customDepthMaterial=F.depth;
  const sc=.62+R()*.16; m.scale.set(sc,sc*(.9+R()*.2),sc); g.add(m);
  const bg = partsVariant('berries', 6, ()=>{ const parts=[]; for(let i=0;i<14;i++){ const a=Math.random()*6.28, y=(.45+Math.random()*.6)*.7, r=(.45+Math.random()*.3)*.7; parts.push([F.berryGeo, new T.Matrix4().makeTranslation(Math.cos(a)*r, y, Math.sin(a)*r)]); } return mergeParts(parts); });
  g.add(new T.Mesh(bg, F.berryMat));
  g.rotation.y = R()*6.28; return g;
}
function makeRock(R, kind){
  geos();
  const g = new T.Group();
  const gold = kind==='gold';
  if(kind==='stone' && MODELS.rock){
    const big = MODELS.mono && R()<.25;
    const m = modelMesh(big?'mono':'rock', big?1.1:1.5+R()*.4); if(big) m.scale.multiplyScalar(1.4); g.add(m);
    g.rotation.y = R()*6.28; return g;
  }
  if((kind==='gold'||kind==='metal') && MODELS.ore){
    const m = modelMesh('ore', 1.5+R()*.3);
    if(gold){ m.material = MODELS.ore.goldMat || (MODELS.ore.goldMat = (()=>{ const x=MODELS.ore.mat.clone(); x.color.setRGB(1.5,1.15,.35); x.emissive=new T.Color(0x2a1a00); return x; })()); }
    g.add(m);
    if(gold){ const ng=partsVariant('nug', 5, ()=>{ const parts=[]; for(let i=0;i<5;i++){ const a=Math.random()*6.28; parts.push([GEO.nug, new T.Matrix4().makeTranslation(Math.cos(a)*.6, .35+Math.random()*.35, Math.sin(a)*.55)]); } return mergeParts(parts); }); g.add(new T.Mesh(ng, mat(0xffd24a,{emissive:0x553300}))); }
    g.rotation.y = R()*6.28; return g;
  }
  const r = mesh(GEO.rock, mat(gold?0x8a7a55:kind==='metal'?0x7a5a4a:0x9aa1a8), 0,.35,0); r.scale.set(1.1,.7,1); r.rotation.set(R(),R(),R()); g.add(r);
  const r2 = mesh(GEO.rock, mat(gold?0x7d6d48:0x868d94), .45,.2,.3); r2.scale.set(.55,.45,.55); g.add(r2);
  if(gold) for(let i=0;i<6;i++){ const a=R()*6.28; g.add(mesh(GEO.nug, mat(0xffd24a,{emissive:0x553300}), Math.cos(a)*.55, .3+R()*.35, Math.sin(a)*.5)); }
  g.rotation.y = R()*6.28; return g;
}
function makeOil(R){
  geos();
  const g = new T.Group();
  const pool = new T.Mesh(new T.CircleGeometry(.75,20), new T.MeshPhongMaterial({color:0x07070a, specular:0x6a6a80, shininess:90}));
  pool.rotation.x=-Math.PI/2; pool.position.y=.05; pool.scale.set(1,.7,1); g.add(pool);
  const rim = new T.Mesh(new T.RingGeometry(.72,.95,20), new T.MeshLambertMaterial({color:0x2a2016}));
  rim.rotation.x=-Math.PI/2; rim.position.y=.04; rim.scale.set(1,.72,1); g.add(rim);
  g.rotation.y = R()*6.28;
  return g;
}
function makeDeer(kind){
  if(kind==='rabbit' && MODELS.rabbit){ const g=makeAnimal('rabbit',.32); if(g){ g.quad.hop=true; g.userData.deadY=.06; return g; } }
  if(kind==='horse' && MODELS.horse){ const g=makeAnimal('horse',1.62); if(g){ g.userData.deadY=.2; return g; } }
  if(MODELS.antelope){ const g=makeAnimal('antelope',1.4); if(g){ g.userData.deadY=.14; return g; } }
  geos();
  const g = new T.Group(), c = mat(0xa0643a), d = mat(0x6a3e1e);
  const body = mesh(GEO.box, c, 0,.62,0); body.scale.set(.32,.3,.78); g.add(body);
  const neck = mesh(GEO.box, c, 0,.85,.36); neck.scale.set(.16,.36,.16); neck.rotation.x=-.5; g.add(neck);
  const head = mesh(GEO.box, c, 0,1.02,.5); head.scale.set(.16,.15,.3); g.add(head);
  const ant1 = mesh(GEO.box, d, -.08,1.2,.45); ant1.scale.set(.03,.22,.03); ant1.rotation.z=.4; g.add(ant1);
  const ant2 = mesh(GEO.box, d, .08,1.2,.45); ant2.scale.set(.03,.22,.03); ant2.rotation.z=-.4; g.add(ant2);
  g.legs = [];
  for(const [x,z] of [[-.11,.28],[.11,.28],[-.11,-.28],[.11,-.28]]){
    const l = mesh(GEO.limb, d, x,.5,z); l.scale.set(.8,1.15,.8); g.add(l); g.legs.push(l);
  }
  g.scale.setScalar(1.3); // Rothirsch: Schulterhöhe etwa wie die Brust eines Menschen
  return g;
}
function makeWorker(color){
  geos();
  const sx = G && G.nextSex; if(G) G.nextSex=null;
  const key = sx==='f' ? 'cavef' : sx==='m' ? 'cavem' : Math.random()<.5 ? 'cavem' : 'cavef';
  if(MODELS[key]){ const g = makeRigged(key, 1.45, color); if(g){ g.rig.hips.userData.y0 = g.rig.hips.position.y; g.userData.key=key; return g; } }
  const g = new T.Group();
  const skin = mat(0xe0b088), fur = mat(0x7d4f2a), hair = mat(0x3a2414), team = mat(color);
  const body = mesh(GEO.body, fur, 0,.72,0); g.add(body);
  const sash = mesh(GEO.box, team, 0,.8,0); sash.scale.set(.48,.09,.4); sash.rotation.z=.5; g.add(sash);
  const head = mesh(GEO.head, skin, 0,1.15,0); g.add(head);
  const hr = mesh(GEO.head, hair, 0,1.22,-.03); hr.scale.set(1.08,.75,1.08); g.add(hr);
  g.legs = [], g.arms = [];
  for(const x of [-.09,.09]){ const l=mesh(GEO.limb, skin, x,.47,0); g.add(l); g.legs.push(l); }
  for(const x of [-.25,.25]){ const a=mesh(GEO.limb, skin, x,.94,0); a.scale.set(.85,1,.85); g.add(a); g.arms.push(a); }
  const club = mesh(GEO.box, mat(0x6a4020), .26,.62,.12); club.scale.set(.07,.42,.07); club.rotation.x=.6; g.add(club); g.club=club;
  const load = mesh(GEO.box, mat(0x9a6232), 0,1.0,-.24); load.scale.set(.34,.22,.22); load.visible=false; g.add(load); g.load=load;
  g.scale.setScalar(1.4);
  return g;
}
const LOADCOL = {food:0xd8283a, wood:0x9a6232, stone:0x9aa3ad, gold:0xffd24a};

/* ============================================================
   AUTOMATISCHES SKELETT (Auto-Rig) für Meshy-Figuren ohne Knochen
   ============================================================ */
const RIGS = {};
function buildRig(key){
  const m = MODELS[key]; if(!m) return null;
  const geo = m.geo, pos = geo.attributes.position, n = pos.count;
  const bb = geo.boundingBox, H = bb.max.y-bb.min.y;
  const V = (x,y,z)=>new T.Vector3(x,y,z);
  // Hände finden: äußerste Punkte links/rechts
  const hand = [0,0].map(()=>V(0,0,0)), cnt=[0,0];
  let maxX=0; for(let i=0;i<n;i++) maxX=Math.max(maxX,Math.abs(pos.getX(i)));
  for(let i=0;i<n;i++){ const x=pos.getX(i); if(Math.abs(x)>maxX*.9){ const k=x<0?0:1; hand[k].add(V(x,pos.getY(i),pos.getZ(i))); cnt[k]++; } }
  hand.forEach((h,k)=>h.multiplyScalar(1/Math.max(1,cnt[k])));
  // Körperpunkte (Anteile der Höhe)
  const J = {
    hips:V(0,.52*H,0), spine:V(0,.64*H,0), chest:V(0,.76*H,0), neck:V(0,.85*H,0), head:V(0,.9*H,0), top:V(0,H,0),
    shL:V(-.13*H,.81*H,0), shR:V(.13*H,.81*H,0),
    hipL:V(-.06*H,.5*H,0), hipR:V(.06*H,.5*H,0), kneeL:V(-.065*H,.27*H,.01*H), kneeR:V(.065*H,.27*H,.01*H),
    ankL:V(-.07*H,.045*H,0), ankR:V(.07*H,.045*H,0), toeL:V(-.07*H,.01*H,.09*H), toeR:V(.07*H,.01*H,.09*H),
    handL:hand[0], handR:hand[1]
  };
  J.elL = J.shL.clone().lerp(J.handL,.5).add(V(0,0,-.02*H)); J.elR = J.shR.clone().lerp(J.handR,.5).add(V(0,0,-.02*H));
  J.tipL = J.handL.clone().add(J.handL.clone().sub(J.elL).multiplyScalar(.35)); J.tipR = J.handR.clone().add(J.handR.clone().sub(J.elR).multiplyScalar(.35));
  // Knochen: [Name, Elternteil, Gelenk]
  const BONES = [['hips',-1,'hips'],['spine',0,'spine'],['chest',1,'chest'],['neck',2,'neck'],['head',3,'head'],
    ['shL',2,'shL'],['elL',5,'elL'],['handL',6,'handL'],['shR',2,'shR'],['elR',8,'elR'],['handR',9,'handR'],
    ['hipL',0,'hipL'],['kneeL',11,'kneeL'],['ankL',12,'ankL'],['hipR',0,'hipR'],['kneeR',14,'kneeR'],['ankR',15,'ankR']];
  // Segmente (Bereich, der einem Knochen folgt) mit Seite: 0 Mitte, -1 links, 1 rechts, Art
  const SEG = [[0,'hips','spine',0,'t'],[1,'spine','chest',0,'t'],[2,'chest','neck',0,'t'],[3,'neck','head',0,'t'],[4,'head','top',0,'t'],
    [5,'shL','elL',-1,'a'],[6,'elL','handL',-1,'a'],[7,'handL','tipL',-1,'a'],[8,'shR','elR',1,'a'],[9,'elR','handR',1,'a'],[10,'handR','tipR',1,'a'],
    [11,'hipL','kneeL',-1,'l'],[12,'kneeL','ankL',-1,'l'],[13,'ankL','toeL',-1,'l'],[14,'hipR','kneeR',1,'l'],[15,'kneeR','ankR',1,'l'],[16,'ankR','toeR',1,'l']];
  const skinI = new Uint16Array(n*4), skinW = new Float32Array(n*4);
  const p=V(0,0,0), ab=V(0,0,0), ap=V(0,0,0), q=V(0,0,0);
  const armX = Math.abs(J.shL.x)*.95;
  for(let i=0;i<n;i++){
    p.set(pos.getX(i),pos.getY(i),pos.getZ(i));
    const ds=[];
    for(const [bi,a,b,side,kind] of SEG){
      const A=J[a], B=J[b]; ab.subVectors(B,A); ap.subVectors(p,A);
      const t=clamp(ap.dot(ab)/ab.lengthSq(),0,1); q.copy(A).addScaledVector(ab,t);
      let d=p.distanceTo(q);
      if(kind==='a' && side*p.x < armX) d+=H;                       // Arme nur außen
      if(kind==='l' && (p.y>.56*H || side*p.x < -.02*H)) d+=H;       // Beine nur unten und auf ihrer Seite
      if(kind==='t' && p.y<.46*H) d+=H*.5;                           // Rumpf nicht in den Beinen
      if(kind==='t' && Math.abs(p.x)>armX*1.25 && p.y<.84*H) d+=H*.5; // Rumpf nicht in den Armen
      ds.push([d,bi]);
    }
    ds.sort((a,b)=>a[0]-b[0]);
    const w0=1/Math.pow(ds[0][0]+.004,4), w1=1/Math.pow(ds[1][0]+.004,4), sw=w0+w1;
    skinI[i*4]=ds[0][1]; skinI[i*4+1]=ds[1][1]; skinW[i*4]=w0/sw; skinW[i*4+1]=w1/sw;
  }
  const g2 = geo.clone();
  g2.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinI,4));
  g2.setAttribute('skinWeight', new T.Float32BufferAttribute(skinW,4));
  g2.computeBoundingSphere();
  const dL=J.handL.clone().sub(J.shL), dR=J.handR.clone().sub(J.shR);
  const restZ=[Math.atan2(-dL.x,-dL.y)-.18, -(Math.atan2(dR.x,-dR.y)-.18)];
  return RIGS[key] = {geo:g2, mat:m.mat, J, BONES, H, restZ};
}
let HEADBAND_Y = .042, PALM = .5;
function makeRigged(key, height, color){
  const r = RIGS[key] || buildRig(key); if(!r) return null;
  const bones = r.BONES.map(([name,par,j])=>{ const b=new T.Bone(); b.name=name; return b; });
  r.BONES.forEach(([name,par,j],i)=>{ const jp=r.J[j]; if(par<0) bones[i].position.copy(jp); else { bones[i].position.copy(jp).sub(r.J[r.BONES[par][2]]); bones[par].add(bones[i]); } });
  const sk = new T.SkinnedMesh(r.geo, r.mat);
  sk.add(bones[0]); sk.bind(new T.Skeleton(bones));
  sk.castShadow=true; sk.receiveShadow=true; sk.frustumCulled=false;
  const g = new T.Group(); const sc = height/r.H; sk.scale.setScalar(sc); g.add(sk);
  const B = {}; r.BONES.forEach(([name],i)=>B[name]=bones[i]);
  // Teamfarbe: Band über der Brust, Keule in der rechten Hand, Last auf dem Rücken
  // Teamfarbe als Stirnband (statt Ring um die Brust)
  const band = new T.Mesh(new T.TorusGeometry(.052*r.H,.0045*r.H,5,20), new T.MeshLambertMaterial({color}));
  band.rotation.set(Math.PI/2+.12,0,0); band.position.set(0,HEADBAND_Y*r.H,.012*r.H); band.scale.set(1,1.18,1); B.head.add(band); g.band=band;
  const club = new T.Mesh(new T.CylinderGeometry(.012*r.H,.028*r.H,.28*r.H,6), new T.MeshLambertMaterial({color:0x6a4020}));
  club.position.set(0,-.06*r.H,.08*r.H); club.rotation.x=1.4; B.handR.add(club);
  const load = new T.Mesh(new T.BoxGeometry(.2*r.H,.12*r.H,.1*r.H), new T.MeshLambertMaterial({color:0x9a6232}));
  load.position.set(0,0,-.13*r.H); load.visible=false; B.chest.add(load);
  g.rig = B; g.load = load; g.club = club; g.isRigged = true; g.restZ = r.restZ;
  // Handflächen-Mitte (Griffpunkt) relativ zum Handgelenk-Knochen
  if(!r.palm){ // Mitte der echten Hand-Geometrie (Ecken, die am Hand-Knochen hängen) = Griffpunkt
    const si=r.geo.attributes.skinIndex, sw=r.geo.attributes.skinWeight, pos=r.geo.attributes.position, idx={}; r.BONES.forEach(([n],i)=>idx[n]=i);
    const cen=(name)=>{ const bi=idx[name], c=new T.Vector3(); let n=0; for(let v=0;v<pos.count;v++){ for(let k=0;k<4;k++){ if(si.getComponent(v,k)===bi && sw.getComponent(v,k)>.5){ c.x+=pos.getX(v); c.y+=pos.getY(v); c.z+=pos.getZ(v); n++; break; } } }
      return n ? c.divideScalar(n).sub(r.J[name]) : r.J[name==='handR'?'tipR':'tipL'].clone().sub(r.J[name]).multiplyScalar(PALM); };
    r.palm={R:cen('handR'), L:cen('handL')}; }
  g.palmR = r.palm.R.clone(); g.palmL = r.palm.L.clone();
  return g;
}
function poseRig(g, mode, ph){
  const B = g.rig, s=Math.sin(ph), c=Math.cos(ph);
  const set=(b,x,y,z)=>{ B[b].rotation.set(x||0,y||0,z||0); };
  set('hips'); set('spine'); set('chest'); set('neck'); set('head');
  set('elL'); set('elR'); set('hipL'); set('kneeL'); set('ankL'); set('hipR'); set('kneeR'); set('ankR');
  const zL=g.restZ[0], zR=g.restZ[1];
  const arm=(b,x,z)=>B[b].rotation.set(x||0,0,(b==='shL'?zL:zR)+(z||0));
  arm('shL'); arm('shR');
  if(mode==='walk'){
    set('hipL',-s*.55); set('hipR',s*.55);
    set('kneeL',Math.max(0,s)*.85); set('kneeR',Math.max(0,-s)*.85);
    arm('shL',s*.5); arm('shR',-s*.5); set('elL',-.25); set('elR',-.25);
    set('spine',.06,0,0); set('chest',0,s*.08,0);
    B.hips.position.y = g.rig.hips.userData.y0 + Math.abs(c)*.02*g.children[0].geometry.boundingSphere.radius;
  } else if(mode==='shoot'){
    // Bogen schießen: linker Arm gestreckt nach vorn, rechte Hand zieht die Sehne zurück
    const draw = Math.min(1, ph*1.6);
    set('chest',0,-.35,0); set('spine',.05,0,0); set('head',0,.3,0);
    arm('shL',-1.5,.05); set('elL',0);
    arm('shR',-1.45,.25+draw*.2); set('elR',-.4-draw*1.5);
    set('hipL',-.15); set('kneeL',.1); set('hipR',.2); set('kneeR',.05);
  } else if(mode==='work'){
    const t=(Math.sin(ph)+1)/2;
    set('spine',.25*t,0,0); set('chest',.15*t,0,0);
    arm('shR',-2.4+t*1.9,-.2); set('elR',-.4*(1-t));
    arm('shL',-.9+t*.5,.2); set('elL',-.6);
    set('hipL',-.15); set('kneeL',.25); set('hipR',.2); set('kneeR',.15);
  } else {
    set('chest',Math.sin(ph*.5)*.03,0,0); set('elL',-.15); set('elR',-.15); set('head',0,Math.sin(ph*.3)*.25,0);
  }
}


/* ---------- Tiere: automatisches Vierbeiner-Rig (Beine, Hals) für Meshy-Modelle ---------- */
const QRIGS = {};
function buildQuadRig(key){
  const m = MODELS[key]; if(!m) return null;
  const geo=m.geo, pos=geo.attributes.position, n=pos.count, bb=geo.boundingBox;
  const H=bb.max.y-bb.min.y, L=bb.max.z-bb.min.z;
  // Bauchhöhe: dort, wo die Zahl der Punkte pro Schicht stark ansteigt (über den Beinen beginnt der Körper)
  const NB=24, cnt=new Array(NB).fill(0);
  for(let i=0;i<n;i++){ const b=Math.min(NB-1, Math.floor(pos.getY(i)/H*NB)); cnt[b]++; }
  let legTop=.42*H;
  for(let b=3;b<NB*.65;b++){ const base=cnt.slice(1,b).sort((a,c)=>a-c)[Math.floor((b-1)/2)]||1; if(cnt[b]>base*1.9){ legTop=b/NB*H; break; } }
  // Beine: vier Gruppen (vorne/hinten, links/rechts)
  let zmin=1e9, zmax=-1e9; for(let i=0;i<n;i++){ if(pos.getY(i)<legTop*.7){ const z=pos.getZ(i); zmin=Math.min(zmin,z); zmax=Math.max(zmax,z); } }
  const zMid=(zmin+zmax)/2, legs=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; // FL FR BL BR: sx, sz, n
  const legOf=(x,z)=>(z>zMid?0:2)+(x<0?0:1);
  for(let i=0;i<n;i++){ const y=pos.getY(i); if(y<legTop*.7){ const x=pos.getX(i), z=pos.getZ(i), k=legOf(x,z); legs[k][0]+=x; legs[k][1]+=z; legs[k][2]++; } }
  const hips=legs.map(l=>new T.Vector3(l[0]/Math.max(1,l[2]), legTop*1.05, l[1]/Math.max(1,l[2])));
  // Körper vorne -> Halsansatz
  let bzMax=-1e9; for(let i=0;i<n;i++){ const y=pos.getY(i); if(y>legTop && y<legTop+.2*H) bzMax=Math.max(bzMax,pos.getZ(i)); }
  const neck=new T.Vector3(0, legTop+(H-legTop)*.32, bzMax-.12*L);
  const skinI=new Uint16Array(n*4), skinW=new Float32Array(n*4);
  for(let i=0;i<n;i++){
    const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
    let bone=0, w=0;
    const wl=clamp((legTop*1.1-y)/(legTop*.35),0,1);
    if(wl>0){ bone=1+legOf(x,z); w=wl; }
    else { const wn=clamp((z-(neck.z-.04*L))/(.12*L),0,1)*clamp((y-(neck.y-.12*H))/(.12*H),0,1); if(wn>0){ bone=5; w=wn; } }
    skinI[i*4]=bone; skinW[i*4]=w; skinI[i*4+1]=0; skinW[i*4+1]=1-w;
  }
  const g2=geo.clone(); g2.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinI,4)); g2.setAttribute('skinWeight',new T.Float32BufferAttribute(skinW,4)); g2.computeBoundingSphere();
  return QRIGS[key]={geo:g2, mat:m.mat, hips, neck, H, L, legTop};
}
function makeAnimal(key, height){
  const r=QRIGS[key]||buildQuadRig(key); if(!r) return null;
  const root=new T.Bone(); const bones=[root];
  r.hips.forEach(h=>{ const b=new T.Bone(); b.position.copy(h); root.add(b); bones.push(b); });
  const nb=new T.Bone(); nb.position.copy(r.neck); root.add(nb); bones.push(nb);
  const sk=new T.SkinnedMesh(r.geo, r.mat); sk.add(root); sk.bind(new T.Skeleton(bones));
  sk.castShadow=true; sk.receiveShadow=true;
  const inner=new T.Group(); inner.scale.setScalar(height/r.H); inner.add(sk);
  const g=new T.Group(); g.add(inner); g.quad={legs:bones.slice(1,5), neck:nb, inner}; g.userData.deadY=r.L*height/r.H*.0+.08;
  return g;
}
function poseAnimal(m, mode, ph){
  const q=m.quad; if(!q) return;
  if(q.hop){ // Hase: hüpfen
    const s=Math.abs(Math.sin(ph*.5)); q.inner.position.y = mode==='move' ? s*.12 : 0; q.inner.rotation.x = mode==='move' ? -Math.cos(ph*.5)*.25 : 0;
    q.inner.scale.y = q.inner.scale.x*(mode==='move' ? 1+.08*Math.sin(ph) : 1+.03*Math.sin(ph*.3)); return; }
  const s=Math.sin(ph), a=mode==='move'?.55:0;
  q.legs[0].rotation.x= s*a; q.legs[3].rotation.x= s*a; q.legs[1].rotation.x=-s*a; q.legs[2].rotation.x=-s*a;
  q.neck.rotation.x = mode==='graze' ? .85+Math.sin(ph*2)*.05 : mode==='move' ? -.05+Math.sin(ph*2)*.04 : Math.sin(ph*.4)*.06;
  q.inner.position.y = mode==='move' ? Math.abs(Math.cos(ph))*.03 : 0;
}

// Varianten: jedes Volk bekommt dauerhaft eine eigene Auswahl (Steinzeit: alle Modelle für alle gleich)
function variant(owner, keys){ const ok=keys.filter(k=>MODELS[k]); if(!ok.length) return null; return ok[((owner|0)*7 + (G?G.seed:0)) % ok.length]; }
function modelByHeight(k, h){ const m=MODELS[k]; const bb=m.geo.boundingBox; const o=new T.Mesh(m.geo,m.mat); o.scale.setScalar(h/(bb.max.y-bb.min.y)); o.castShadow=true; o.receiveShadow=true; return o; }
function addDecor(g, k, x, z, size, rotY, byHeight){ if(!MODELS[k]) return; const o = byHeight ? modelByHeight(k,size) : modelMesh(k,size); o.position.set(x,0,z); o.rotation.y=rotY||0; g.add(o); return o; }
function makeTC(color, civ, owner){
  geos();
  const g = new T.Group();
  const tk = variant(owner, ['tc','bigtc']);
  if(tk){
    g.add(modelMesh(tk, tk==='bigtc'?6.6:6.2));
    // Leben rund ums Stadtzentrum
    if(G.gfx>=1){ addDecor(g,'banner', -2.7, 2.9, 2.3, .3, true); addDecor(g,'banner', 2.9, -2.6, 2.3, 2.5, true);
    addDecor(g,'thron', -1.9, 4.4, 1.3, Math.PI*.85); addDecor(g,'bank', 1.9, 4.6, 1.4, -Math.PI*.15);
    addDecor(g,'fellgestell', -4.2, -1.2, 1.7, 1.2); addDecor(g,'trockengestell', 4.3, 1.1, 1.8, -1.3);
    addDecor(g,'werkzeuge', -3.8, 1.9, 1.3, .8); addDecor(g,'trog', 3.7, -.8+3, 1.3, -1.9); addDecor(g,'leiter', 2.6, 1.6, 2.4, -.7, true); } else addDecor(g,'banner', -2.7, 2.9, 2.3, .3, true);
    g.flag = civ ? civFlag(g, civ, color, 2.2, 0, 2.0, 4.2) : teamFlag(g, color, 2.2, 0, 2.0, 3.6);
    const fire = makeCampfire(); fire.position.set(0,0,3.9);
    g.add(fire); g.fire=fire.flames; g.fireFx=fire;
    return g;
  }
  const wall = mesh(new T.CylinderGeometry(1.7,1.85,1.3,10), mat(0x8a5a2e), 0,.65,0); g.add(wall);
  const roof = mesh(new T.ConeGeometry(2.25,1.9,10), mat(0xc9a14e), 0,2.25,0); g.add(roof);
  const roof2 = mesh(new T.ConeGeometry(1.2,1,10), mat(0xb08a3e), 0,3.1,0); g.add(roof2);
  const door = mesh(GEO.box, mat(0x3a2414), 0,.5,1.72); door.scale.set(.6,.9,.15); g.add(door);
  // Palisade
  for(let i=0;i<22;i++){ const a=i/22*Math.PI*2; if(Math.abs(Math.sin(a/2-Math.PI/4*0))<.0) continue;
    if(a>1.2 && a<1.95) continue;
    const p = mesh(GEO.box, mat(0x7a4d28), Math.cos(a)*2.85, .5, Math.sin(a)*2.85); p.scale.set(.18,1+((i*7)%3)*.12,.18); g.add(p); }
  // Banner
  const pole = mesh(GEO.box, mat(0x5a3818), 1.6,1.8,1.4); pole.scale.set(.08,3.6,.08); g.add(pole);
  const flag = mesh(GEO.box, mat(color), 1.95,3.2,1.4); flag.scale.set(.7,.5,.04); g.add(flag); g.flag = flag;
  // Lagerfeuer
  const fire = new T.Group(); fire.position.set(0,0,3.6);
  for(let i=0;i<5;i++){ const s=mesh(GEO.rock, mat(0x777777), Math.cos(i*1.26)*.42,.06,Math.sin(i*1.26)*.42); s.scale.set(.16,.12,.16); fire.add(s); }
  const f1 = new T.Mesh(GEO.flame, new T.MeshBasicMaterial({color:0xffa31a})); f1.position.y=.32; fire.add(f1);
  const f2 = new T.Mesh(GEO.flame, new T.MeshBasicMaterial({color:0xffe066})); f2.position.y=.25; f2.scale.set(.55,.6,.55); fire.add(f2);
  g.add(fire); g.fire=[f1,f2];
  return g;
}
function makeBarracks(color, owner){
  geos();
  const g = new T.Group();
  const bk = variant(owner, ['barr1','barr2','barr3','barracks']);
  if(bk){ g.add(modelMesh(bk, 4.6)); addDecor(g,'barrikade', 0, 2.9, 2.2, 0); teamFlag(g, color, 2, 0, 1.8, 3.2); return g; }
  const hut = mesh(new T.ConeGeometry(1.9,2.6,8), mat(0x7a5230), 0,1.3,0); g.add(hut); teamFlag(g, color, 1.6, 0, 1.4, 2.8); return g;
}
// Wachturm: Krieger stehen oben auf der Plattform, sind geschützt und schießen weiter
// Das kleine Dach über der Plattform weglassen, damit man die Krieger oben sieht
function towerGeo(){
  const M=MODELS.tower; if(M.cut) return M.cut;
  const g=M.geo, bb=g.boundingBox, cy=bb.min.y+(bb.max.y-bb.min.y)*.865, P=g.attributes.position.array, I=g.index?g.index.array:null, n=I?I.length:P.length/3, out=[];
  for(let i=0;i<n;i+=3){ const a=I?I[i]:i, b=I?I[i+1]:i+1, c=I?I[i+2]:i+2; if(Math.max(P[a*3+1],P[b*3+1],P[c*3+1])<cy) out.push(a,b,c); }
  const ng=g.clone(); ng.setIndex(out); ng.boundingBox=bb.clone(); ng.computeBoundingSphere(); M.cut=ng; return ng;
}
function makeTower(color, owner){
  geos();
  const g = new T.Group();
  if(MODELS.tower){ const m=modelMesh('tower', 3.0), bb=MODELS.tower.geo.boundingBox, s=m.scale.x; m.geometry=towerGeo(); g.add(m);
    g.platY = (bb.min.y + (bb.max.y-bb.min.y)*.75)*s; g.slotX=(bb.max.x-bb.min.x)*s*.2; g.slotZ=(bb.max.z-bb.min.z)*s*.22;
    teamFlag(g, color, (bb.max.x-bb.min.x)*s*.42, g.platY+.3, (bb.max.z-bb.min.z)*s*.42, 2.4); return g; }
  for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const p=mesh(GEO.box, mat(0x6b4a2a), x,2.4,z); p.scale.set(.25,4.8,.25); g.add(p); }
  const pl=mesh(GEO.box, mat(0x8a6238), 0,4.8,0); pl.scale.set(2.6,.2,2.6); g.add(pl);
  g.platY=4.9; g.slotX=.55; g.slotZ=.55; teamFlag(g, color, 1.1, 4.9, 1.1, 2.2); return g;
}
function makeHouse(color, owner){
  geos();
  const g = new T.Group();
  const hk = variant(((owner|0)*3+G.builds.length)%97, ['house','tent']);
  if(hk){ g.add(modelMesh(hk, hk==='tent'?3.1:3.3)); teamFlag(g, color, 1.1, 1.5, 1.1, 1.4); return g; }
  const tent = mesh(new T.ConeGeometry(1.05,1.9,7), mat(0xb98b56), 0,.95,0); g.add(tent);
  const hide = mesh(new T.ConeGeometry(.75,1.1,7,1,true,0,2.2), mat(0x8a5a2e,{side:T.DoubleSide}), 0,.7,0); hide.rotation.y=1; g.add(hide);
  for(let i=0;i<4;i++){ const a=i*1.57+.4; const p=mesh(GEO.box, mat(0x5a3818), Math.cos(a)*.18,2,Math.sin(a)*.18); p.scale.set(.05,.6,.05); p.rotation.set(Math.sin(a)*.4,0,-Math.cos(a)*.4); g.add(p); }
  const band = mesh(GEO.box, mat(color), 0,1.25,.62); band.scale.set(.35,.12,.05); g.add(band);
  return g;
}
function makeStore(color, owner){
  geos();
  const g = new T.Group();
  const sk = variant(((owner|0)*5+G.builds.length)%97, ['store','store2','store3']);
  if(sk){ const m=modelMesh(sk, 3.7); g.add(m); teamFlag(g, color, 1.6, 0, 1.4, 2.8); return g; }
  const base = mesh(GEO.box, mat(0x7a4d28), 0,.15,0); base.scale.set(2.6,.3,2.4); g.add(base);
  for(let i=0;i<4;i++){ const l=mesh(new T.CylinderGeometry(.16,.16,1.6,6), mat(0x9a6232), -.4,.48+i*.0,-.7+i*.34); l.rotation.z=Math.PI/2; g.add(l); }
  for(let i=0;i<3;i++){ const l=mesh(new T.CylinderGeometry(.16,.16,1.6,6), mat(0x8a5428), -.4,.78,-.53+i*.34); l.rotation.z=Math.PI/2; g.add(l); }
  const r = mesh(GEO.rock, mat(0x9aa1a8), .75,.55,.4); r.scale.set(.55,.45,.5); g.add(r);
  const r2 = mesh(GEO.rock, mat(0x8a7a55), .8,.5,-.5); r2.scale.set(.4,.35,.4); g.add(r2);
  for(const [x,z] of [[-1.2,-1.1],[1.2,-1.1],[-1.2,1.1],[1.2,1.1]]){ const p=mesh(GEO.box, mat(0x5a3818), x,1,z); p.scale.set(.12,1.7,.12); g.add(p); }
  const roof = mesh(GEO.box, mat(0xc9a14e), 0,1.9,0); roof.scale.set(2.8,.12,2.6); roof.rotation.z=.08; g.add(roof);
  const band = mesh(GEO.box, mat(color), 0,1.75,1.32); band.scale.set(.6,.18,.04); g.add(band);
  return g;
}


/* ============================================================
   3D-MODELLE (eigene, verkleinerte GLB-Dateien)
   ============================================================ */
const MODEL_FILES = { tc:'models/rundhuette.glb', house:'models/rundhuette.glb', store:'models/steinhaus.glb', barracks:'models/zahnhaus.glb', fence:'models/zaun.glb', rock:'models/fels.glb', ore:'models/erz.glb', mono:'models/monolith.glb', cavem:'models/hoehlenmann.glb', bigtc:'models/grosse_huette.glb', tent:'models/zelt.glb', store2:'models/vorratshuette.glb', store3:'models/kornspeicher.glb', barr1:'models/festung.glb', barr2:'models/aussenposten.glb', barr3:'models/zahnhaus2.glb', w_spear:'models/speer.glb', w_axe:'models/steinaxt.glb', w_bow:'models/langbogen.glb', banner:'models/banner.glb', bank:'models/bank.glb', thron:'models/thron.glb', werkzeuge:'models/werkzeuge.glb', leiter:'models/leiter.glb', trog:'models/trog.glb', fellgestell:'models/fellgestell.glb', barrikade:'models/barrikade.glb', antelope:'models/antilope.glb', rabbit:'models/hase.glb', horse:'models/pferd.glb', cavef:'models/hoehlenfrau.glb', warrior:'models/krieger.glb', palisade:'models/zaun_knochen.glb', fire:'models/lagerfeuer.glb', tower:'models/wachturm.glb' };
const MODELS = {};
let modelsReady = null;
function parseGLB(buf){
  const dv = new DataView(buf), jl = dv.getUint32(12,true);
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,jl)));
  const binOff = 20+jl+8;
  const view = i => { const bv=j.bufferViews[i]; return {off:binOff+(bv.byteOffset||0), len:bv.byteLength}; };
  const accArr = i => { const a=j.accessors[i], v=view(a.bufferView), n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const C = a.componentType===5126?Float32Array:a.componentType===5125?Uint32Array:Uint16Array;
    return new C(buf.slice(v.off, v.off + a.count*n*C.BYTES_PER_ELEMENT)); };
  const pr = j.meshes[0].primitives[0], at = pr.attributes;
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(accArr(at.POSITION),3));
  if(at.NORMAL!=null) geo.setAttribute('normal', new T.BufferAttribute(accArr(at.NORMAL),3));
  if(at.COLOR_0!=null) geo.setAttribute('color', new T.BufferAttribute(accArr(at.COLOR_0),3));
  if(at.TEXCOORD_0!=null) geo.setAttribute('uv', new T.BufferAttribute(accArr(at.TEXCOORD_0),2));
  geo.setIndex(new T.BufferAttribute(accArr(pr.indices),1));
  if(at.NORMAL==null) geo.computeVertexNormals();
  geo.computeBoundingBox();
  const bb = geo.boundingBox, c = new T.Vector3(); bb.getCenter(c);
  geo.translate(-c.x, -bb.min.y, -c.z); geo.computeBoundingBox();
  const mat = new T.MeshLambertMaterial({side:T.DoubleSide, vertexColors: at.COLOR_0!=null});
  let texP = Promise.resolve();
  if(j.images && j.images.length){
    const v = view(j.images[0].bufferView);
    const blob = new Blob([new Uint8Array(buf, v.off, v.len)], {type:j.images[0].mimeType||'image/jpeg'});
    texP = new Promise(res=>{ const img=new Image(); img.onload=()=>{ const t=new T.Texture(img); t.flipY=false; t.colorSpace=T.SRGBColorSpace; t.needsUpdate=true; mat.map=t; mat.needsUpdate=true; res(); }; img.onerror=res; img.src=URL.createObjectURL(blob); });
  }
  return texP.then(()=>({geo, mat}));
}
// Grafik „Niedrig“: Gebäude in einfacher Fassung (models/niedrig/), ab „Mittel“ volle Qualität
const MODEL_LOW = new Set(['tower','warrior','bigtc','tent','store2','store3','barr1','barr2','barr3']);
let modelsLow = null;
function loadModels(gfx){
  const low = gfx===0;
  if(modelsReady && modelsLow===low) return modelsReady;
  const src = window.EE_MODELS || {}, again = modelsReady && modelsLow!==low;
  modelsLow = low;
  const list = Object.entries(MODEL_FILES).filter(([k])=> !again || MODEL_LOW.has(k));
  modelsReady = Promise.all(list.map(([k,f]) => {
    const useLow = low && MODEL_LOW.has(k), url = useLow ? (src[k+'_low'] || f.replace('models/','models/niedrig/')) : (src[k] || f);
    return fetch(url).then(r=>{ if(!r.ok) throw 0; return r.arrayBuffer(); }).then(parseGLB).then(m=>{ MODELS[k]=m; }).catch(()=>{});
  }));
  return modelsReady;
}
function modelMesh(k, width){
  const m = MODELS[k]; const bb = m.geo.boundingBox;
  const s = width / Math.max(bb.max.x-bb.min.x, bb.max.z-bb.min.z);
  const o = new T.Mesh(m.geo, m.mat); o.scale.setScalar(s); o.castShadow=true; o.receiveShadow=true;
  return o;
}
/* ============================================================
   PFLANZEN: Laubbaum, Nadelbaum, Palme, Beerenbusch (selbst gebaut, mit Blätter-Textur und Wind)
   ============================================================ */
let FLORA = null;
function floraAtlas(){
  const W=1024, H=512, cv=document.createElement('canvas'); cv.width=W; cv.height=H; const x=cv.getContext('2d');
  const R=rng(4711);
  // Rinde (0..256)
  let gr=x.createLinearGradient(0,0,256,0); gr.addColorStop(0,'#4a3222'); gr.addColorStop(.5,'#6e4a30'); gr.addColorStop(1,'#4a3222');
  x.fillStyle=gr; x.fillRect(0,0,256,512);
  for(let i=0;i<260;i++){ const px=R()*256, w=1+R()*3; x.strokeStyle=`rgba(${30+R()*30|0},${20+R()*20|0},${12},${.35+R()*.4})`; x.lineWidth=w; x.beginPath(); x.moveTo(px,0); let yy=0; while(yy<512){ yy+=10+R()*30; x.lineTo(px+(R()-.5)*6,yy); } x.stroke(); }
  for(let i=0;i<120;i++){ x.fillStyle=`rgba(${140+R()*40|0},${110+R()*30|0},${80},.18)`; x.fillRect(R()*256,R()*512,2+R()*5,6+R()*16); }
  // Palmenstamm (256..512): Ringe
  x.fillStyle='#8a6a44'; x.fillRect(256,0,256,512);
  for(let y=0;y<512;y+=16){ const g=x.createLinearGradient(0,y,0,y+16); g.addColorStop(0,'#5a4128'); g.addColorStop(.35,'#9c7a50'); g.addColorStop(1,'#6e5233'); x.fillStyle=g; x.fillRect(256,y,256,16);
    for(let k=0;k<14;k++){ x.fillStyle='rgba(50,34,20,.35)'; x.fillRect(256+R()*256, y+R()*4, 6+R()*14, 2); } }
  // Laubbüschel (512..768, oben) und kleinblättriges Büschel (512..768, unten)
  const clump=(ox,oy,S,cols,leafL,leafW,count)=>{
    for(let i=0;i<count;i++){
      const a=R()*6.283, rr=Math.pow(R(),.65)*S*.46, cx=ox+S/2+Math.cos(a)*rr, cy=oy+S/2+Math.sin(a)*rr*.95;
      const c=cols[(R()*cols.length)|0], sh=.75+ (1-rr/(S*.46))*.35 + (R()-.5)*.15;
      x.save(); x.translate(cx,cy); x.rotate(R()*6.283);
      x.fillStyle=`rgb(${c[0]*sh|0},${c[1]*sh|0},${c[2]*sh|0})`;
      const L=leafL*(.7+R()*.6), Wd=leafW*(.7+R()*.6);
      x.beginPath(); x.moveTo(-L/2,0); x.quadraticCurveTo(0,-Wd,L/2,0); x.quadraticCurveTo(0,Wd,-L/2,0); x.fill();
      x.strokeStyle='rgba(20,40,10,.35)'; x.lineWidth=.8; x.beginPath(); x.moveTo(-L/2,0); x.lineTo(L/2,0); x.stroke();
      x.restore();
    }
  };
  clump(512,0,256,[[62,120,40],[78,140,46],[52,104,36],[92,152,58],[70,128,44]],24,10,900);
  clump(512,256,256,[[70,130,46],[88,150,56],[60,116,40],[104,160,66]],15,7,1300);
  // Tannen-Nadeln (768..1024, oben): dichte Nadeln, unten gezackter Rand
  { x.fillStyle='#24502c'; x.fillRect(768,0,256,200);
    for(let i=0;i<2600;i++){ const px=768+R()*256, py=R()*200, L=5+R()*9, g=60+R()*60|0;
      x.strokeStyle=`rgb(${20+R()*25|0},${g},${30+R()*20|0})`; x.lineWidth=1.5; x.beginPath(); x.moveTo(px,py); x.lineTo(px+(R()-.5)*4, py+L); x.stroke(); }
    for(let k=0;k<16;k++){ const cx=768+k*16+8, d=200+18+R()*30; x.fillStyle='#2a5a30'; x.beginPath(); x.moveTo(cx-9,198); x.lineTo(cx,d); x.lineTo(cx+9,198); x.fill();
      for(let i=0;i<30;i++){ const py=198+R()*(d-200), w=(1-(py-198)/(d-198))*8; x.strokeStyle=`rgb(${26+R()*20|0},${70+R()*50|0},${34})`; x.lineWidth=1.3; x.beginPath(); x.moveTo(cx+(R()-.5)*w*2,py); x.lineTo(cx+(R()-.5)*w*2,py+5); x.stroke(); } } }
  // Palmwedel (768..1024, unten): Mittelrippe entlang u
  { const oy=256+128; x.strokeStyle='#6a7a2a'; x.lineWidth=4; x.beginPath(); x.moveTo(770,oy); x.lineTo(1020,oy); x.stroke();
    for(let i=0;i<70;i++){ const t=i/70, px=772+t*246, L=(1-Math.pow(t,1.4)*.8)*(60+R()*18);
      for(const side of [-1,1]){ const g=110+R()*40|0; x.strokeStyle=`rgb(${50+R()*20|0},${g},${36})`; x.lineWidth=4.5*(1-t*.5);
        x.beginPath(); x.moveTo(px,oy); x.quadraticCurveTo(px+L*.35, oy+side*L*.45, px+L*.55, oy+side*L*.95); x.stroke(); } } }
  const t=new T.CanvasTexture(cv); t.colorSpace=T.SRGBColorSpace; t.anisotropy=4; t.flipY=false;
  return t;
}
// Geometrie-Baukasten
function GB(){ return {p:[],n:[],u:[],c:[],i:[]}; }
function gbAdd(g,p,n,u,c){ g.p.push(p[0],p[1],p[2]); g.n.push(n[0],n[1],n[2]); g.u.push(u[0],u[1]); g.c.push(c,c,c); return g.p.length/3-1; }
function gbCyl(g, pts, rads, seg, u0, u1, vRep, shade){
  const base=g.p.length/3;
  for(let s=0;s<pts.length;s++){
    const [px,py,pz]=pts[s], r=rads[s], v=s/(pts.length-1)*vRep;
    for(let k=0;k<=seg;k++){ const a=k/seg*6.283, cx=Math.cos(a), cz=Math.sin(a);
      gbAdd(g,[px+cx*r,py,pz+cz*r],[cx,.15,cz],[u0+(u1-u0)*k/seg, v], shade*(s===0?.7:1)); }
  }
  for(let s=0;s<pts.length-1;s++) for(let k=0;k<seg;k++){ const a=base+s*(seg+1)+k, b=a+1, c=a+seg+1, d=c+1; g.i.push(a,c,b, b,c,d); }
}
// Blätterkarte: Quadrat um Mittelpunkt, Normalen zeigen kugelig vom Kronenzentrum weg (weiches Licht)
function gbCard(g, ctr, axU, axV, size, uv, crown, shade){
  const [u0,v0,u1,v1]=uv, idx=[];
  for(const [su,sv,uu,vv] of [[-1,-1,u0,v0],[1,-1,u1,v0],[1,1,u1,v1],[-1,1,u0,v1]]){
    const p=[ctr[0]+(axU[0]*su+axV[0]*sv)*size/2, ctr[1]+(axU[1]*su+axV[1]*sv)*size/2, ctr[2]+(axU[2]*su+axV[2]*sv)*size/2];
    let n=[p[0]-crown[0], (p[1]-crown[1])*1.3+.4, p[2]-crown[2]]; const L=Math.hypot(...n)||1; n=n.map(v=>v/L);
    idx.push(gbAdd(g,p,n,[uu,vv],shade*(.82+.3*Math.max(0,(p[1]-crown[1])/size+.3))));
  }
  g.i.push(idx[0],idx[1],idx[2], idx[0],idx[2],idx[3]);
}
function randAxes(R){
  const a=R()*6.283, b=(R()-.5)*2.2, n=[Math.cos(a)*Math.cos(b), Math.sin(b), Math.sin(a)*Math.cos(b)];
  let u=[-n[2],0,n[0]]; let L=Math.hypot(...u)||1; u=u.map(v=>v/L);
  const v=[n[1]*u[2]-n[2]*u[1], n[2]*u[0]-n[0]*u[2], n[0]*u[1]-n[1]*u[0]];
  const r=R()*6.283, c=Math.cos(r), s=Math.sin(r);
  return [[u[0]*c+v[0]*s,u[1]*c+v[1]*s,u[2]*c+v[2]*s],[v[0]*c-u[0]*s,v[1]*c-u[1]*s,v[2]*c-u[2]*s]];
}
function gbBlob(g, c, r, C, det){
  const ico=new T.IcosahedronGeometry(1,det==null?1:det), p=ico.attributes.position, base=g.p.length/3, [u0,v0,u1,v1]=UV_LEAF;
  for(let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i), z=p.getZ(i), k=.85+hash2(x*3,z*3,y*5)*.3;
    const pp=[c[0]+x*r*k, c[1]+y*r*.85*k, c[2]+z*r*k]; let n=[pp[0]-C[0],(pp[1]-C[1])*1.3+.4,pp[2]-C[2]]; const L=Math.hypot(...n)||1;
    gbAdd(g, pp, n.map(v=>v/L), [u0+(u1-u0)*(.35+.3*(x*.5+.5)), v0+(v1-v0)*(.35+.3*(z*.5+.5))], .62+.25*(y*.5+.5)); }
  const ix=ico.index ? ico.index.array : [...Array(p.count).keys()];
  for(let i=0;i<ix.length;i++) g.i.push(base+ix[i]);
  ico.dispose();
}
function gbGeo(g){
  const geo=new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(g.p,3)); geo.setAttribute('normal', new T.Float32BufferAttribute(g.n,3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(g.u,2)); geo.setAttribute('color', new T.Float32BufferAttribute(g.c,3));
  geo.setIndex(g.i); geo.computeBoundingBox(); geo.computeBoundingSphere(); return geo;
}
const UV_BARK=[0,0,.25,1], UV_PALMT=[.25,0,.5,1], UV_LEAF=[.5,0,.75,.5], UV_LEAF2=[.5,.5,.75,1], UV_FIR=[.75,0,1,.5], UV_FROND=[.75,.5,1,1];
function makeBroadleaf(R, small, lod){
  const g=GB(), H=small?2.4:3.4;
  const tr=[[0,0,0],[.05,H*.35,.03],[-.04,H*.7,.06],[.08,H,0]];
  gbCyl(g, lod?[[0,0,0],[0,H,0]]:tr, lod?[.3,.15]:[.34,.26,.2,.15], lod?5:8, 0,.25, 1, .9);
  const crowns=[[0,H+1.6,0,1.9]];
  for(let b=0;b<4;b++){ const a=b/4*6.283+R()*.8, y=H*.75+R()*H*.25, L=1.3+R()*.5, ex=Math.cos(a)*L, ez=Math.sin(a)*L, ey=y+.9+R()*.6;
    if(!lod) gbCyl(g, [[0,y,0],[ex*.5,y+.45,ez*.5],[ex,ey,ez]], [.13,.09,.05], 5, 0,.25, 1, .85);
    crowns.push([ex*1.05, ey+.5, ez*1.05, 1.35+R()*.4]); }
  const C=[0,H+1.2,0];
  const LQ=G.gfx===0;
  for(const [cx,cy,cz,r] of crowns){ const n=lod?3:LQ?7:small?10:14;
    for(let k=0;k<n;k++){ const [au,av]=randAxes(R); const a=R()*6.283, e=(R()-.3)*1.4, d=r*(.35+R()*.45);
      const o=[cx+Math.cos(a)*Math.cos(e)*d, cy+Math.sin(e)*d*.8, cz+Math.sin(a)*Math.cos(e)*d];
      gbCard(g, o, au, av, r*(.9+R()*.4), R()<.7?UV_LEAF:UV_LEAF2, C, .9+R()*.2); }
    gbBlob(g, [cx,cy,cz], r*.78, C, (LQ||lod)?0:1); }
  return gbGeo(g);
}
function makeFir(R, lod){
  const g=GB(), H=8.8;
  gbCyl(g, [[0,0,0],[0,H*.5,0],[0,H,0]], [.3,.18,.04], 7, 0,.25, 1, .85);
  const tiers=lod?4:G.gfx===0?5:7, seg=lod?6:G.gfx===0?8:10, [u0,v0,u1,v1]=UV_FIR;
  for(let t=0;t<tiers;t++){
    const f=t/(tiers-1), yb=1.4+f*(H-2.6), r=2.6*(1-f)+.6, th=2.3-f*.9, yt=yb+th;
    const base=g.p.length/3, rings=[[.06,yt,0],[.55,yt-th*.5,.45],[1,yb,1]];
    for(let ri=0;ri<3;ri++){ const [rf,y,vv]=rings[ri];
      for(let k=0;k<=seg;k++){ const a=k/seg*6.283+t*.5, ca=Math.cos(a), sa=Math.sin(a), wob=ri===2?(.85+R()*.3):1;
        const rr=r*rf*wob, yy=y-(ri===2?R()*.25:0);
        const n=[ca,.75,sa], L=Math.hypot(...n);
        gbAdd(g,[ca*rr,yy,sa*rr],n.map(v=>v/L),[u0+(u1-u0)*(k/seg*2%1||(k?1:0)), v0+(v1-v0)*vv*.99], (.62+.38*ri/2)*(.8+.35*f)); } }
    for(let ri=0;ri<2;ri++) for(let k=0;k<seg;k++){ const a=base+ri*(seg+1)+k, b=a+1, c=a+seg+1, d=c+1; g.i.push(a,b,c, b,d,c); }
  }
  return gbGeo(g);
}
function makePalm(R, lod){
  const g=GB(), H=6.4, lean=.9+R()*.8, pts=[], rads=[];
  for(let s=0;s<=7;s++){ const t=s/7; pts.push([lean*t*t, H*t, 0]); rads.push(.24-.08*t); }
  gbCyl(g, pts, rads, 7, .25,.5, 1, .95);
  const top=pts[7], C=[top[0],top[1],top[2]];
  const fr=lod?6:9;
  for(let f=0;f<fr;f++){ const a=f/fr*6.283+R()*.3, ca=Math.cos(a), sa=Math.sin(a), L=3+R()*.7, seg=lod?2:6, ups=.5+R()*.5;
    const base=g.p.length/3;
    for(let s=0;s<=seg;s++){ const t=s/seg, d=L*t, y=top[1]+ups*Math.sin(t*2.2)*1.0 - t*t*1.9, w=.75*(1-t*.6)+.1;
      const cx=top[0]+ca*d, cz=top[2]+sa*d, sx=-sa*w, sz=ca*w;
      const [u0,v0,u1,v1]=UV_FROND, uu=u0+(u1-u0)*t;
      gbAdd(g,[cx+sx,y-.08*t,cz+sz],[ca*.3,1,sa*.3],[uu,v0],1); gbAdd(g,[cx-sx,y-.08*t,cz-sz],[ca*.3,1,sa*.3],[uu,v1],1); }
    for(let s=0;s<seg;s++){ const a0=base+s*2; g.i.push(a0,a0+1,a0+2, a0+1,a0+3,a0+2); }
  }
  return gbGeo(g);
}
function makeBushGeo(R){
  const g=GB(), C=[0,.55,0];
  for(let k=0;k<16;k++){ const [au,av]=randAxes(R); const a=R()*6.283, r=R()*.55;
    gbCard(g,[Math.cos(a)*r, .5+R()*.45, Math.sin(a)*r], au, av, 1.05+R()*.4, UV_LEAF2, C, .95); }
  return gbGeo(g);
}
function floraMat(tex){
  const m=new T.MeshLambertMaterial({map:tex, vertexColors:true, alphaTest:.45, side:T.DoubleSide});
  const fk='flora'+G.gfx; m.customProgramCacheKey=()=>fk;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = TERRAIN_T;
    // nah an der Kamera werden Baumkronen durchsichtig, damit man beim Heranzoomen etwas sieht
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `void main() {
      float cdist = length(vViewPosition);
      if(cdist < 11.0){ float a = smoothstep(4.5, 11.0, cdist); float ign = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056,.00583715)))); if(ign > a) discard; }`);
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 ip = vec2(modelMatrix[3][0], modelMatrix[3][2]);
      #endif
      float bend = ${G.gfx===0 ? '0.0' : 'max(0.0, position.y-1.2) * .018'};
      transformed.x += sin(uTime*1.7 + ip.x*.37 + ip.y*.21 + position.y*.4) * bend;
      transformed.z += cos(uTime*1.3 + ip.x*.23 - ip.y*.3) * bend * .7;`);
  };
  return m;
}
function flora(){
  if(FLORA && FLORA.gfx===G.gfx) return FLORA;
  const tex=floraAtlas(), R=rng(99);
  const mat=floraMat(tex);
  const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking, map:tex, alphaTest:.45, side:T.DoubleSide});
  FLORA={tex, mat, depth,
    geo:{ oak:[makeBroadleaf(R),makeBroadleaf(R),makeBroadleaf(R,true)], fir:[makeFir(R),makeFir(R)], palm:[makePalm(R),makePalm(R)], bush:[makeBushGeo(R),makeBushGeo(R)] },
    lod:{ oak:makeBroadleaf(R,false,true), fir:makeFir(R,true), palm:makePalm(R,true) },
    gfx:G.gfx, berryGeo:new T.IcosahedronGeometry(.075,0), berryMat:new T.MeshLambertMaterial({color:0xd4202e, emissive:0x3a0000})};
  return FLORA;
}
function treeKind(x,z,h,R){
  const lon=toLon(x), lat=toLat(z), al=Math.abs(lat), cold=coldAt(lat), mt=mountainAt(lon,lat), ds=desertAt(lon,lat);
  if(al<33 && (h<WATER_Y+1.2 || ds>.3) && R()<.85) return 'palm';
  if(al<16 && R()<.25) return 'palm';
  if(cold>.1 || mt>.5 || al>55) return R()<.9?'fir':'oak';
  if(al>44) return R()<.45?'fir':'oak';
  return R()<.12?'fir':'oak';
}
/* ---------- Sammel-Zeichnen: alle Bäume / alles Gras einer Sorte in EINEM Zeichenaufruf ----------
   Jede Sorte hat Daten pro Weltstück; gezeichnet wird nur, was nahe der Kamera liegt. */
function makeBatch(geo, mat, opt){ return {geo, mat, opt:opt||{}, chunks:new Map(), im:null, cap:0, dirty:true}; }
function batchAdd(B, ck, matrix, color){
  let c=B.chunks.get(ck); if(!c){ c={m:new Float32Array(16*32), c:new Float32Array(3*32), n:0, cx:0, cz:0}; const [i,j]=ck.split(',').map(Number); c.cx=(i+.5)*TILE-G.NX/2; c.cz=(j+.5)*TILE-G.NZ/2; B.chunks.set(ck,c); }
  if(c.n*16>=c.m.length){ const m2=new Float32Array(c.m.length*2); m2.set(c.m); c.m=m2; const c2=new Float32Array(c.c.length*2); c2.set(c.c); c.c=c2; }
  matrix.toArray(c.m, c.n*16); if(color) color.toArray(c.c, c.n*3); else c.c.fill(1, c.n*3, c.n*3+3);
  B.dirty=true; return {B, c, i:c.n++};
}
function batchHide(ref){ ref.c.m.fill(0, ref.i*16, ref.i*16+16); ref.B.dirty=true; }
const _fr=new T.Frustum(), _fm=new T.Matrix4(), _sp=new T.Sphere();
function batchFill(im, list){ const M=im.instanceMatrix.array, C=im.instanceColor.array; let o=0;
  for(const c of list){ M.set(c.m.subarray(0,c.n*16), o*16); C.set(c.c.subarray(0,c.n*3), o*3); o+=c.n; }
  im.count=o; im.instanceMatrix.needsUpdate=true; im.instanceColor.needsUpdate=true; }
function batchRefill(B, cx, cz, R){
  let n=0, nl=0; const list=[], far=[], shl=[]; let sn=0; const LR=[45,65,95][G.gfx];
  G.cam.updateMatrixWorld(); _fm.multiplyMatrices(G.cam.projectionMatrix, G.cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_fm);
  for(const c of B.chunks.values()){ const dx=c.cx-cx, dz=c.cz-cz, rr=R+TILE*.75, d2=dx*dx+dz*dz; if(d2>=rr*rr) continue;
    _sp.center.set(c.cx, getH(c.cx,c.cz)+4, c.cz); _sp.radius=TILE*.75+8;
    if(_fr.intersectsSphere(_sp)){ if(B.opt.lod && d2 > LR*LR){ far.push(c); nl+=c.n; } else { list.push(c); n+=c.n; } }
    if(B.opt.shadow && G.gfx>=1 && d2 < (56+TILE*.75)**2){ shl.push(c); sn+=c.n; } }
  // eigene, unsichtbare Schattenwerfer nur nahe der Kamera (Schatten reichen ohnehin nur ~40 Einheiten)
  if(B.opt.shadow && G.gfx>=1){
    if(!B.sh || sn>B.shCap){ if(B.sh){ G.scene.remove(B.sh); B.sh.dispose(); } B.shCap=Math.max(128,Math.ceil(sn*1.5));
      B.sh=new T.InstancedMesh(B.geo, B.shMat||(B.shMat=new T.MeshBasicMaterial({colorWrite:false, depthWrite:false})), B.shCap);
      B.sh.instanceColor=new T.InstancedBufferAttribute(new Float32Array(B.shCap*3),3); B.sh.frustumCulled=false; B.sh.castShadow=true; B.sh.customDepthMaterial=B.opt.depth; B.sh.layers.set(1); G.sun.shadow.camera.layers.enable(1); G.scene.add(B.sh); }
    batchFill(B.sh, shl);
  }
  if(!B.im || n>B.cap){
    if(B.im){ G.scene.remove(B.im); B.im.dispose(); }
    B.cap=Math.max(256, Math.ceil(n*1.5)); const im=new T.InstancedMesh(B.geo, B.mat, B.cap);
    im.instanceColor=new T.InstancedBufferAttribute(new Float32Array(B.cap*3),3); im.frustumCulled=false;
    im.castShadow=false; im.receiveShadow=true;
    G.scene.add(im); B.im=im;
  }
  batchFill(B.im, list); B.dirty=false;
  if(B.opt.lod){
    if(!B.imL || nl>B.capL){ if(B.imL){ G.scene.remove(B.imL); B.imL.dispose(); } B.capL=Math.max(256,Math.ceil(nl*1.5));
      B.imL=new T.InstancedMesh(B.opt.lod, B.mat, B.capL); B.imL.instanceColor=new T.InstancedBufferAttribute(new Float32Array(B.capL*3),3); B.imL.frustumCulled=false; B.imL.receiveShadow=true; G.scene.add(B.imL); }
    batchFill(B.imL, far);
  }
}
function batchesUpdate(force){
  if(!G.batches) return;
  const s=G.camS, ci=Math.floor((s.x+G.NX/2)/TILE), cj=Math.floor((s.z+G.NZ/2)/TILE);
  const fogR=G.scene.fog.far+8, key=ci+','+cj+','+Math.round(fogR/32)+','+Math.round(s.yaw*6)+','+(G.farView?1:0);
  const moved = key!==G.batchKey; G.batchKey=key;
  for(const k in G.batches){ const B=G.batches[k]; if(!(moved||B.dirty||force)) continue;
    const R = B.opt.decor ? Math.min(fogR*.6, TILE*[1.6,2.6,3.2][G.gfx]) : Math.min(fogR, TILE*6);
    batchRefill(B, s.x, s.z, R);
    if(B.im) B.im.visible = !(G.farView && B.opt.decor); }
}
function batch(key, geo, mat, opt){ if(!G.batches) G.batches={}; return G.batches[key] || (G.batches[key]=makeBatch(geo, mat, opt)); }
const chunkKeyOf = (x,z) => Math.floor((x+G.NX/2)/TILE)+','+Math.floor((z+G.NZ/2)/TILE);
function treeInstance(x,z,force){
  const R=G.rand, h=getH(x,z), F=flora();
  const kind=force||treeKind(x,z,h,R), variants=F.geo[kind], vi=(R()*variants.length)|0;
  const B = batch('tree:'+kind+vi, variants[vi], F.mat, {shadow:true, depth:F.depth, lod:F.lod[kind]});
  const sc=(kind==='fir'?.72:kind==='palm'?.85:.8)+R()*.35;
  const o=new T.Object3D(); o.position.set(x,h-.1,z); o.rotation.y=R()*6.28; o.scale.setScalar(sc); o.updateMatrix();
  const c=new T.Color(), v=.85+R()*.25; c.setRGB(v*(.95+R()*.12), v, v*(.9+R()*.1));
  const d=new T.Object3D(); d.inst=batchAdd(B, chunkKeyOf(x,z), o.matrix, c); return d;
}
const civTexCache = {};
function civFlagTex(civ, color){
  const key = civ[0]+color;
  if(civTexCache[key]) return civTexCache[key];
  const c=document.createElement('canvas'); c.width=128; c.height=96; const x=c.getContext('2d');
  x.fillStyle='#'+color.toString(16).padStart(6,'0'); x.fillRect(0,0,128,96);
  const t=new T.CanvasTexture(c); t.colorSpace=T.SRGBColorSpace; civTexCache[key]=t;
  const body=civ[2].replace(/cp/g,'cpf').split('M0 0H30V34L15 27L0 34Z').join('M0 0H30V36H0Z').replace(/<path d="M0 0H30V36H0Z" fill="none"[^>]*\/>/,'');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 3 30 27" preserveAspectRatio="none">'+body+'</svg>';
  const img=new Image(); img.onload=()=>{ x.clearRect(0,0,128,96); x.drawImage(img,0,0,128,96); t.needsUpdate=true; };
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  return t;
}
const FLAG_T = {value:0};
function clothMat(opts){
  const m = new T.MeshLambertMaterial(Object.assign({side:T.DoubleSide}, opts));
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = FLAG_T;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        float fx = uv.x;                                  // 0 = am Mast, 1 = frei
        float ph = position.x*4.2 - uTime*6.0 + position.y*1.3;
        float amp = .16*fx*fx + .03*fx;
        float dz = cos(ph)*4.2*amp;
        vec3 objectNormal = normalize(vec3(-dz, 0.0, 1.0));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        transformed.z += sin(ph)*amp + sin(position.x*9.0 - uTime*11.0)*.025*fx;
        transformed.y -= fx*fx*.06*(1.0+.5*sin(uTime*2.3));`);
  };
  return m;
}
function clothGeo(w,h){ const g=new T.PlaneGeometry(w,h,14,8); g.translate(w/2,0,0); return g; }
function civFlag(g, civ, color, x, y, z, h){
  const pole = mesh(GEO.box, mat(0x5a3818), x, y+h/2, z); pole.scale.set(.1,h,.1); g.add(pole);
  const fl = new T.Mesh(clothGeo(1.6,1.15), clothMat({map:civFlagTex(civ,color)}));
  fl.position.set(x+.05, y+h-.62, z); fl.castShadow=true; g.add(fl);
  return fl;
}
let GLOW_TEX=null, SMOKE_TEX=null;
function radialTex(inner, outer){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); const gr=x.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0,inner); gr.addColorStop(1,outer); x.fillStyle=gr; x.fillRect(0,0,64,64); return new T.CanvasTexture(c); }
function makeCampfire(){
  geos();
  const g = new T.Group();
  if(MODELS.fire){ const m=modelMesh('fire', 1.7); m.material = MODELS.fire.glowMat || (MODELS.fire.glowMat=(()=>{ const x=MODELS.fire.mat.clone(); x.emissive=new T.Color(0x3a1200); return x; })()); g.add(m); }
  else for(let i=0;i<5;i++){ const s2=mesh(GEO.rock, mat(0x777777), Math.cos(i*1.26)*.42,.06,Math.sin(i*1.26)*.42); s2.scale.set(.16,.12,.16); g.add(s2); }
  const f1 = new T.Mesh(GEO.flame, new T.MeshBasicMaterial({color:0xff8a1a, transparent:true, opacity:.9})); f1.position.y=.55; g.add(f1);
  const f2 = new T.Mesh(GEO.flame, new T.MeshBasicMaterial({color:0xffe27a, transparent:true, opacity:.95})); f2.position.y=.45; g.add(f2);
  if(!GLOW_TEX){ GLOW_TEX=radialTex('rgba(255,170,60,.85)','rgba(255,120,20,0)'); SMOKE_TEX=radialTex('rgba(90,90,90,.55)','rgba(90,90,90,0)'); }
  const glow = new T.Sprite(new T.SpriteMaterial({map:GLOW_TEX, blending:T.AdditiveBlending, depthWrite:false, transparent:true}));
  glow.scale.set(3.2,3.2,1); glow.position.y=.6; g.add(glow);
  const smoke=[]; for(let i=0;i<5;i++){ const sp=new T.Sprite(new T.SpriteMaterial({map:SMOKE_TEX, depthWrite:false, transparent:true, opacity:.5})); sp.userData.t=i/5; g.add(sp); smoke.push(sp); }
  g.flames=[f1,f2]; g.glow=glow; g.smoke=smoke;
  return g;
}
function animateFire(fx, t, dt){
  const [f1,f2]=fx.flames;
  f1.scale.set(1.3+Math.sin(t*13)*.18, 1.4+Math.sin(t*9.7)*.35, 1.3+Math.cos(t*11)*.18); f1.rotation.y=t*1.7;
  f2.scale.set(.7+Math.sin(t*15)*.1, .9+Math.sin(t*12.3)*.25, .7);
  fx.glow.material.opacity = .75+Math.sin(t*17)*.12+Math.sin(t*5.3)*.1;
  for(const sp of fx.smoke){ sp.userData.t=(sp.userData.t+dt*.22)%1; const k=sp.userData.t;
    sp.position.set(Math.sin(k*5+sp.id)*.35*k, 1+k*4.5, Math.cos(k*4)*.25*k); const sc=.6+k*2.4; sp.scale.set(sc,sc,1); sp.material.opacity=.45*(1-k)*Math.min(1,k*5); }
}
function teamFlag(g, color, x, y, z, h){
  const pole = mesh(GEO.box, mat(0x5a3818), x, y+h/2, z); pole.scale.set(.08,h,.08); g.add(pole);
  const flag = new T.Mesh(clothGeo(.75,.45), clothMat({color})); flag.position.set(x+.04, y+h-.27, z); flag.castShadow=true; g.add(flag);
  return flag;
}

/* ---------- Objekte anlegen ---------- */
const cellIdx = (x,z) => { const i=Math.floor(x+G.NX/2), j=Math.floor(z+G.NZ/2); if(i<0||j<0||i>=G.NX||j>=G.NZ) return -1; const ti=(i/TILE)|0, tj=(j/TILE)|0; if(!G.tiles[tj*G.tnx+ti]) ensureTile(ti,tj); return j*G.NX+i; };
function freeCell(x,z){ const k=cellIdx(x,z); return k>=0 && !G.grid[k]; }

// Bäume brauchen Abstand zueinander (Lücken im Wald, Kronen überlappen nicht zu stark)
const TREE_GAP = 3.4;
function treeTooClose(x,z){ if(!G.treeHash) G.treeHash=new Map(); const ci=Math.floor(x/4), cj=Math.floor(z/4);
  for(let j=cj-1;j<=cj+1;j++) for(let i=ci-1;i<=ci+1;i++){ const a=G.treeHash.get(i+','+j); if(a) for(let k=0;k<a.length;k+=2){ if(Math.hypot(a[k]-x,a[k+1]-z)<TREE_GAP) return true; } } return false; }
function treeMark(x,z){ const key=Math.floor(x/4)+','+Math.floor(z/4); let a=G.treeHash.get(key); if(!a) G.treeHash.set(key,a=[]); a.push(x,z); }
function placeCluster(type, cx, cz, count, spread, minB){
  const R = G.rand;
  for(let i=0,tries=0;i<count && tries<count*6;tries++){
    const a=R()*6.28, r=Math.sqrt(R())*spread;
    const x=Math.round(cx+Math.cos(a)*r)+.5, z=Math.round(cz+Math.sin(a)*r)+.5;
    if(!freeCell(x,z)) continue;
    if(G.bases.some(b=>Math.hypot(b.x-x,b.z-z)<(minB||6.5))) continue;
    if(getH(x,z)<WATER_Y+.3) continue;
    if(type==='tree' && treeTooClose(x,z)) continue;
    addRes(type,x,z); i++;
    if(type==='tree') treeMark(x,z);
  }
}
function addRes(type,x,z){
  let m, kind, amt;
  if(type.startsWith('tree')){ m=treeInstance(x,z,type.split(':')[1]); kind='wood'; amt=100; type='tree'; }
  else if(type==='bush'){ m=makeBush(G.rand); kind='food'; amt=125; }
  else if(type==='stone'){ m=makeRock(G.rand,'stone'); kind='stone'; amt=250; }
  else if(type==='gold'){ m=makeRock(G.rand,'gold'); kind='gold'; amt=250; }
  else if(type==='metal'){ m=makeRock(G.rand,'metal'); kind='metal'; amt=400; }
  else { m=makeOil(G.rand); kind='oil'; amt=1000; }
  m.position.set(x, getH(x,z), z);
  if(!m.inst) G.scene.add(m);
  const r = {type, kind, amt, max:amt, x, z, mesh:m, alive:true, r:.6};
  G.grid[cellIdx(x,z)] = 1;
  G.res.push(r);
  if(G.resMod){ const k=resKey(x,z); if(k in G.resMod){ r.amt=G.resMod[k]; if(r.amt<=0) removeRes(r); } }
  return r;
}
function spawnDeer(x,z,kind){
  if(!freeCell(x,z) || getH(x,z)<WATER_Y+.3) return;
  if(!kind){ const lon=toLon(x), lat=toLat(z), africa = lon>-20 && lon<55 && lat<33, warm = Math.abs(lat)<28;
    kind = G.rand()<.35 ? 'rabbit' : (africa||warm) ? 'antelope' : 'horse'; }
  const m = makeDeer(kind); m.position.set(x,getH(x,z),z); m.rotation.y = G.rand()*6.28;
  G.scene.add(m);
  const rab = kind==='rabbit', amt = rab?35:kind==='horse'?160:120;
  const d = {type:'deer', animal:kind, kind:'food', amt, max:amt, x, z, mesh:m, alive:true, dead:false, r:rab?.3:.5,
             tx:x, tz:z, wait:G.rand()*4, phase:G.rand()*6, deer:true, speed:rab?2.4:kind==='horse'?1.9:1.5};
  G.deer.push(d); G.res.push(d);
}
function spawnWorker(owner,x,z,kind){
  kind = kind||'worker';
  const m = (kind==='worker'||kind==='kid') ? makeWorker(COLORS[owner]) : makeSoldier(kind, COLORS[owner]);
  m.position.set(x,getH(x,z),z);
  G.scene.add(m);
  const ring = new T.Mesh(GEO.ring, new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.6, depthWrite:false}));
  ring.visible=false; G.scene.add(ring);
  const U = UNIT[kind];
  const u = {kind, hp:U.hp, maxHp:U.hp, cd:0, sex:(m.userData.key==='cavef'?'f':'m'), owner, x, z, mesh:m, ring, state:'idle', path:null, pi:0, carry:{type:null,amt:0},
             target:null, site:null, speed:U.speed, phase:Math.random()*6, face:0, repath:0, gt:0, lastType:null};
  if(G.farView) m.visible=false;
  G.units.push(u);
  G.players[owner].pop++;
  return u;
}
function footprint(kind,x,z){
  const s = BUILD[kind].size, cells=[];
  const x0 = Math.round(x - s/2), z0 = Math.round(z - s/2);
  for(let j=0;j<s;j++) for(let i=0;i<s;i++) cells.push(cellIdx(x0+i+.5, z0+j+.5));
  return {cells, cx:x0+s/2, cz:z0+s/2};
}
function addBuilding(kind, owner, x, z, done){
  const fp = footprint(kind,x,z);
  const d = BUILD[kind], col = COLORS[owner];
  const m = kind==='tc'?makeTC(col, G.players[owner] && G.players[owner].civ, owner):kind==='house'?makeHouse(col, owner):kind==='barracks'?makeBarracks(col, owner):kind==='tower'?makeTower(col, owner):makeStore(col, owner);
  let hy = 0; for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1],[0,0]]) hy += getH(fp.cx+dx*d.size/2*.8, fp.cz+dz*d.size/2*.8);
  m.position.set(fp.cx, hy/5-.05, fp.cz);
  G.scene.add(m);
  for(const k of fp.cells) if(k>=0) G.grid[k]=1;
  const ring = new T.Mesh(new T.RingGeometry(d.size*.62, d.size*.7, 32), new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.85, depthWrite:false}));
  ring.rotation.x = -Math.PI/2; ring.position.set(fp.cx, m.position.y+.08, fp.cz); ring.visible=false; G.scene.add(ring);
  const b = {kind, owner, x:fp.cx, z:fp.cz, size:d.size, mesh:m, ring, cells:fp.cells, built:done?1:0, hp:done?d.hp:1, queue:[], qT:0, slow:!done && kind!=='tc' && kind!=='road' && G.reg && !friendlyLand(owner,fp.cx,fp.cz)};
  if(!done){ m.scale.y = .25; m.traverse(o=>{ if(o.material && o.isMesh){ o.material = o.material.clone(); o.material.transparent=true; o.material.opacity=.55; } }); }
  else if(d.pop) G.players[owner].popCap += d.pop;
  G.builds.push(b);
  if(kind==='tc' && G.borderGrp){ if(done) claimRegion(b); buildBorders(); }
  return b;
}

// Bodenbewuchs: Grasbüschel, Blumen, Sträucher und Steinchen – alles instanziert (billig zu zeichnen)
let TUFT_GEO=null, TUFT_MAT=null, FLOWER_GEO=null, FLOWER_MAT=null, PEBBLE_GEO=null, PEBBLE_MAT=null;
function decorAssets(){
  if(TUFT_GEO) return;
  const P=[], C=[], N=[];
  for(let k=0;k<7;k++){ const a=k/7*6.283+Math.random()*.5, r=.05+Math.random()*.1, h=.28+Math.random()*.3, lean=.12+Math.random()*.15;
    const bx=Math.cos(a)*r, bz=Math.sin(a)*r, px=-Math.sin(a)*.035, pz=Math.cos(a)*.035, tx=bx+Math.cos(a)*lean, tz=bz+Math.sin(a)*lean;
    P.push(bx-px,0,bz-pz, bx+px,0,bz+pz, tx,h,tz); C.push(.35,.5,.2, .35,.5,.2, .9,1,.6); N.push(0,1,0, 0,1,0, 0,1,0); }
  TUFT_GEO=new T.BufferGeometry(); TUFT_GEO.setAttribute('position',new T.Float32BufferAttribute(P,3)); TUFT_GEO.setAttribute('color',new T.Float32BufferAttribute(C,3)); TUFT_GEO.setAttribute('normal',new T.Float32BufferAttribute(N,3));
  TUFT_MAT=new T.MeshLambertMaterial({vertexColors:true, side:T.DoubleSide});
  FLOWER_GEO=new T.IcosahedronGeometry(.07,0); FLOWER_MAT=new T.MeshBasicMaterial({color:0xffffff});
  PEBBLE_GEO=new T.DodecahedronGeometry(.18,0); PEBBLE_GEO.scale(1,.55,1); PEBBLE_MAT=new T.MeshLambertMaterial({color:0x8d8a84});
}
function addDecorChunk(x0,z0,CH,R){
  decorAssets();
  const nT=[110,300,480][G.gfx], nS=[6,16,24][G.gfx], nP=[12,30,45][G.gfx];
  const F=flora();
  const BT=batch('d:tuft',TUFT_GEO,TUFT_MAT,{decor:true}), BF=batch('d:fl',FLOWER_GEO,FLOWER_MAT,{decor:true}), BS=batch('d:shrub',F.geo.bush[0],F.mat,{decor:true,shadow:true,depth:F.depth}), BP=batch('d:peb',PEBBLE_GEO,PEBBLE_MAT,{decor:true});
  const ck=chunkKeyOf(x0+CH/2, z0+CH/2);
  const m4=new T.Matrix4(), q=new T.Quaternion(), sv=new T.Vector3(), p=new T.Vector3(), e=new T.Euler(), c=new T.Color();
  const fcols=[0xfff1a8,0xff9fc4,0xb9a3ff,0xffffff,0xffd36b]; let gi=0, si=0, pi=0;
  for(let k=0;k<nT*2 && gi<nT;k++){
    const x=x0+R()*CH, z=z0+R()*CH, h=getH(x,z);
    if(h<WATER_Y+.35 || h>WATER_Y+13) continue;
    const lon=toLon(x), lat=toLat(z), ds=desertAt(lon,lat), cold=coldAt(lat); if(cold>.75) continue;
    if(G.bases.some(b=>Math.hypot(b.x-x,b.z-z)<6)) continue;
    if(ds>.5 && R()<.75) continue;
    e.set(0,R()*6.28,0); q.setFromEuler(e); const sc=.8+R()*.9; sv.set(sc,sc*(.8+R()*.5),sc); p.set(x,h-.02,z);
    m4.compose(p,q,sv);
    const v=.8+R()*.35; if(ds>.3) c.setRGB(1.3*v,1.1*v,.55*v); else if(h>WATER_Y+6) c.setRGB(.85*v,.95*v,.7*v); else c.setRGB(v*(.9+R()*.15), v, v*.85);
    batchAdd(BT, ck, m4, c); gi++;
    if(ds<.3 && h<WATER_Y+8 && R()<.2){ p.set(x+.1,h+.25,z+.08); sv.set(1,1,1); m4.compose(p,q,sv); batchAdd(BF, ck, m4, c.setHex(fcols[(R()*5)|0])); }
    if(si<nS && ds<.4 && R()<.03){ e.set(0,R()*6.28,0); q.setFromEuler(e); const s2=.45+R()*.35; sv.set(s2,s2*(.8+R()*.4),s2); p.set(x,h-.05,z); m4.compose(p,q,sv); batchAdd(BS, ck, m4, c.setRGB(1,1,1)); si++; }
    if(pi<nP && R()<.05){ e.set(R(),R()*6.28,R()); q.setFromEuler(e); const s3=.4+R()*1.1; sv.set(s3,s3,s3); p.set(x,h,z); m4.compose(p,q,sv); batchAdd(BP, ck, m4, c.setRGB(1,1,1)); pi++; }
  }
}

/* ============================================================
   WEGFINDUNG (A*)
   ============================================================ */
function nearestFree(i,j){
  const NX=G.NX, NZ=G.NZ;
  ensureArea(i-NX/2-14, j-NZ/2-14, i-NX/2+14, j-NZ/2+14);
  for(let r=0;r<14;r++){
    let best=-1, bd=1e9;
    for(let dj=-r;dj<=r;dj++) for(let di=-r;di<=r;di++){
      if(Math.max(Math.abs(di),Math.abs(dj))!==r) continue;
      const a=i+di, b=j+dj; if(a<0||b<0||a>=NX||b>=NZ) continue;
      if(!G.grid[b*NX+a]){ const d=di*di+dj*dj; if(d<bd){bd=d;best=b*NX+a;} }
    }
    if(best>=0) return best;
  }
  return -1;
}
function findPath(x0,z0,x1,z1){
  const NX=G.NX, NZ=G.NZ, PW=G.pfW;
  // Ziel zu weit weg: Zwischenziel in Richtung des Ziels (der Rest wird später neu berechnet)
  const dd=Math.hypot(x1-x0,z1-z0), maxR=PW/2-30;
  if(dd>maxR){ const k=maxR/dd; x1=x0+(x1-x0)*k; z1=z0+(z1-z0)*k; }
  let s = cellIdx(x0,z0), t = cellIdx(x1,z1);
  if(s<0||t<0) return null;
  if(G.grid[s]) s = nearestFree(s%NX, (s/NX)|0);
  if(G.grid[t]) t = nearestFree(t%NX, (t/NX)|0);
  if(s<0||t<0) return null;
  if(s===t) return [[x1,z1]];
  const si=s%NX, sj=(s/NX)|0, ti=t%NX, tj=(t/NX)|0;
  const ox = clamp(Math.round((si+ti)/2)-PW/2, 0, Math.max(0,NX-PW)), oz = clamp(Math.round((sj+tj)/2)-PW/2, 0, Math.max(0,NZ-PW));
  ensureArea(ox-NX/2, oz-NZ/2, ox+PW-1-NX/2, oz+PW-1-NZ/2);
  const L = (i,j)=> (j-oz)*PW+(i-ox);
  const st = ++G.pfStamp, g=G.pfG, from=G.pfF, seen=G.pfS, closed=G.pfC;
  const heap = [], hp = (k,f)=>{ heap.push([f,k]); let i=heap.length-1; while(i>0){ const p=(i-1)>>1; if(heap[p][0]<=heap[i][0]) break; [heap[p],heap[i]]=[heap[i],heap[p]]; i=p; } };
  const pop = ()=>{ const top=heap[0], last=heap.pop(); if(heap.length){ heap[0]=last; let i=0; for(;;){ const l=i*2+1, r=l+1; let m=i; if(l<heap.length&&heap[l][0]<heap[m][0]) m=l; if(r<heap.length&&heap[r][0]<heap[m][0]) m=r; if(m===i) break; [heap[m],heap[i]]=[heap[i],heap[m]]; i=m; } } return top; };
  const hfun = (i,j) => { const dx=Math.abs(i-ti), dz=Math.abs(j-tj); return (dx+dz)+(1.414-2)*Math.min(dx,dz); };
  const ls=L(si,sj); g[ls]=0; seen[ls]=st; from[ls]=-1; hp(ls,hfun(si,sj));
  let it=0, found=-1, best=ls, bestH=hfun(si,sj);
  while(heap.length && it++<40000){
    const [,lk] = pop(); if(closed[lk]===st) continue; closed[lk]=st;
    const ki=lk%PW+ox, kj=((lk/PW)|0)+oz;
    if(ki===ti && kj===tj){ found=lk; break; }
    for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++){
      if(!di&&!dj) continue;
      const a=ki+di, b=kj+dj; if(a<ox||b<oz||a>=ox+PW||b>=oz+PW||a>=NX||b>=NZ) continue;
      if(G.grid[b*NX+a]) continue;
      if(di&&dj && (G.grid[kj*NX+a]||G.grid[b*NX+ki])) continue;
      const nl=L(a,b); if(closed[nl]===st) continue;
      const ng = g[lk] + (di&&dj?1.414:1)*(G.road[b*NX+a]?.62:1);
      if(seen[nl]!==st || ng<g[nl]){ seen[nl]=st; g[nl]=ng; from[nl]=lk; const hh=hfun(a,b); hp(nl, ng+hh); if(hh<bestH){bestH=hh;best=nl;} }
    }
  }
  let k = found>=0 ? found : best; const pts=[];
  while(k!==ls && k>=0){ pts.push([k%PW+ox-NX/2+.5, ((k/PW)|0)+oz-NZ/2+.5]); k=from[k]; }
  pts.reverse();
  const out=[]; let cx=x0, cz=z0, i=0;
  while(i<pts.length){
    let j=Math.min(pts.length-1, i+40);
    while(j>i && !lineFree(cx,cz,pts[j][0],pts[j][1])) j--;
    out.push(pts[j]); cx=pts[j][0]; cz=pts[j][1]; i=j+1;
  }
  if(found>=0 && !G.grid[cellIdx(x1,z1)]) { if(out.length) out[out.length-1]=[x1,z1]; }
  return out;
}
function lineFree(x0,z0,x1,z1){
  const d=Math.hypot(x1-x0,z1-z0), n=Math.ceil(d*2.5);
  for(let i=1;i<n;i++){ const t=i/n; if(G.grid[cellIdx(lerp(x0,x1,t),lerp(z0,z1,t))]) return false; }
  return true;
}

/* ============================================================
   EINHEITEN-LOGIK
   ============================================================ */
// Wegsuche mit Zeitbudget pro Bild: viele Befehle auf einmal lassen das Spiel nicht mehr ruckeln
function moveTo(u,x,z){
  if(!G.pfDeadline || performance.now() < G.pfDeadline){ u.pfWait=null; u.path = findPath(u.x,u.z,x,z); u.pi=0; return !!u.path; }
  u.pfWait={x,z}; u.path=null; u.pi=0; return true;
}
function cmdMove(u,x,z){ u.state='move'; u.target=null; u.site=null; u.goal={x,z,tries:0}; moveTo(u,x,z); }
function cmdGather(u,r){
  u.target=r; u.site=null; u.lastType=r.kind;
  if(u.carry.amt>0 && u.carry.type!==r.kind){ u.carry.amt=0; }
  u.state = r.deer && !r.dead ? 'hunt' : 'gather';
  moveTo(u,r.x,r.z);
}
function cmdBuild(u,b){ u.state='build'; u.site=b; u.target=null; moveTo(u,b.x,b.z); }
function dropoffFor(u){
  let best=null, bd=1e9;
  for(const b of G.builds){ if(b.owner!==u.owner||b.built<1) continue; const d=BUILD[b.kind]; if(!d.drop||d.drop.indexOf(u.carry.type)<0) continue;
    const dd=Math.hypot(b.x-u.x,b.z-u.z); if(dd<bd){bd=dd;best=b;} }
  return best;
}
function nearestRes(kind,x,z,maxD,owner){
  let best=null, bd=maxD||1e9;
  for(const r of G.res){ if(!r.alive||r.kind!==kind||r.amt<=0) continue; if(r.deer && !r.dead && kind!=='food') continue;
    const d=Math.hypot(r.x-x,r.z-z); if(d<bd){bd=d;best=r;} }
  return best;
}
function followPath(u,dt){
  if(!u.path || u.pi>=u.path.length) return true;
  const [tx,tz] = u.path[u.pi];
  const dx=tx-u.x, dz=tz-u.z, d=Math.hypot(dx,dz);
  const ck = cellIdx(u.x,u.z), step = u.speed*dt*(ck>=0 && G.road[ck] ? 1.5 : 1);
  if(d<=step+.05){ u.x=tx; u.z=tz; u.pi++; return u.pi>=u.path.length; }
  u.x += dx/d*step; u.z += dz/d*step; u.face = Math.atan2(dx,dz); u.moving=true;
  return false;
}
function near(u,x,z,r){ return Math.hypot(u.x-x,u.z-z)<=r; }

function updateWorker(u,dt){
  if(u.dead) return;
  const p = G.players[u.owner];
  u.moving=false; u.working=false;
  const gatherRate = (u.owner===0 && G.civ[0]==='Chinesen') ? 1.15 : 1;
  if(u.inside && u.inside.kind==='tower'){ updateTowerCrew(u,dt); u.ring.visible=false; return; }
  if(isSoldier(u)){ u.scanT=(u.scanT||0)-dt; if(u.scanT<=0){ u.scanT=.5; if(u.state==='idle'){ const f=nearestFoe(u, UNIT[u.kind].ranged?10:7); if(f) cmdAttack(u,f); } } }
  if(u.inside){ u.x=u.inside.x; u.z=u.inside.z; u.mesh.position.set(u.x,-100,u.z); u.ring.visible=false; if(u.inside.dead){ u.inside=null; } return; }
  if(u.kind==='kid') updateKid(u,dt);
  else if(u.homeless && u.kind==='worker' && u.state!=='idle' && u.state!=='move'){ u.state='idle'; u.path=null; }
  if(u.pfWait && performance.now() < G.pfDeadline){ const w=u.pfWait; u.pfWait=null; u.path=findPath(u.x,u.z,w.x,w.z); u.pi=0; }
  if(!u.pfWait) switch(u.state){
    case 'garrison': {
      const b=u.site; if(!b || b.dead){ u.state='idle'; u.site=null; break; }
      if(near(u,b.x,b.z,b.size*.5+1.4)){ enterTower(u,b); break; }
      u.repath-=dt; if(!u.path || u.pi>=u.path.length){ if(u.repath<=0){ u.repath=1; moveTo(u,b.x,b.z); } }
      followPath(u,dt); break; }
    case 'attack': {
      if(u.target && u.target.inside && u.target.inside.kind==='tower') u.target=u.target.inside;
      const t=u.target; if(!alive(t)){ u.target=null; u.state='idle'; break; }
      const U=UNIT[u.kind], d=Math.hypot(t.x-u.x,t.z-u.z)-(t.size?t.size*.5+.2:.35);
      if(d<=U.range){ u.path=null; u.working=true; u.face=Math.atan2(t.x-u.x,t.z-u.z); u.cd-=dt; if(u.cd<=0){ u.cd=U.cd; hit(u,t); } }
      else { u.repath-=dt; if(u.repath<=0 || !u.path || u.pi>=u.path.length){ u.repath=.7; moveTo(u,t.x,t.z); } followPath(u,dt); }
      break; }
    case 'move':
      if(followPath(u,dt)){ const gl=u.goal; if(gl && Math.hypot(gl.x-u.x,gl.z-u.z)>2 && gl.tries++<40){ moveTo(u,gl.x,gl.z); } else u.state='idle'; }
      break;
    case 'hunt': {
      const r = u.target;
      if(!r||!r.alive){ u.state='idle'; break; }
      if(r.dead){ u.state='gather'; moveTo(u,r.x,r.z); break; }
      r.hunted = 1.5;
      u.repath -= dt;
      if(u.repath<=0){ u.repath=.8; moveTo(u,r.x,r.z); }
      followPath(u,dt);
      if(near(u,r.x,r.z,1.5)){ sfxAt('deer',r.x,r.z); r.dead=true; r.mesh.rotation.z=Math.PI/2; r.mesh.position.y=getH(r.x,r.z)+(r.mesh.userData.deadY!=null?r.mesh.userData.deadY:.25); if(r.mesh.quad) poseAnimal(r.mesh,'idle',0); if(u.owner===0) EE.vib(20); u.state='gather'; }
      break; }
    case 'gather': {
      let r = u.target;
      if(!r || !r.alive || r.amt<=0){
        r = nearestRes(u.lastType||'wood', u.x, u.z, 14, u.owner);
        if(r){ cmdGather(u,r); } else { u.state = u.carry.amt>0 ? 'drop' : 'idle'; u.path=null; }
        break;
      }
      if(near(u,r.x,r.z,r.r+.85)){
        u.path=null; u.working=true; u.face=Math.atan2(r.x-u.x,r.z-u.z);
        u.hitT=(u.hitT||0)+dt; if(u.hitT>1.05){ u.hitT=0; sfxAt(r.kind==='wood'?'chop':r.kind==='stone'?'stone':r.kind==='gold'?'gold':'berry', u.x,u.z,.8); }
        const amount = Math.min(r.amt, dt*(r.kind==='wood'?1:r.kind==='food'?1.15:.8)*gatherRate);
        r.amt -= amount; u.carry.type=r.kind; u.carry.amt += amount;
        if(r.deer) r.mesh.scale.setScalar(.5+.5*r.amt/r.max);
        if(r.amt<=0) removeRes(r);
        if(u.carry.amt>=CARRY){ u.state='drop'; u.path=null; }
      } else {
        if(!u.path || u.pi>=u.path.length){ u.repath-=dt; if(u.repath<=0){ u.repath=1; if(!moveTo(u,r.x,r.z)){ u.state='idle'; } } }
        followPath(u,dt);
      }
      break; }
    case 'drop': {
      const b = dropoffFor(u);
      if(!b){ u.state='idle'; break; }
      if(near(u,b.x,b.z,b.size*.5+1.1)){
        p.res[u.carry.type] += u.carry.amt; b.recv=b.recv||{}; b.recv[u.carry.type]=(b.recv[u.carry.type]||0)+u.carry.amt; u.carry.amt=0; u.path=null; if(G.selB===b) drawPanelSoon();
        if(u.owner===0) updateHUD();
        const r = (u.target && u.target.alive && u.target.amt>0) ? u.target : nearestRes(u.lastType, u.x,u.z, 16, u.owner);
        if(r) cmdGather(u,r); else u.state='idle';
      } else {
        if(!u.path || u.pi>=u.path.length){ moveTo(u,b.x,b.z); }
        followPath(u,dt);
      }
      break; }
    case 'build': {
      const b = u.site;
      if(!b || b.dead || (b.built>=1 && b.hp>=BUILD[b.kind].hp)){ u.state='idle'; autoJob(u); break; }
      if(near(u,b.x,b.z,b.size*.5+1.1)){
        u.path=null; u.working=true; u.face=Math.atan2(b.x-u.x,b.z-u.z);
        u.hitT=(u.hitT||0)+dt; if(u.hitT>.9){ u.hitT=0; sfxAt('build',u.x,u.z,.8); }
        if(b.built>=1){ b.hp = Math.min(BUILD[b.kind].hp, b.hp + dt*BUILD[b.kind].hp/BUILD[b.kind].time*.5); if(G.selB===b && u.owner===0) drawPanelSoon(); break; } // reparieren
        b.built = Math.min(1, b.built + dt/BUILD[b.kind].time/(b.slow?3:1));
        b.hp = Math.max(1, BUILD[b.kind].hp*b.built);
        if(b.kind==='road') b.mesh.children[0].material.opacity=.35+.6*b.built; else b.mesh.scale.y = .25 + .75*b.built;
        if(b.built>=1) finishBuilding(b);
        if(G.selB===b && u.owner===0) drawPanelSoon();
      } else {
        if(!u.path || u.pi>=u.path.length){ moveTo(u,b.x,b.z); }
        followPath(u,dt);
      }
      break; }
  }
  // Separation
  for(const o of G.units){ if(o===u) continue; const dx=u.x-o.x, dz=u.z-o.z, d2=dx*dx+dz*dz;
    if(d2<.36 && d2>1e-5){ const d=Math.sqrt(d2), push=(.6-d)*.5; const nx=u.x+dx/d*push, nz=u.z+dz/d*push; if(freeCell(nx,nz)){ u.x=nx; u.z=nz; } } }
  // Darstellung
  const m = u.mesh; m.position.set(u.x, getH(u.x,u.z), u.z);
  let df = u.face - m.rotation.y; df = Math.atan2(Math.sin(df),Math.cos(df)); m.rotation.y += df*Math.min(1,dt*10);
  u.phase += dt*(u.moving?8.5:u.working?6:2);
  if(m.isRigged){ const shoot = u.working && UNIT[u.kind] && UNIT[u.kind].ranged; if(m.bowK) setBowSlot(m, shoot); if(!G.farView && m.visible) poseRig(m, u.moving?'walk':shoot?'shoot':u.working?'work':'idle', shoot ? 1-clamp(u.cd/UNIT[u.kind].cd,0,1) : u.phase); }
  else {
  const sw = u.moving ? Math.sin(u.phase)*.7 : 0;
  m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
  m.arms[0].rotation.x = -sw*.8;
  m.arms[1].rotation.x = u.working ? -1.4+Math.sin(u.phase)*.9 : sw*.8;
  m.club.rotation.x = u.working ? .6+Math.sin(u.phase)*.9 : .6;
  }
  m.load.visible = u.carry.amt>0.5;
  if(m.load.visible) m.load.material = mat(LOADCOL[u.carry.type]);
  u.ring.position.set(u.x, m.position.y+.06, u.z); u.ring.scale.setScalar(1);
  updateBar(u);
}
let panelT = 0; function drawPanelSoon(){ panelT = .25; }
function sfxAt(name, x, z, v){ if(!G || G.farView) return; const d=Math.hypot(x-G.camS.x, z-G.camS.z); const k=clamp(1-d/(G.camS.dist*.9+6),0,1); if(k>0) EE.sfx(name, (v||1)*k*k); }

function autoJob(u){
  const r = nearestRes(u.lastType||'food', u.x,u.z, 14, u.owner) || nearestRes('wood', u.x,u.z, 20, u.owner);
  if(r) cmdGather(u,r);
}
function removeRes(r){
  r.alive=false; G.scene.remove(r.mesh);
  if(r.mesh.inst) batchHide(r.mesh.inst);
  if(!r.deer){ const k=cellIdx(r.x,r.z); if(k>=0) G.grid[k]=0; }
}
function finishBuilding(b){
  const d = BUILD[b.kind];
  b.built=1; b.hp=d.hp; b.mesh.scale.y=1;
  if(b.kind==='road'){ for(const k of b.roadCells) G.road[k]=1; b.mesh.traverse(o=>{ if(o.isMesh) o.material.opacity=1; }); }
  else b.mesh.traverse(o=>{ if(o.isMesh && o.material && o.material.transparent && o.material.opacity<.6){ o.material.opacity=1; o.material.transparent=false; } });
  if(d.pop) G.players[b.owner].popCap += d.pop;
  if(b.kind==='tc'){ const p=G.players[b.owner]; if(!p.tc) p.tc=b; claimRegion(b); buildBorders(); if(b.owner===0 && G.t>5){ EE.toast('Dein Gebiet ist gewachsen!'); EE.sfx('fanfare',.7); } }
  if(b.wallId){
    for(const u of G.units) if(u.site===b){ const next=G.builds.filter(o=>o.wallId===b.wallId && o.built<1).sort((p,q)=>Math.hypot(p.x-u.x,p.z-u.z)-Math.hypot(q.x-u.x,q.z-u.z))[0];
      if(next) cmdBuild(u,next); else { u.site=null; u.state='idle'; autoJob(u); } }
    if(!G.quiet && b.owner===0 && !G.builds.some(o=>o.wallId===b.wallId && o.built<1)){ EE.toast(b.kind==='road'?'Weg fertig – hier laufen alle schneller':'Palisade fertig gebaut'); EE.vib(25); EE.sfx('done',.8); }
    return;
  }
  if(G.quiet) return;
  if(b.owner===0){ EE.toast(d.name+' fertig gebaut'); EE.vib(25); EE.sfx('done',.8); updateHUD(); }
  for(const u of G.units) if(u.site===b){ u.site=null; u.state='idle'; autoJob(u); }
}

function updateDeer(d,dt){
  if(!d.alive) return;
  const m = d.mesh;
  if(d.dead){ return; }
  if(d.hunted>0){ d.hunted-=dt; }
  d.wait -= dt;
  let moving=false;
  if(d.wait<=0){
    const dx=d.tx-d.x, dz=d.tz-d.z, dist=Math.hypot(dx,dz);
    if(dist<.2){ d.wait = 2+G.rand()*5; const a=G.rand()*6.28, r=2+G.rand()*4; const nx=d.x+Math.cos(a)*r, nz=d.z+Math.sin(a)*r; if(freeCell(nx,nz) && lineFree(d.x,d.z,nx,nz)){ d.tx=nx; d.tz=nz; } }
    else { const sp=(d.speed||1.5)*(d.hunted>0?.8:1)*dt; d.x+=dx/dist*Math.min(sp,dist); d.z+=dz/dist*Math.min(sp,dist); m.rotation.y=Math.atan2(dx,dz); moving=true; }
  }
  d.phase += dt*(moving?10:1);
  m.position.set(d.x, getH(d.x,d.z), d.z);
  if(m.quad){ if(!moving && d.wait>0) d.graze = d.graze ?? (G.rand()<.6); if(moving) d.graze=null; if(m.visible) poseAnimal(m, moving?'move':(d.graze?'graze':'idle'), d.phase); return; }
  const s = moving?Math.sin(d.phase)*.5:0;
  m.legs[0].rotation.x=s; m.legs[3].rotation.x=s; m.legs[1].rotation.x=-s; m.legs[2].rotation.x=-s;
}

// Fortschrittsbalken über dem Gebäude: Bau (orange) oder Ausbildung (blau)
function updateBBar(b){
  let f=-1, col=0x4fb3ff;
  if(b.built<1){ f=b.built; col=0xf2a630; }
  else if(b.queue.length){ const qk=b.queue[0]; f=b.qT/(qk==='worker'?WORKER_TIME:UNIT[qk].time); }
  const show = f>=0 && !G.farView && b.owner===0;
  if(!show){ if(b.bar) b.bar.visible=false; return; }
  const W=Math.max(2.2,b.size*.55);
  if(!b.bar){ const g=new T.Group();
    const bg=new T.Sprite(new T.SpriteMaterial({color:0x111111, depthTest:false, transparent:true, opacity:.85})); bg.scale.set(W+.12,.3,1);
    const fg=new T.Sprite(new T.SpriteMaterial({color:0x4fb3ff, depthTest:false})); fg.center.set(0,.5); fg.scale.set(W,.2,1); fg.position.x=-W/2;
    bg.renderOrder=8; fg.renderOrder=9; g.add(bg); g.add(fg); g.fg=fg; b.bar=g; G.scene.add(g); }
  b.bar.visible=true; b.bar.position.set(b.x, b.mesh.position.y + (b.kind==='tc'?5.2:b.size*.9+1), b.z);
  b.bar.quaternion.copy(G.cam.quaternion);
  b.bar.fg.scale.x=Math.max(.001,W*clamp(f,0,1)); b.bar.fg.material.color.setHex(col);
  if(G.selB===b){ const el=document.querySelector('#panel .bar div'); if(el) el.style.width=(clamp(f,0,1)*100).toFixed(1)+'%'; }
}
// Lager füllen sich sichtbar: Haufen aus Holzstämmen, Steinen, Goldbrocken und Beeren-/Fleischvorrat
// wachsen und schrumpfen mit dem Vorrat des Volkes
const PILE = {types:['wood','stone','gold','food'], step:{wood:40,stone:30,gold:20,food:40}, max:14};
function pileGeo(){
  if(PILE.geo) return;
  const log=new T.CylinderGeometry(.11,.11,1.1,7); log.rotateZ(Math.PI/2);
  PILE.geo={wood:log, stone:new T.DodecahedronGeometry(.2,0), gold:new T.DodecahedronGeometry(.13,0), food:new T.SphereGeometry(.16,7,5)};
  PILE.mat={wood:new T.MeshLambertMaterial({color:0x8a5a2e}), stone:new T.MeshLambertMaterial({color:0x9aa0a6, flatShading:true}), gold:new T.MeshLambertMaterial({color:0xf2c230, emissive:0x3a2a00, flatShading:true}), food:new T.MeshLambertMaterial({color:0xb5262e})};
}
function pileSlot(type, i){
  // Haufen stapeln: unten breit, nach oben enger
  const layer = i<6?0:i<10?1:i<13?2:3, k = layer===0?i:layer===1?i-6:layer===2?i-10:0, per=[6,4,3,1][layer];
  if(type==='wood') return [ (k-(per-1)/2)*.0, .11+layer*.2, (k-(per-1)/2)*.23, 0 ];
  const a=k/per*6.28+layer*.5, r=[.38,.26,.14,0][layer]; return [Math.cos(a)*r, .12+layer*.17, Math.sin(a)*r, a];
}
function updatePiles(b){
  if(b.built<1 || b.dead || !BUILD[b.kind].drop) return;
  pileGeo(); const p=G.players[b.owner];
  if(!b.piles){ b.piles={}; const off=b.size*.5+.9;
    const spots={wood:[off,-off*.45], stone:[off,off*.45], gold:[-off,off*.45], food:[-off,-off*.45]};
    for(const t of PILE.types){ const im=new T.InstancedMesh(PILE.geo[t], PILE.mat[t], PILE.max); im.castShadow=G.gfx>0; im.receiveShadow=true; im.count=0;
      const [sx,sz]=spots[t]; im.position.set(b.x+sx, getH(b.x+sx,b.z+sz)-.02, b.z+sz); im.userData.n=-1; G.scene.add(im); b.piles[t]=im; } }
  for(const t of PILE.types){ const im=b.piles[t], n=Math.min(PILE.max, Math.floor((p.res[t]||0)/PILE.step[t]));
    if(im.userData.n===n) continue; im.userData.n=n; im.count=n;
    const m4=new T.Matrix4(), q=new T.Quaternion(), e=new T.Euler(), sc=new T.Vector3(1,1,1), ps=new T.Vector3(), R=rng(b.x*7+b.z*13+t.length);
    for(let i=0;i<n;i++){ const [x,y,z,a]=pileSlot(t,i); ps.set(x+(R()-.5)*.06,y,z+(R()-.5)*.06); e.set(t==='wood'?0:R()*3, t==='wood'?(R()-.5)*.15:R()*6, t==='wood'?0:R()*3); q.setFromEuler(e); const s=t==='wood'?1:.8+R()*.4; sc.set(s,s,s); m4.compose(ps,q,sc); im.setMatrixAt(i,m4); }
    im.instanceMatrix.needsUpdate=true; }
}
function removePiles(b){ if(b.piles){ for(const t in b.piles) G.scene.remove(b.piles[t]); b.piles=null; } }
function updateBuilding(b,dt){
  b.pileT=(b.pileT||0)-dt; if(b.pileT<=0){ b.pileT=1; updatePiles(b); }
  if(b.owner===0) updateBBar(b);
  if(b.kind==='tc' && b.mesh.fireFx && !G.farView) animateFire(b.mesh.fireFx, G.t+b.x, dt);

  if(b.built<1 || !b.queue.length) return;
  const p = G.players[b.owner];
  if(p.pop>=p.popCap){ if(b.owner===0 && !b.warned){ EE.toast('Zu wenig Platz – baue eine Hütte'); b.warned=true; } return; }
  b.warned=false;
  b.qT += dt*trainMul(b);
  const qk = b.queue[0], qtime = qk==='worker' ? WORKER_TIME : UNIT[qk].time;
  if(b.qT>=qtime){
    b.qT=0; b.queue.shift();
    const a = G.rand()*6.28, x=b.x+Math.cos(a)*4.3, z=b.z+Math.sin(a)*4.3;
    const k = cellIdx(x,z); const NX=G.NX, NZ=G.NZ;
    let sx=x, sz=z; if(k<0||G.grid[k]){ const f=nearestFree(Math.floor(x+NX/2),Math.floor(z+NZ/2)); if(f>=0){ sx=f%NX-NX/2+.5; sz=((f/NX)|0)-NZ/2+.5; } }
    const u = spawnWorker(b.owner, sx, sz, qk);
    if(b.owner===0){ updateHUD(); EE.vib(15); EE.sfx('trained',.8); }
    if(qk==='worker') autoJob(u); else if(b.rally) cmdMove(u, b.rally.x, b.rally.z);
  }
  if(G.selB===b) drawPanelSoon();
}

/* ---------- einfache Gegner-KI (Wirtschaft) ---------- */
function updateAI(p,dt){
  p.aiT = (p.aiT||0) - dt; if(p.aiT>0) return; p.aiT = 1.5;
  const tc = p.tc; if(!tc) return;
  const mine = G.units.filter(u=>u.owner===p.id);
  updateAIWar(p, mine, tc);
  const want = ['food','wood','food','wood','stone','gold','wood','food'];
  mine.forEach((u,i)=>{ if(u.kind==='worker' && u.state==='idle'){ const r=nearestRes(want[i%want.length], u.x,u.z, 30, p.id); if(r) cmdGather(u,r); } });
  if(mine.filter(u=>u.kind==='worker').length<10 && !tc.queue.length && p.res.food>=WORKER_COST.food && p.pop<p.popCap){ p.res.food-=WORKER_COST.food; tc.queue.push('worker'); }
  if(p.pop>=p.popCap-1 && p.res.wood>=30 && !G.builds.some(b=>b.owner===p.id && b.built<1)){
    for(let t=0;t<20;t++){ const a=G.rand()*6.28, r=6+G.rand()*4; const x=tc.x+Math.cos(a)*r, z=tc.z+Math.sin(a)*r;
      if(validPlace('house',x,z,p.id)){ p.res.wood-=30; const b=addBuilding('house',p.id,x,z,false); const w=mine.find(u=>u.kind==='worker' && u.state!=='build'); if(w) cmdBuild(w,b); break; } }
  }
}

/* ============================================================
   UPDATE & RENDER
   ============================================================ */
function update(dt){
  G.t += dt;
  if((G.saveT-=dt)<=0){ G.saveT=30; saveGame(); }
  for(const u of G.units.slice()) updateWorker(u,dt);
  updatePopulation(dt);
  G.dtW=dt; updateArrows(dt); updateBlood(dt); updateDebris(dt); if(G.alarmT) G.alarmT=Math.max(0,G.alarmT-dt);
  for(const d of G.deer) updateDeer(d,dt);
  for(const b of G.builds) updateBuilding(b,dt);
  for(let i=1;i<G.players.length;i++) updateAI(G.players[i],dt);
  if(G.waterU) G.waterU.value = G.t;
  G.chunkT=(G.chunkT||0)-dt; if(G.chunkT<=0){ G.chunkT=.25; updateChunks(); }
  G.tileT=(G.tileT||0)-dt; if(G.tileT<=0){ G.tileT=.12; updateTiles(); }
  G.cullT=(G.cullT||0)-dt; if(G.cullT<=0){ G.cullT=.2; cullFar(); }
  TERRAIN_T.value = G.t;
  G.ambT=(G.ambT||0)-dt; if(G.ambT<=0){ G.ambT=.5; updateAmbient(); }
  FLAG_T.value = G.t;
  updateOverview();
  if(panelT>0){ panelT-=dt; if(panelT<=0) drawPanel(); }
  G.hudT = (G.hudT||0)-dt; if(G.hudT<=0){ G.hudT=.5; updateHUD(); if(G.sel.length===1) drawPanel(); }
  G.miniT = (G.miniT||0)-dt; if(G.miniT<=0){ G.miniT=.25; drawMinimap(); }
  if(G.place && !G.place.line) updateGhost();
  updateDip(dt);
}
function updateAmbient(){
  const cx=G.camS.x, cz=G.camS.z, far=G.farView;
  const c = G.clim = climateAt(cx,cz), land = getH(cx,cz)>WATER_Y, wx=G.wx||{k:0,kind:'clear'};
  let water=0; for(let i=0;i<12;i++){ const a=i/12*6.28; if(getH(cx+Math.cos(a)*10, cz+Math.sin(a)*10)<WATER_Y) water++; }
  let trees=0; for(const r of G.res){ if(r.kind==='wood' && r.alive && Math.abs(r.x-cx)<14 && Math.abs(r.z-cz)<14) trees++; if(trees>25) break; }
  let fire=0; for(const p of G.players){ if(p.tc){ const d=Math.hypot(p.tc.x-cx,p.tc.z-cz); fire=Math.max(fire, clamp(1-d/14,0,1)); } }
  const zoom=clamp(G.camS.dist/80,0,1);
  const reg = 1-zoom*.5, temperate = (1-c.jg)*(1-c.cold)*(1-c.ds);
  EE.ambient({ wind:.25+zoom*.75+c.cold*.4+(wx.kind==='snow'?wx.k*.5:0), waves: far?0:water/12, birds: far?0:clamp(trees/18,0,1)*(1-zoom)*temperate*(wx.kind==='rain'?1-wx.k:1), fire: far?0:fire*(1-zoom),
    jungle: land?c.jg*reg:0, cold: c.cold*reg, desert: land?c.ds*reg:0, rain: wx.kind==='rain'?wx.k:0, storm: wx.kind==='rain' && c.jg>.4 ? wx.k : 0 });
}
/* ============================================================
   WETTER je nach Region: Sibirien/Kanada/Gebirge viel Schnee, Dschungel oft Regen und Sonne im Wechsel,
   Europa und andere milde Gegenden mal leichter Regen, Wüste fast immer trocken
   ============================================================ */
// Kleine Wetter- und Temperaturanzeige oben rechts
const WX_ICON = {
  sun:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#ffd24a"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="#ffd24a" stroke-width="2" stroke-linecap="round"/></svg>',
  cloud:'<svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="4" fill="#ffd24a"/><path d="M7 19h11a4 4 0 0 0 0-8 6 6 0 0 0-11 2 3 3 0 0 0 0 6z" fill="#dfe7ef"/></svg>',
  rain:'<svg viewBox="0 0 24 24"><path d="M6 14h12a4 4 0 0 0 0-8 6 6 0 0 0-11 2 3 3 0 0 0-1 6z" fill="#b9c4cf"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3" stroke="#6fb4ff" stroke-width="2" stroke-linecap="round"/></svg>',
  storm:'<svg viewBox="0 0 24 24"><path d="M6 13h12a4 4 0 0 0 0-8 6 6 0 0 0-11 2 3 3 0 0 0-1 6z" fill="#8f9aa6"/><path d="M12 14l-3 5h3l-2 4 5-6h-3l2-3z" fill="#ffd24a"/></svg>',
  snow:'<svg viewBox="0 0 24 24"><path d="M6 13h12a4 4 0 0 0 0-8 6 6 0 0 0-11 2 3 3 0 0 0-1 6z" fill="#e6edf4"/><g fill="#fff"><circle cx="8" cy="17" r="1.4"/><circle cx="12" cy="20" r="1.4"/><circle cx="16" cy="17" r="1.4"/></g></svg>'};
function updateWxHUD(){
  const el=document.getElementById('wx'), c=G.clim, w=G.wx; if(!el || !c || !w) return;
  const lat=Math.abs(c.lat);
  let t = 29 - .62*Math.max(0, lat-12) - c.cold*14 + c.ds*7 + c.jg*1 - Math.max(0,(mountainAt(c.lon,c.lat)-1.5))*4;
  t += Math.sin(G.t/90 + c.lon)*1.5;
  if(w.kind==='rain') t -= 3.5*w.k; if(w.kind==='snow') t = Math.min(t, -2) - 4*w.k;
  const ic = w.k>.15 ? (w.kind==='snow'?'snow': w.kind==='rain' ? (c.jg>.4&&w.k>.6?'storm':'rain') : 'sun') : (w.next!=='clear'||c.cold>.5 ? 'cloud' : 'sun');
  const txt = WX_ICON[ic]+'<b>'+Math.round(t)+' °C</b>';
  if(el._t!==txt){ el._t=txt; el.innerHTML=txt; }
}
function wxPick(){
  const c=G.clim||climateAt(G.camS.x,G.camS.z), w=G.wx, R=G.rand;
  const p = c.cold>.5 ? .65 : c.jg>.4 ? .55 : c.ds>.5 ? .02 : Math.abs(c.lat)<23 ? .3 : .25;
  const wet = R()<p;
  w.next = wet ? (c.cold>.5?'snow':'rain') : 'clear';
  w.amt = !wet ? 0 : c.jg>.4 ? .75+R()*.25 : c.cold>.5 ? .45+R()*.55 : .25+R()*.4;
  w.T = c.jg>.4 ? (wet?35+R()*45:40+R()*60) : (wet?60+R()*80:80+R()*100);
}
function wxParticles(){
  const w=G.wx, N=[500,1100,1600][G.gfx];
  const rp=new Float32Array(N*6), sp=new Float32Array(N*3);
  const rg=new T.BufferGeometry(); rg.setAttribute('position',new T.BufferAttribute(rp,3));
  w.rain=new T.LineSegments(rg, new T.LineBasicMaterial({color:0xb8c6d6, transparent:true, opacity:.55, depthWrite:false}));
  const c=document.createElement('canvas'); c.width=c.height=32; const x=c.getContext('2d'), gr=x.createRadialGradient(16,16,1,16,16,15); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.6,'rgba(255,255,255,.7)'); gr.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=gr; x.fillRect(0,0,32,32);
  const sg=new T.BufferGeometry(); sg.setAttribute('position',new T.BufferAttribute(sp,3));
  w.snow=new T.Points(sg, new T.PointsMaterial({map:new T.CanvasTexture(c), size:.32, transparent:true, depthWrite:false, color:0xffffff}));
  for(const o of [w.rain,w.snow]){ o.frustumCulled=false; o.visible=false; o.renderOrder=5; G.scene.add(o); }
  w.N=N; w.seed=[]; for(let i=0;i<N;i++) w.seed.push([G.rand(),G.rand(),G.rand(),G.rand()*6.28]);
}
const SKY = new T.Color(0x9fd3ff), SKY_RAIN = new T.Color(0x7d8794), SKY_SNOW = new T.Color(0xc9d2dc), _sky = new T.Color();
function updateWeather(dt){
  G.wxHudT=(G.wxHudT||0)-dt; if(G.wxHudT<=0){ G.wxHudT=.5; updateWxHUD(); }
  if(!G.wx){ G.wx={kind:'clear', next:'clear', k:0, amt:0, T:0}; }
  const w=G.wx, c=G.clim; if(!c) return;
  if(!w.rain) wxParticles();
  w.T-=dt; if(w.T<=0) wxPick();
  // Kamera in andere Region gezogen: passendes Wetter
  if(w.next==='snow' && c.cold<.3) w.next = c.ds>.5?'clear':'rain';
  if(w.next==='rain' && c.cold>.6) w.next='snow';
  if(w.next!=='clear' && c.ds>.6){ w.next='clear'; w.T=Math.min(w.T,60); }
  const goal = w.kind===w.next ? w.amt : 0;
  w.k += clamp(goal-w.k, -dt*.12, dt*.12);
  if(w.k<.01 && w.kind!==w.next){ w.kind=w.next; }
  // Licht und Himmel
  const kr = w.kind==='rain'?w.k:0, ks = w.kind==='snow'?w.k:0;
  G.sun.intensity = 2.1*(1-.5*kr-.3*ks); G.hemi.intensity = 1.1*(1-.15*kr+.05*ks);
  _sky.copy(SKY).lerp(SKY_RAIN, kr*.85).lerp(SKY_SNOW, ks*.8);
  G.scene.background.copy(_sky); G.scene.fog.color.copy(_sky);
  if(kr+ks>0){ G.scene.fog.far *= 1-.35*(kr+ks); G.scene.fog.near *= 1-.4*(kr+ks); }
  // Teilchen um die Kamera
  const show = !G.farView && w.k>.02, n=Math.floor(w.N*w.k);
  w.rain.visible = show && w.kind==='rain'; w.snow.visible = show && w.kind==='snow';
  if(!show) return;
  const s=G.camS, B=clamp(s.dist*.9,16,42), Hh=clamp(s.dist*.8,14,40), y0=Math.max(getH(s.x,s.z),WATER_Y)-2, t=G.t;
  if(w.kind==='rain'){ const P=w.rain.geometry.attributes.position.array, sp=28, L=1.1, wind=c.jg>.4?3:5;
    for(let i=0;i<n;i++){ const q=w.seed[i]; const h=((q[1]*Hh - t*sp*(.85+q[2]*.3)) % Hh + Hh) % Hh;
      const x=s.x+(q[0]-.5)*2*B + (h/sp)*wind, z=s.z+(q[2]-.5)*2*B, y=y0+h;
      P[i*6]=x; P[i*6+1]=y; P[i*6+2]=z; P[i*6+3]=x-wind*L/sp; P[i*6+4]=y+L; P[i*6+5]=z; }
    w.rain.geometry.attributes.position.needsUpdate=true; w.rain.geometry.setDrawRange(0,n*2); }
  else { const P=w.snow.geometry.attributes.position.array;
    for(let i=0;i<n;i++){ const q=w.seed[i]; const h=((q[1]*Hh - t*(1.6+q[2]*1.2)) % Hh + Hh) % Hh;
      P[i*3]=s.x+(q[0]-.5)*2*B+Math.sin(t*.8+q[3])*.6; P[i*3+1]=y0+h; P[i*3+2]=s.z+(q[2]-.5)*2*B+Math.cos(t*.6+q[3])*.5; }
    w.snow.geometry.attributes.position.needsUpdate=true; w.snow.geometry.setDrawRange(0,n); }
}
// Grafik im laufenden Spiel umstellen
async function applyGfx(g){
  const r=G.renderer; G.gfx=g;
  r.setPixelRatio(Math.min(window.devicePixelRatio||1, [1.5,1.5,2][g])); r.setSize(G.W, G.H, false);
  const sh = g>=1;
  if(r.shadowMap.enabled!==sh){ r.shadowMap.enabled=sh; G.scene.traverse(o=>{ if(o.material){ (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true); } }); }
  const sz = g>=2 ? 2048 : 1024; if(G.sun.shadow.mapSize.x!==sz){ G.sun.shadow.mapSize.set(sz,sz); if(G.sun.shadow.map){ G.sun.shadow.map.dispose(); G.sun.shadow.map=null; } }
  // Gebäude-Modelle (niedrig / volle Qualität) austauschen
  const old={}; for(const k of MODEL_LOW) if(MODELS[k]) old[k]=MODELS[k];
  await loadModels(g);
  const swap={}; for(const k in old) if(MODELS[k] && MODELS[k]!==old[k]) swap[k]=[old[k],MODELS[k]];
  const w=m=>{ const bb=m.geo.boundingBox; return Math.max(bb.max.x-bb.min.x, bb.max.z-bb.min.z); };
  for(const b of G.builds) b.mesh.traverse(o=>{ if(!o.isMesh) return; for(const k in swap){ const [a,n]=swap[k]; if(o.geometry===a.geo){ o.geometry=n.geo; o.material=Array.isArray(o.material)?o.material:n.mat; if(!o.material.transparent) o.material=n.mat; o.scale.multiplyScalar(w(a)/w(n)); } } });
  EE.toast('Grafik: '+['Niedrig','Mittel','Hoch'][g]+(g===0?' (einfache Gebäude)':''));
}
let fpsN=0, fpsT=0;
function fpsTick(now){ fpsN++; if(now-fpsT>=500){ const el=document.getElementById('fps'); if(el){ const on=!!(EE.S.fps|0); el.classList.toggle('hidden',!on); if(on) el.textContent=Math.round(fpsN*1000/(now-fpsT))+' FPS'; } fpsN=0; fpsT=now; } }
function render(){ updateCam(); updateWeather(G.dtW||.016); G.fr=(G.fr||0)+1; if(G.renderer.shadowMap.enabled && (G.fr%2===0 || G.camMoved)) G.renderer.shadowMap.needsUpdate=true; G.camMoved=false; G.renderer.render(G.scene, G.cam); }

/* ============================================================
   MINIKARTE
   ============================================================ */
function buildMinimapBase(){
  const NX=G.NX, NZ=G.NZ, st=Math.max(1,Math.ceil(NX/640)), W=Math.ceil(NX/st), H=Math.ceil(NZ/st);
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const x=c.getContext('2d'), img=x.createImageData(W,H);
  for(let j=0;j<H;j++) for(let i=0;i<W;i++){
    const px=i*st-NX/2+.5, pz=j*st-NZ/2+.5, h=getH(px,pz), o=(j*W+i)*4, lat=toLat(pz), lon=toLon(px);
    let r=96,g=158,b=58;
    if(h<WATER_Y+.05){ r=40;g=110;b=185; }
    else if(desertAt(lon,lat)>.5){ r=222;g=190;b=120; }
    else if(h>WATER_Y+4.6 || coldAt(lat)>.7){ r=235;g=240;b=245; }
    else if(h>WATER_Y+3.3){ r=140;g=138;b=126; }
    img.data[o]=r; img.data[o+1]=g; img.data[o+2]=b; img.data[o+3]=255;
  }
  x.putImageData(img,0,0); G.miniBase=c;
  const cv=$('#mini'); cv.width=Math.min(640,W); cv.height=Math.round(cv.width*NZ/NX);
}
function drawMinimap(){
  const cv=$('#mini'); if(!cv) return; const x=cv.getContext('2d'), W=cv.width, H=cv.height, s=W/G.NX;
  x.drawImage(G.miniBase,0,0,W,H);
  const px=v=>(v+G.NX/2)*s, pz=v=>(v+G.NZ/2)*s;
  G.miniResT=(G.miniResT||0)-1;
  for(const r of G.res){ if(!r.alive||r.deer||r.kind==='wood'||r.kind==='food'||r.kind==='stone') continue; x.fillStyle = r.kind==='gold'?'#ffd24a':r.kind==='metal'?'#c87a4a':r.kind==='oil'?'#111':'#d0d4d8'; x.fillRect(px(r.x)-1,pz(r.z)-1,2,2); }
  if(G.reg) drawRegionsMini(x, px, pz);
  for(const b of G.builds){ x.fillStyle='#'+COLORS[b.owner].toString(16).padStart(6,'0'); const z=Math.max(3,b.size*s); x.fillRect(px(b.x)-z/2,pz(b.z)-z/2,z,z); x.strokeStyle='#000'; x.lineWidth=1; x.strokeRect(px(b.x)-z/2,pz(b.z)-z/2,z,z); }
  for(const u of G.units){ x.fillStyle='#'+COLORS[u.owner].toString(16).padStart(6,'0'); x.fillRect(px(u.x)-1,pz(u.z)-1,2,2); }
  const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>groundAtNDC(a,b)).filter(Boolean);
  if(pts.length===4){ x.strokeStyle='#fff'; x.lineWidth=1.5; x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(px(p.x),pz(p.z)):x.moveTo(px(p.x),pz(p.z))); x.closePath(); x.stroke(); }
}
/* ---------- Übersicht beim Herauszoomen: Fahnen über Städten, Punkte für Einheiten ---------- */
function buildOverview(){
  G.banners = [];
  G.players.forEach((p,i)=>{
    const c=document.createElement('canvas'); c.width=256; c.height=72; const x=c.getContext('2d');
    const col='#'+COLORS[i].toString(16).padStart(6,'0');
    x.fillStyle='rgba(10,15,34,.85)'; x.beginPath(); x.roundRect(2,2,252,68,14); x.fill();
    x.fillStyle=col; x.fillRect(10,12,16,48);
    x.strokeStyle=col; x.lineWidth=4; x.beginPath(); x.roundRect(2,2,252,68,14); x.stroke();
    x.fillStyle='#fff7e2'; x.font='bold 30px Georgia, serif'; x.textBaseline='middle'; x.fillText(p.civ[0]+(i===0?' (Du)':''),36,37);
    const t=new T.CanvasTexture(c); t.colorSpace=T.SRGBColorSpace;
    const sp=new T.Sprite(new T.SpriteMaterial({map:t, depthTest:false, transparent:true}));
    sp.renderOrder=10; sp.visible=false; G.scene.add(sp); G.banners.push({sp,p});
  });
  const n=1500, geo=new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n*3),3));
  geo.setAttribute('color', new T.BufferAttribute(new Float32Array(n*3),3));
  G.dots = new T.Points(geo, new T.PointsMaterial({size:6, sizeAttenuation:false, vertexColors:true, depthTest:false}));
  G.dots.renderOrder=9; G.dots.frustumCulled=false; G.dots.visible=false; G.scene.add(G.dots);
}
function updateOverview(){
  const far = G.farView;
  if(G.lastFar!==far){ G.lastFar=far; for(const r of G.res) if(r.mesh && !r.mesh.inst) r.mesh.visible=!far; for(const u of G.units) u.mesh.visible=!far; batchesUpdate(true); }
  for(const {sp,p} of G.banners){
    sp.visible = far && p.tc;
    if(sp.visible){ const sc=G.camS.dist*.035; sp.scale.set(sc*3.55,sc,1); sp.center.set(.5,0); sp.position.set(p.tc.x, p.tc.mesh.position.y+4, p.tc.z); }
  }
  G.dots.visible = far;
  if(far){
    const pa=G.dots.geometry.attributes.position, ca=G.dots.geometry.attributes.color, c=new T.Color();
    let i=0; for(const u of G.units){ if(i>=pa.count) break; pa.setXYZ(i,u.x,getH(u.x,u.z)+1,u.z); c.setHex(COLORS[u.owner]); ca.setXYZ(i,c.r,c.g,c.b); i++; }
    G.dots.geometry.setDrawRange(0,i); pa.needsUpdate=true; ca.needsUpdate=true;
  }
}
const _ray = new T.Raycaster(), _v2 = new T.Vector2(), _plane = new T.Plane(new T.Vector3(0,1,0),0), _v3 = new T.Vector3();
function groundAtNDC(a,b){ _v2.set(a,b); _ray.setFromCamera(_v2,G.cam); _plane.constant=-getH(G.camS.x,G.camS.z); return _ray.ray.intersectPlane(_plane,_v3) ? _v3.clone() : null; }
function groundAt(sx,sy){
  _v2.set(sx/G.W*2-1, -(sy/G.H)*2+1); _ray.setFromCamera(_v2,G.cam);
  // Strahl über das Höhenfeld laufen lassen (genau und schnell, egal ob grob oder fein gezeichnet)
  const o=_ray.ray.origin, d=_ray.ray.direction, maxT=G.cam.far;
  let t=0, prev=0;
  for(let k=0;k<600 && t<maxT;k++){
    const x=o.x+d.x*t, y=o.y+d.y*t, z=o.z+d.z*t, h=Math.max(getH(x,z), WATER_Y);
    if(y<=h){ let a=prev, b=t; for(let q=0;q<14;q++){ const m=(a+b)/2, ym=o.y+d.y*m, xm=o.x+d.x*m, zm=o.z+d.z*m; if(ym<=Math.max(getH(xm,zm),WATER_Y)) b=m; else a=m; }
      return new T.Vector3(o.x+d.x*b, o.y+d.y*b, o.z+d.z*b); }
    prev=t; t += Math.max(.25, (y-h)*.6);
  }
  return groundAtNDC(_v2.x,_v2.y);
}
function toScreen(x,y,z){ _v3.set(x,y,z).project(G.cam); return {x:(_v3.x+1)/2*G.W, y:(1-_v3.y)/2*G.H, ok:_v3.z<1}; }

/* ============================================================
   EINGABE (Touch + Maus)
   ============================================================ */
const P = new Map(); let gesture=null, lastTap={t:0,u:null}, longT=0;
function initInput(){
  const c = $('#gc');
  c.addEventListener('pointerdown', pDown);
  c.addEventListener('pointermove', pMove);
  c.addEventListener('pointerup', pUp);
  c.addEventListener('pointercancel', pUp);
  c.addEventListener('wheel', e=>{ e.preventDefault(); G.camS.dist *= e.deltaY>0?1.1:.9; }, {passive:false});
  c.addEventListener('contextmenu', e=>e.preventDefault());
  const mini = $('#mini');
  const miniGo = e=>{ const r=mini.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width*G.NX-G.NX/2, z=(e.clientY-r.top)/r.height*G.NZ-G.NZ/2; G.camS.x=x; G.camS.z=z; };
  mini.addEventListener('pointerdown', e=>{ e.preventDefault(); mini.setPointerCapture(e.pointerId); miniGo(e); mini.onpointermove=miniGo; });
  mini.addEventListener('pointerup', ()=>{ mini.onpointermove=null; });
}
function pDown(e){
  e.preventDefault(); $('#gc').setPointerCapture(e.pointerId);
  P.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now()});
  if(P.size===1){
    gesture={type:'tap'};
    clearTimeout(longT);
  } else if(P.size===2){
    clearTimeout(longT); hideBox();
    const [a,b]=[...P.values()];
    gesture={type:'two', d:Math.hypot(a.x-b.x,a.y-b.y), ang:Math.atan2(b.y-a.y,b.x-a.x), mx:(a.x+b.x)/2, my:(a.y+b.y)/2};
  }
}
function pMove(e){
  const p = P.get(e.pointerId); if(!p) return;
  const px=p.x, py=p.y; p.x=e.clientX; p.y=e.clientY;
  if(!gesture) return;
  if(gesture.type==='tap' && Math.hypot(p.x-p.sx,p.y-p.sy)>10){
    clearTimeout(longT);
    if(G.place && G.place.line){ const g0=groundAt(p.sx,p.sy); if(g0){ G.place.ax=g0.x; G.place.az=g0.z; } gesture={type:'wall'}; }
    else gesture = G.place ? {type:'ghost'} : {type:'box', x0:p.sx, y0:p.sy};
  }
  if(gesture.type==='pan'){ panBy(p.x-px, p.y-py); }
  else if(gesture.type==='ghost'){ const g=groundAt(p.x,p.y); if(g){ G.place.x=g.x; G.place.z=g.z; } }
  else if(gesture.type==='wall'){ const g=groundAt(p.x,p.y); if(g){ G.place.bx=g.x; G.place.bz=g.z; updateWallGhost(); } }
  else if(gesture.type==='box'){ showBox(gesture.x0,gesture.y0,p.x,p.y); }
  else if(gesture.type==='two' && P.size===2){
    const [a,b]=[...P.values()];
    const d=Math.hypot(a.x-b.x,a.y-b.y), ang=Math.atan2(b.y-a.y,b.x-a.x), mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    G.camS.dist *= gesture.d/d;
    let da = ang-gesture.ang; da=Math.atan2(Math.sin(da),Math.cos(da)); G.camS.yaw -= da;
    panBy(mx-gesture.mx, my-gesture.my);
    gesture.d=d; gesture.ang=ang; gesture.mx=mx; gesture.my=my;
  }
}
function pUp(e){
  const p = P.get(e.pointerId); P.delete(e.pointerId);
  clearTimeout(longT);
  if(!p || !gesture) return;
  if(gesture.type==='tap' && P.size===0) tapAt(p.x,p.y);
  else if(gesture.type==='box' && P.size===0){ boxSelect(gesture.x0,gesture.y0,p.x,p.y); hideBox(); }
  if(P.size===0) gesture=null;
  else if(gesture && gesture.type==='two') gesture={type:'none'};
}
function panBy(dx,dy){
  const s = G.camS.dist/G.H*1.25;
  const c=Math.cos(G.camS.yaw), sn=Math.sin(G.camS.yaw);
  G.camS.x -= (dx*c + dy*sn)*s;
  G.camS.z -= (-dx*sn + dy*c)*s;
}
function showBox(x0,y0,x1,y1){ const b=$('#sel-box'); b.style.display='block'; b.style.left=Math.min(x0,x1)+'px'; b.style.top=Math.min(y0,y1)+'px'; b.style.width=Math.abs(x1-x0)+'px'; b.style.height=Math.abs(y1-y0)+'px'; }
function hideBox(){ const b=$('#sel-box'); if(b) b.style.display='none'; }

function pickAt(sx,sy){
  let best=null, bd=34;
  if(G.sel.some(u=>u.owner===0 && u.kind==='worker')){ let bb=1e9; for(const b of G.builds){ if(b.owner!==0 || b.kind==='road' || (b.built>=1 && b.hp>=BUILD[b.kind].hp)) continue; const s=toScreen(b.x, b.mesh.position.y+.5, b.z); if(!s.ok) continue; const d=Math.hypot(s.x-sx,s.y-sy); if(d<26+b.size*14 && d<bb){ bb=d; best={b}; } } if(best) return best; }
  for(const u of G.units){ if(u.inside) continue; const s=toScreen(u.x, getH(u.x,u.z)+.7, u.z); if(!s.ok) continue; const d=Math.hypot(s.x-sx,s.y-sy); if(d<bd){bd=d;best={u};} }
  if(best) return best;
  bd = 1e9;
  for(const b of G.builds){ if(b.kind==='road') continue; const s=toScreen(b.x, b.mesh.position.y+1, b.z); const r = 26+b.size*14; const d=Math.hypot(s.x-sx,s.y-sy); if(d<r && d<bd){bd=d;best={b};} }
  if(best) return best;
  bd = 30;
  for(const r of G.res){ if(!r.alive) continue; const s=toScreen(r.x, getH(r.x,r.z)+.6, r.z); if(!s.ok) continue; const d=Math.hypot(s.x-sx,s.y-sy); if(d<bd){bd=d;best={r};} }
  return best;
}
function tapAt(sx,sy){
  if(G.place){ const g=groundAt(sx,sy); if(g){ if(G.place.line){ G.place.bx=g.x; G.place.bz=g.z; updateWallGhost(); } else { G.place.x=g.x; G.place.z=g.z; } } return; }
  const hit = pickAt(sx,sy);
  const mine = G.sel.filter(u=>u.owner===0);
  const now = performance.now();
  if(hit && hit.u){
    if(hit.u.owner===0){
      if(now-lastTap.t<350 && lastTap.u===hit.u){ // Doppeltipp: alle sichtbaren eigenen Arbeiter
        select(G.units.filter(u=>u.owner===0 && (()=>{const s=toScreen(u.x,getH(u.x,u.z),u.z); return s.ok&&s.x>0&&s.y>0&&s.x<G.W&&s.y<G.H;})()), null);
      } else select([hit.u], null);
      lastTap={t:now,u:hit.u}; EE.click(); return;
    }
    if(mine.length){ if(hostile(0,hit.u.owner)){ mine.forEach(u=>cmdAttack(u,hit.u)); marker(hit.u.x,hit.u.z,0xff4444); EE.vib(12); drawPanel(); }
      else EE.toast('Ihr habt keinen Krieg mit den '+G.players[hit.u.owner].civ[0]+' – das geht in der Diplomatie');
      return; }
    select([], null); EE.toast(UNIT[hit.u.kind].name+' der '+G.players[hit.u.owner].civ[0]); return;
  }
  if(mine.length){
    if(hit && hit.r && (hit.r.kind==='metal'||hit.r.kind==='oil')){ EE.toast(RES_DE[hit.r.kind]+'-Vorkommen – kann noch nicht abgebaut werden'); return; }
    if(hit && hit.r){ mine.forEach(u=>cmdGather(u,hit.r)); marker(hit.r.x,hit.r.z,0xffd24a); EE.vib(10); drawPanel(); return; }
    if(hit && hit.b && hit.b.owner===0 && hit.b.kind==='tower' && hit.b.built>=1 && mine.some(isSoldier)){ const ss=mine.filter(isSoldier), free=Math.max(0,TOWER_MAX-crew(hit.b).length);
      if(!free){ EE.toast('Der Wachturm ist voll'); return; }
      ss.slice(0,free).forEach(u=>cmdGarrison(u,hit.b)); marker(hit.b.x,hit.b.z,0xffffff); EE.vib(10);
      EE.toast(Math.min(free,ss.length)+' Krieger '+(Math.min(free,ss.length)>1?'gehen':'geht')+' in den Wachturm'+(ss.length>free?' (voll)':'')); return; }
    if(hit && hit.b && hit.b.owner===0 && (hit.b.built<1 || hit.b.hp<BUILD[hit.b.kind].hp)){ const bs=mine.filter(u=>u.kind==='worker'); if(!bs.length){ EE.toast('Nur Bauern können bauen'); return; } bs.forEach(u=>cmdBuild(u,hit.b)); if(bs.length>1) EE.toast(bs.length+' Bauern '+(hit.b.built<1?'bauen':'reparieren')+' zusammen – das geht schneller'); marker(hit.b.x,hit.b.z,0xffd24a); EE.vib(10); drawPanel(); return; }
    if(hit && hit.b && hit.b.owner===0 && BUILD[hit.b.kind].drop){ mine.forEach(u=>{ if(u.carry.amt>0){u.state='drop';u.path=null;} }); marker(hit.b.x,hit.b.z,0xffffff); return; }
    if(hit && hit.b && hit.b.owner!==0){ if(hostile(0,hit.b.owner)){ mine.forEach(u=>cmdAttack(u,hit.b)); marker(hit.b.x,hit.b.z,0xff4444); EE.vib(12); }
      else EE.toast('Ihr habt keinen Krieg mit den '+G.players[hit.b.owner].civ[0]); return; }
    if(hit && hit.b){ select([],hit.b); EE.click(); return; }
    // Doppeltipp auf den Boden: Auswahl aufheben
    if(now-lastTap.t<450 && lastTap.g && Math.hypot(sx-lastTap.x, sy-lastTap.y)<45){ lastTap={t:0,u:null}; select([],null); EE.click(); EE.toast('Auswahl aufgehoben'); return; }
    lastTap={t:now,u:null,g:true,x:sx,y:sy};
    const g = groundAt(sx,sy);
    if(g){ formationMove(mine, g.x, g.z); marker(g.x,g.z,0x7cff7c); EE.vib(8); drawPanel(); }
    return;
  }
  if(hit && hit.b){ select([],hit.b); EE.click(); return; }
  if(hit && hit.r){ EE.toast(RES_DE[hit.r.kind]+': '+Math.ceil(hit.r.amt)+' übrig'); return; }
  select([],null);
}
function formationMove(us,x,z){
  const n=us.length, cols=Math.ceil(Math.sqrt(n));
  us.forEach((u,i)=>{ const cx=(i%cols)-(cols-1)/2, cz=Math.floor(i/cols)-(Math.ceil(n/cols)-1)/2; cmdMove(u, x+cx*.9, z+cz*.9); });
}
function boxSelect(x0,y0,x1,y1){
  const ax=Math.min(x0,x1), bx=Math.max(x0,x1), ay=Math.min(y0,y1), by=Math.max(y0,y1);
  const us = G.units.filter(u=>{ if(u.owner!==0) return false; const s=toScreen(u.x,getH(u.x,u.z)+.5,u.z); return s.ok && s.x>=ax && s.x<=bx && s.y>=ay && s.y<=by; });
  select(us,null); if(us.length) EE.click();
}
function select(us,b){
  us = us.filter(u=>!u.inside);
  for(const u of G.sel) u.ring.visible=false;
  if(G.selB) G.selB.ring.visible=false;
  G.sel = us; G.selB = b;
  for(const u of us){ u.ring.visible=true; u.ring.material.color.setHex(0xffffff); }
  if(b){ b.ring.visible=true; }
  drawPanel();
}
function selectIdle(){
  const idle = G.units.filter(u=>u.owner===0 && u.state==='idle' && u.kind!=='kid' && !u.inside);
  if(!idle.length){ EE.toast('Alle Bauern sind beschäftigt'); return; }
  G.idleI = ((G.idleI||0)+1) % idle.length;
  const u = idle[G.idleI]; select([u],null); centerCamOn(u.x,u.z-4);
}
const markers=[];
function marker(x,z,col){
  const m = new T.Mesh(new T.RingGeometry(.2,.4,20), new T.MeshBasicMaterial({color:col, transparent:true, depthWrite:false}));
  m.rotation.x=-Math.PI/2; m.position.set(x,getH(x,z)+.08,z); G.scene.add(m);
  let t=0; const step=()=>{ if(!G) return; t+=.03; m.scale.setScalar(1+t*3); m.material.opacity=1-t; if(t<1) requestAnimationFrame(step); else { G.scene.remove(m); m.geometry.dispose(); } }; step();
}


/* ============================================================
   PALISADE (selbst bauen: Linie ziehen, optional Tor)
   ============================================================ */
let WALL_ID = 1;
function makeWallPiece(color, gate, len){
  len = len||1;
  geos();
  const g = new T.Group();
  if(gate){
    for(const x of [-.5*len,.5*len]){ const p=mesh(GEO.box, mat(0x5a3818), x, 1.1, 0); p.scale.set(.24,2.2,.24); g.add(p); }
    const top=mesh(GEO.box, mat(0x6a4422), 0, 2.15, 0); top.scale.set(len*1.3,.2,.28); g.add(top);
    const fl=mesh(GEO.box, mat(color), 0, 1.85, .16); fl.scale.set(.45,.28,.03); g.add(fl);
    return g;
  }
  if(MODELS.palisade){ const m=modelMesh('palisade', len*1.08); const bb=MODELS.palisade.geo.boundingBox; m.scale.y = 1.95/(bb.max.y-bb.min.y); m.scale.z*=1.6; g.add(m); }
  else { for(let i=0;i<4;i++){ const p=mesh(GEO.box, mat(0x7a4d28), (-.38+i*.25)*len, .65+((i*7)%3)*.06, 0); p.scale.set(.16,1.3,.16); g.add(p); } }
  return g;
}
function wallCells(x0,z0,x1,z1){
  const NX=G.NX; const out=[];
  let i0=Math.floor(x0+NX/2), j0=Math.floor(z0+G.NZ/2), i1=Math.floor(x1+NX/2), j1=Math.floor(z1+G.NZ/2);
  const di=Math.abs(i1-i0), dj=Math.abs(j1-j0), si=i0<i1?1:-1, sj=j0<j1?1:-1; let err=di-dj;
  for(let n=0;n<60;n++){ out.push([i0,j0]); if(i0===i1&&j0===j1) break; const e2=2*err; if(e2>-dj){err-=dj;i0+=si;} if(e2<di){err+=di;j0+=sj;} }
  return out;
}
/* ---------- Wege (Steinzeit: Trampelpfad) – darauf laufen alle 50 % schneller ---------- */
let ROAD_TEX=null, ROAD_MAT=null;
function roadMat(){
  if(ROAD_MAT) return ROAD_MAT;
  const S=128, cv=document.createElement('canvas'); cv.width=cv.height=S; const x=cv.getContext('2d'), R=rng(77);
  const img=x.createImageData(S,S), n=fbmTile(S,91);
  for(let j=0;j<S;j++) for(let i=0;i<S;i++){ const o=(j*S+i)*4, t=n[j*S+i], e=Math.abs(i/S-.5)*2, edge=clamp((1-e)*3.2 - (t-.5)*2.4,0,1);
    img.data[o]=118+t*60; img.data[o+1]=92+t*46; img.data[o+2]=62+t*30; img.data[o+3]=edge*235; }
  x.putImageData(img,0,0);
  for(let i=0;i<70;i++){ const px=S*.2+R()*S*.6, py=R()*S; x.fillStyle=`rgba(${150+R()*50|0},${145+R()*45|0},${135+R()*40|0},.9)`; x.beginPath(); x.arc(px,py,.8+R()*1.8,0,7); x.fill(); }
  for(let k=0;k<2;k++){ x.strokeStyle='rgba(70,50,30,.35)'; x.lineWidth=5; x.beginPath(); x.moveTo(S*(.36+k*.28),0); x.lineTo(S*(.36+k*.28),S); x.stroke(); }
  ROAD_TEX=new T.CanvasTexture(cv); ROAD_TEX.wrapT=T.RepeatWrapping; ROAD_TEX.colorSpace=T.SRGBColorSpace;
  ROAD_MAT=new T.MeshLambertMaterial({map:ROAD_TEX, transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
  return ROAD_MAT;
}
function makeRoadPiece(cx,cz,len,ang){
  const ux=Math.cos(ang), uz=Math.sin(ang), W=1.5, nL=Math.max(2,Math.ceil(len/.5)), h0=getH(cx,cz);
  const P=[], U=[], I=[];
  for(let a=0;a<=nL;a++) for(let b=0;b<=2;b++){
    const t=(a/nL-.5)*(len+.35), s=(b/2-.5)*W, wx=cx+ux*t-uz*s, wz=cz+uz*t+ux*s;
    P.push(ux*t-uz*s, getH(wx,wz)-h0+.05, uz*t+ux*s); U.push(b/2, (a/nL)*(len+.35)/1.6);
  }
  for(let a=0;a<nL;a++) for(let b=0;b<2;b++){ const i=a*3+b; I.push(i,i+1,i+3, i+1,i+4,i+3); }
  const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.Float32BufferAttribute(P,3)); geo.setAttribute('uv',new T.Float32BufferAttribute(U,2)); geo.setIndex(I); geo.computeVertexNormals();
  const m=new T.Mesh(geo, roadMat().clone()); m.receiveShadow=true; m.renderOrder=1;
  const g=new T.Group(); g.add(m); g.position.set(cx,h0,cz); g.isRoad=true; return g;
}
function startWall(kind){
  kind = kind||'wall';
  const g = groundAtNDC(0,-.1) || {x:G.camS.x, z:G.camS.z};
  G.place = {kind, line:true, ax:g.x, az:g.z, bx:g.x+4, bz:g.z, gate:false, ghosts:[], cells:[], ok:false, workers:G.sel.filter(u=>u.owner===0)};
  $('#pTxt').textContent='Mit dem Finger eine Linie ziehen';
  $('#pGate').classList.toggle('hidden', kind!=='wall'); $('#pGate').classList.remove('on');
  $('#placebar').classList.remove('hidden');
  drawPanel(); updateWallGhost();
}
function updateWallGhost(){
  const pl=G.place, NX=G.NX, NZ=G.NZ;
  for(const gh of pl.ghosts) G.scene.remove(gh); pl.ghosts=[];
  const road = pl.kind==='road';
  const dx=pl.bx-pl.ax, dz=pl.bz-pl.az, L=Math.min(Math.hypot(dx,dz), 150);
  const n = Math.max(1, Math.round(L/1.15)), seg = Math.max(.6, L/n);
  const ux = L>0.01?dx/Math.hypot(dx,dz):1, uz = L>0.01?dz/Math.hypot(dx,dz):0;
  const ang = Math.atan2(uz, ux), mid = Math.floor(n/2);
  pl.cells = [];
  for(let i=0;i<n;i++){
    const x = pl.ax + ux*seg*(i+.5), z = pl.az + uz*seg*(i+.5);
    const ks = new Set();
    for(let t=-.45;t<=.45;t+=.15){ const k=cellIdx(x+ux*seg*t, z+uz*seg*t); ks.add(k); }
    const arr=[...ks];
    const ok = arr.every(k=>k>=0 && !G.grid[k]) && getH(x,z)>WATER_Y+.15 && true;
    pl.cells.push({ks:arr, x, z, len:seg, ok, gate: !road && pl.gate && n>=3 && (n<=30 ? i===mid : i%24===12)});
  }
  let okCount=0;
  for(const c of pl.cells){
    const gh = road ? makeRoadPiece(c.x,c.z,c.len,ang) : makeWallPiece(COLORS[0], c.gate, c.len);
    gh.traverse(o=>{ if(o.isMesh){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=road?.8:.55; o.material.color.setHex(c.ok?0x66ff77:0xff5555); o.castShadow=false; } });
    if(!road){ gh.position.set(c.x, getH(c.x,c.z), c.z); gh.rotation.y = -ang; }
    G.scene.add(gh); pl.ghosts.push(gh); if(c.ok) okCount++;
  }
  pl.ang = ang;
  const cost = road ? 0 : pl.cells.reduce((s,c)=>s+(c.ok?(c.gate?BUILD.gate.cost.wood:BUILD.wall.cost.wood):0),0);
  pl.cost = cost; pl.ok = okCount>0;
  const pay = G.players[0].res.wood >= cost; setCost({wood:cost});
  $('#pTxt').textContent = okCount ? (road ? 'Weg: '+Math.round(okCount*seg)+' m · kostenlos' : okCount+' Stück · '+cost+' Holz'+(pay?'':' – es fehlen '+Math.ceil(cost-G.players[0].res.wood)+' Holz')) : 'Mit dem Finger eine Linie ziehen';
  $('#pOk').classList.toggle('dim', !pl.ok || !pay); $('#pOk').disabled = !pl.ok || !pay;
}
function confirmWall(){
  const pl=G.place, p=G.players[0];
  if(!pl.ok){ EE.toast(pl.kind==='road'?'Hier kann kein Weg entstehen':'Hier kann keine Palisade stehen'); return; }
  if(pl.kind==='road' && !pl.workers.length){ EE.toast('Wähle zuerst Bauern aus, die den Weg anlegen'); return; }
  if(p.res.wood < pl.cost){ EE.toast('Nicht genug Holz ('+pl.cost+' nötig)'); return; }
  p.res.wood -= pl.cost;
  const id = WALL_ID++, ang = pl.ang||0, segs=[];
  for(const c of pl.cells){ if(!c.ok) continue; segs.push(addWall(0, c, ang, id, pl.kind==='road')); }
  const ws = pl.workers;
  ws.forEach((u,i)=>{ const seg = segs[Math.floor(i*segs.length/Math.max(1,ws.length))]; if(seg) cmdBuild(u,seg); });
  EE.sfx('place'); EE.vib(20);
  endPlace(); updateHUD(); select(ws,null);
}
function addWall(owner, c, ang, id, road){
  const kind = road?'road':c.gate?'gate':'wall', d=BUILD[kind];
  const m = road ? makeRoadPiece(c.x,c.z,c.len,ang) : makeWallPiece(COLORS[owner], c.gate, c.len);
  if(!road){ m.position.set(c.x, getH(c.x,c.z)-.03, c.z); m.rotation.y = -ang; }
  G.scene.add(m);
  if(!c.gate && !road) for(const k of c.ks) if(k>=0) G.grid[k]=1;
  const ring = new T.Mesh(new T.RingGeometry(.55,.68,20), new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.85, depthWrite:false}));
  ring.rotation.x=-Math.PI/2; ring.position.set(c.x, m.position.y+.08, c.z); ring.visible=false; G.scene.add(ring);
  const b = {kind, owner, x:c.x, z:c.z, size:1, mesh:m, ring, cells:(c.gate||road)?[]:c.ks.filter(k=>k>=0), roadCells:road?c.ks.filter(k=>k>=0):null, built:0, hp:1, queue:[], qT:0, wallId:id, seg:{ks:c.ks, x:c.x, z:c.z, len:c.len, gate:!!c.gate, ang}};
  if(!road) m.scale.y=.25;
  m.traverse(o=>{ if(o.material && o.isMesh){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=road?.35:.55; } });
  G.builds.push(b);
  return b;
}

/* ---------- Gebäude platzieren ---------- */
/* ============================================================
   GEBIETE (wie Empire Earth 2): Die Welt ist in feste Gebiete aufgeteilt (ein Land hat mehrere).
   Ein Stadtzentrum macht das ganze Gebiet zu deinem. Weitere Gebiete holt man sich mit neuen
   Stadtzentren in Nachbargebieten – fremde Gebiete erst, wenn deren Stadtzentrum zerstört ist.
   ============================================================ */
const REG_S = 70;
function initRegions(){
  const S=REG_S, gw=Math.ceil(G.NX/S), gh=Math.ceil(G.NZ/S), R=rng(G.seed^0x5bd1e995);
  G.reg={S, gw, gh, seeds:new Array(gw*gh).fill(null), owner:new Map(), poly:new Map()};
  for(let j=0;j<gh;j++) for(let i=0;i<gw;i++){
    const x=(i+.2+R()*.6)*S-G.NX/2, z=(j+.2+R()*.6)*S-G.NZ/2;
    if(rawLand(x,z)>.62) G.reg.seeds[j*gw+i]={id:j*gw+i, x, z};
  }
}
function regionAt(x,z){
  const g=G.reg; if(!g) return -1; const gi=Math.floor((x+G.NX/2)/g.S), gj=Math.floor((z+G.NZ/2)/g.S);
  let best=-1, bd=1e18;
  for(let j=gj-2;j<=gj+2;j++) for(let i=gi-2;i<=gi+2;i++){ if(i<0||j<0||i>=g.gw||j>=g.gh) continue; const s=g.seeds[j*g.gw+i]; if(!s) continue; const d=(s.x-x)**2+(s.z-z)**2; if(d<bd){ bd=d; best=s.id; } }
  return best;
}
const regOwner = id => (id>=0 && G.reg.owner.has(id)) ? G.reg.owner.get(id) : -1;
const inOwn = (owner,x,z) => regOwner(regionAt(x,z))===owner;
function regNeighbors(id){
  const g=G.reg, s=g.seeds[id], out=[]; if(!s) return out;
  const gi=id%g.gw, gj=(id/g.gw)|0;
  for(let j=gj-2;j<=gj+2;j++) for(let i=gi-2;i<=gi+2;i++){ if(i<0||j<0||i>=g.gw||j>=g.gh) continue; const n=g.seeds[j*g.gw+i]; if(n && n!==s) out.push(n); }
  return out;
}
// Umriss eines Gebiets (Voronoi-Zelle): Quadrat Schritt für Schritt an den Mittelsenkrechten abschneiden
function regPoly(id){
  const g=G.reg; if(g.poly.has(id)) return g.poly.get(id);
  const s=g.seeds[id], S=g.S*2.2; let P=[[s.x-S,s.z-S,-1],[s.x+S,s.z-S,-1],[s.x+S,s.z+S,-1],[s.x-S,s.z+S,-1]];
  for(const n of regNeighbors(id)){
    const mx=(s.x+n.x)/2, mz=(s.z+n.z)/2, dx=n.x-s.x, dz=n.z-s.z, f=p=>(p[0]-mx)*dx+(p[1]-mz)*dz, out=[];
    for(let k=0;k<P.length;k++){ const a=P[k], b=P[(k+1)%P.length], fa=f(a), fb=f(b);
      if(fa<=0) out.push(a);
      if((fa<=0)!==(fb<=0)){ const t=fa/(fa-fb); out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, n.id]); }
      // Kante ab Punkt a gehört zu dem Nachbarn, der sie erzeugt hat (3. Wert)
    }
    for(let k=0;k<out.length;k++){ const a=out[k], b=out[(k+1)%out.length]; if(f(a)>-1e-6 && f(b)>-1e-6) a[2]=n.id; }
    P=out;
  }
  g.poly.set(id,P); return P;
}
function claimRegion(b){ const id=regionAt(b.x,b.z); if(id>=0){ G.reg.owner.set(id,b.owner); b.region=id; } }
function releaseRegion(b){ const id=b.region; if(id==null||id<0) return; if(!G.builds.some(o=>o!==b && o.kind==='tc' && o.built>=1 && o.region===id && o.owner===b.owner)) G.reg.owner.delete(id); }
function terrCheck(owner, kind, x, z){
  if(kind==='road') return null;
  const id=regionAt(x,z), o=regOwner(id);
  if(kind==='tc'){
    if(id<0) return 'Hier kann man kein Gebiet gründen';
    if(o===owner) return 'Dieses Gebiet gehört dir schon – baue im Nachbargebiet';
    if(o>=0) return 'Das Gebiet gehört den '+G.players[o].civ[0]+' – erst deren Stadtzentrum zerstören';
    if(G.builds.some(b=>b.kind==='tc' && b.built<1 && regionAt(b.x,b.z)===id)) return 'Hier wird schon ein Stadtzentrum gebaut';
    const mine=[...G.reg.owner].filter(([k,v])=>v===owner).map(([k])=>k);
    if(!mine.length) return null;
    const near = regNeighbors(id).some(n=>regOwner(n.id)===owner && regPoly(id).some(p=>p[2]===n.id));
    return near ? null : 'Nur ein Nachbargebiet deines Landes';
  }
  if(id<0) return 'Hier kann man nicht bauen';
  if(kind==='house' && G.builds.filter(b=>b.kind==='house' && b.owner===owner && regionAt(b.x,b.z)===id).length>=HOUSE_MAX) return 'Höchstens '+HOUSE_MAX+' Hütten pro Gebiet – erweitere dein Land';
  return null;
}
// Wie in Empire Earth 2: Außerhalb des eigenen (oder verbündeten) Gebiets darf man bauen, aber es dauert dreimal so lange
const HOUSE_MAX = 6;
function friendlyLand(owner,x,z){ const o=regOwner(regionAt(x,z)); if(o<0) return false; if(o===owner) return true; const p=o===0?owner:owner===0?o:-1; return p>=0 && G.dip[p] && G.dip[p].state==='ally'; }
// Grenzen zeichnen: Außengrenze in Teamfarbe (leicht nach innen versetzt), innere Gebietsgrenzen zart,
// freie Nachbargebiete weiß gestrichelt
// Hauptfarbe der Flagge eines Volkes (erste nicht-weiße Füllfarbe im Wappen)
const flagCache={};
function flagColor(owner){
  const civ=G.players[owner].civ; if(flagCache[civ[0]]!=null) return flagCache[civ[0]];
  const fills=[...String(civ[2]).matchAll(/fill="(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})"/g)].map(m=>new T.Color(m[1]));
  const c = fills.find(c=>c.r+c.g+c.b<2.5) || fills[0] || new T.Color(COLORS[owner]);
  return flagCache[civ[0]] = c.getHex();
}
// Beim Platzieren eines Stadtzentrums: Umriss des Gebiets anzeigen, das man damit bekommt (grün = möglich, rot = nicht)
function regionPreview(pl, id, ok){
  const key=id+'/'+ok; if(pl.regKey===key) return; pl.regKey=key;
  if(pl.regM){ G.scene.remove(pl.regM); pl.regM.geometry.dispose(); pl.regM=null; }
  if(id<0) return;
  const P=regPoly(id), s=G.reg.seeds[id], pos=[];
  for(let k=0;k<P.length;k++){ const a=P[k], b=P[(k+1)%P.length]; let nx=s.x-(a[0]+b[0])/2, nz=s.z-(a[1]+b[1])/2; const L=Math.hypot(nx,nz)||1; nx/=L; nz/=L;
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]), n=Math.max(1,Math.ceil(len/1.5));
    for(let i=0;i<n;i++){ const t0=i/n, t1=(i+1)/n, ax=a[0]+(b[0]-a[0])*t0, az=a[1]+(b[1]-a[1])*t0, bx=a[0]+(b[0]-a[0])*t1, bz=a[1]+(b[1]-a[1])*t1, w=.5;
      const y=(x,z)=>Math.max(getH(x,z),WATER_Y)+.15;
      pos.push(ax,y(ax,az),az, ax+nx*w,y(ax+nx*w,az+nz*w),az+nz*w, bx,y(bx,bz),bz, bx,y(bx,bz),bz, ax+nx*w,y(ax+nx*w,az+nz*w),az+nz*w, bx+nx*w,y(bx+nx*w,bz+nz*w),bz+nz*w); } }
  const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  pl.regM=new T.Mesh(geo,new T.MeshBasicMaterial({color:ok?0x55ff77:0xff5544, transparent:true, opacity:.8, depthWrite:false, side:T.DoubleSide, polygonOffset:true, polygonOffsetFactor:-4}));
  pl.regM.renderOrder=3; pl.regM.frustumCulled=false; G.scene.add(pl.regM);
}
function buildBorders(){
  if(G.borderGrp){ G.scene.remove(G.borderGrp); G.borderGrp.traverse(o=>{ if(o.geometry && o.geometry!==GEO.post) o.geometry.dispose(); if(o.material) o.material.dispose(); }); }
  const grp=new T.Group(); G.borderGrp=grp; G.scene.add(grp);
  const lines=new Map(); // farbe+art -> positions
  const add=(key,col,op,w,x0,z0,x1,z1,nx,nz,inset,dash)=>{
    let L=lines.get(key); if(!L){ L={col,op,pos:[]}; lines.set(key,L); }
    const len=Math.hypot(x1-x0,z1-z0), n=Math.max(1,Math.ceil(len/1.5));
    for(let k=0;k<n;k++){ if(dash && k%2) continue; const t0=k/n, t1=(k+1)/n;
      const ax=x0+(x1-x0)*t0+nx*inset, az=z0+(z1-z0)*t0+nz*inset, bx=x0+(x1-x0)*t1+nx*inset, bz=z0+(z1-z0)*t1+nz*inset;
      if(getH(ax,az)<WATER_Y+.05 && getH(bx,bz)<WATER_Y+.05) continue;
      const y=(x,z)=>Math.max(getH(x,z),WATER_Y)+.14;
      const cx=ax+nx*w, cz=az+nz*w, dx=bx+nx*w, dz=bz+nz*w;
      L.pos.push(ax,y(ax,az),az, cx,y(cx,cz),cz, bx,y(bx,bz),bz,  bx,y(bx,bz),bz, cx,y(cx,cz),cz, dx,y(dx,dz),dz); }
  };
  // Außengrenzen: kleine Holzpfosten in gleichmäßigem Abstand (ein einziges InstancedMesh)
  const P=[], POST_GAP=1.5;
  let PC=0, PH=1;
  const posts=(x0,z0,x1,z1,nx,nz)=>{ const len=Math.hypot(x1-x0,z1-z0), n=Math.max(1,Math.round(len/POST_GAP));
    for(let k=0;k<n;k++){ const t=(k+.5)/n, x=x0+(x1-x0)*t+nx*.3, z=z0+(z1-z0)*t+nz*.3; if(getH(x,z)<WATER_Y+.1) continue; P.push(x,z,PC,PH); } };
  const owned=[...G.reg.owner.entries()];
  const shownFree=new Set();
  for(const [id,ow] of owned){
    const P=regPoly(id), s=G.reg.seeds[id], col=COLORS[ow]; PC=flagColor(ow); PH=1;
    for(let k=0;k<P.length;k++){
      const a=P[k], b=P[(k+1)%P.length], nb=a[2];
      const mx=(a[0]+b[0])/2, mz=(a[1]+b[1])/2; let nx=s.x-mx, nz=s.z-mz; const L=Math.hypot(nx,nz)||1; nx/=L; nz/=L;
      const other = nb>=0 ? regOwner(nb) : -1;
      if(other!==ow) posts(a[0],a[1],b[0],b[1], nx,nz);
      if(ow===0 && nb>=0 && other<0) shownFree.add(nb);
    }
  }
  // Gebiete, in denen gerade ein Stadtzentrum entsteht: niedrige Pfosten (werden erst noch eingeschlagen)
  for(const b of G.builds){ if(b.kind!=='tc' || b.built>=1 || b.dead) continue; const id=regionAt(b.x,b.z); if(id<0 || regOwner(id)>=0) continue;
    const P=regPoly(id), s=G.reg.seeds[id]; PC=flagColor(b.owner); PH=.45+.55*b.built;
    for(let k=0;k<P.length;k++){ const a=P[k], c=P[(k+1)%P.length]; if(a[2]>=0 && regOwner(a[2])===b.owner) continue;
      const mx=(a[0]+c[0])/2, mz=(a[1]+c[1])/2; let nx=s.x-mx, nz=s.z-mz; const L=Math.hypot(nx,nz)||1; posts(a[0],a[1],c[0],c[1], nx/L,nz/L); }
    shownFree.delete(id); }
  if(P.length){
    if(!GEO.post){ const I=new T.Matrix4(); GEO.post=mergeParts([[new T.CylinderGeometry(.06,.07,.5,6,1,true), new T.Matrix4().makeTranslation(0,.2,0)],[new T.ConeGeometry(.06,.12,6,1,true), new T.Matrix4().makeTranslation(0,.51,0)]]); }
    const NP=P.length/4, im=new T.InstancedMesh(GEO.post, new T.MeshLambertMaterial({color:0xffffff}), NP), m4=new T.Matrix4(), q=new T.Quaternion(), e=new T.Euler(), sc=new T.Vector3(), ps=new T.Vector3();
    const R=rng(77);
    const col=new T.Color();
    for(let i=0;i<NP;i++){ const x=P[i*4], z=P[i*4+1]; e.set((R()-.5)*.12,R()*6.28,(R()-.5)*.12); q.setFromEuler(e); const s=(.85+R()*.3)*P[i*4+3]; sc.set(1,s,1); ps.set(x,getH(x,z)-.04,z); m4.compose(ps,q,sc); im.setMatrixAt(i,m4);
      col.setHex(P[i*4+2]).multiplyScalar(1.05+R()*.3); im.setColorAt(i, col); }
    im.castShadow=G.gfx>0; im.frustumCulled=false; grp.add(im);
  }
  for(const L of lines.values()){ if(!L.pos.length) continue;
    const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.Float32BufferAttribute(L.pos,3));
    const m=new T.Mesh(geo,new T.MeshBasicMaterial({color:L.col, transparent:true, opacity:L.op, depthWrite:false, side:T.DoubleSide, polygonOffset:true, polygonOffsetFactor:-4}));
    m.renderOrder=3; m.frustumCulled=false; grp.add(m); }
  if(G.miniBase) drawMinimap();
}
function drawRegionsMini(x, px, pz){
  for(const [id,ow] of G.reg.owner){ const P=regPoly(id), col='#'+COLORS[ow].toString(16).padStart(6,'0');
    x.beginPath(); P.forEach((p,i)=>i?x.lineTo(px(p[0]),pz(p[1])):x.moveTo(px(p[0]),pz(p[1]))); x.closePath();
    x.globalAlpha=.35; x.fillStyle=col; x.fill(); x.globalAlpha=.9; x.strokeStyle=col; x.lineWidth=1; x.stroke(); x.globalAlpha=1; }
}
function validPlace(kind,x,z,owner){
  if(terrCheck(owner|0, kind, x, z)) return false;
  const fp = footprint(kind,x,z);
  if(fp.cells.some(k=>k<0||G.grid[k])) return false;
  for(const u of G.units){ if(Math.abs(u.x-fp.cx)<BUILD[kind].size/2+.2 && Math.abs(u.z-fp.cz)<BUILD[kind].size/2+.2 && u.owner!==0) return false; }
  return true;
}
function startPlace(kind){
  const col = COLORS[0];
  const ghost = kind==='house'?makeHouse(col,0):kind==='barracks'?makeBarracks(col,0):kind==='tower'?makeTower(col,0):makeStore(col,0);
  ghost.traverse(o=>{ if(o.isMesh){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=.6; o.castShadow=false; } });
  const pad = new T.Mesh(new T.PlaneGeometry(BUILD[kind].size,BUILD[kind].size), new T.MeshBasicMaterial({color:0x44ff66, transparent:true, opacity:.4, depthWrite:false}));
  pad.rotation.x=-Math.PI/2; G.scene.add(ghost); G.scene.add(pad);
  const g = groundAtNDC(0,-.1) || {x:G.camS.x, z:G.camS.z};
  G.place = {kind, ghost, pad, x:g.x, z:g.z, ok:false, workers:G.sel.filter(u=>u.owner===0)};
  $('#placebar').classList.remove('hidden');
  drawPanel();
}
function updateGhost(){
  const pl=G.place, fp=footprint(pl.kind,pl.x,pl.z);
  const y = getH(fp.cx,fp.cz);
  pl.ghost.position.set(fp.cx,y,fp.cz); pl.pad.position.set(fp.cx,y+.1,fp.cz);
  pl.ok = validPlace(pl.kind,pl.x,pl.z,0);
  pl.why = terrCheck(0, pl.kind, fp.cx, fp.cz);
  if(pl.kind==='tc') regionPreview(pl, regionAt(fp.cx,fp.cz), pl.ok);
  const slow = pl.ok && pl.kind!=='tc' && !friendlyLand(0,fp.cx,fp.cz);
  $('#pTxt').textContent = pl.why || (BUILD[pl.kind].name + (!pl.ok ? ' – hier ist kein Platz' : slow ? ' – außerhalb deines Landes: Bau dauert 3× so lange' : ' – hier bauen?'));
  const pay = canPay(G.players[0], BUILD[pl.kind].cost); setCost(BUILD[pl.kind].cost);
  if(pl.ok && !pay) $('#pTxt').textContent = missingTxt(G.players[0], BUILD[pl.kind].cost);
  pl.pad.material.color.setHex(!pl.ok||!pay?0xff4444:slow?0xffcc33:0x44ff66);
  $('#pOk').classList.toggle('dim', !pl.ok || !pay); $('#pOk').disabled = !pl.ok || !pay;
}
function confirmPlace(){
  if(G.place && G.place.line) return confirmWall();
  const pl=G.place, p=G.players[0];
  if(!pl.ok){ EE.toast(pl.why || 'Hier kann nicht gebaut werden'); EE.sfx('error'); return; }
  if(!canPay(p,BUILD[pl.kind].cost)){ EE.sfx('error'); return; }
  if(!pl.workers.length){ const w=G.units.filter(u=>u.owner===0 && u.kind==='worker' && !u.inside && !u.dead).sort((a,b)=>Math.hypot(a.x-pl.x,a.z-pl.z)-Math.hypot(b.x-pl.x,b.z-pl.z)).slice(0,3); pl.workers=w; }
  pay(p,BUILD[pl.kind].cost);
  const b = addBuilding(pl.kind,0,pl.x,pl.z,false);
  pl.workers.forEach(u=>cmdBuild(u,b));
  if(pl.kind==='tc') EE.toast('Stadtzentrum wird gebaut – deine Bauern sind unterwegs');
  EE.sfx('place'); EE.vib(20);
  endPlace(); updateHUD(); select(pl.workers,null);
}
function cancelPlace(){ EE.click(); endPlace(); drawPanel(); }
function endPlace(){
  const pl=G.place; if(!pl) return;
  if(pl.ghost) G.scene.remove(pl.ghost); if(pl.pad) G.scene.remove(pl.pad);
  if(pl.ghosts) for(const gh of pl.ghosts) G.scene.remove(gh);
  if(pl.regM){ G.scene.remove(pl.regM); pl.regM.geometry.dispose(); }
  G.place=null; G.costH=null; $('#pCost').innerHTML=''; $('#placebar').classList.add('hidden'); $('#pGate').classList.add('hidden'); $('#pTxt').textContent='Gebäude mit dem Finger platzieren';
}

window.EEGame = { start:()=>start(), load:loadGame, hasSave:()=>!!readSave(), save:saveGame, stop, resume, running:()=>!!G, dbg:()=>G, dev:{chunks:(n)=>{ for(let i=0;i<(n||40);i++){ G.chunkT=0; updateChunks(); } }, build:(k,o,x,z,d)=>addBuilding(k,o,x,z,d), unit:(o,x,z,k)=>spawnWorker(o,x,z,k), attack:(u,t)=>cmdAttack(u,t), tiles:()=>{ updateCam(); updateTiles(true); updateChunks(); }, tap:(x,y)=>tapAt(x,y), addRes:(t,x,z)=>addRes(t,x,z), spawnDeer:(x,z,k)=>spawnDeer(x,z,k), reg:{regionAt, regNeighbors, regOwner, terrCheck, regPoly}, kill:(b)=>destroyBuilding(b), bowT:BOW_T, hb:(v)=>{HEADBAND_Y=v;},  place:(k,x,z)=>{ startPlace(k); G.place.x=x; G.place.z=z; updateGhost(); }}, tick:(n)=>{for(let i=0;i<n;i++) update(.05);}, scr:(x,y,z)=>toScreen(x,y,z), h:(x,z)=>getH(x,z) };
})();
