/* ============================================================
   EARTH EMPIRE – Musik & Geräusche (alles im Browser erzeugt)
   Hauptthema (Ladebildschirm + Hauptmenü, läuft durch),
   ruhige Spielmusik (gleiche Melodie, Steinzeit-Instrumente),
   Spielgeräusche und Umgebungsgeräusche.
   ============================================================ */
(function(){
'use strict';
let AC=null, master, musicBus, sfxBus, ambBus, reverb, noiseBuf;
let mode=null, nextBar=0, barIdx=0, timer=null, started=false;
// Menümusik als MP3 ("Where the Morning Breathes"); fällt sie aus, spielt das erzeugte Hauptthema
let menuEl=null, menuOk=true;
function menuTrack(){
  if(menuEl || !menuOk || !AC) return menuEl;
  try{
    menuEl = new Audio(window.EE_MENU_MUSIC || 'musik_menue.mp3');
    menuEl.loop = true; menuEl.preload = 'auto';
    menuEl.addEventListener('error', ()=>{ menuOk=false; });
    const src = AC.createMediaElementSource(menuEl), g = AC.createGain(); g.gain.value = 1.5;
    src.connect(g); g.connect(musicBus);
  }catch(e){ menuOk=false; menuEl=null; }
  return menuEl;
}
function startMenu(){ const el=menuTrack(); if(!el) return; try{ el.currentTime=0; }catch(e){} const p=el.play(); if(p&&p.catch) p.catch(()=>{ menuOk=false; }); }
function stopMenu(){ if(menuEl) menuEl.pause(); }
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
  timer = setInterval(schedule, 90);
  document.addEventListener('visibilitychange', ()=>{ if(!AC) return; if(document.hidden){ AC.suspend(); stopMenu(); } else { AC.resume(); if(mode==='theme' && menuEl && menuOk){ const p=menuEl.play(); if(p&&p.catch) p.catch(()=>{}); } } });
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

// Instrumente
function taiko(t, f, vol, bus){
  const g=gain(0,bus||musicBus); env(g,t,.005,vol,.6);
  const o=osc('sine',f*2.6,t,.7,g); o.frequency.setValueAtTime(f*2.6,t); o.frequency.exponentialRampToValueAtTime(f,t+.12);
  const ng=gain(0,bus||musicBus); env(ng,t,.002,vol*.5,.12); noise(t,.15,filt('lowpass',420,1,ng));
  send(g,.5);
}
function handDrum(t, f, vol){
  const g=gain(0,musicBus); env(g,t,.004,vol,.22);
  const o=osc('sine',f*1.8,t,.3,g); o.frequency.exponentialRampToValueAtTime(f,t+.05);
  const ng=gain(0,musicBus); env(ng,t,.002,vol*.35,.05); noise(t,.07,filt('bandpass',1800,1.2,ng));
  send(g,.35);
}
function shaker(t, vol){ const g=gain(0,musicBus); env(g,t,.01,vol,.07); noise(t,.1,filt('highpass',6500,.7,g)); }
function pad(t, midis, dur, vol, bright){
  const g=gain(0,musicBus); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+dur*.35); g.gain.linearRampToValueAtTime(vol*.8,t+dur*.8); g.gain.linearRampToValueAtTime(0.0001,t+dur+.6);
  const lp=filt('lowpass',bright||900,.6,g);
  for(const m of midis){ osc('sawtooth',mtof(m),t,dur+.7,lp,-7); osc('sawtooth',mtof(m),t,dur+.7,lp,7); }
  send(g,.7);
}
function brass(t, midi, dur, vol){
  const f=mtof(midi), g=gain(0,musicBus);
  g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+.09); g.gain.setTargetAtTime(vol*.75,t+.12,.2); g.gain.setTargetAtTime(0.0001,t+dur,.12);
  const lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.Q.value=1.5; lp.connect(g);
  lp.frequency.setValueAtTime(500,t); lp.frequency.linearRampToValueAtTime(2600,t+.12); lp.frequency.setTargetAtTime(1500,t+.15,.3);
  osc('sawtooth',f,t,dur+.5,lp,-5); osc('sawtooth',f,t,dur+.5,lp,6); osc('square',f/2,t,dur+.5,gain(.25,lp));
  send(g,.45);
}
function choir(t, midis, dur, vol){
  const g=gain(0,musicBus); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+dur*.4); g.gain.linearRampToValueAtTime(0.0001,t+dur+.8);
  const f1=filt('bandpass',720,4,g), f2=filt('bandpass',1150,5,g);
  for(const m of midis) for(const dt of [-9,0,9]){ const o=osc('sawtooth',mtof(m),t,dur+.9,f1,dt); o.connect(f2); }
  send(g,.9);
}
function flute(t, midi, dur, vol){
  const f=mtof(midi), g=gain(0,musicBus);
  g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+.07); g.gain.setTargetAtTime(vol*.8,t+.1,.3); g.gain.setTargetAtTime(0.0001,t+dur,.09);
  const o=osc('sine',f,t,dur+.4,g); const o2=osc('triangle',f*2,t,dur+.4,gain(.12,g));
  const lfo=AC.createOscillator(), ld=AC.createGain(); lfo.frequency.value=5.2; ld.gain.setValueAtTime(0,t); ld.gain.linearRampToValueAtTime(f*.006,t+.35);
  lfo.connect(ld); ld.connect(o.frequency); ld.connect(o2.frequency); lfo.start(t); lfo.stop(t+dur+.4);
  const bg=gain(0,musicBus); env(bg,t,.03,vol*.18,dur*.6); noise(t,dur,filt('bandpass',f*2,2,bg));
  send(g,.6);
}
function drone(t, midi, dur, vol){
  const g=gain(0,musicBus); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+dur*.3); g.gain.linearRampToValueAtTime(0.0001,t+dur+.4);
  const lp=filt('lowpass',380,2,g); osc('sawtooth',mtof(midi),t,dur+.5,lp,-4); osc('sawtooth',mtof(midi-12),t,dur+.5,lp,4);
  send(g,.5);
}

