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
const COLORS = [0x2f7bff, 0xe23b3b, 0xf2c230, 0x3fbf5a];
const COLNAMES = ['Blau','Rot','Gelb','Grün'];
const RES = ['food','wood','stone','gold'];
const RES_DE = {food:'Nahrung',wood:'Holz',stone:'Stein',gold:'Gold'};
const BUILD = {
  tc:    {name:'Stadtzentrum', size:6, cost:{}, time:60, hp:1200, drop:['food','wood','stone','gold'], pop:5},
  house: {name:'Hütte', size:2, cost:{wood:30}, time:14, hp:300, pop:5},
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
function start(){
  if(G) stop();
  EE.hideMenu();
  const S = EE.S;
  const N = [80,104,128][S.map] || 104;
  const foes = (S.foes|0)+1;
  const civ = EE.CIVS[S.civ] || EE.CIVS[0];
  const gfx = S.gfx|0;

  G = { N, foes, civ, gfx, seed:(Math.random()*1e9)|0, t:0, units:[], builds:[], res:[], deer:[],
        players:[], sel:[], selB:null, place:null, running:true, raf:0, msgT:0 };
  G.rand = rng(G.seed);
  buildUI();
  initRenderer();
  genWorld();
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
  <div id="placebar" class="hidden"><span>Gebäude mit dem Finger platzieren</span><button class="pb no" id="pNo">✕</button><button class="pb ok" id="pOk">✓</button></div>
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
      h += `<button class="ab lock" data-a="b-barr"><span class="ai"><svg viewBox="0 0 24 24"><path d="M5 4l10 10M19 4L9 14M7 13l-3 3 2 2 3-3M17 13l3 3-2 2-3-3" stroke="#e8b64a" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></span>Kaserne<span class="ac">bald</span></button>`;
    }
    el.innerHTML = h; el.className='';
  } else {
    el.innerHTML = `<div class="info hint"><b>Tipp</b><small>Arbeiter antippen, dann Bäume, Beeren, Steine oder Gold antippen</small></div>`;
    el.className='';
  }
  el.querySelectorAll('.ab').forEach(b=>b.onclick=()=>action(b.dataset.a));
}
const hutSVG = () => '<svg viewBox="0 0 24 24"><path d="M12 3L3 18h18z" fill="#c9a46a"/><path d="M12 3L8 18h8z" fill="#8a5a2b"/></svg>';
const storeSVG = () => '<svg viewBox="0 0 24 24"><rect x="3" y="15" width="18" height="4" fill="#8a5a2b"/><rect x="4" y="10" width="7" height="5" rx="2" fill="#a86d36"/><rect x="12" y="11" width="8" height="4" rx="2" fill="#a86d36"/><path d="M8 10l2-4 3 3z" fill="#9aa3ad"/></svg>';

