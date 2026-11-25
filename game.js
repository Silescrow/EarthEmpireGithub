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
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const lerp = (a,b,t) => a+(b-a)*t;
function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hash2(x,y,s){ let h=Math.sin(x*127.1+y*311.7+s*74.7)*43758.5453; return h-Math.floor(h); }
function vnoise(x,y,s){ const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi,s),b=hash2(xi+1,yi,s),c=hash2(xi,yi+1,s),d=hash2(xi+1,yi+1,s);
  return lerp(lerp(a,b,u),lerp(c,d,u),v); }
function fbm(x,y,s){ let f=0,a=.5,fr=1; for(let i=0;i<4;i++){ f+=a*vnoise(x*fr,y*fr,s+i*13); fr*=2; a*=.5; } return f; }

/* ---------- Daten ---------- */
const COLORS = [0x2f7bff,0xe23b3b,0xf2c230,0x3fbf5a,0x9b59ff,0xff8a1f,0x1fd1d1,0xff5fb0,0x8a5a2b,0xffffff,0x2b2b2b,0x7dff4a,0x1f4fa8,0xa8203a,0xc9a227,0x2e8b57,0x6a3d9a,0xff6f61];
const COLNAMES = ['Blau','Rot','Gelb','Grün','Lila','Orange','Türkis','Pink','Braun','Weiß','Schwarz','Hellgrün','Dunkelblau','Weinrot','Ocker','Waldgrün','Violett','Koralle'];
const RES = ['food','wood','stone','gold'];
const RES_DE = {food:'Nahrung',wood:'Holz',stone:'Stein',gold:'Gold',metal:'Metall',oil:'Öl'};
const BUILD = {
  tc:    {name:'Stadtzentrum', size:6, cost:{}, time:60, hp:1200, drop:['food','wood','stone','gold'], pop:5},
  house: {name:'Hütte', size:3, cost:{wood:30}, time:14, hp:300, pop:5},
  wall:  {name:'Palisade', size:1, cost:{wood:4}, time:3, hp:250},
  gate:  {name:'Tor', size:1, cost:{wood:15}, time:8, hp:500},
  store: {name:'Lager', size:3, cost:{wood:50}, time:18, hp:500, drop:['wood','stone','gold','food']},
};
const WORKER_COST = {food:50};
const WORKER_TIME = 10;
const CARRY = 10;
const START_RES = {food:200, wood:200, stone:100, gold:50};

/* ---------- Zustand ---------- */
let G = null; // aktives Spiel

/* ============================================================
   START / STOPP
   ============================================================ */
