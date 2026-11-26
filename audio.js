/* ============================================================
   SILES EMPIRE – Musik & Geräusche (alles im Browser erzeugt)
   Hauptthema (Ladebildschirm + Hauptmenü, läuft durch),
   ruhige Spielmusik (gleiche Melodie, Steinzeit-Instrumente),
   Spielgeräusche und Umgebungsgeräusche.
   ============================================================ */
(function(){
'use strict';
let AC=null, master, musicBus, sfxBus, ambBus, reverb, noiseBuf;
let mode=null, started=false;
// Musik als MP3: Hauptmenü „Crowns upon the Horizon“, im Spiel „Before the Written Word“.
// Nur noch diese beiden Lieder – die alte, selbst erzeugte Musik ist entfernt.
const TRACKS = { theme: ()=>window.EE_MENU_MUSIC || 'musik_menue.mp3', calm: ()=>window.EE_GAME_MUSIC || 'musik_spiel.mp3' };
const trk = {};
function track(m){
  if(!AC || !TRACKS[m]) return null;
  let t = trk[m]; if(t) return t.ok ? t.el : null;
  t = trk[m] = {ok:true, el:null};
  try{
    const el = new Audio(TRACKS[m]()); el.loop = true; el.preload = 'auto';
    el.addEventListener('error', ()=>{ t.ok=false; });
    const src = AC.createMediaElementSource(el), g = AC.createGain(); g.gain.value = m==='theme' ? 1.5 : 1.2;
    src.connect(g); g.connect(musicBus); t.el = el;
  }catch(e){ t.ok=false; }
  return t.ok ? t.el : null;
}
const hasTrack = m => trk[m] && trk[m].ok && trk[m].el;
function startTrack(m){ const el=track(m); if(!el) return; try{ el.currentTime=0; }catch(e){} const p=el.play(); if(p&&p.catch) p.catch(()=>{ trk[m].ok=false; }); }
function stopTrack(m){ if(trk[m] && trk[m].el) trk[m].el.pause(); }
const stopMenu = () => { for(const k in trk) stopTrack(k); };
const mtof = m => 440*Math.pow(2,(m-69)/12);

function init(){
  if(AC) { if(AC.state==='suspended') AC.resume(); return; }
  try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
  master = AC.createGain(); master.connect(AC.destination);
  const comp = AC.createDynamicsCompressor(); comp.threshold.value=-14; comp.ratio.value=4; comp.connect(master);
  musicBus = AC.createGain(); sfxBus = AC.createGain(); ambBus = AC.createGain();
  musicBus.connect(comp); sfxBus.connect(comp); ambBus.connect(comp);
  // Hall
  reverb = AC.createConvolver();
  const len = AC.sampleRate*2.6, ir = AC.createBuffer(2,len,AC.sampleRate);
  for(let c=0;c<2;c++){ const d=ir.getChannelData(c); for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.4); }
  reverb.buffer = ir;
  const rv = AC.createGain(); rv.gain.value=.32; reverb.connect(rv); rv.connect(musicBus);
  // Rauschen
  noiseBuf = AC.createBuffer(1, AC.sampleRate*2, AC.sampleRate);
  const nd = noiseBuf.getChannelData(0); for(let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
  startAmbient();
  document.addEventListener('visibilitychange', ()=>{ if(!AC) return; if(document.hidden){ AC.suspend(); stopMenu(); } else { AC.resume(); if(hasTrack(mode)){ const p=trk[mode].el.play(); if(p&&p.catch) p.catch(()=>{}); } } });
}
function setVol(music, sfx, mute){
  if(!AC) return;
  const m = mute?0:1, t=AC.currentTime;
  musicBus.gain.setTargetAtTime(music*.55*m, t, .3);
  sfxBus.gain.setTargetAtTime(sfx*.9*m, t, .05);
  ambBus.gain.setTargetAtTime(sfx*.6*m, t, .3);
}

/* ---------- Bausteine ---------- */
function env(g, t, a, peak, d, end){ g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(peak,t+a); g.gain.exponentialRampToValueAtTime(0.0001,t+a+d); if(end) g.gain.setValueAtTime(0,t+a+d+.01); }
function osc(type,f,t,dur,dest,detune){ const o=AC.createOscillator(); o.type=type; o.frequency.value=f; if(detune) o.detune.value=detune; o.connect(dest); o.start(t); o.stop(t+dur+.1); return o; }
function noise(t,dur,dest){ const s=AC.createBufferSource(); s.buffer=noiseBuf; s.loop=true; s.playbackRate.value=.8+Math.random()*.4; s.connect(dest); s.start(t, Math.random()); s.stop(t+dur+.05); return s; }
function filt(type,f,q,dest){ const b=AC.createBiquadFilter(); b.type=type; b.frequency.value=f; if(q) b.Q.value=q; b.connect(dest); return b; }
function gain(v,dest){ const g=AC.createGain(); g.gain.value=v; g.connect(dest); return g; }
function send(node, wet){ const g=gain(wet, reverb); node.connect(g); }

function play(m){
  if(!AC || m===mode) return;
  const t=AC.currentTime;
  if(mode){ musicBus.gain.cancelScheduledValues(t); const v=musicBus.gain.value; musicBus.gain.setValueAtTime(v,t); musicBus.gain.linearRampToValueAtTime(0.0001,t+1.2);
    setTimeout(()=>{ stopTrack(mode); mode=m; startTrack(m); if(window.EE && EE.applyVol) EE.applyVol(); }, 1300); return; }
  mode=m; startTrack(m);
}

/* ---------- Geräusche ---------- */
function sfx(name, vol){
  if(!AC) return; vol = vol==null?1:vol; if(vol<.02) return;
  const t=AC.currentTime, B=gain(vol,sfxBus);
  switch(name){
    case 'click': { const g=gain(0,B); env(g,t,.003,.35,.06); osc('triangle',880,t,.1,g); osc('triangle',1320,t+.02,.08,g); break; }
    case 'confirm': { [0,.07].forEach((d,i)=>{ const g=gain(0,B); env(g,t+d,.005,.3,.18); osc('triangle',[660,990][i],t+d,.25,g); }); break; }
    case 'error': { const g=gain(0,B); env(g,t,.01,.25,.25); osc('square',140,t,.3,filt('lowpass',600,1,g)); osc('square',147,t,.3,filt('lowpass',600,1,g)); break; }
    case 'fanfare': { [67,72,76,79].forEach((m,i)=>{ const g=gain(0,B); env(g,t+i*.13,.02,.22,.55); const lp=filt('lowpass',2400,1,g); osc('sawtooth',mtof(m),t+i*.13,.6,lp,-5); osc('sawtooth',mtof(m),t+i*.13,.6,lp,5); });
      const g=gain(0,B); env(g,t,.005,.6,.7); const o=osc('sine',130,t,.8,g); o.frequency.exponentialRampToValueAtTime(50,t+.15); break; }
    case 'chop': { // Holz hacken
      const g=gain(0,B); env(g,t,.002,.7,.16); const o=osc('sine',210,t,.2,g); o.frequency.exponentialRampToValueAtTime(95,t+.08);
      const ng=gain(0,B); env(ng,t,.001,.55,.09); noise(t,.12,filt('bandpass',1300+Math.random()*300,1.4,ng)); break; }
    case 'stone': { // Stein klopfen
      const ng=gain(0,B); env(ng,t,.001,.6,.07); noise(t,.09,filt('bandpass',2600,2,ng));
      const g=gain(0,B); env(g,t,.001,.25,.12); osc('triangle',780+Math.random()*120,t,.15,g); break; }
    case 'gold': { // Erz und Gold: metallisch
      [1650,2470,3300].forEach((f,i)=>{ const g=gain(0,B); env(g,t,.001,.18/(i+1),.35); osc('sine',f*(1+Math.random()*.02),t,.4,g); });
      const ng=gain(0,B); env(ng,t,.001,.35,.05); noise(t,.07,filt('highpass',3000,1,ng)); break; }
    case 'berry': { // Rascheln
      const ng=gain(0,B); ng.gain.setValueAtTime(0.0001,t); ng.gain.linearRampToValueAtTime(.3,t+.05); ng.gain.exponentialRampToValueAtTime(0.0001,t+.3);
      noise(t,.32,filt('highpass',3200,.6,ng)); break; }
    case 'build': { // Hämmern
      const g=gain(0,B); env(g,t,.001,.6,.1); const o=osc('sine',320,t,.12,g); o.frequency.exponentialRampToValueAtTime(160,t+.05);
      const ng=gain(0,B); env(ng,t,.001,.4,.05); noise(t,.06,filt('bandpass',900,1.5,ng)); break; }
    case 'done': { [72,76,79,84].forEach((m,i)=>{ const g=gain(0,B); env(g,t+i*.09,.005,.18,.5); osc('triangle',mtof(m),t+i*.09,.55,g); }); break; }
    case 'trained': { [67,74].forEach((m,i)=>{ const g=gain(0,B); env(g,t+i*.12,.04,.16,.45); const lp=filt('lowpass',1600,1,g); osc('sawtooth',mtof(m),t+i*.12,.5,lp); }); break; }
    case 'deer': { const g=gain(0,B); env(g,t,.01,.22,.3); const o=osc('sawtooth',620,t,.35,filt('bandpass',900,3,g)); o.frequency.exponentialRampToValueAtTime(380,t+.3); break; }
    case 'place': { const g=gain(0,B); env(g,t,.002,.5,.25); const o=osc('sine',150,t,.3,g); o.frequency.exponentialRampToValueAtTime(70,t+.2);
      const ng=gain(0,B); env(ng,t,.002,.3,.2); noise(t,.22,filt('lowpass',800,1,ng)); break; }
  }
}

/* ---------- Umgebung: Wind, Wellen, Vögel, Feuer ---------- */
const AMB = {wind:.3, waves:0, birds:0, fire:0, jungle:0, cold:0, desert:0, rain:0, storm:0};
let windG, waveG, insectG, howlG, sandG, rainG;
function startAmbient(){
  const t=AC.currentTime;
  windG = gain(0, ambBus); const wf=filt('lowpass',500,.8,windG);
  const ws=AC.createBufferSource(); ws.buffer=noiseBuf; ws.loop=true; ws.connect(wf); ws.start(t);
  const wl=AC.createOscillator(), wld=AC.createGain(); wl.frequency.value=.11; wld.gain.value=220; wl.connect(wld); wld.connect(wf.frequency); wl.start(t);
  waveG = gain(0, ambBus); const vf=filt('lowpass',700,.5,waveG); const vg=gain(1,vf);
  const vs=AC.createBufferSource(); vs.buffer=noiseBuf; vs.loop=true; vs.playbackRate.value=.6; vs.connect(vg); vs.start(t);
  const vl=AC.createOscillator(), vld=AC.createGain(); vl.frequency.value=.13; vld.gain.value=.5; vl.connect(vld); vld.connect(vg.gain); vl.start(t);
  // Dschungel: Zikaden und Insekten (hohes Rauschen, schnell pulsierend)
  insectG = gain(0, ambBus); const am=gain(.5, insectG); const ib=filt('bandpass',4700,5,am);
  const is=AC.createBufferSource(); is.buffer=noiseBuf; is.loop=true; is.connect(ib); is.start(t);
  const io=AC.createOscillator(), iod=AC.createGain(); io.frequency.value=31; iod.gain.value=.5; io.connect(iod); iod.connect(am.gain); io.start(t);
  const io2=AC.createOscillator(), io2d=AC.createGain(); io2.frequency.value=.09; io2d.gain.value=900; io2.connect(io2d); io2d.connect(ib.frequency); io2.start(t);
  // Kälte (Sibirien): heulender Wind durch enge Filter
  howlG = gain(0, ambBus);
  for(const [f,q,r,dep] of [[520,11,.07,260],[880,14,.11,300]]){ const hb=filt('bandpass',f,q,howlG); const hs=AC.createBufferSource(); hs.buffer=noiseBuf; hs.loop=true; hs.playbackRate.value=.7; hs.connect(hb); hs.start(t);
    const ho=AC.createOscillator(), hd=AC.createGain(); ho.frequency.value=r; hd.gain.value=dep; ho.connect(hd); hd.connect(hb.frequency); ho.start(t); }
  // Wüste: trockenes Sandrieseln
  sandG = gain(0, ambBus); const sg2=gain(.6,sandG); const sh=filt('highpass',2800,.7,sg2);
  const ss=AC.createBufferSource(); ss.buffer=noiseBuf; ss.loop=true; ss.connect(sh); ss.start(t);
  const so=AC.createOscillator(), sod=AC.createGain(); so.frequency.value=.17; sod.gain.value=.45; so.connect(sod); sod.connect(sg2.gain); so.start(t);
  // Regen: dichtes Prasseln
  rainG = gain(0, ambBus); const rl=filt('lowpass',5200,.5,rainG); const rh=filt('highpass',700,.5,rl);
  const rs=AC.createBufferSource(); rs.buffer=noiseBuf; rs.loop=true; rs.playbackRate.value=1.3; rs.connect(rh); rs.start(t);
  setInterval(()=>{
    if(!AC || AC.state!=='running') return;
    const n=AC.currentTime;
    windG.gain.setTargetAtTime(AMB.wind*.16, n, 1.2);
    waveG.gain.setTargetAtTime(AMB.waves*.22, n, 1);
    insectG.gain.setTargetAtTime(AMB.jungle*.06*(1-AMB.rain*.6), n, 1.5);
    howlG.gain.setTargetAtTime(AMB.cold*.5, n, 1.5);
    sandG.gain.setTargetAtTime(AMB.desert*.05, n, 1.5);
    rainG.gain.setTargetAtTime(AMB.rain*.2, n, 1.5);
    const J=AMB.jungle*(1-AMB.rain*.8);
    if(J>.05){ if(Math.random()<J*.3) tropBird(n+Math.random()*.4, J); if(Math.random()<J*.22) frog(n+Math.random()*.4, J); if(Math.random()<J*.025) monkey(n, J); }
    if(AMB.cold>.2 && Math.random()<AMB.cold*.02) wolf(n, AMB.cold);
    if(AMB.desert>.3 && Math.random()<AMB.desert*.02) hawk(n, AMB.desert);
    if(AMB.rain>.1){ for(let i=0;i<4;i++) if(Math.random()<AMB.rain) drop(n+Math.random()*.5, AMB.rain); }
    if(AMB.storm>.6 && Math.random()<.012) thunder(n);
    if(AMB.birds>.05 && Math.random()<AMB.birds*.55) bird(n+Math.random()*.4, AMB.birds);
    if(AMB.fire>.05){ for(let i=0;i<3;i++) if(Math.random()<.6) crackle(n+Math.random()*.5, AMB.fire); }
  }, 500);
}
function bird(t, v){
  const base=2200+Math.random()*1800, n=2+((Math.random()*4)|0);
  for(let i=0;i<n;i++){ const s=t+i*(.08+Math.random()*.06), g=gain(0,ambBus); env(g,s,.01,.05*v,.07);
    const o=osc('sine',base,s,.1,g); o.frequency.setValueAtTime(base,s); o.frequency.exponentialRampToValueAtTime(base*(1.2+Math.random()*.4),s+.06); }
}
// Tropenvogel: tiefer, rufender Pfiff mit Triller (Tukan/Papagei)
function tropBird(t, v){
  const kind=Math.random(), g=gain(0,ambBus);
  if(kind<.5){ const f=900+Math.random()*700; for(let i=0;i<2;i++){ const s=t+i*.22, gg=gain(0,ambBus); env(gg,s,.02,.07*v,.18); const o=osc('triangle',f,s,.22,gg); o.frequency.setValueAtTime(f*1.25,s); o.frequency.exponentialRampToValueAtTime(f*.8,s+.18); } }
  else { const f=1800+Math.random()*900; env(g,t,.01,.06*v,.35); const o=osc('square',f,t,.4,filt('bandpass',f,4,g)); const lfo=AC.createOscillator(), ld=AC.createGain(); lfo.frequency.value=24; ld.gain.value=f*.12; lfo.connect(ld); ld.connect(o.frequency); lfo.start(t); lfo.stop(t+.45); }
}
function frog(t, v){ const n=3+((Math.random()*4)|0), f=280+Math.random()*220;
  for(let i=0;i<n;i++){ const s=t+i*.11, g=gain(0,ambBus); env(g,s,.005,.05*v,.06); osc('square',f,s,.08,filt('lowpass',900,3,g)); } }
function monkey(t, v){ const g=gain(0,ambBus); env(g,t,.15,.07*v,1.2); const o=osc('sawtooth',320,t,1.5,filt('bandpass',700,3,g)); o.frequency.setValueAtTime(320,t); o.frequency.linearRampToValueAtTime(680,t+.5); o.frequency.linearRampToValueAtTime(380,t+1.3); }
// Wolf in der Ferne (Sibirien)
function wolf(t, v){ const g=gain(0,ambBus); env(g,t,.5,.06*v,2.4); const o=osc('sine',380,t,3.2,g); o.frequency.setValueAtTime(380,t); o.frequency.linearRampToValueAtTime(610,t+.7); o.frequency.linearRampToValueAtTime(560,t+2.2); o.frequency.linearRampToValueAtTime(420,t+3);
  const l=AC.createOscillator(), ld=AC.createGain(); l.frequency.value=5.5; ld.gain.value=9; l.connect(ld); ld.connect(o.frequency); l.start(t); l.stop(t+3.3); send(g,.6); }
function hawk(t, v){ const g=gain(0,ambBus); env(g,t,.02,.05*v,.7); const o=osc('sawtooth',2700,t,.8,filt('bandpass',2400,6,g)); o.frequency.setValueAtTime(2900,t); o.frequency.exponentialRampToValueAtTime(1800,t+.7); }
function drop(t, v){ const g=gain(0,ambBus); env(g,t,.001,.05*v,.03); noise(t,.04,filt('bandpass',2500+Math.random()*3500,3,g)); }
function thunder(t){ const g=gain(0,ambBus); env(g,t,.08,.35,3.5); noise(t,4,filt('lowpass',160,.8,g)); const g2=gain(0,ambBus); env(g2,t,.01,.15,.5); noise(t,.6,filt('lowpass',900,.5,g2)); }
function crackle(t, v){ const g=gain(0,ambBus); env(g,t,.001,.12*v,.03); noise(t,.04,filt('bandpass',1500+Math.random()*2500,2,g)); }
function ambient(o){ Object.assign(AMB, o); }

window.EEAudio = { init, setVol, play, sfx, ambient, get ready(){ return !!AC && AC.state==='running'; } };
})();