/* ---------- Hauptthema (D-Moll) ---------- */
// Akkorde je 2 Takte, Melodie in Schlägen [Start, Midi, Länge]
const CH = [[50,57,62,65],[46,53,58,62],[53,57,60,65],[48,55,60,64],[50,57,62,65],[46,53,58,62],[43,55,58,62],[45,52,57,61]];
const MEL = [[0,74,2],[2,69,1],[3,74,1],[4,77,3],[7,76,1],[8,74,2],[10,72,1],[11,70,1],[12,69,4],
             [16,70,2],[18,72,1],[19,74,1],[20,77,2],[22,79,2],[24,81,3],[27,79,1],[28,76,2],[30,73,2]];
let themeStep = 0;
function themeBar(t, bar, beat){
  const phrase = Math.floor(bar/16), inBar = bar%16, chord = CH[Math.floor(inBar/2)];
  const intro = phrase===0 && inBar<8;
  // Trommeln
  taiko(t, 52, intro?.55:.8); taiko(t+beat*2, 52, intro?.4:.6);
  if(!intro){ taiko(t+beat*2.5, 62, .35); taiko(t+beat*3.5, 58, .3); }
  if(inBar%2===0){
    pad(t, chord.map(m=>m), beat*8, intro?.05+.02*inBar/8:.075, intro?600+inBar*90:1300);
    drone(t, chord[0]-12, beat*8, .07);
    if(!intro) choir(t, [chord[1]+12, chord[2]+12], beat*8, .035);
  }
  if(!intro){
    const off = (inBar%8)*4, oct = (phrase%2===1 && inBar>=8) ? 0 : -12;
    for(const [s,m,l] of MEL){ if(s>=off && s<off+4) brass(t+(s-off)*beat, m+oct, l*beat*.95, .085); }
  } else if(inBar>=4){
    // Hörner kündigen die Melodie an
    if(inBar%2===0) brass(t, chord[2], beat*3, .05);
  }
}
/* ---------- Ruhige Spielmusik (gleiche Melodie, Steinzeit-Instrumente) ---------- */
function calmBar(t, bar, beat){
  const inBar = bar%32, chord = CH[Math.floor((inBar%16)/2)];
  if(inBar%2===0){ pad(t, [chord[0],chord[2],chord[3]], beat*8, .045, 700); drone(t, chord[0]-12, beat*8, .06); }
  handDrum(t, 110, .32); handDrum(t+beat*1.5, 150, .16); handDrum(t+beat*2, 120, .24); handDrum(t+beat*3, 150, .14);
  if(Math.random()<.6) shaker(t+beat*.5, .05); if(Math.random()<.6) shaker(t+beat*2.5, .05);
  if(inBar<16){
    const off=(inBar%8)*4;
    for(const [s,m,l] of MEL){ if(s>=off && s<off+4) flute(t+(s-off)*beat, m, l*beat*.95, .07); }
  } else if(inBar%4===1){
    const scale=[62,64,65,69,72,74];
    for(let i=0;i<3;i++) if(Math.random()<.7) flute(t+beat*(i*1.2+.3), scale[(Math.random()*scale.length)|0], beat*.9, .045);
  }
}
function schedule(){
  if(!AC || !mode) return;
  if(mode==='theme' && menuEl && menuOk){ nextBar=0; return; }
  const bpm = mode==='theme' ? 78 : 64, beat = 60/bpm, barLen = beat*4;
  if(nextBar < AC.currentTime) nextBar = AC.currentTime+.05;
  while(nextBar < AC.currentTime+.7){
    if(mode==='theme') themeBar(nextBar, barIdx, beat); else calmBar(nextBar, barIdx, beat);
    barIdx++; nextBar += barLen;
  }
}
function play(m){
  if(!AC || m===mode) return;
  const t=AC.currentTime;
  if(mode){ musicBus.gain.cancelScheduledValues(t); const v=musicBus.gain.value; musicBus.gain.setValueAtTime(v,t); musicBus.gain.linearRampToValueAtTime(0.0001,t+1.2);
    setTimeout(()=>{ if(mode==='theme') stopMenu(); mode=m; barIdx = m==='theme'?16:0; nextBar=AC.currentTime+.1; if(m==='theme') startMenu(); if(window.EE && EE.applyVol) EE.applyVol(); }, 1300); return; }
  mode=m; barIdx=0; nextBar=t+.1; if(m==='theme') startMenu();
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
const AMB = {wind:.3, waves:0, birds:0, fire:0};
let windG, waveG;
function startAmbient(){
  const t=AC.currentTime;
  windG = gain(0, ambBus); const wf=filt('lowpass',500,.8,windG);
  const ws=AC.createBufferSource(); ws.buffer=noiseBuf; ws.loop=true; ws.connect(wf); ws.start(t);
  const wl=AC.createOscillator(), wld=AC.createGain(); wl.frequency.value=.11; wld.gain.value=220; wl.connect(wld); wld.connect(wf.frequency); wl.start(t);
  waveG = gain(0, ambBus); const vf=filt('lowpass',700,.5,waveG); const vg=gain(1,vf);
  const vs=AC.createBufferSource(); vs.buffer=noiseBuf; vs.loop=true; vs.playbackRate.value=.6; vs.connect(vg); vs.start(t);
  const vl=AC.createOscillator(), vld=AC.createGain(); vl.frequency.value=.13; vld.gain.value=.5; vl.connect(vld); vld.connect(vg.gain); vl.start(t);
  setInterval(()=>{
    if(!AC || AC.state!=='running') return;
    const n=AC.currentTime;
    windG.gain.setTargetAtTime(AMB.wind*.16, n, 1.2);
    waveG.gain.setTargetAtTime(AMB.waves*.22, n, 1);
    if(AMB.birds>.05 && Math.random()<AMB.birds*.55) bird(n+Math.random()*.4, AMB.birds);
    if(AMB.fire>.05){ for(let i=0;i<3;i++) if(Math.random()<.6) crackle(n+Math.random()*.5, AMB.fire); }
  }, 500);
}
function bird(t, v){
  const base=2200+Math.random()*1800, n=2+((Math.random()*4)|0);
  for(let i=0;i<n;i++){ const s=t+i*(.08+Math.random()*.06), g=gain(0,ambBus); env(g,s,.01,.05*v,.07);
    const o=osc('sine',base,s,.1,g); o.frequency.setValueAtTime(base,s); o.frequency.exponentialRampToValueAtTime(base*(1.2+Math.random()*.4),s+.06); }
}
function crackle(t, v){ const g=gain(0,ambBus); env(g,t,.001,.12*v,.03); noise(t,.04,filt('bandpass',1500+Math.random()*2500,2,g)); }
function ambient(o){ Object.assign(AMB, o); }

window.EEAudio = { init, setVol, play, sfx, ambient, get ready(){ return !!AC && AC.state==='running'; } };
})();
