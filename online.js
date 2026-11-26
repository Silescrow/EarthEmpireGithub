/* ============================================================
   ONLINE-BEREICH (wie Empire Earth 2, gleiches System wie alle Silescrow-Spiele):
   nur mit Silescrow ID; Raum entsteht automatisch (🔓 offen oder 🔒 mit Passwort), Freunde einladen
   nur aus dem eigenen Raum, Freunde sehen offene Räume und treten bei. Spielerplätze,
   jeder wählt sein Volk und Team, der Gastgeber stellt Karte/KI ein und startet –
   alle Geräte starten dann gleichzeitig. Verbindung: PeerJS (kostenloser Vermittler, kein eigener Server).
   ============================================================ */
(function(){
  'use strict';
  const $=s=>document.querySelector(s), MAXP=8, PREFIX='earth-empire-raum-';
  const ON = window.EEOnline = { peer:null, host:false, code:'', conns:new Map(), me:null, lobby:null, myId:'' };
  const name = () => { const k=window.SC&&SC.konto&&SC.konto(); return k ? k.name : ''; };
  const rnd = n => Math.random().toString(36).slice(2, 2+n);
  const civByName = n => EE.CIVS.find(c=>c[0]===n);
  function loadPeer(){ return window.Peer ? Promise.resolve() : new Promise((ok,err)=>{ const s=document.createElement('script'); s.src='https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'; s.onload=ok; s.onerror=()=>err(new Error('PeerJS konnte nicht geladen werden – Internet prüfen')); document.head.appendChild(s); }); }

  // ---------- Oberfläche ----------
  function ui(){
    if($('#dOnline')) return;
    const d=document.createElement('div'); d.className='dlg hidden'; d.id='dOnline';
    d.innerHTML=`<div class="card wide on-card">
      <h2>Online spielen</h2>
      <div id="onStart">
        <p class="on-ich">Du spielst als <b id="onIch">–</b></p>
        <div class="on-two">
          <div class="on-box"><b>🔓 Offener Raum</b><small>Alle deine Freunde sehen den Raum und können direkt beitreten.</small><button class="btn main small" id="onHost">Raum erstellen</button></div>
          <div class="on-box"><b>🔒 Raum mit Schloss</b><small>Freunde brauchen dein Passwort. Wen du einlädst, kommt ohne Passwort rein.</small><input id="onPw" maxlength="12" placeholder="Passwort (mind. 4 Zeichen)" autocomplete="off"><button class="btn small" id="onHostPw">Raum mit Schloss erstellen</button></div>
        </div>
        <div class="on-fr"><b>Räume deiner Freunde</b><div id="onFr"><small class="dim">Lade …</small></div></div>
        <div class="acts"><button class="btn small" data-close>Zurück</button></div>
      </div>
      <div id="onLobby" class="hidden">
        <div class="on-head"><div id="onRaum">Dein Raum</div><div class="on-hb"><button class="btn small" id="onPwBtn">🔒 Passwort</button><button class="btn main small" id="onInv">👥 Freunde einladen</button></div></div>
        <div id="onSlots"></div>
        <div class="on-set">
          <div class="row"><label>Weltkarte</label><select id="onMap"><option value="0">Klein</option><option value="1">Mittel</option><option value="2">Groß</option><option value="3">Riesig</option></select></div>
          <div class="row"><label>Computer-Gegner</label><select id="onDiff"><option value="0">Leicht</option><option value="1">Mittel</option><option value="2">Schwer</option></select></div>
        </div>
        <div id="onChat"></div><div class="on-chatin"><input id="onMsg" maxlength="120" placeholder="Nachricht …"><button class="btn small" id="onSend">Senden</button></div>
        <div class="acts"><button class="btn small" id="onLeave">Verlassen</button><button class="btn main small" id="onGo" disabled>Spiel starten</button></div>
        <small id="onWait"></small>
      </div>
    </div>`;
    $('#menu').appendChild(d);
    const btn=document.createElement('button'); btn.className='btn sc-online'; btn.id='bOnline'; btn.textContent='Online spielen';
    btn.onclick=()=>{ EE.click();
      if(!window.SC || !SC.netz){ EE.toast('📴 Kein Internet – online spielen geht gerade nicht'); return; }
      if(!SC.konto()){ SC.oeffnen('start'); return; }
      if(SC.gesperrt){ SC.oeffnen('gesperrt'); return; }
      $('#onIch').textContent=name(); d.classList.remove('hidden'); friendsRooms(); };
    $('#menu .panel').insertBefore(btn, $('#menu .panel [data-open=dSet]'));
    d.querySelector('[data-close]').onclick=()=>{ EE.click(); d.classList.add('hidden'); };
    $('#onHost').onclick=()=>host('');
    $('#onHostPw').onclick=()=>{ const pw=$('#onPw').value.trim(); if(pw.length<4){ EE.toast('Das Passwort braucht mindestens 4 Zeichen'); $('#onPw').focus(); return; } host(pw); };
    $('#onInv').onclick=()=>{ EE.click(); SC.einladen({code:ON.code, schluessel:ON.lobby.key}); };
    $('#onPwBtn').onclick=()=>{ EE.click(); const L=ON.lobby; const pw=prompt(L.pw?'Neues Passwort (leer = Schloss entfernen):':'Passwort für den Raum festlegen (mind. 4 Zeichen):', L.pw||''); if(pw===null) return;
      const t=pw.trim(); if(t && t.length<4){ EE.toast('Mindestens 4 Zeichen'); return; } L.pw=t; push(); melden(); EE.toast(t?'🔒 Raum hat jetzt ein Schloss':'🔓 Raum ist jetzt offen für Freunde'); };
    $('#onLeave').onclick=()=>leave(true);
    $('#onGo').onclick=()=>startGame();
    $('#onSend').onclick=sendChat; $('#onMsg').onkeydown=e=>{ if(e.key==='Enter') sendChat(); };
    $('#onMap').onchange=e=>{ if(ON.host){ ON.lobby.map=+e.target.value; push(); } };
    $('#onDiff').onchange=e=>{ if(ON.host){ ON.lobby.diff=+e.target.value; push(); } };
  }
  function myName(){ const n=name(); if(!n || !SC.online()){ SC.oeffnen(); return null; } return n; }
  // offene Räume der Freunde (aus der Silescrow ID)
  function friendsRooms(){
    const el=$('#onFr'); if(!el) return; const l=SC.freundesRaeume();
    el.innerHTML = l.length ? l.map(r=>`<div class="on-row2"><span>${esc(r.name)} ${r.schloss?'🔒':'🔓'}</span><button class="btn small" data-r="${r.uid}">Beitreten</button></div>`).join('')
      : `<small class="dim">${SC.freunde().length?'Gerade hat keiner deiner Freunde einen Raum offen.':'Noch keine Freunde – füge sie über 👤 Silescrow ID → Freunde hinzu.'}</small>`;
    el.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{ const r=l.find(x=>x.uid===b.dataset.r); joinRoom({code:r.code, schloss:r.schloss, name:r.name}); });
  }
  ON.friendsRooms=friendsRooms;
  // Beitreten: aus Einladung (Schlüssel), oder über die Freundesliste (bei Schloss mit Passwort)
  function joinRoom(r){
    if(!myName()) return;
    let pw='';
    if(r.schloss && !r.schluessel){ pw=prompt('🔒 Der Raum von '+(r.name||'deinem Freund')+' hat ein Schloss. Passwort:',''); if(pw===null) return; }
    if(ON.lobby) leave(false);
    $('#dOnline').classList.remove('hidden'); $('#onIch').textContent=name();
    join(r.code, pw.trim(), r.schluessel||'');
  }
  ON.joinRoom=joinRoom;
  ON.leave=(x)=>leave(x);
  function melden(){ if(ON.host && ON.lobby && !ON.lobby.started) SC.raumOffen({code:ON.code, schloss:!!ON.lobby.pw, plaetze:ON.lobby.slots.filter(s=>s.kind==='open').length}); }

  // ---------- Raum (Gastgeber) ----------
  async function host(pw){
    const n=myName(); if(!n) return;
    try{ await loadPeer(); }catch(e){ EE.toast(e.message); return; }
    EE.toast('Raum wird erstellt …');
    const tryCode = tries => {
      const code=String(1000+Math.floor(Math.random()*9000)), p=new Peer(PREFIX+code,{debug:0});
      p.on('open',()=>{ ON.peer=p; ON.host=true; ON.code=code; ON.myId='host';
        ON.lobby={ map:+(EE.S.map||1), diff:+(EE.S.diff||1), slots:[{kind:'human', id:'host', name:n, civ:null, team:1}], chat:[], pw:pw||'', key:rnd(10) };
        for(let i=1;i<MAXP;i++) ON.lobby.slots.push({kind: i<4?'open':'closed', team:i+1});
        p.on('connection', c=>hostConn(c)); showLobby(); melden(); });
      p.on('error', e=>{ if(e.type==='unavailable-id' && tries<6){ p.destroy(); tryCode(tries+1); } else { EE.toast('Online-Fehler: '+(e.type||e.message)); } });
    };
    tryCode(0);
  }
  function hostConn(c){
    c.on('open',()=>{ ON.conns.set(c.peer,c); });
    c.on('data', m=>{
      const L=ON.lobby; if(!m) return;
      if(m.t==='hello'){ if(L.pw && m.pw!==L.pw && m.key!==L.key){ c.send({t:'kick', why: m.pw?'🔒 Falsches Passwort':'🔒 Dieser Raum hat ein Schloss'}); return; }
        if(m.ver!==EE.VER){ c.send({t:'kick', why:'Andere Spielversion ('+m.ver+' statt '+EE.VER+') – bitte Seite neu laden'}); return; }
        const s=L.slots.findIndex(x=>x.kind==='open'); if(s<0 || L.started){ c.send({t:'kick', why: L.started?'Das Spiel läuft schon':'Der Raum ist voll'}); return; }
        L.slots[s]={kind:'human', id:c.peer, name:String(m.name).slice(0,16), civ:null, team:L.slots[s].team||s+1}; chat('', m.name+' ist beigetreten'); push(); melden(); }
      if(m.t==='set'){ const s=L.slots.find(x=>x.id===c.peer); if(s){ if('civ' in m) s.civ=m.civ; if('team' in m) s.team=m.team; push(); } }
      if(m.t==='chat'){ const s=L.slots.find(x=>x.id===c.peer); if(s) chat(s.name, m.text); }
    });
    c.on('close',()=>{ ON.conns.delete(c.peer); const L=ON.lobby; if(!L) return; const i=L.slots.findIndex(x=>x.id===c.peer); if(i>=0){ chat('', L.slots[i].name+' hat den Raum verlassen'); L.slots[i]={kind:'open', team:L.slots[i].team}; push(); melden(); } });
  }
  function push(){ if(!ON.host) return; const msg={t:'lobby', lobby:Object.assign({}, ON.lobby, {pw:ON.lobby.pw?'*':'', key:''})}; ON.conns.forEach(c=>{ try{ c.open&&c.send(msg); }catch(e){} }); render(); }
  function chat(who,text){ const L=ON.lobby; L.chat.push({who,text:String(text).slice(0,120)}); if(L.chat.length>30) L.chat.shift(); if(ON.host) push(); }

  // ---------- Raum beitreten (Gast) ----------
  async function join(code, pw, key){
    const n=myName(); if(!n) return;
    try{ await loadPeer(); }catch(e){ EE.toast(e.message); return; }
    EE.toast('Verbinde …');
    const p=new Peer(undefined,{debug:0}); ON.peer=p; ON.host=false; ON.code=code;
    let ok=false; const uhr=setTimeout(()=>{ if(!ok){ EE.toast('Der Raum ist nicht mehr da'); leave(false); } }, 12000);
    p.on('open', id=>{ ON.myId=id; const c=p.connect(PREFIX+code,{reliable:true}); ON.conns.set('host',c);
      c.on('open',()=>{ ok=true; clearTimeout(uhr); c.send({t:'hello', name:n, uid:(SC.konto()||{}).uid, ver:EE.VER, pw:pw||'', key:key||''}); });
      c.on('data', m=>{ if(!m) return;
        if(m.t==='lobby'){ ON.lobby=m.lobby; if($('#onLobby').classList.contains('hidden')) showLobby(); else render(); }
        if(m.t==='kick'){ EE.toast(m.why||'Du wurdest entfernt'); leave(false); }
        if(m.t==='start'){ launch(m.cfg); }
        if(m.t==='g' && window.EEGame && EEGame.netIn) EEGame.netIn(m);
      });
      c.on('close',()=>{ if(ON.lobby && !ON.lobby.started){ EE.toast('Verbindung zum Gastgeber getrennt'); leave(false); } else if(ON.lobby) EE.toast('Verbindung zum Gastgeber getrennt'); });
    });
    p.on('error', e=>{ if(!ok){ clearTimeout(uhr); EE.toast(e.type==='peer-unavailable'?'Der Raum ist nicht mehr da':'Online-Fehler: '+(e.type||e.message)); leave(false); } });
  }
  function send(m){ const c=ON.conns.get('host'); try{ c&&c.open&&c.send(m); }catch(e){} }
  function sendChat(){ const t=$('#onMsg').value.trim(); if(!t) return; $('#onMsg').value=''; if(ON.host) chat(ON.lobby.slots[0].name,t); else send({t:'chat', text:t}); }
  function leave(sayIt){
    try{ ON.conns.forEach(c=>c.close()); ON.peer&&ON.peer.destroy(); }catch(e){}
    if(ON.host) SC.raumZu();
    ON.conns.clear(); ON.peer=null; ON.lobby=null; ON.host=false;
    $('#onLobby').classList.add('hidden'); $('#onStart').classList.remove('hidden');
    if(sayIt) EE.click();
  }

  // ---------- Lobby anzeigen ----------
  function showLobby(){ $('#onStart').classList.add('hidden'); $('#onLobby').classList.remove('hidden'); render(); }
  function render(){
    const L=ON.lobby; if(!L) return;
    const me = L.slots.findIndex(s=>s.id===ON.myId), used=new Set(L.slots.filter(s=>s.civ).map(s=>s.civ));
    const civOpts = cur => `<option value="">– Volk wählen –</option>`+EE.CIVS.map(c=>`<option ${c[0]===cur?'selected':''} ${used.has(c[0])&&c[0]!==cur?'disabled':''}>${c[0]}</option>`).join('');
    const teamOpts = cur => [1,2,3,4,5,6,7,8].map(t=>`<option value="${t}" ${t===cur?'selected':''}>Team ${t}</option>`).join('');
    $('#onSlots').innerHTML = L.slots.map((s,i)=>{
      const mine=i===me, canEdit = mine || (ON.host && s.kind==='ai');
      const flag = s.civ && civByName(s.civ) ? `<svg viewBox="0 0 30 36" class="on-flag">${civByName(s.civ)[2]}</svg>` : '<span class="on-flag none"></span>';
      let who = s.kind==='human' ? `${s.name}${s.id==='host'?' <i>Gastgeber</i>':''}${mine?' <i>du</i>':''}` : s.kind==='ai' ? 'Computer' : s.kind==='open' ? '<span class="dim">Offen – wartet auf Spieler</span>' : '<span class="dim">Geschlossen</span>';
      const ctl = ON.host && i>0 ? `<button class="on-sl" data-sl="${i}">${s.kind==='human'?'Entfernen':s.kind==='open'?'→ Computer':s.kind==='ai'?'→ Geschlossen':'→ Offen'}</button>` : '';
      const play = s.kind==='human'||s.kind==='ai';
      return `<div class="on-row ${mine?'me':''} ${play?'':'off'}">${flag}<span class="on-who">${who}</span>
        ${play ? (canEdit ? `<select data-civ="${i}">${civOpts(s.civ)}</select><select data-team="${i}">${teamOpts(s.team)}</select>` : `<span class="on-civ">${s.civ||'<span class="warn">wählt noch …</span>'}</span><span class="on-team">Team ${s.team}</span>`) : ''}
        ${s.kind==='human' ? (s.civ?'<span class="ok">✔</span>':'<span class="warn">…</span>') : '<span></span>'}${ctl}</div>`;
    }).join('');
    $('#onSlots').querySelectorAll('[data-civ]').forEach(el=>el.onchange=()=>setSlot(+el.dataset.civ,{civ:el.value||null}));
    $('#onSlots').querySelectorAll('[data-team]').forEach(el=>el.onchange=()=>setSlot(+el.dataset.team,{team:+el.value}));
    $('#onSlots').querySelectorAll('[data-sl]').forEach(el=>el.onclick=()=>{ const i=+el.dataset.sl, s=L.slots[i];
      if(s.kind==='human'){ const c=ON.conns.get(s.id); try{ c&&c.send({t:'kick', why:'Der Gastgeber hat dich entfernt'}); }catch(e){} L.slots[i]={kind:'open', team:s.team}; }
      else if(s.kind==='open') L.slots[i]={kind:'ai', team:s.team, civ:EE.CIVS.map(c=>c[0]).filter(n=>!used.has(n))[0]};
      else if(s.kind==='ai') L.slots[i]={kind:'closed', team:s.team}; else L.slots[i]={kind:'open', team:s.team};
      push(); });
    const host=L.slots[0]; $('#onRaum').innerHTML=`${ON.host?'Dein Raum':'Raum von '+esc(host.name||'')} ${L.pw?'🔒':'🔓'}`;
    $('#onInv').classList.toggle('hidden', !ON.host); $('#onPwBtn').classList.toggle('hidden', !ON.host); $('#onPwBtn').textContent=L.pw?'🔒 Passwort ändern':'🔓 Schloss setzen';
    $('#onMap').value=L.map; $('#onDiff').value=L.diff; $('#onMap').disabled=!ON.host; $('#onDiff').disabled=!ON.host;
    $('#onChat').innerHTML=L.chat.map(m=>m.who?`<div><b>${esc(m.who)}:</b> ${esc(m.text)}</div>`:`<div class="sys">${esc(m.text)}</div>`).join(''); $('#onChat').scrollTop=1e9;
    // Start nur, wenn alle Menschen ein Volk haben und mindestens 2 Mitspieler (Mensch oder Computer) dabei sind
    const waiting = L.slots.filter(s=>(s.kind==='human'||s.kind==='ai') && !s.civ).map(s=>s.kind==='ai'?'Computer':s.name);
    const players = L.slots.filter(s=>s.kind==='human'||s.kind==='ai').length;
    $('#onGo').classList.toggle('hidden', !ON.host);
    $('#onGo').disabled = !!waiting.length || players<2;
    $('#onWait').textContent = waiting.length ? 'Warte auf: '+waiting.join(', ')+' (Volk wählen)' : players<2 ? 'Warte auf einen Mitspieler – lade Freunde ein oder setze einen Computer-Gegner' : ON.host ? 'Alle bereit – du kannst starten' : 'Alle bereit – warte auf den Gastgeber';
  }
  const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function setSlot(i, v){ const L=ON.lobby; if(ON.host){ Object.assign(L.slots[i], v); push(); } else { Object.assign(L.slots[i], v); render(); send(Object.assign({t:'set'}, v)); } }

  // ---------- Start: alle Geräte starten gleichzeitig ----------
  function startGame(){
    const L=ON.lobby; if(!ON.host || $('#onGo').disabled) return;
    L.started=true; SC.raumZu();
    const cfg={ seed:(Math.random()*1e9)|0, map:L.map, diff:L.diff, slots:L.slots.filter(s=>s.kind==='human'||s.kind==='ai').map(s=>({kind:s.kind, id:s.id||null, name:s.name||'Computer', civ:s.civ, team:s.team})) };
    ON.conns.forEach(c=>{ try{ c.open&&c.send({t:'start', cfg}); }catch(e){} });
    launch(cfg);
  }
  function launch(cfg){
    if(ON.lobby) ON.lobby.started=true;
    $('#dOnline').classList.add('hidden'); EE.fanfare(); EE.vib(40);
    const me = cfg.slots.findIndex(s=>s.id===ON.myId);
    if(window.EEGame) EEGame.startOnline(cfg, me); else EE.toast('Spiel wird noch geladen …');
  }
  EE.onlineUI = ui;
  setInterval(()=>{ if(!$('#dOnline') || $('#dOnline').classList.contains('hidden') || ON.lobby) return; SC.freundeLaden&&SC.freundeLaden(); friendsRooms(); }, 5000);
  if(document.readyState!=='loading') ui(); else addEventListener('DOMContentLoaded', ui);
})();