async function start(){
  if(G) stop();
  EE.toast('Die Welt wird geladen …');
  await Promise.all([loadModels(), loadWorldMask()]);
  EE.hideMenu();
  const S = EE.S;
  const NX = [2000,3000,4000,5400][S.map|0] || 3000, HS = [4,5,5,6][S.map|0] || 5, NZ = Math.round(NX*(LAT0-LAT1)/360/HS)*HS;
  const civ = EE.CIVS[S.civ] || EE.CIVS[0];
  const foes = clamp(S.ai||3, 1, 17);
  // Gegner möglichst weit weg wählen (bei wenigen Gegnern nie Nachbarn)
  const dist = (a,b)=>{ const p=CIV_POS[a[0]]||[0,0], q=CIV_POS[b[0]]||[0,0]; let dl=Math.abs(p[0]-q[0]); return Math.hypot(dl, (p[1]-q[1])*1.3); };
  const chosen=[civ], pool=EE.CIVS.filter(c=>c!==civ);
  while(chosen.length<=foes && pool.length){
    const sc = pool.map(c=>[c, Math.min(...chosen.map(o=>dist(c,o)))]).sort((a,b)=>b[1]-a[1]);
    const pick = pool[(Math.random()*pool.length)|0];
    chosen.push(pick); pool.splice(pool.indexOf(pick),1);
  }
  const others = chosen.slice(1);
  const gfx = S.gfx|0;
  G = { NX, NZ, HS, foes, civ, gfx, seed:(Math.random()*1e9)|0, t:0, units:[], builds:[], res:[], deer:[],
        players:[], sel:[], selB:null, place:null, running:true, raf:0, msgT:0 };
  G.rand = rng(G.seed);
  [civ, ...others.slice(0,foes)].forEach((c,i)=>G.players.push({id:i, civ:c, res:{...START_RES}, pop:0, popCap:0, tc:null, color:COLORS[i]}));
  buildUI();
  initRenderer();
  genWorld();
  buildOverview();
  setTimeout(()=>{ if(G) drawMinimap(); }, 50);
  initInput();
  updateHUD(); drawPanel();
  centerCamOn(G.players[0].tc.x, G.players[0].tc.z);
  $('#game').classList.remove('hidden');
  let last = performance.now();
  const loop = now => {
    if(!G || !G.running) return;
    const dt = Math.min(.05,(now-last)/1000); last = now;
    if(!G.paused) update(dt);
    render();
    G.raf = requestAnimationFrame(loop);
  };
  G.raf = requestAnimationFrame(loop);
  EE.toast('Die '+civ[0]+' erwachen in der Steinzeit');
  EE.music('calm');
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
    <div class="age"><span>${G.civ[0]}</span> · Steinzeit</div>
    <button class="hb" id="bPause" aria-label="Menü"><svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>
  </div>
  <canvas id="mini" width="150" height="150"></canvas>
  <button class="hb" id="bIdle" aria-label="Untätige Arbeiter"><svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" fill="#f0d3a8"/><path d="M4 21q1-8 8-8t8 8z" fill="#8a5a2b"/><text x="18" y="9" font-size="9" fill="#ffd24a" font-weight="700">z</text></svg><i id="idleN">0</i></button>
  <button class="hb" id="bHome" aria-label="Zur Basis"><svg viewBox="0 0 24 24"><path d="M3 12l9-8 9 8M6 10v10h12V10" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linejoin="round"/></svg></button>
  <div id="panel"></div>
  <div id="placebar" class="hidden"><span id="pTxt">Gebäude mit dem Finger platzieren</span><button class="pb gate hidden" id="pGate">Tor</button><button class="pb no" id="pNo">✕</button><button class="pb ok" id="pOk">✓</button></div>
  <div id="rotate"><div>Bitte das Handy quer halten</div></div>
  <div id="pause" class="hidden"><div class="pcard"><h2>Pause</h2>
    <button class="btn main small" id="pWeiter">Weiter</button>
    <button class="btn small" id="pMenu">Zum Hauptmenü</button></div></div>`;
  $('#bPause').onclick = () => { EE.click(); G.paused = true; $('#pause').classList.remove('hidden'); };
  $('#pWeiter').onclick = () => { EE.click(); G.paused = false; $('#pause').classList.add('hidden'); };
  $('#pMenu').onclick = () => { EE.click(); stop(); };
  $('#bIdle').onclick = () => { EE.click(); selectIdle(); };
  $('#bHome').onclick = () => { EE.click(); const tc=G.players[0].tc; if(tc){ centerCamOn(tc.x,tc.z); select([],tc); } };
  $('#pOk').onclick = confirmPlace;
  $('#pGate').onclick = ()=>{ if(G.place&&G.place.kind==='wall'){ G.place.gate=!G.place.gate; $('#pGate').classList.toggle('on',G.place.gate); EE.click(); } };
  $('#pNo').onclick = cancelPlace;
}

function updateHUD(){
  const p = G.players[0];
  for(const r of RES) $('#r-'+r+' b').textContent = Math.floor(p.res[r]);
  $('#r-pop b').textContent = p.pop+'/'+p.popCap;
  $('#r-pop').classList.toggle('full', p.pop>=p.popCap);
  const idle = G.units.filter(u=>u.owner===0 && u.state==='idle').length;
  $('#idleN').textContent = idle; $('#bIdle').classList.toggle('dim', idle===0);
}

function costText(c){ return Object.keys(c).map(k=>`<span class="c">${ICON[k]}${c[k]}</span>`).join(''); }
function canPay(p,c){ return Object.keys(c).every(k=>p.res[k]>=c[k]); }
function pay(p,c){ for(const k in c) p.res[k]-=c[k]; }

function drawPanel(){
  const el = $('#panel'); if(!el) return;
  const p = G.players[0];
  if(G.place){ el.innerHTML=''; el.className='hidden'; return; }
  if(G.selB){
    const b = G.selB, d = BUILD[b.kind];
    let h = `<div class="info"><b>${d.name}</b><small>${b.owner===0?(b.built<1?'Wird gebaut … '+Math.floor(b.built*100)+' %':'Leben '+Math.ceil(b.hp)+'/'+d.hp):'Gegner ('+COLNAMES[b.owner]+')'}</small></div>`;
    if(b.owner===0 && b.built>=1 && b.kind==='tc'){
      const q = b.queue.length;
      h += `<button class="ab" data-a="worker"><span class="ai">${ICON.pop}</span>Arbeiter<span class="ac">${costText(WORKER_COST)}</span>${q?'<i class="q">'+q+'</i>':''}</button>`;
      h += `<button class="ab lock" data-a="age"><span class="ai"><svg viewBox="0 0 24 24"><path d="M12 3l8 9h-5v9H9v-9H4z" fill="#e8b64a"/></svg></span>Bronzezeit<span class="ac">${costText({food:500,wood:300})}</span></button>`;
      if(q) h += `<div class="bar"><div style="width:${(b.qT/WORKER_TIME*100)|0}%"></div></div>`;
    }
    el.innerHTML = h; el.className='';
  } else if(G.sel.length){
    const ws = G.sel;
    const carry = ws.length===1 && ws[0].carry.amt>=1 ? ' · trägt '+Math.floor(ws[0].carry.amt)+' '+RES_DE[ws[0].carry.type] : '';
    const job = ws.length===1 ? ({idle:'Wartet',move:'Läuft',gather:'Sammelt',drop:'Bringt Ressourcen',build:'Baut',hunt:'Jagt'})[ws[0].state] : '';
    let h = `<div class="info"><b>${ws.length>1?ws.length+' Arbeiter':'Arbeiter'}</b><small>${job}${carry}</small></div>`;
    if(ws[0].owner===0){
      h += `<button class="ab" data-a="b-house"><span class="ai">${hutSVG()}</span>Hütte<span class="ac">${costText(BUILD.house.cost)}</span></button>`;
      h += `<button class="ab" data-a="b-store"><span class="ai">${storeSVG()}</span>Lager<span class="ac">${costText(BUILD.store.cost)}</span></button>`;
      h += `<button class="ab" data-a="b-wall"><span class="ai">${wallSVG()}</span>Palisade<span class="ac">${costText(BUILD.wall.cost)}/Stück</span></button>`;
      h += `<button class="ab lock" data-a="b-barr"><span class="ai"><svg viewBox="0 0 24 24"><path d="M5 4l10 10M19 4L9 14M7 13l-3 3 2 2 3-3M17 13l3 3-2 2-3-3" stroke="#e8b64a" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></span>Kaserne<span class="ac">bald</span></button>`;
    }
    el.innerHTML = h; el.className='';
  } else {
    el.innerHTML = `<div class="info hint"><b>Tipp</b><small>Ein Finger ziehen: Auswahlrahmen · Zwei Finger: Karte bewegen und zoomen</small></div>`;
    el.className='';
  }
  el.querySelectorAll('.ab').forEach(b=>b.onclick=()=>action(b.dataset.a));
}
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
  } else if(a==='b-barr'){ EE.toast('Die Kaserne kommt mit dem Kampf-Update');
  } else if(a==='b-wall'){ startWall();
  } else if(a.startsWith('b-')){
    const kind = a.slice(2);
    if(!canPay(p,BUILD[kind].cost)){ EE.sfx('error'); EE.toast('Nicht genug '+Object.keys(BUILD[kind].cost).map(k=>RES_DE[k]).join(' und ')); return; }
    startPlace(kind);
  }
  updateHUD(); drawPanel();
}

/* ============================================================
   RENDERER & KAMERA
   ============================================================ */
function initRenderer(){
  const c = $('#gc');
  const r = new T.WebGLRenderer({canvas:c, antialias:G.gfx>=1, powerPreference:'high-performance'});
  r.setPixelRatio(Math.min(window.devicePixelRatio||1, [1,1.5,2][G.gfx]));
  r.shadowMap.enabled = G.gfx>=1;
  r.shadowMap.type = T.PCFSoftShadowMap;
  r.outputColorSpace = T.SRGBColorSpace;
  G.renderer = r;
  const sc = new T.Scene();
  sc.background = new T.Color(0x9fd3ff);
  sc.fog = new T.Fog(0x9fd3ff, 60, 140);
  G.scene = sc;
  G.cam = new T.PerspectiveCamera(42, 1, .5, 400);
  G.camS = { x:0, z:0, dist:27, yaw:-.6, pitch:.95 };
  sc.add(new T.HemisphereLight(0xdff2ff, 0x5a6b3a, 1.1));
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
  s.dist = clamp(s.dist, 5, maxD);
  const far = clamp((s.dist-45)/(maxD-45),0,1);
  const pitch = lerp(.95, 1.38, far);
  const y = Math.max(getH(s.x,s.z), WATER_Y);
  const hd = Math.cos(pitch)*s.dist, yaw = s.yaw*(1-far);
  G.cam.position.set(s.x+Math.sin(yaw)*hd, y+Math.sin(pitch)*s.dist, s.z+Math.cos(yaw)*hd);
  G.cam.far = s.dist*4+200; G.cam.updateProjectionMatrix();
  G.cam.lookAt(s.x, y, s.z);
  G.scene.fog.near = s.dist*1.6+20; G.scene.fog.far = s.dist*4+120;
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
    img.src = window.EE_WORLD || 'weltkarte.png';
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
function desertAt(lon,lat){ let v=0; for(const b of DESERTS){ v=Math.max(v, inBox(lon,lat,b,3)); } return v; }
function mountainAt(lon,lat){ let v=0; for(const m of MOUNTAINS){ const d=Math.hypot((lon-m[0])/m[2],(lat-m[1])/m[3]); if(d<1) v=Math.max(v,(1-d*d)*m[4]); } return v; }
function coldAt(lat){ return clamp((Math.abs(lat)-55)/12,0,1); }

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
    const mt = mountainAt(lon,lat);
    if(mt>0) h += mt*land*(.55+fbm(x*.12,z*.12,H_SEED+21)*.9);
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
function getH(x,z){
  const s=G.hs, gx=(x+G.NX/2)/s, gz=(z+G.NZ/2)/s, n=G.hnx;
  const ix=clamp(Math.floor(gx),0,G.hnx-2), iz=clamp(Math.floor(gz),0,G.hnz-2);
  const fx=clamp(gx-ix,0,1), fz=clamp(gz-iz,0,1), a=G.hm;
  const h00=a[iz*n+ix], h10=a[iz*n+ix+1], h01=a[(iz+1)*n+ix], h11=a[(iz+1)*n+ix+1];
  return lerp(lerp(h00,h10,fx), lerp(h01,h11,fx), fz);
}
const WATER_Y = -.55;

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
  const tries = Math.round(CH*CH/9);
  for(let i=0;i<tries;i++){
    const x=x0+R()*CH, z=z0+R()*CH;
    if(rawLand(x,z)<.7) continue;
    if(G.bases.some(b=>Math.hypot(b.x-x,b.z-z)<12)) continue;
    const lon=toLon(x), lat=toLat(z), ds=desertAt(lon,lat), cold=coldAt(lat), mt=mountainAt(lon,lat);
    const forest = fbm(x*.03,z*.03,H_SEED+40);
    const r = R();
    if(ds>.5){ if(r<.02) placeCluster('tree',x,z,3,1.5); else if(r<.05) placeCluster('stone',x,z,2,1); }
    else if(forest>.53 && cold<.85 && mt<2.5 && r<.35) placeCluster('tree',x,z,5+(R()*9|0),2.2+R()*2.5);
    else if(r<.045) placeCluster('bush',x,z,3,1.6);
    else if(r<.075 && mt>.4) placeCluster('stone',x,z,3,1.5);
    else if(r<.085) placeCluster('gold',x,z,2,1.2);
    else if(r<.13 && cold<.9) spawnDeer(x,z);
  }
  addDecorChunk(x0,z0,CH,R);
  G.rand=saveR;
  if(G.farView){ for(const r of G.res) if(r.mesh && !r.mesh.inst && r.mesh.visible) r.mesh.visible=false; }
}
function updateChunks(){
  if(!G.chunks || G.farView) return;
  const CH=G.CH, ci=Math.floor((G.camS.x+G.NX/2)/CH), cj=Math.floor((G.camS.z+G.NZ/2)/CH);
  const rad = G.camS.dist<30?1:2;
  let made=0;
  for(let dj=-rad;dj<=rad && made<2;dj++) for(let di=-rad;di<=rad && made<2;di++){ const key=(ci+di)+','+(cj+dj); if(!G.chunks.has(key)){ genChunk(ci+di,cj+dj); made++; } }
}
function rawLand(x,z){ const m=landAt(toLon(x),toLat(z)); return m; }
function genWorld(){
  const NX=G.NX, NZ=G.NZ, R=G.rand; H_SEED=(G.seed%997)+1;
  // Startorte der Zivilisationen (echte Orte, bei Platzmangel etwas verschoben)
  G.bases = [];
  const nP = G.players.length;
  const minD = Math.max(14, Math.round(nP<=2 ? NX/11 : nP<=4 ? NX/12 : nP<=8 ? NX/14 : NX/22));
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
  // Raster für Wegfindung
  G.grid = new Uint8Array(NX*NZ);
  const PW=320; G.pfW=PW; G.pfG = new Float32Array(PW*PW); G.pfF = new Int32Array(PW*PW); G.pfS = new Uint32Array(PW*PW); G.pfC = new Uint32Array(PW*PW); G.pfStamp = 0;
  // Höhe je Feld einmal berechnen (schneller bei großen Karten), Steilheit aus den Nachbarfeldern
  const CHt = new Float32Array(NX*NZ);
  for(let j=0;j<NZ;j++) for(let i=0;i<NX;i++) CHt[j*NX+i] = getH(i-NX/2+.5, j-NZ/2+.5);
  for(let j=0;j<NZ;j++) for(let i=0;i<NX;i++){
    const k=j*NX+i, h=CHt[k];
    const edge = i<2||j<2||i>NX-3||j>NZ-3;
    const steep = !edge && (Math.abs(CHt[k+1]-CHt[k-1])+Math.abs(CHt[k+NX]-CHt[k-NX]))*.5 > 2.2;
    if(h<WATER_Y+.15 || edge || steep) G.grid[k]=1;
  }
  buildTerrain();
  buildWater();
  // Spieler: Stadtzentrum, Arbeiter, faire Startressourcen
  G.players.forEach((p,i)=>{
    const b = G.bases[i];
    p.tc = addBuilding('tc', i, b.x, b.z, true);
    for(let k=0;k<4;k++){ const a=k/4*Math.PI*2+.4; spawnWorker(i, b.x+Math.cos(a)*4.2, b.z+Math.sin(a)*4.2); }
    const ang = R()*Math.PI*2;
    placeCluster('bush', b.x+Math.cos(ang)*8, b.z+Math.sin(ang)*8, 6, 2.6, 6.5);
    placeCluster('stone', b.x+Math.cos(ang+2)*10, b.z+Math.sin(ang+2)*10, 3, 1.6, 6.5);
    placeCluster('gold', b.x+Math.cos(ang+3.3)*11, b.z+Math.sin(ang+3.3)*11, 3, 1.6, 6.5);
    placeCluster('tree', b.x+Math.cos(ang+4.6)*13, b.z+Math.sin(ang+4.6)*13, 22, 5, 6.5);
    for(let k=0;k<4;k++) spawnDeer(b.x+Math.cos(ang+1)*15+R()*4, b.z+Math.sin(ang+1)*15+R()*4);
  });
  // Natur entsteht in Chunks (Stücken): zuerst rund um alle Städte, der Rest beim Hinschauen
  G.chunks = new Set(); G.CH = 48;
  G.bases.forEach(b=>{ const ci=Math.floor((b.x+NX/2)/G.CH), cj=Math.floor((b.z+NZ/2)/G.CH); for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++) genChunk(ci+di,cj+dj); });
  // Rohstoffe an echten Orten
  for(const d of DEPOSITS){
    const n = Math.max(1, Math.round(d[5]*Math.sqrt(NX/320)));
    for(let k=0;k<n;k++) for(let t=0;t<25;t++){
      const lon=d[1]+R()*(d[2]-d[1]), lat=d[3]+R()*(d[4]-d[3]), x=fromLon(lon), z=fromLat(lat);
      if(rawLand(x,z)<.7) continue;
      placeCluster(d[0], x, z, d[0]==='oil'?1:3, 1.6); break;
    }
  }
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
function buildTerrain(){
  const NX=G.NX, NZ=G.NZ;
  const geo = new T.PlaneGeometry(NX, NZ, G.hnx-1, G.hnz-1);
  geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position, wA = new Float32Array(pos.count*4), wB = new Float32Array(pos.count), tint = new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i), h=G.hm[i]; pos.setY(i,h);
    const lon=toLon(x), lat=toLat(z);
    let grass=1, dirt=0, sand=0, rock=0, snow=0;
    const n1 = fbm(x*.07,z*.07,H_SEED+3);
    dirt = clamp((n1-.62)*3,0,.6);
    const ds = desertAt(lon,lat); sand = Math.max(sand, ds);
    for(const b of G.bases){ const d=Math.hypot(x-b.x,z-b.z); if(d<9) dirt=Math.max(dirt, clamp((9-d)/5,0,1)*.85); }
    if(h<WATER_Y+.45) sand = Math.max(sand, clamp((WATER_Y+.45-h)/.4,0,1));
    rock = clamp((h-(WATER_Y+3.1))/1.1,0,1);
    const cold = coldAt(lat);
    snow = Math.max(clamp((h-(WATER_Y+4.6))/.9,0,1), cold>.55 ? clamp((cold-.55)*2.5,0,1) : 0);
    // Gewichte normalisieren (Reihenfolge: Schnee > Fels > Sand > Erde > Gras)
    let rest = 1;
    const ws = snow*rest; rest -= ws;
    const wr = rock*rest; rest -= wr;
    const wsa = sand*rest; rest -= wsa;
    const wd = dirt*rest; rest -= wd;
    wA[i*4]=rest; wA[i*4+1]=wd; wA[i*4+2]=wsa; wA[i*4+3]=wr; wB[i]=ws;
    const v = .9+hash2(x,z,9)*.2, tn = cold*.25;
    tint[i*3]=v*(1-tn*.4); tint[i*3+1]=v; tint[i*3+2]=v*(1+tn*.3);
  }
  geo.setAttribute('aW', new T.BufferAttribute(wA,4));
  geo.setAttribute('aS', new T.BufferAttribute(wB,1));
  geo.setAttribute('color', new T.BufferAttribute(tint,3));
  geo.computeVertexNormals();
  const tex = { grass:makeGroundTex('grass'), dirt:makeGroundTex('dirt'), sand:makeGroundTex('sand'), rock:makeGroundTex('rock'), snow:makeGroundTex('snow') };
  G.groundTex = tex;
  const mt = new T.MeshLambertMaterial({vertexColors:true});
  mt.onBeforeCompile = sh => {
    for(const k in tex) sh.uniforms['t_'+k] = {value:tex[k]};
    sh.vertexShader = 'attribute vec4 aW;\nattribute float aS;\nvarying vec4 vW;\nvarying float vS;\nvarying vec2 vWP;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vW=aW; vS=aS; vWP=position.xz;');
    sh.fragmentShader = 'uniform sampler2D t_grass,t_dirt,t_sand,t_rock,t_snow;\nvarying vec4 vW;\nvarying float vS;\nvarying vec2 vWP;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec2 uv1 = vWP*.28, uv2 = vWP*.061 + vec2(.37,.11);
        vec3 cg = mix(texture2D(t_grass,uv1).rgb, texture2D(t_grass,uv2).rgb, .45);
        vec3 cd = mix(texture2D(t_dirt,uv1).rgb, texture2D(t_dirt,uv2).rgb, .4);
        vec3 cs = mix(texture2D(t_sand,uv1*.7).rgb, texture2D(t_sand,uv2).rgb, .4);
        vec3 cr = mix(texture2D(t_rock,uv1*.8).rgb, texture2D(t_rock,uv2).rgb, .4);
        vec3 cn = texture2D(t_snow,uv1*.6).rgb;
        vec3 ground = cg*vW.x + cd*vW.y + cs*vW.z + cr*vW.w + cn*vS;
        diffuseColor.rgb *= ground;`);
  };
  const m = new T.Mesh(geo, mt);
  m.receiveShadow = true;
  G.scene.add(m); G.terrain = m;
  const skirt = new T.Mesh(new T.PlaneGeometry(NX*6,NZ*6), new T.MeshLambertMaterial({color:0x123f66}));
  skirt.rotation.x = -Math.PI/2; skirt.position.y = WATER_Y-2; G.scene.add(skirt);
}
function buildWater(){
  const NX=G.NX, NZ=G.NZ;
  const geo = new T.PlaneGeometry(NX*1.4, NZ*1.6, Math.min(420,Math.round(NX/1.5)), Math.min(160,Math.round(NZ/1.5)));
  geo.rotateX(-Math.PI/2);
  const mt = new T.MeshLambertMaterial({color:0x2f8fd8, transparent:true, opacity:.84});
  mt.onBeforeCompile = sh => {
    sh.uniforms.uTime = {value:0}; G.waterU = sh.uniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\nvarying float vWave;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        float wx = position.x, wz = position.z;
        float w1 = sin(wx*.55 + uTime*1.3) * .5 + sin(wz*.42 - uTime*1.05) * .5;
        float w2 = sin((wx+wz)*.9 + uTime*2.1) * .35;
        float dX = cos(wx*.55 + uTime*1.3)*.55*.5 + cos((wx+wz)*.9 + uTime*2.1)*.9*.35;
        float dZ = -sin(wz*.42 - uTime*1.05)*0.0 + cos(wz*.42 - uTime*1.05)*.42*.5 + cos((wx+wz)*.9 + uTime*2.1)*.9*.35;
        vec3 objectNormal = normalize(vec3(-dX*.12, 1.0, -dZ*.12));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position); transformed.y += (w1+w2)*.07; vWave = w1+w2;`);
    sh.fragmentShader = 'varying float vWave;\n' + sh.fragmentShader
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.rgb += vec3(.10,.14,.16) * smoothstep(.55, 1.1, vWave);`);
  };
  const w = new T.Mesh(geo, mt);
  w.position.y = WATER_Y; G.scene.add(w); G.water = w;
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
  GEO.ring = new T.RingGeometry(.48,.62,24); GEO.ring.rotateX(-Math.PI/2);
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
function makeBush(R){
  geos();
  const g = new T.Group();
  if(MODELS.bush){ const bm=modelMesh('bush', 1.5+R()*.3); g.add(bm);
    for(let i=0;i<9;i++){ const a=R()*6.28, y=.35+R()*.55, r=.55+R()*.15; g.add(mesh(GEO.berry, mat(0xd8283a), Math.cos(a)*r, y, Math.sin(a)*r)); }
    g.rotation.y = R()*6.28; return g; }
  const b = mesh(GEO.bush, mat(0x3f8f3a), 0,.45,0); b.scale.set(1.1,.8,1.1); g.add(b);
  for(let i=0;i<7;i++){ const a=R()*6.28, y=.35+R()*.4, r=.5+R()*.12;
    g.add(mesh(GEO.berry, mat(0xd8283a), Math.cos(a)*r, y, Math.sin(a)*r)); }
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
    if(gold) for(let i=0;i<5;i++){ const a=R()*6.28; g.add(mesh(GEO.nug, mat(0xffd24a,{emissive:0x553300}), Math.cos(a)*.6, .35+R()*.35, Math.sin(a)*.55)); }
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
function makeDeer(){
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
  return g;
}
function makeWorker(color){
  geos();
  const key = Math.random()<.5 ? 'cavem' : 'cavef';
  if(MODELS[key]){ const g = makeRigged(key, 1.45, color); if(g){ g.rig.hips.userData.y0 = g.rig.hips.position.y; return g; } }
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
  const band = new T.Mesh(new T.TorusGeometry(.13*r.H,.018*r.H,6,16), new T.MeshLambertMaterial({color}));
  band.rotation.set(Math.PI/2,0,.5); band.position.set(0,.02*r.H,0); band.scale.set(1.2,.85,1); B.chest.add(band);
  const club = new T.Mesh(new T.CylinderGeometry(.012*r.H,.028*r.H,.28*r.H,6), new T.MeshLambertMaterial({color:0x6a4020}));
  club.position.set(0,-.06*r.H,.08*r.H); club.rotation.x=1.4; B.handR.add(club);
  const load = new T.Mesh(new T.BoxGeometry(.2*r.H,.12*r.H,.1*r.H), new T.MeshLambertMaterial({color:0x9a6232}));
  load.position.set(0,0,-.13*r.H); load.visible=false; B.chest.add(load);
  g.rig = B; g.load = load; g.club = club; g.isRigged = true; g.restZ = r.restZ;
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


function makeTC(color, civ){
  geos();
  const g = new T.Group();
  if(MODELS.tc){
    g.add(modelMesh('tc', 6.2));
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
function makeHouse(color){
  geos();
  const g = new T.Group();
  if(MODELS.house){ g.add(modelMesh('house', 3.3)); teamFlag(g, color, 1.1, 1.5, 1.1, 1.4); return g; }
  const tent = mesh(new T.ConeGeometry(1.05,1.9,7), mat(0xb98b56), 0,.95,0); g.add(tent);
  const hide = mesh(new T.ConeGeometry(.75,1.1,7,1,true,0,2.2), mat(0x8a5a2e,{side:T.DoubleSide}), 0,.7,0); hide.rotation.y=1; g.add(hide);
  for(let i=0;i<4;i++){ const a=i*1.57+.4; const p=mesh(GEO.box, mat(0x5a3818), Math.cos(a)*.18,2,Math.sin(a)*.18); p.scale.set(.05,.6,.05); p.rotation.set(Math.sin(a)*.4,0,-Math.cos(a)*.4); g.add(p); }
  const band = mesh(GEO.box, mat(color), 0,1.25,.62); band.scale.set(.35,.12,.05); g.add(band);
  return g;
}
function makeStore(color){
  geos();
  const g = new T.Group();
  if(MODELS.store){ const m=modelMesh('store', 3.7); g.add(m); teamFlag(g, color, 1.6, 0, 1.4, 2.8); return g; }
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
const MODEL_FILES = { tc:'models/rundhuette.glb', house:'models/rundhuette.glb', store:'models/steinhaus.glb', barracks:'models/zahnhaus.glb', fence:'models/zaun.glb', tree:'models/baum.glb', palm:'models/palme.glb', bush:'models/busch.glb', rock:'models/fels.glb', ore:'models/erz.glb', mono:'models/monolith.glb', cavem:'models/hoehlenmann.glb', cavef:'models/hoehlenfrau.glb', palisade:'models/zaun_knochen.glb', fire:'models/lagerfeuer.glb' };
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
function loadModels(){
  if(modelsReady) return modelsReady;
  const src = window.EE_MODELS || {};
  modelsReady = Promise.all(Object.entries(MODEL_FILES).map(([k,f]) =>
    fetch(src[k] || f).then(r=>{ if(!r.ok) throw 0; return r.arrayBuffer(); }).then(parseGLB).then(m=>{ MODELS[k]=m; if(k==='tree'||k==='palm'||k==='bush'){ m.mat.color.setRGB(1.25,1.55,1.05); m.mat.emissive.setHex(0x14220a); } }).catch(()=>{})
  ));
  return modelsReady;
}
function modelMesh(k, width){
  const m = MODELS[k]; const bb = m.geo.boundingBox;
  const s = width / Math.max(bb.max.x-bb.min.x, bb.max.z-bb.min.z);
  const o = new T.Mesh(m.geo, m.mat); o.scale.setScalar(s); o.castShadow=true; o.receiveShadow=true;
  return o;
}
function treeInstance(x,z){
  const R=G.rand, h=getH(x,z);
  const palm = MODELS.palm && (h < WATER_Y+1.1 || R()<.08);
  const key = (palm?'palm':'tree')+':'+Math.floor((x+G.NX/2)/48)+','+Math.floor((z+G.NZ/2)/48);
  if(!G.trees) G.trees={};
  let t = G.trees[key];
  if(!t){ const m=MODELS[palm?'palm':'tree']; const im=new T.InstancedMesh(m.geo, m.mat, 700); im.count=0; im.castShadow=true; im.receiveShadow=true; G.scene.add(im); t=G.trees[key]={im}; }
  const bb=MODELS[palm?'palm':'tree'].geo.boundingBox, hgt=bb.max.y-bb.min.y;
  const sc=(palm?3.6:3.0)/hgt*(.8+R()*.45);
  const o=new T.Object3D(); o.position.set(x,h-.05,z); o.rotation.y=R()*6.28; o.scale.setScalar(sc); o.updateMatrix();
  const i=t.im.count; if(i>=700) return makeTree(R);
  t.im.setMatrixAt(i,o.matrix); t.im.count++; t.im.instanceMatrix.needsUpdate=true; t.im.computeBoundingSphere();
  const d=new T.Object3D(); d.inst={im:t.im,i}; return d;
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
const cellIdx = (x,z) => { const i=Math.floor(x+G.NX/2), j=Math.floor(z+G.NZ/2); return (i<0||j<0||i>=G.NX||j>=G.NZ)?-1:j*G.NX+i; };
function freeCell(x,z){ const k=cellIdx(x,z); return k>=0 && !G.grid[k]; }

function placeCluster(type, cx, cz, count, spread, minB){
  const R = G.rand;
  for(let i=0,tries=0;i<count && tries<count*6;tries++){
    const a=R()*6.28, r=Math.sqrt(R())*spread;
    const x=Math.round(cx+Math.cos(a)*r)+.5, z=Math.round(cz+Math.sin(a)*r)+.5;
    if(!freeCell(x,z)) continue;
    if(G.bases.some(b=>Math.hypot(b.x-x,b.z-z)<(minB||6.5))) continue;
    if(getH(x,z)<WATER_Y+.3) continue;
    addRes(type,x,z); i++;
  }
}
function addRes(type,x,z){
  let m, kind, amt;
  if(type==='tree' && MODELS.tree && G.gfx>=1){ m=treeInstance(x,z); kind='wood'; amt=100; }
  else if(type==='tree'){ m=makeTree(G.rand); kind='wood'; amt=100; }
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
  return r;
}
function spawnDeer(x,z){
  if(!freeCell(x,z) || getH(x,z)<WATER_Y+.3) return;
  const m = makeDeer(); m.position.set(x,getH(x,z),z); m.rotation.y = G.rand()*6.28;
  G.scene.add(m);
  const d = {type:'deer', kind:'food', amt:100, max:100, x, z, mesh:m, alive:true, dead:false, r:.5,
             tx:x, tz:z, wait:G.rand()*4, phase:G.rand()*6, deer:true};
  G.deer.push(d); G.res.push(d);
}
function spawnWorker(owner,x,z){
  const m = makeWorker(COLORS[owner]);
  m.position.set(x,getH(x,z),z);
  G.scene.add(m);
  const ring = new T.Mesh(GEO.ring, new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.9, depthWrite:false}));
  ring.visible=false; G.scene.add(ring);
  const u = {kind:'worker', owner, x, z, mesh:m, ring, state:'idle', path:null, pi:0, carry:{type:null,amt:0},
             target:null, site:null, speed:3.1, phase:Math.random()*6, face:0, repath:0, gt:0, lastType:null};
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
  const m = kind==='tc'?makeTC(col, G.players[owner] && G.players[owner].civ):kind==='house'?makeHouse(col):makeStore(col);
  let hy = 0; for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1],[0,0]]) hy += getH(fp.cx+dx*d.size/2*.8, fp.cz+dz*d.size/2*.8);
  m.position.set(fp.cx, hy/5-.05, fp.cz);
  G.scene.add(m);
  for(const k of fp.cells) if(k>=0) G.grid[k]=1;
  const ring = new T.Mesh(new T.RingGeometry(d.size*.62, d.size*.7, 32), new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.85, depthWrite:false}));
  ring.rotation.x = -Math.PI/2; ring.position.set(fp.cx, m.position.y+.08, fp.cz); ring.visible=false; G.scene.add(ring);
  const b = {kind, owner, x:fp.cx, z:fp.cz, size:d.size, mesh:m, ring, cells:fp.cells, built:done?1:0, hp:done?d.hp:1, queue:[], qT:0};
  if(!done){ m.scale.y = .25; m.traverse(o=>{ if(o.material && o.isMesh){ o.material = o.material.clone(); o.material.transparent=true; o.material.opacity=.55; } }); }
  else if(d.pop) G.players[owner].popCap += d.pop;
  G.builds.push(b);
  return b;
}