function action(a){
  const p = G.players[0];
  EE.click();
  if(a==='worker'){
    const b = G.selB;
    if(b.queue.length>=5){ EE.toast('Warteschlange voll'); return; }
    if(!canPay(p,WORKER_COST)){ EE.toast('Nicht genug Nahrung'); return; }
    pay(p,WORKER_COST); b.queue.push('worker'); EE.vib(15);
  } else if(a==='age'){ EE.toast('Die Bronzezeit kommt im nächsten Update');
  } else if(a==='b-barr'){ EE.toast('Die Kaserne kommt mit dem Kampf-Update');
  } else if(a.startsWith('b-')){
    const kind = a.slice(2);
    if(!canPay(p,BUILD[kind].cost)){ EE.toast('Nicht genug '+Object.keys(BUILD[kind].cost).map(k=>RES_DE[k]).join(' und ')); return; }
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
  const s = G.camS, half = G.N/2-4;
  s.x = clamp(s.x,-half,half); s.z = clamp(s.z,-half,half);
  s.dist = clamp(s.dist, 14, 70);
  const y = getH(s.x,s.z);
  const hd = Math.cos(s.pitch)*s.dist;
  G.cam.position.set(s.x+Math.sin(s.yaw)*hd, y+Math.sin(s.pitch)*s.dist, s.z+Math.cos(s.yaw)*hd);
  G.cam.lookAt(s.x, y, s.z);
  G.sun.position.set(s.x+30, y+55, s.z+18);
  G.sun.target.position.set(s.x, y, s.z);
}
function centerCamOn(x,z){ G.camS.x=x; G.camS.z=z+4; }

/* ============================================================
   WELT
   ============================================================ */
let H_SEED = 1;
function rawH(x,z){
  const n = fbm(x*.035+50, z*.035+50, H_SEED);
  let h = (n-.45)*7;
  h += (fbm(x*.12, z*.12, H_SEED+7)-.5)*1.2;
  // Seen
  for(const l of G.lakes){ const d=Math.hypot(x-l.x,z-l.z); if(d<l.r) h -= (1-d/l.r)**1.6*l.r*.55; }
  // Basen ebnen
  for(const b of G.bases){ const d=Math.hypot(x-b.x,z-b.z); if(d<16){ const t=clamp((16-d)/8,0,1); h = lerp(h, b.h, t); } }
  // Kartenrand anheben
  const e = Math.max(Math.abs(x),Math.abs(z)) - (G.N/2-6);
  if(e>0) h += e*e*.25;
  return h;
}
function getH(x,z){
  const N=G.N, s=G.hs, gx=(x+N/2)/s, gz=(z+N/2)/s;
  const ix=clamp(Math.floor(gx),0,G.hn-2), iz=clamp(Math.floor(gz),0,G.hn-2);
  const fx=clamp(gx-ix,0,1), fz=clamp(gz-iz,0,1), n=G.hn, a=G.hm;
  const h00=a[iz*n+ix], h10=a[iz*n+ix+1], h01=a[(iz+1)*n+ix], h11=a[(iz+1)*n+ix+1];
  return lerp(lerp(h00,h10,fx), lerp(h01,h11,fx), fz);
}
const WATER_Y = -.55;

function genWorld(){
  const N = G.N, R = G.rand; H_SEED = (G.seed%997)+1;
  // Basen in den Ecken
  const off = N*.32;
  const corners = [[-off,off],[off,-off],[off,off],[-off,-off]];
  G.bases = [];
  for(let i=0;i<=G.foes;i++) G.bases.push({x:corners[i][0], z:corners[i][1], h:0});
  // Seen zwischen den Basen
  G.lakes = [];
  for(let i=0;i<2+(N>100?1:0);i++){
    for(let tries=0;tries<30;tries++){
      const x=(R()-.5)*N*.7, z=(R()-.5)*N*.7, r=3.5+R()*4;
      if(G.bases.every(b=>Math.hypot(b.x-x,b.z-z)>r+20)){ G.lakes.push({x,z,r}); break; }
    }
  }
  G.bases.forEach(b=>{ G.lakes_tmp=G.lakes; b.h = Math.max(.2, (fbm(b.x*.035+50,b.z*.035+50,H_SEED)-.45)*7); });
  // Höhenkarte
  G.hs = 1; G.hn = N+1;
  G.hm = new Float32Array(G.hn*G.hn);
  for(let j=0;j<G.hn;j++) for(let i=0;i<G.hn;i++) G.hm[j*G.hn+i] = rawH(i-N/2, j-N/2);
  // Raster für Wegfindung
  G.grid = new Uint8Array(N*N);    // 1 = blockiert
  for(let j=0;j<N;j++) for(let i=0;i<N;i++){
    const h = getH(i-N/2+.5, j-N/2+.5);
    const edge = i<2||j<2||i>N-3||j>N-3;
    if(h<WATER_Y+.15 || edge) G.grid[j*N+i]=1;
  }
  buildTerrain();
  buildWater();
  // Spieler
  for(let i=0;i<=G.foes;i++){
    const civ = i===0 ? G.civ : EE.CIVS[(R()*EE.CIVS.length)|0];
    const p = {id:i, civ, res:{...START_RES}, pop:0, popCap:0, tc:null, color:COLORS[i]};
    G.players.push(p);
    const b = G.bases[i];
    const tc = addBuilding('tc', i, b.x, b.z, true);
    p.tc = tc;
    for(let k=0;k<4;k++){ const a=k/4*Math.PI*2+.4; spawnWorker(i, b.x+Math.cos(a)*4.2, b.z+Math.sin(a)*4.2); }
    // Ressourcen rund um die Basis (fair für alle)
    const ang = R()*Math.PI*2;
    placeCluster('bush', b.x+Math.cos(ang)*8, b.z+Math.sin(ang)*8, 6, 2.6);
    placeCluster('stone', b.x+Math.cos(ang+2)*10, b.z+Math.sin(ang+2)*10, 3, 1.6);
    placeCluster('gold', b.x+Math.cos(ang+3.3)*11, b.z+Math.sin(ang+3.3)*11, 3, 1.6);
    placeCluster('tree', b.x+Math.cos(ang+4.6)*13, b.z+Math.sin(ang+4.6)*13, 22, 5);
    for(let k=0;k<4;k++) spawnDeer(b.x+Math.cos(ang+1)*15+R()*4, b.z+Math.sin(ang+1)*15+R()*4);
  }
  // Wälder und Felsen auf der Karte
  const forests = Math.round(N*N/900);
  for(let i=0;i<forests;i++){ const x=(R()-.5)*N*.85, z=(R()-.5)*N*.85;
    if(G.bases.every(b=>Math.hypot(b.x-x,b.z-z)>14)) placeCluster('tree', x, z, 10+(R()*22|0), 3+R()*5); }
  for(let i=0;i<Math.round(N/14);i++){ const x=(R()-.5)*N*.8, z=(R()-.5)*N*.8;
    if(G.bases.every(b=>Math.hypot(b.x-x,b.z-z)>18)) placeCluster(R()<.5?'stone':'gold', x, z, 3, 1.5); }
  for(let i=0;i<Math.round(N/10);i++){ const x=(R()-.5)*N*.8, z=(R()-.5)*N*.8;
    if(G.bases.every(b=>Math.hypot(b.x-x,b.z-z)>18)){ placeCluster('bush', x, z, 4, 2); } }
  for(let i=0;i<Math.round(N/9);i++){ const x=(R()-.5)*N*.8, z=(R()-.5)*N*.8; spawnDeer(x,z); }
  // Deko: Gras-Büschel und Blumen (instanziert, kein Hindernis)
  addDecor();
  buildMinimapBase();
}

/* ---------- Gelände ---------- */
function buildTerrain(){
  const N=G.N, n=G.hn;
  const geo = new T.PlaneGeometry(N, N, n-1, n-1);
  geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count*3);
  const cGrass1=new T.Color(0x6fae3f), cGrass2=new T.Color(0x4f8f34), cDirt=new T.Color(0xa58456), cSand=new T.Color(0xd9c38a), cRock=new T.Color(0x8d8a7e), c=new T.Color();
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i);
    const h = G.hm[i]; pos.setY(i,h);
    const n1 = fbm(x*.08,z*.08,H_SEED+3);
    c.copy(cGrass1).lerp(cGrass2, clamp(n1*1.6-.4,0,1));
    for(const b of G.bases){ const d=Math.hypot(x-b.x,z-b.z); if(d<9) c.lerp(cDirt, clamp((9-d)/5,0,1)*.75); }
    if(h<WATER_Y+.5) c.lerp(cSand, clamp((WATER_Y+.5-h)/.5,0,1));
    if(h>3.2) c.lerp(cRock, clamp((h-3.2)/1.5,0,1));
    const v = .94+hash2(x,z,9)*.12; c.multiplyScalar(v);
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  geo.setAttribute('color', new T.BufferAttribute(col,3));
  geo.computeVertexNormals();
  const m = new T.Mesh(geo, new T.MeshLambertMaterial({vertexColors:true, flatShading:true}));
  m.receiveShadow = true;
  G.scene.add(m); G.terrain = m;
  // Unterseite / Rand
  const skirt = new T.Mesh(new T.PlaneGeometry(N*4,N*4), new T.MeshLambertMaterial({color:0x5c8a35}));
  skirt.rotation.x = -Math.PI/2; skirt.position.y = -2.5; G.scene.add(skirt);
}
function buildWater(){
  const w = new T.Mesh(new T.PlaneGeometry(G.N, G.N, 1, 1),
    new T.MeshLambertMaterial({color:0x2e8fd6, transparent:true, opacity:.82}));
  w.rotation.x = -Math.PI/2; w.position.y = WATER_Y; G.scene.add(w); G.water = w;
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
  const b = mesh(GEO.bush, mat(0x3f8f3a), 0,.45,0); b.scale.set(1.1,.8,1.1); g.add(b);
  for(let i=0;i<7;i++){ const a=R()*6.28, y=.35+R()*.4, r=.5+R()*.12;
    g.add(mesh(GEO.berry, mat(0xd8283a), Math.cos(a)*r, y, Math.sin(a)*r)); }
  g.rotation.y = R()*6.28; return g;
}
function makeRock(R, gold){
  geos();
  const g = new T.Group();
  const r = mesh(GEO.rock, mat(gold?0x8a7a55:0x9aa1a8), 0,.35,0); r.scale.set(1.1,.7,1); r.rotation.set(R(),R(),R()); g.add(r);
  const r2 = mesh(GEO.rock, mat(gold?0x7d6d48:0x868d94), .45,.2,.3); r2.scale.set(.55,.45,.55); g.add(r2);
  if(gold) for(let i=0;i<6;i++){ const a=R()*6.28; g.add(mesh(GEO.nug, mat(0xffd24a,{emissive:0x553300}), Math.cos(a)*.55, .3+R()*.35, Math.sin(a)*.5)); }
  g.rotation.y = R()*6.28; return g;
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

function makeTC(color){
  geos();
  const g = new T.Group();
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
  const tent = mesh(new T.ConeGeometry(1.05,1.9,7), mat(0xb98b56), 0,.95,0); g.add(tent);
  const hide = mesh(new T.ConeGeometry(.75,1.1,7,1,true,0,2.2), mat(0x8a5a2e,{side:T.DoubleSide}), 0,.7,0); hide.rotation.y=1; g.add(hide);
  for(let i=0;i<4;i++){ const a=i*1.57+.4; const p=mesh(GEO.box, mat(0x5a3818), Math.cos(a)*.18,2,Math.sin(a)*.18); p.scale.set(.05,.6,.05); p.rotation.set(Math.sin(a)*.4,0,-Math.cos(a)*.4); g.add(p); }
  const band = mesh(GEO.box, mat(color), 0,1.25,.62); band.scale.set(.35,.12,.05); g.add(band);
  return g;
}
function makeStore(color){
  geos();
  const g = new T.Group();
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

/* ---------- Objekte anlegen ---------- */
const cellIdx = (x,z) => { const N=G.N; const i=Math.floor(x+N/2), j=Math.floor(z+N/2); return (i<0||j<0||i>=N||j>=N)?-1:j*N+i; };
function freeCell(x,z){ const k=cellIdx(x,z); return k>=0 && !G.grid[k]; }

function placeCluster(type, cx, cz, count, spread){
  const R = G.rand;
  for(let i=0,tries=0;i<count && tries<count*6;tries++){
    const a=R()*6.28, r=Math.sqrt(R())*spread;
    const x=Math.round(cx+Math.cos(a)*r)+.5, z=Math.round(cz+Math.sin(a)*r)+.5;
    if(!freeCell(x,z)) continue;
    if(G.bases.some(b=>Math.hypot(b.x-x,b.z-z)<6.5)) continue;
    if(getH(x,z)<WATER_Y+.3) continue;
    addRes(type,x,z); i++;
  }
}
function addRes(type,x,z){
  let m, kind, amt;
  if(type==='tree'){ m=makeTree(G.rand); kind='wood'; amt=100; }
  else if(type==='bush'){ m=makeBush(G.rand); kind='food'; amt=125; }
  else if(type==='stone'){ m=makeRock(G.rand,false); kind='stone'; amt=250; }
  else { m=makeRock(G.rand,true); kind='gold'; amt=250; }
  m.position.set(x, getH(x,z), z);
  G.scene.add(m);
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
  const m = kind==='tc'?makeTC(col):kind==='house'?makeHouse(col):makeStore(col);
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

function addDecor(){
  const R = G.rand, N=G.N;
  const count = [250,600,1100][G.gfx];
  const gGeo = new T.ConeGeometry(.08,.45,3); gGeo.translate(0,.2,0);
  const im = new T.InstancedMesh(gGeo, new T.MeshLambertMaterial({color:0x5e9e36, flatShading:true}), count);
  const fGeo = new T.IcosahedronGeometry(.08,0);
  const fl = new T.InstancedMesh(fGeo, new T.MeshBasicMaterial({color:0xffffff}), Math.floor(count/4));
  const m4 = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), e = new T.Euler();
  let gi=0, fi=0; const fcols=[0xfff1a8,0xff9fc4,0xb9a3ff,0xffffff], c=new T.Color();
  for(let k=0;k<count*2 && gi<count;k++){
    const x=(R()-.5)*(N-8), z=(R()-.5)*(N-8), h=getH(x,z);
    if(h<WATER_Y+.4) continue;
    if(G.bases.some(b=>Math.hypot(b.x-x,b.z-z)<7)) continue;
    e.set(0,R()*6,0); q.setFromEuler(e); const sc=.7+R()*.8; s.set(sc,sc,sc); p.set(x,h,z);
    m4.compose(p,q,s); im.setMatrixAt(gi++, m4);
    if(fi<fl.count && R()<.25){ p.set(x+.2,h+.12,z+.1); s.set(1,1,1); m4.compose(p,q,s); fl.setMatrixAt(fi, m4); fl.setColorAt(fi, c.setHex(fcols[(R()*4)|0])); fi++; }
  }
  im.count = gi; fl.count = fi;
  im.receiveShadow = true;
  G.scene.add(im); G.scene.add(fl);
}

/* ============================================================
   WEGFINDUNG (A*)
   ============================================================ */
function nearestFree(i,j){
  const N=G.N;
  for(let r=0;r<12;r++){
    let best=-1, bd=1e9;
    for(let dj=-r;dj<=r;dj++) for(let di=-r;di<=r;di++){
      if(Math.max(Math.abs(di),Math.abs(dj))!==r) continue;
      const a=i+di, b=j+dj; if(a<0||b<0||a>=N||b>=N) continue;
      if(!G.grid[b*N+a]){ const d=di*di+dj*dj; if(d<bd){bd=d;best=b*N+a;} }
    }
    if(best>=0) return best;
  }
  return -1;
}
function findPath(x0,z0,x1,z1){
  const N=G.N;
  let s = cellIdx(x0,z0), t = cellIdx(x1,z1);
  if(s<0||t<0) return null;
  if(G.grid[s]) s = nearestFree(s%N, (s/N)|0);
  if(G.grid[t]) t = nearestFree(t%N, (t/N)|0);
  if(s<0||t<0) return null;
  if(s===t) return [[x1,z1]];
  const tx=t%N, tz=(t/N)|0;
  const g = new Float32Array(N*N).fill(1e9), from = new Int32Array(N*N).fill(-1), closed = new Uint8Array(N*N);
  const heap = [], hp = (k,f)=>{ heap.push([f,k]); let i=heap.length-1; while(i>0){ const p=(i-1)>>1; if(heap[p][0]<=heap[i][0]) break; [heap[p],heap[i]]=[heap[i],heap[p]]; i=p; } };
  const pop = ()=>{ const top=heap[0], last=heap.pop(); if(heap.length){ heap[0]=last; let i=0; for(;;){ const l=i*2+1, r=l+1; let m=i; if(l<heap.length&&heap[l][0]<heap[m][0]) m=l; if(r<heap.length&&heap[r][0]<heap[m][0]) m=r; if(m===i) break; [heap[m],heap[i]]=[heap[i],heap[m]]; i=m; } } return top; };
  const hfun = k => { const dx=Math.abs(k%N-tx), dz=Math.abs(((k/N)|0)-tz); return (dx+dz)+(1.414-2)*Math.min(dx,dz); };
  g[s]=0; hp(s,hfun(s));
  let it=0, found=false, best=s, bestH=hfun(s);
  while(heap.length && it++<9000){
    const [,k] = pop(); if(closed[k]) continue; closed[k]=1;
    if(k===t){ found=true; break; }
    const ki=k%N, kj=(k/N)|0;
    for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++){
      if(!di&&!dj) continue;
      const a=ki+di, b=kj+dj; if(a<0||b<0||a>=N||b>=N) continue;
      const nk=b*N+a; if(G.grid[nk]||closed[nk]) continue;
      if(di&&dj && (G.grid[kj*N+a]||G.grid[b*N+ki])) continue;
      const ng = g[k] + (di&&dj?1.414:1);
      if(ng<g[nk]){ g[nk]=ng; from[nk]=k; const hh=hfun(nk); hp(nk, ng+hh); if(hh<bestH){bestH=hh;best=nk;} }
    }
  }
  let k = found ? t : best; const pts=[];
  while(k!==s && k>=0){ pts.push([k%N-N/2+.5, ((k/N)|0)-N/2+.5]); k=from[k]; }
  pts.reverse();
  // Glätten: überspringen, solange freie Sicht
  const out=[]; let cx=x0, cz=z0, i=0;
  while(i<pts.length){
    let j=pts.length-1;
    while(j>i && !lineFree(cx,cz,pts[j][0],pts[j][1])) j--;
    out.push(pts[j]); cx=pts[j][0]; cz=pts[j][1]; i=j+1;
  }
  if(found && !G.grid[cellIdx(x1,z1)]) { if(out.length) out[out.length-1]=[x1,z1]; }
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
function cmdMove(u,x,z){ u.state='move'; u.target=null; u.site=null; moveTo(u,x,z); }
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
      if(followPath(u,dt)) u.state='idle';
      break;
    case 'hunt': {
      const r = u.target;
      if(!r||!r.alive){ u.state='idle'; break; }
      if(r.dead){ u.state='gather'; moveTo(u,r.x,r.z); break; }
      r.hunted = 1.5;
      u.repath -= dt;
      if(u.repath<=0){ u.repath=.8; moveTo(u,r.x,r.z); }
      followPath(u,dt);
      if(near(u,r.x,r.z,1.5)){ r.dead=true; r.mesh.rotation.z=Math.PI/2; r.mesh.position.y=getH(r.x,r.z)+.25; if(u.owner===0) EE.vib(20); u.state='gather'; }
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
  u.phase += dt*(u.moving?11:u.working?7:2);
  const sw = u.moving ? Math.sin(u.phase)*.7 : 0;
  m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
  m.arms[0].rotation.x = -sw*.8;
  m.arms[1].rotation.x = u.working ? -1.4+Math.sin(u.phase)*.9 : sw*.8;
  m.club.rotation.x = u.working ? .6+Math.sin(u.phase)*.9 : .6;
  m.load.visible = u.carry.amt>0.5;
  if(m.load.visible) m.load.material = mat(LOADCOL[u.carry.type]);
  u.ring.position.set(u.x, m.position.y+.06, u.z); u.ring.scale.setScalar(1.3);
}
let panelT = 0; function drawPanelSoon(){ panelT = .25; }

function autoJob(u){
  const r = nearestRes(u.lastType||'food', u.x,u.z, 14, u.owner) || nearestRes('wood', u.x,u.z, 20, u.owner);
  if(r) cmdGather(u,r);
}
function removeRes(r){
  r.alive=false; G.scene.remove(r.mesh);
  if(!r.deer){ const k=cellIdx(r.x,r.z); if(k>=0) G.grid[k]=0; }
}
function finishBuilding(b){
  const d = BUILD[b.kind];
  b.built=1; b.hp=d.hp; b.mesh.scale.y=1;
  b.mesh.traverse(o=>{ if(o.isMesh && o.material && o.material.transparent && o.material.opacity<.6){ o.material.opacity=1; o.material.transparent=false; } });
  if(d.pop) G.players[b.owner].popCap += d.pop;
  if(b.owner===0){ EE.toast(d.name+' fertig gebaut'); EE.vib(25); updateHUD(); }
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
  if(b.kind==='tc' && b.mesh.fire){ const t=G.t*12+b.x; b.mesh.fire[0].scale.set(1+Math.sin(t)*.15,1+Math.sin(t*1.3)*.25,1+Math.cos(t)*.15); b.mesh.fire[1].scale.set(.55,.6+Math.sin(t*1.7)*.15,.55); }
  if(b.kind==='tc' && b.mesh.flag) b.mesh.flag.rotation.y = Math.sin(G.t*2+b.x)*.25;
  if(b.built<1 || !b.queue.length) return;
  const p = G.players[b.owner];
  if(p.pop>=p.popCap){ if(b.owner===0 && !b.warned){ EE.toast('Zu wenig Platz – baue eine Hütte'); b.warned=true; } return; }
  b.warned=false;
  b.qT += dt;
  if(b.qT>=WORKER_TIME){
    b.qT=0; b.queue.shift();
    const a = G.rand()*6.28, x=b.x+Math.cos(a)*4.3, z=b.z+Math.sin(a)*4.3;
    const k = cellIdx(x,z); const N=G.N;
    let sx=x, sz=z; if(G.grid[k]){ const f=nearestFree(Math.floor(x+N/2),Math.floor(z+N/2)); if(f>=0){ sx=f%N-N/2+.5; sz=((f/N)|0)-N/2+.5; } }
    const u = spawnWorker(b.owner, sx, sz);
    if(b.owner===0){ updateHUD(); EE.vib(15); }
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
  if(G.water) G.water.position.y = WATER_Y + Math.sin(G.t*.8)*.03;
  if(panelT>0){ panelT-=dt; if(panelT<=0) drawPanel(); }
  G.hudT = (G.hudT||0)-dt; if(G.hudT<=0){ G.hudT=.5; updateHUD(); if(G.sel.length===1) drawPanel(); }
  G.miniT = (G.miniT||0)-dt; if(G.miniT<=0){ G.miniT=.25; drawMinimap(); }
  if(G.place) updateGhost();
}
function render(){ updateCam(); G.renderer.render(G.scene, G.cam); }

/* ============================================================
   MINIKARTE
   ============================================================ */
function buildMinimapBase(){
  const N=G.N, c=document.createElement('canvas'); c.width=c.height=N;
  const x=c.getContext('2d'), img=x.createImageData(N,N);
  for(let j=0;j<N;j++) for(let i=0;i<N;i++){
    const h=getH(i-N/2+.5,j-N/2+.5), o=(j*N+i)*4;
    let r=96,g=158,b=58; if(h<WATER_Y+.1){r=46;g=130;b=200;} else if(h>3.2){r=140;g=138;b=126;} else { const s=clamp(h/4,-.3,.3); r+=s*60; g+=s*60; b+=s*40; }
    img.data[o]=r; img.data[o+1]=g; img.data[o+2]=b; img.data[o+3]=255;
  }
  x.putImageData(img,0,0); G.miniBase=c;
}
function drawMinimap(){
  const cv=$('#mini'); if(!cv) return; const x=cv.getContext('2d'), W=cv.width, N=G.N, s=W/N;
  x.drawImage(G.miniBase,0,0,W,W);
  const px=v=>(v+N/2)*s;
  for(const r of G.res){ if(!r.alive||r.deer) continue; x.fillStyle = r.kind==='wood'?'#1f5a26':r.kind==='food'?'#e04a5a':r.kind==='gold'?'#ffd24a':'#d0d4d8'; x.fillRect(px(r.x)-1,px(r.z)-1,2,2); }
  for(const b of G.builds){ x.fillStyle='#'+COLORS[b.owner].toString(16).padStart(6,'0'); const z=b.size*s; x.fillRect(px(b.x)-z/2,px(b.z)-z/2,z,z); x.strokeStyle='#000'; x.lineWidth=1; x.strokeRect(px(b.x)-z/2,px(b.z)-z/2,z,z); }
  for(const u of G.units){ x.fillStyle='#'+COLORS[u.owner].toString(16).padStart(6,'0'); x.fillRect(px(u.x)-1.5,px(u.z)-1.5,3,3); }
  // Sichtbereich
  const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>groundAtNDC(a,b)).filter(Boolean);
  if(pts.length===4){ x.strokeStyle='#fff'; x.lineWidth=1.5; x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(px(p.x),px(p.z)):x.moveTo(px(p.x),px(p.z))); x.closePath(); x.stroke(); }
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
  const miniGo = e=>{ const r=mini.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width*G.N-G.N/2, z=(e.clientY-r.top)/r.height*G.N-G.N/2; G.camS.x=x; G.camS.z=z; };
  mini.addEventListener('pointerdown', e=>{ e.preventDefault(); mini.setPointerCapture(e.pointerId); miniGo(e); mini.onpointermove=miniGo; });
  mini.addEventListener('pointerup', ()=>{ mini.onpointermove=null; });
}
function pDown(e){
  e.preventDefault(); $('#gc').setPointerCapture(e.pointerId);
  P.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now()});
  if(P.size===1){
    gesture={type:'tap'};
    clearTimeout(longT);
    longT = setTimeout(()=>{ if(gesture && gesture.type==='tap' && !G.place){ const p=[...P.values()][0]; gesture={type:'box',x0:p.sx,y0:p.sy}; EE.vib(15); showBox(p.sx,p.sy,p.x,p.y); } }, 420);
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
    gesture = G.place ? {type:'ghost'} : {type:'pan'};
  }
  if(gesture.type==='pan'){ panBy(p.x-px, p.y-py); }
  else if(gesture.type==='ghost'){ const g=groundAt(p.x,p.y); if(g){ G.place.x=g.x; G.place.z=g.z; } }
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
  if(G.place){ const g=groundAt(sx,sy); if(g){ G.place.x=g.x; G.place.z=g.z; } return; }
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
  const pl=G.place, p=G.players[0];
  if(!pl.ok){ EE.toast('Hier kann nicht gebaut werden'); return; }
  if(!canPay(p,BUILD[pl.kind].cost)){ EE.toast('Nicht genug Ressourcen'); cancelPlace(); return; }
  pay(p,BUILD[pl.kind].cost);
  const b = addBuilding(pl.kind,0,pl.x,pl.z,false);
  pl.workers.forEach(u=>cmdBuild(u,b));
  EE.click(); EE.vib(20);
  endPlace(); updateHUD(); select(pl.workers,null);
}
function cancelPlace(){ EE.click(); endPlace(); drawPanel(); }
function endPlace(){
  const pl=G.place; if(!pl) return;
  G.scene.remove(pl.ghost); G.scene.remove(pl.pad);
  G.place=null; $('#placebar').classList.add('hidden');
}

window.EEGame = { start, stop, dbg:()=>G, tick:(n)=>{for(let i=0;i<n;i++) update(.05);}, scr:(x,y,z)=>toScreen(x,y,z), h:(x,z)=>getH(x,z) };
})();