let DECOR_GEO=null, DECOR_MAT=null, FLOWER_GEO=null, FLOWER_MAT=null;
function addDecorChunk(x0,z0,CH,R){
  if(!DECOR_GEO){ DECOR_GEO=new T.ConeGeometry(.08,.45,3); DECOR_GEO.translate(0,.2,0); DECOR_MAT=new T.MeshLambertMaterial({color:0x5e9e36});
    FLOWER_GEO=new T.IcosahedronGeometry(.08,0); FLOWER_MAT=new T.MeshBasicMaterial({color:0xffffff}); }
  const count=[90,220,420][G.gfx];
  const im=new T.InstancedMesh(DECOR_GEO, DECOR_MAT, count), fl=new T.InstancedMesh(FLOWER_GEO, FLOWER_MAT, Math.floor(count/4));
  const m4=new T.Matrix4(), q=new T.Quaternion(), sv=new T.Vector3(), p=new T.Vector3(), e=new T.Euler(), c=new T.Color();
  const fcols=[0xfff1a8,0xff9fc4,0xb9a3ff,0xffffff]; let gi=0, fi=0;
  for(let k=0;k<count*3 && gi<count;k++){
    const x=x0+R()*CH, z=z0+R()*CH, h=getH(x,z);
    if(h<WATER_Y+.4 || h>WATER_Y+3.2) continue;
    const lon=toLon(x), lat=toLat(z); if(desertAt(lon,lat)>.3 || coldAt(lat)>.7) continue;
    if(G.bases.some(b=>Math.hypot(b.x-x,b.z-z)<7)) continue;
    e.set(0,R()*6,0); q.setFromEuler(e); const sc=.7+R()*.8; sv.set(sc,sc,sc); p.set(x,h,z);
    m4.compose(p,q,sv); im.setMatrixAt(gi++, m4);
    if(fi<fl.count && R()<.25){ p.set(x+.2,h+.12,z+.1); sv.set(1,1,1); m4.compose(p,q,sv); fl.setMatrixAt(fi, m4); fl.setColorAt(fi, c.setHex(fcols[(R()*4)|0])); fi++; }
  }
  if(!gi) return;
  im.count=gi; fl.count=fi; im.computeBoundingSphere(); if(fi) fl.computeBoundingSphere();
  im.receiveShadow=true; G.scene.add(im); if(fi) G.scene.add(fl);
  (G.decor||(G.decor=[])).push(im); if(fi) G.decor.push(fl);
  if(G.farView){ im.visible=false; fl.visible=false; }
}

/* ============================================================
   WEGFINDUNG (A*)
   ============================================================ */
function nearestFree(i,j){
  const NX=G.NX, NZ=G.NZ;
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
      const ng = g[lk] + (di&&dj?1.414:1);
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
function moveTo(u,x,z){ u.path = findPath(u.x,u.z,x,z); u.pi=0; return !!u.path; }
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
  const step = u.speed*dt;
  if(d<=step+.05){ u.x=tx; u.z=tz; u.pi++; return u.pi>=u.path.length; }
  u.x += dx/d*step; u.z += dz/d*step; u.face = Math.atan2(dx,dz); u.moving=true;
  return false;
}
function near(u,x,z,r){ return Math.hypot(u.x-x,u.z-z)<=r; }

function updateWorker(u,dt){
  const p = G.players[u.owner];
  u.moving=false; u.working=false;
  const gatherRate = (u.owner===0 && G.civ[0]==='Chinesen') ? 1.15 : 1;
  switch(u.state){
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
      if(near(u,r.x,r.z,1.5)){ sfxAt('deer',r.x,r.z); r.dead=true; r.mesh.rotation.z=Math.PI/2; r.mesh.position.y=getH(r.x,r.z)+.25; if(u.owner===0) EE.vib(20); u.state='gather'; }
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
        p.res[u.carry.type] += u.carry.amt; u.carry.amt=0; u.path=null;
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
      if(!b || b.built>=1 || b.dead){ u.state='idle'; autoJob(u); break; }
      if(near(u,b.x,b.z,b.size*.5+1.1)){
        u.path=null; u.working=true; u.face=Math.atan2(b.x-u.x,b.z-u.z);
        u.hitT=(u.hitT||0)+dt; if(u.hitT>.9){ u.hitT=0; sfxAt('build',u.x,u.z,.8); }
        b.built = Math.min(1, b.built + dt/BUILD[b.kind].time);
        b.hp = Math.max(1, BUILD[b.kind].hp*b.built);
        b.mesh.scale.y = .25 + .75*b.built;
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
  if(m.isRigged){ if(!G.farView) poseRig(m, u.moving?'walk':u.working?'work':'idle', u.phase); }
  else {
  const sw = u.moving ? Math.sin(u.phase)*.7 : 0;
  m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
  m.arms[0].rotation.x = -sw*.8;
  m.arms[1].rotation.x = u.working ? -1.4+Math.sin(u.phase)*.9 : sw*.8;
  m.club.rotation.x = u.working ? .6+Math.sin(u.phase)*.9 : .6;
  }
  m.load.visible = u.carry.amt>0.5;
  if(m.load.visible) m.load.material = mat(LOADCOL[u.carry.type]);
  u.ring.position.set(u.x, m.position.y+.06, u.z); u.ring.scale.setScalar(1.3);
}
let panelT = 0; function drawPanelSoon(){ panelT = .25; }
function sfxAt(name, x, z, v){ if(!G || G.farView) return; const d=Math.hypot(x-G.camS.x, z-G.camS.z); const k=clamp(1-d/(G.camS.dist*.9+6),0,1); if(k>0) EE.sfx(name, (v||1)*k*k); }

function autoJob(u){
  const r = nearestRes(u.lastType||'food', u.x,u.z, 14, u.owner) || nearestRes('wood', u.x,u.z, 20, u.owner);
  if(r) cmdGather(u,r);
}
function removeRes(r){
  r.alive=false; G.scene.remove(r.mesh);
  if(r.mesh.inst){ const {im,i}=r.mesh.inst; im.setMatrixAt(i, new T.Matrix4().makeScale(0,0,0)); im.instanceMatrix.needsUpdate=true; }
  if(!r.deer){ const k=cellIdx(r.x,r.z); if(k>=0) G.grid[k]=0; }
}
function finishBuilding(b){
  const d = BUILD[b.kind];
  b.built=1; b.hp=d.hp; b.mesh.scale.y=1;
  b.mesh.traverse(o=>{ if(o.isMesh && o.material && o.material.transparent && o.material.opacity<.6){ o.material.opacity=1; o.material.transparent=false; } });
  if(d.pop) G.players[b.owner].popCap += d.pop;
  if(b.wallId){
    for(const u of G.units) if(u.site===b){ const next=G.builds.filter(o=>o.wallId===b.wallId && o.built<1).sort((p,q)=>Math.hypot(p.x-u.x,p.z-u.z)-Math.hypot(q.x-u.x,q.z-u.z))[0];
      if(next) cmdBuild(u,next); else { u.site=null; u.state='idle'; autoJob(u); } }
    if(b.owner===0 && !G.builds.some(o=>o.wallId===b.wallId && o.built<1)){ EE.toast('Palisade fertig gebaut'); EE.vib(25); EE.sfx('done',.8); }
    return;
  }
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
    else { const sp=(d.hunted>0?1.2:1.5)*dt; d.x+=dx/dist*Math.min(sp,dist); d.z+=dz/dist*Math.min(sp,dist); m.rotation.y=Math.atan2(dx,dz); moving=true; }
  }
  d.phase += dt*(moving?10:1);
  m.position.set(d.x, getH(d.x,d.z), d.z);
  const s = moving?Math.sin(d.phase)*.5:0;
  m.legs[0].rotation.x=s; m.legs[3].rotation.x=s; m.legs[1].rotation.x=-s; m.legs[2].rotation.x=-s;
}

function updateBuilding(b,dt){
  if(b.kind==='tc' && b.mesh.fireFx && !G.farView) animateFire(b.mesh.fireFx, G.t+b.x, dt);

  if(b.built<1 || !b.queue.length) return;
  const p = G.players[b.owner];
  if(p.pop>=p.popCap){ if(b.owner===0 && !b.warned){ EE.toast('Zu wenig Platz – baue eine Hütte'); b.warned=true; } return; }
  b.warned=false;
  b.qT += dt;
  if(b.qT>=WORKER_TIME){
    b.qT=0; b.queue.shift();
    const a = G.rand()*6.28, x=b.x+Math.cos(a)*4.3, z=b.z+Math.sin(a)*4.3;
    const k = cellIdx(x,z); const NX=G.NX, NZ=G.NZ;
    let sx=x, sz=z; if(k<0||G.grid[k]){ const f=nearestFree(Math.floor(x+NX/2),Math.floor(z+NZ/2)); if(f>=0){ sx=f%NX-NX/2+.5; sz=((f/NX)|0)-NZ/2+.5; } }
    const u = spawnWorker(b.owner, sx, sz);
    if(b.owner===0){ updateHUD(); EE.vib(15); EE.sfx('trained',.8); }
    autoJob(u);
  }
  if(G.selB===b) drawPanelSoon();
}

/* ---------- einfache Gegner-KI (Wirtschaft) ---------- */
function updateAI(p,dt){
  p.aiT = (p.aiT||0) - dt; if(p.aiT>0) return; p.aiT = 1.5;
  const tc = p.tc; if(!tc) return;
  const mine = G.units.filter(u=>u.owner===p.id);
  const want = ['food','wood','food','wood','stone','gold','wood','food'];
  mine.forEach((u,i)=>{ if(u.state==='idle'){ const r=nearestRes(want[i%want.length], u.x,u.z, 30, p.id); if(r) cmdGather(u,r); } });
  if(mine.length<10 && !tc.queue.length && p.res.food>=50 && p.pop<p.popCap){ p.res.food-=50; tc.queue.push('worker'); }
  if(p.pop>=p.popCap-1 && p.res.wood>=30 && !G.builds.some(b=>b.owner===p.id && b.built<1)){
    for(let t=0;t<20;t++){ const a=G.rand()*6.28, r=6+G.rand()*4; const x=tc.x+Math.cos(a)*r, z=tc.z+Math.sin(a)*r;
      if(validPlace('house',x,z)){ p.res.wood-=30; const b=addBuilding('house',p.id,x,z,false); const w=mine.find(u=>u.state!=='build'); if(w) cmdBuild(w,b); break; } }
  }
}

/* ============================================================
   UPDATE & RENDER
   ============================================================ */
function update(dt){
  G.t += dt;
  for(const u of G.units) updateWorker(u,dt);
  for(const d of G.deer) updateDeer(d,dt);
  for(const b of G.builds) updateBuilding(b,dt);
  for(let i=1;i<G.players.length;i++) updateAI(G.players[i],dt);
  if(G.waterU) G.waterU.value = G.t;
  G.chunkT=(G.chunkT||0)-dt; if(G.chunkT<=0){ G.chunkT=.35; updateChunks(); }
  G.ambT=(G.ambT||0)-dt; if(G.ambT<=0){ G.ambT=.5; updateAmbient(); }
  FLAG_T.value = G.t;
  updateOverview();
  if(panelT>0){ panelT-=dt; if(panelT<=0) drawPanel(); }
  G.hudT = (G.hudT||0)-dt; if(G.hudT<=0){ G.hudT=.5; updateHUD(); if(G.sel.length===1) drawPanel(); }
  G.miniT = (G.miniT||0)-dt; if(G.miniT<=0){ G.miniT=.25; drawMinimap(); }
  if(G.place && G.place.kind!=='wall') updateGhost();
}
function updateAmbient(){
  const cx=G.camS.x, cz=G.camS.z, far=G.farView;
  let water=0; for(let i=0;i<12;i++){ const a=i/12*6.28; if(getH(cx+Math.cos(a)*10, cz+Math.sin(a)*10)<WATER_Y) water++; }
  let trees=0; for(const r of G.res){ if(r.kind==='wood' && r.alive && Math.abs(r.x-cx)<14 && Math.abs(r.z-cz)<14) trees++; if(trees>25) break; }
  let fire=0; for(const p of G.players){ if(p.tc){ const d=Math.hypot(p.tc.x-cx,p.tc.z-cz); fire=Math.max(fire, clamp(1-d/14,0,1)); } }
  const zoom=clamp(G.camS.dist/80,0,1);
  EE.ambient({ wind:.25+zoom*.75, waves: far?0:water/12, birds: far?0:clamp(trees/18,0,1)*(1-zoom), fire: far?0:fire*(1-zoom) });
}
function render(){ updateCam(); G.renderer.render(G.scene, G.cam); }

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
  if(G.lastFar!==far){ G.lastFar=far; for(const r of G.res) if(r.mesh && !r.mesh.inst) r.mesh.visible=!far; for(const u of G.units) u.mesh.visible=!far; if(G.decor) G.decor.forEach(d=>d.visible=!far); }
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
  const hit = _ray.intersectObject(G.terrain,false)[0];
  return hit ? hit.point : groundAtNDC(_v2.x,_v2.y);
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
    if(G.place && G.place.kind==='wall'){ const g0=groundAt(p.sx,p.sy); if(g0){ G.place.ax=g0.x; G.place.az=g0.z; } gesture={type:'wall'}; }
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
  for(const u of G.units){ const s=toScreen(u.x, getH(u.x,u.z)+.7, u.z); if(!s.ok) continue; const d=Math.hypot(s.x-sx,s.y-sy); if(d<bd){bd=d;best={u};} }
  if(best) return best;
  bd = 1e9;
  for(const b of G.builds){ const s=toScreen(b.x, b.mesh.position.y+1, b.z); const r = 26+b.size*14; const d=Math.hypot(s.x-sx,s.y-sy); if(d<r && d<bd){bd=d;best={b};} }
  if(best) return best;
  bd = 30;
  for(const r of G.res){ if(!r.alive) continue; const s=toScreen(r.x, getH(r.x,r.z)+.6, r.z); if(!s.ok) continue; const d=Math.hypot(s.x-sx,s.y-sy); if(d<bd){bd=d;best={r};} }
  return best;
}
function tapAt(sx,sy){
  if(G.place){ const g=groundAt(sx,sy); if(g){ if(G.place.kind==='wall'){ G.place.bx=g.x; G.place.bz=g.z; updateWallGhost(); } else { G.place.x=g.x; G.place.z=g.z; } } return; }
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
    select([], null); EE.toast('Gegnerischer Arbeiter ('+COLNAMES[hit.u.owner]+')'); return;
  }
  if(mine.length){
    if(hit && hit.r && (hit.r.kind==='metal'||hit.r.kind==='oil')){ EE.toast(RES_DE[hit.r.kind]+'-Vorkommen – kann noch nicht abgebaut werden'); return; }
    if(hit && hit.r){ mine.forEach(u=>cmdGather(u,hit.r)); marker(hit.r.x,hit.r.z,0xffd24a); EE.vib(10); drawPanel(); return; }
    if(hit && hit.b && hit.b.owner===0 && hit.b.built<1){ mine.forEach(u=>cmdBuild(u,hit.b)); marker(hit.b.x,hit.b.z,0xffd24a); EE.vib(10); drawPanel(); return; }
    if(hit && hit.b && hit.b.owner===0 && BUILD[hit.b.kind].drop){ mine.forEach(u=>{ if(u.carry.amt>0){u.state='drop';u.path=null;} }); marker(hit.b.x,hit.b.z,0xffffff); return; }
    if(hit && hit.b){ select([],hit.b); EE.click(); return; }
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
  for(const u of G.sel) u.ring.visible=false;
  if(G.selB) G.selB.ring.visible=false;
  G.sel = us; G.selB = b;
  for(const u of us){ u.ring.visible=true; u.ring.material.color.setHex(0xffffff); }
  if(b){ b.ring.visible=true; }
  drawPanel();
}
function selectIdle(){
  const idle = G.units.filter(u=>u.owner===0 && u.state==='idle');
  if(!idle.length){ EE.toast('Alle Arbeiter sind beschäftigt'); return; }
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
function startWall(){
  const g = groundAtNDC(0,-.1) || {x:G.camS.x, z:G.camS.z};
  G.place = {kind:'wall', ax:g.x, az:g.z, bx:g.x+4, bz:g.z, gate:false, ghosts:[], cells:[], ok:false, workers:G.sel.filter(u=>u.owner===0)};
  $('#pTxt').textContent='Mit dem Finger eine Linie ziehen';
  $('#pGate').classList.remove('hidden'); $('#pGate').classList.remove('on');
  $('#placebar').classList.remove('hidden');
  drawPanel(); updateWallGhost();
}
function updateWallGhost(){
  const pl=G.place, NX=G.NX, NZ=G.NZ;
  for(const gh of pl.ghosts) G.scene.remove(gh); pl.ghosts=[];
  const dx=pl.bx-pl.ax, dz=pl.bz-pl.az, L=Math.min(Math.hypot(dx,dz), 50);
  const n = Math.max(1, Math.round(L/1.15)), seg = Math.max(.6, L/n);
  const ux = L>0.01?dx/Math.hypot(dx,dz):1, uz = L>0.01?dz/Math.hypot(dx,dz):0;
  const ang = Math.atan2(uz, ux), mid = Math.floor(n/2);
  pl.cells = [];
  for(let i=0;i<n;i++){
    const x = pl.ax + ux*seg*(i+.5), z = pl.az + uz*seg*(i+.5);
    const ks = new Set();
    for(let t=-.45;t<=.45;t+=.15){ const k=cellIdx(x+ux*seg*t, z+uz*seg*t); ks.add(k); }
    const arr=[...ks];
    const ok = arr.every(k=>k>=0 && !G.grid[k]) && getH(x,z)>WATER_Y+.15 && !pl.cells.some(c=>c.ks.some(k=>arr.includes(k)) && false);
    pl.cells.push({ks:arr, x, z, len:seg, ok, gate: pl.gate && n>=3 && i===mid});
  }
  let okCount=0;
  for(const c of pl.cells){
    const gh = makeWallPiece(COLORS[0], c.gate, c.len);
    gh.traverse(o=>{ if(o.isMesh){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=.55; o.material.color.setHex(c.ok?0x66ff77:0xff5555); o.castShadow=false; } });
    gh.position.set(c.x, getH(c.x,c.z), c.z); gh.rotation.y = -ang;
    G.scene.add(gh); pl.ghosts.push(gh); if(c.ok) okCount++;
  }
  pl.ang = ang;
  const cost = pl.cells.reduce((s,c)=>s+(c.ok?(c.gate?BUILD.gate.cost.wood:BUILD.wall.cost.wood):0),0);
  pl.cost = cost; pl.ok = okCount>0;
  $('#pTxt').textContent = okCount ? okCount+' Stück · '+cost+' Holz' : 'Mit dem Finger eine Linie ziehen';
  $('#pOk').classList.toggle('dim', !pl.ok);
}
function confirmWall(){
  const pl=G.place, p=G.players[0];
  if(!pl.ok){ EE.toast('Hier kann keine Palisade stehen'); return; }
  if(p.res.wood < pl.cost){ EE.toast('Nicht genug Holz ('+pl.cost+' nötig)'); return; }
  p.res.wood -= pl.cost;
  const id = WALL_ID++, ang = pl.ang||0, segs=[];
  for(const c of pl.cells){ if(!c.ok) continue; segs.push(addWall(0, c, ang, id)); }
  const ws = pl.workers;
  ws.forEach((u,i)=>{ const seg = segs[Math.floor(i*segs.length/Math.max(1,ws.length))]; if(seg) cmdBuild(u,seg); });
  EE.sfx('place'); EE.vib(20);
  endPlace(); updateHUD(); select(ws,null);
}
function addWall(owner, c, ang, id){
  const kind = c.gate?'gate':'wall', d=BUILD[kind];
  const m = makeWallPiece(COLORS[owner], c.gate, c.len);
  m.position.set(c.x, getH(c.x,c.z)-.03, c.z); m.rotation.y = -ang;
  G.scene.add(m);
  if(!c.gate) for(const k of c.ks) if(k>=0) G.grid[k]=1;
  const ring = new T.Mesh(new T.RingGeometry(.55,.68,20), new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.85, depthWrite:false}));
  ring.rotation.x=-Math.PI/2; ring.position.set(c.x, m.position.y+.08, c.z); ring.visible=false; G.scene.add(ring);
  const b = {kind, owner, x:c.x, z:c.z, size:1, mesh:m, ring, cells:c.gate?[]:c.ks.filter(k=>k>=0), built:0, hp:1, queue:[], qT:0, wallId:id};
  m.scale.y=.25; m.traverse(o=>{ if(o.material && o.isMesh){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=.55; } });
  G.builds.push(b);
  return b;
}

/* ---------- Gebäude platzieren ---------- */
function validPlace(kind,x,z){
  const fp = footprint(kind,x,z);
  if(fp.cells.some(k=>k<0||G.grid[k])) return false;
  for(const u of G.units){ if(Math.abs(u.x-fp.cx)<BUILD[kind].size/2+.2 && Math.abs(u.z-fp.cz)<BUILD[kind].size/2+.2 && u.owner!==0) return false; }
  return true;
}
function startPlace(kind){
  const col = COLORS[0];
  const ghost = kind==='house'?makeHouse(col):makeStore(col);
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
  pl.ok = validPlace(pl.kind,pl.x,pl.z);
  pl.pad.material.color.setHex(pl.ok?0x44ff66:0xff4444);
  $('#pOk').classList.toggle('dim', !pl.ok);
}
function confirmPlace(){
  if(G.place && G.place.kind==='wall') return confirmWall();
  const pl=G.place, p=G.players[0];
  if(!pl.ok){ EE.toast('Hier kann nicht gebaut werden'); return; }
  if(!canPay(p,BUILD[pl.kind].cost)){ EE.toast('Nicht genug Ressourcen'); cancelPlace(); return; }
  pay(p,BUILD[pl.kind].cost);
  const b = addBuilding(pl.kind,0,pl.x,pl.z,false);
  pl.workers.forEach(u=>cmdBuild(u,b));
  EE.sfx('place'); EE.vib(20);
  endPlace(); updateHUD(); select(pl.workers,null);
}
function cancelPlace(){ EE.click(); endPlace(); drawPanel(); }
function endPlace(){
  const pl=G.place; if(!pl) return;
  if(pl.ghost) G.scene.remove(pl.ghost); if(pl.pad) G.scene.remove(pl.pad);
  if(pl.ghosts) for(const gh of pl.ghosts) G.scene.remove(gh);
  G.place=null; $('#placebar').classList.add('hidden'); $('#pGate').classList.add('hidden'); $('#pTxt').textContent='Gebäude mit dem Finger platzieren';
}

window.EEGame = { start, stop, dbg:()=>G, tick:(n)=>{for(let i=0;i<n;i++) update(.05);}, scr:(x,y,z)=>toScreen(x,y,z), h:(x,z)=>getH(x,z) };
})();
