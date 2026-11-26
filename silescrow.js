/* ============================================================
   SILESCROW ID – gemeinsamer Baustein für alle Silescrow-Spiele
   (dasselbe System wie im Silescrow Cup, Firebase-Projekt „silescrow-cup“)
   - Pflicht-Registrierung beim ersten Start (Online-Name, E-Mail, 6-stellige PIN), danach bleibt man angemeldet
   - ohne Internet: offline spielen, Online-Knöpfe ausgegraut
   - Spielstand automatisch in der Cloud (spiele/<spiel>/spieler/<uid>)
   - Freunde, Anfragen, Einladungen in Räume, offene Räume der Freunde
   - Admin-Bereich (admins/<uid>): Spieler, Geschenke und Nachrichten, aus dem Spiel werfen,
     Spielstand löschen, sperren, Neuigkeiten, Support
   Einbinden: <script src="silescrow.js"></script> und SC.init({...}) – siehe unten „SC.init“.
   ============================================================ */
(function(){
  'use strict';
  const CFG = { apiKey:'AIzaSyBbagJ13LPBAcpvnPfhm6nl2N4_GTEdylE', authDomain:'silescrow-cup.firebaseapp.com', projectId:'silescrow-cup',
    storageBucket:'silescrow-cup.firebasestorage.app', messagingSenderId:'585223386510', appId:'1:585223386510:web:c020df4f272659ac78a0df' };
  const SDK = ['10.14.1', '11.0.2'];
  const ONLINE_MS = 3*60e3;               // so lange gilt jemand als online / ein Raum als offen
  const SCHIMPF = ['fick','fuck','arsch','hure','nutte','fotze','wichs','schlampe','bitch','shit','porn','penis','vagina','nazi','hitler','spast','behindert','schwuchtel','kanake','nigg','neger','missgeburt','hurensohn','opfer','sex','kacke','scheiss','admin','silescrow','support'];
  const SC = window.SC = { bereit:false, admin:false, gesperrt:false, netz:navigator.onLine!==false };
  let SP = null;                          // Spiel-Einstellungen aus SC.init

  // ---------- kleine Helfer ----------
  const LS = (()=>{ try{ return window.localStorage; }catch(e){ return null; } })();
  const lsGet = k => { try{ return LS.getItem(k); }catch(e){ return null; } };
  const lsSet = (k,v) => { try{ LS.setItem(k,v); }catch(e){} };
  const lsDel = k => { try{ LS.removeItem(k); }catch(e){} };
  const jget = (k,d) => { try{ const r=lsGet(k); return r?JSON.parse(r):d; }catch(e){ return d; } };
  const esc = x => String(x==null?'':x).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uhr = t => { try{ return new Date(t).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }catch(e){ return ''; } };
  const geraet = () => { let g=lsGet('scGeraet'); if(!g){ g=Math.random().toString(36).slice(2,10)+Date.now().toString(36); lsSet('scGeraet',g); } return g; };
  const hash = s => { let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return s.length+':'+(h>>>0).toString(36); };
  const pfad = p => 'spiele/'+SP.id+'/'+p;                       // Bereich dieses Spiels
  const K_KONTO = 'scKonto';                                      // gemeinsam mit dem Silescrow Cup (gleiche Seite silescrow.github.io)
  const kSync = () => 'scSync_'+SP.id;
  function konto(){ return jget(K_KONTO, null); }
  function kontoSetzen(k){ if(k) lsSet(K_KONTO, JSON.stringify(k)); else lsDel(K_KONTO); ecke(); try{ window.dispatchEvent(new Event('sc-konto')); }catch(e){} }
  function toast(t){ try{ (SP&&SP.toast||alert)(t); }catch(e){} }
  async function packen(s){
    if(window.CompressionStream){ const b=await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(); let x=''; const u=new Uint8Array(b); for(let i=0;i<u.length;i+=8192) x+=String.fromCharCode.apply(null,u.subarray(i,i+8192)); return 'gz:'+btoa(x); }
    return 'js:'+s;
  }
  async function auspacken(s){
    if(!s) return null; if(s.startsWith('js:')) return s.slice(3);
    const bin=atob(s.slice(3)), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
    return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }

  // ---------- Firebase (wie im Cup; im Test ersetzbar durch window.__SC_FB_MOCK) ----------
  let fbP = null;
  function fb(){
    if(fbP) return fbP;
    if(window.__SC_FB_MOCK) return (fbP = Promise.resolve(window.__SC_FB_MOCK));
    fbP = (async()=>{
      if(location.protocol==='file:') throw {code:'offline-datei'};
      let fehler=null;
      for(const v of SDK){
        const B='https://www.gstatic.com/firebasejs/'+v+'/';
        try{
          const [A,U,F] = await Promise.all([import(B+'firebase-app.js'), import(B+'firebase-auth.js'), import(B+'firebase-firestore.js')]);
          const app = A.getApps().length ? A.getApp() : A.initializeApp(CFG);
          const au = U.getAuth(app); try{ au.languageCode='de'; }catch(e){}
          const db = F.getFirestore(app);
          const bereit = new Promise(ok=>{ const aus=U.onAuthStateChanged(au, ()=>{ try{ aus(); }catch(e){} ok(); }); });
          const docs = q => q.docs.map(d=>{ const x=d.data(); x.id=d.id; return x; });
          return {
            bereit:()=>bereit,
            ich:()=>{ const u=au.currentUser; return u ? {uid:u.uid, anon:u.isAnonymous, email:u.email} : null; },
            anon:()=> au.currentUser ? Promise.resolve(au.currentUser.uid) : U.signInAnonymously(au).then(c=>c.user.uid),
            neu:(m,p)=>U.createUserWithEmailAndPassword(au,m,p).then(c=>c.user.uid),
            an:(m,p)=>U.signInWithEmailAndPassword(au,m,p).then(c=>c.user.uid),
            ab:()=>U.signOut(au),
            ichLoeschen:()=> au.currentUser ? U.deleteUser(au.currentUser) : Promise.resolve(),
            bestaetigen:()=> au.currentUser ? U.sendEmailVerification(au.currentUser) : Promise.resolve(),
            pinMail:m=>U.sendPasswordResetEmail(au,m),
            get:p=>F.getDoc(F.doc(db,p)).then(s=>s.exists()?s.data():null),
            set:(p,d,merge)=>F.setDoc(F.doc(db,p), d, merge?{merge:true}:undefined),
            add:(p,d)=>F.addDoc(F.collection(db,p), d).then(r=>r.id),
            alle:p=>F.getDocs(F.collection(db,p)).then(docs),
            del:p=>F.deleteDoc(F.doc(db,p)),
            suche:pre=>F.getDocs(F.query(F.collection(db,'namen'), F.orderBy(F.documentId()), F.startAt(pre), F.endAt(pre+''), F.limit(8))).then(docs),
            hoere:(p,cb)=>F.onSnapshot(F.collection(db,p), q=>cb(docs(q)), ()=>{}),
            liste:(p,n)=>F.getDocs(F.query(F.collection(db,p), F.orderBy('t','desc'), F.limit(n))).then(docs)
          };
        }catch(e){ fehler=e; }
      }
      throw fehler || {code:'offline'};
    })();
    fbP.catch(()=>{ fbP=null; });
    return fbP;
  }
  async function fbIch(){ const f=await fb(); await f.bereit(); const k=konto(), i=f.ich(); if(!k || !i || i.anon || i.uid!==k.uid) throw {code:'nicht-angemeldet'}; return f; }
  function fehlerText(e){
    const c=(e&&(e.code||e.message))||'';
    if(/email-already-in-use/.test(c)) return 'Diese E-Mail hat schon eine Silescrow ID. Tippe auf ANMELDEN.';
    if(/invalid-email/.test(c)) return 'Diese E-Mail-Adresse ist ungültig.';
    if(/weak-password/.test(c)) return 'Die PIN muss genau 6 Ziffern haben.';
    if(/too-many-requests/.test(c)) return 'Zu viele Versuche. Bitte warte ein paar Minuten.';
    if(/offline-datei/.test(c)) return 'Die Silescrow ID geht nur, wenn das Spiel im Internet geöffnet ist.';
    if(/network|offline|unavailable|Failed to fetch|import|dynamically/i.test(c)) return 'Kein Internet. Prüfe deine Verbindung und versuche es noch einmal.';
    if(/permission-denied/.test(c)) return 'Keine Berechtigung. Bitte schreib dem Support.';
    if(/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'E-Mail oder PIN ist falsch.';
    if(/nicht-angemeldet/.test(c)) return 'Bitte melde dich zuerst mit deiner Silescrow ID an.';
    return 'Das hat nicht geklappt ('+String(c).slice(0,40)+'). Bitte noch einmal versuchen.';
  }
  const nameNorm = n => String(n||'').trim().toLowerCase();
  function namePruefen(n){
    if(n.length<3 || n.length>12) return 'Der Online-Name braucht 3 bis 12 Zeichen.';
    if(!/^[a-z0-9_]+$/.test(n)) return 'Nur Buchstaben a–z, Ziffern und _ (keine Leerzeichen, keine Umlaute).';
    const flach=n.replace(/_/g,'').replace(/0/g,'o').replace(/1/g,'i').replace(/3/g,'e').replace(/4/g,'a').replace(/5/g,'s').replace(/7/g,'t');
    for(const w of SCHIMPF) if(w.length<=3 ? flach===w : (flach.includes(w)||n.includes(w))) return 'Dieser Name ist nicht erlaubt. Bitte wähle einen anderen.';
    return '';
  }
  const mailPruefen = m => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m) ? '' : 'Bitte eine gültige E-Mail-Adresse eingeben.';
  const pinPruefen = p => /^\d{6}$/.test(p) ? '' : 'Die PIN muss genau 6 Ziffern haben.';
  const pinZuEinfach = p => /^(\d)\1{5}$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p);
  // Sperre nach 5 falschen PINs (auf diesem Gerät): 15 Min, 1 Std, 24 Std
  const SPERREN=[15*60e3, 60*60e3, 24*60*60e3];
  function pinSperre(m){ const a=jget('scPinFehl',{}), x=a[m]; return x&&x.bis>Date.now() ? x.bis : 0; }
  function pinFalsch(m){ const a=jget('scPinFehl',{}), x=a[m]||{n:0,stufe:0}; x.n++; let r=5-x.n;
    if(x.n>=5){ x.bis=Date.now()+SPERREN[Math.min(x.stufe,2)]; x.stufe++; x.n=0; r=0; } a[m]=x; lsSet('scPinFehl', JSON.stringify(a)); return r; }
  function pinOk(m){ const a=jget('scPinFehl',{}); delete a[m]; lsSet('scPinFehl', JSON.stringify(a)); }

  // ---------- Internet da? ----------
  function netzSetzen(an){ SC.netz=an; if(ansicht==='start') setTimeout(()=>{ if(ansicht==='start') vStart(); },0); document.documentElement.classList.toggle('sc-offline', !an); try{ SP && SP.netz && SP.netz(an); }catch(e){} ecke(); if(an) nachAnmelden(); }
  addEventListener('online', ()=>netzSetzen(true)); addEventListener('offline', ()=>netzSetzen(false));
  SC.online = () => SC.netz && !!konto() && !SC.gesperrt;

  // ---------- Oberfläche ----------
  const css = `
#scId{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:#02040cc8;backdrop-filter:blur(3px);font-family:"Barlow Semi Condensed",system-ui,sans-serif}
#scId[hidden]{display:none}
#scId .sc-box{position:relative;width:min(520px,94vw);max-height:90vh;overflow:auto;padding:18px 18px 16px;border:2px solid #e8b64a;border-radius:14px;background:linear-gradient(180deg,#18224a,#0a0f26);box-shadow:0 10px 40px #000;color:#fff7e2}
#scId h2{margin:0 34px 10px;font:800 22px "Cinzel",Georgia,serif;color:#e8b64a;text-align:center;letter-spacing:.04em}
#scId .sc-zu{position:absolute;top:8px;right:10px;width:34px;height:34px;border-radius:50%;border:1.5px solid #e8b64a88;background:#0b1130;color:#ffe9b0;font-size:16px;cursor:pointer}
#scId p{margin:6px 0;line-height:1.35}#scId .klein{font-size:13px;color:#cbb79a}
#scId label{display:block;margin:8px 0 3px;color:#ffe9b0;font-size:14px}
#scId input,#scId textarea,#scId select{width:100%;box-sizing:border-box;background:#0d1824;border:1px solid #c9a24a;color:#fff;border-radius:8px;padding:9px 10px;font:16px inherit}
#scId .sc-k{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
#scId .sc-b{flex:1 1 auto;min-height:42px;padding:8px 12px;border:2px solid #e8b64a;border-radius:10px;background:linear-gradient(180deg,#1d2752,#0b1130);color:#ffe9b0;font:800 15px "Cinzel",Georgia,serif;cursor:pointer}
#scId .sc-b.gold{background:linear-gradient(180deg,#f6cf62,#c98a1e);color:#3a2203;border-color:#fff0b8}
#scId .sc-b.rot{border-color:#ff8a8a;color:#ffb0b0}#scId .sc-b.mini{flex:0 0 auto;min-height:32px;padding:4px 9px;font-size:13px}
#scId .sc-b:disabled{opacity:.45;filter:grayscale(1)}
#scId .sc-msg{min-height:1.2em;margin-top:8px;font-size:14px;color:#9fe39a}#scId .sc-msg.f{color:#ffb04a}
#scId .sc-list{display:flex;flex-direction:column;gap:5px;margin-top:8px;max-height:46vh;overflow:auto}
#scId .sc-row{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:9px;background:#0006;border:1px solid #e8b64a33}
#scId .sc-row .n{flex:1;min-width:0}#scId .sc-row small{display:block;color:#aab;font-size:12px;overflow:hidden;text-overflow:ellipsis}
#scId .dot{width:9px;height:9px;border-radius:50%;background:#666;flex:0 0 auto}#scId .dot.an{background:#5f5}
#scId .tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}#scId .tabs button{flex:1;padding:7px 4px;border:1.5px solid #e8b64a66;border-radius:8px;background:#0b1130;color:#ffe9b0;font:700 13px inherit;cursor:pointer}
#scId .tabs button.on{background:#e8b64a;color:#2b1a02}
#scId .wahl{display:flex;flex-direction:column;gap:6px;margin-top:6px}#scId .wahl button{padding:9px;border:1.5px solid #e8b64a66;border-radius:9px;background:#0b1130;color:#fff7e2;font:700 15px inherit;text-align:left;cursor:pointer}
#scId .wahl button.on{border-color:#ffd770;background:#2a3462}
#scId .haken{display:flex;gap:8px;align-items:center;margin-top:10px;cursor:pointer}#scId .haken i{width:22px;height:22px;border:2px solid #e8b64a;border-radius:5px;display:grid;place-items:center;font-style:normal;color:#7f7}
#scId .res{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#scId .chat{display:flex;flex-direction:column;gap:5px;max-height:40vh;overflow:auto;margin:6px 0}#scId .chat div{padding:6px 9px;border-radius:9px;background:#0007;max-width:85%}#scId .chat .adm{align-self:flex-end;background:#3a2e10}
#scId .agb{max-height:50vh;overflow:auto;font-size:13px;line-height:1.4;color:#ddd}
#scEcke{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));z-index:40;flex-direction:row-reverse;display:flex;gap:6px;align-items:center}
#scEcke button{height:38px;padding:0 12px;border-radius:19px;border:2px solid #e8b64a;background:#0b1130cc;color:#ffe9b0;font:700 14px "Barlow Semi Condensed",system-ui,sans-serif;cursor:pointer;position:relative}
#scEcke button .neu{position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:#f44;border:2px solid #fff}
body:has(#game:not(.hidden)) #scEcke{display:none!important}
#scEcke .wolke{opacity:.8;font-size:12px;color:#cfe;text-shadow:0 1px 2px #000}
#scPop{position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:95;display:flex;flex-direction:column;gap:6px;width:min(420px,92vw)}
#scPop .pop{padding:10px 12px;border:2px solid #e8b64a;border-radius:12px;background:linear-gradient(180deg,#1d2752f2,#0b1130f2);color:#fff7e2;box-shadow:0 6px 20px #000a;font:15px "Barlow Semi Condensed",system-ui,sans-serif}
#scPop .pop b{color:#ffd770}#scPop .pop .sc-k{display:flex;gap:6px;margin-top:7px}#scPop .pop button{flex:1;min-height:34px;border:1.5px solid #e8b64a;border-radius:8px;background:#0b1130;color:#ffe9b0;font:700 14px inherit;cursor:pointer}#scPop .pop button.gold{background:#e8b64a;color:#2b1a02}
html.sc-offline .sc-online{opacity:.4;filter:grayscale(1);pointer-events:none}`;
  let o, box, ansicht=null, entwurf={}, adminTab='spieler';
  function bauen(){
    if(o) return;
    const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
    o=document.createElement('div'); o.id='scId'; o.hidden=true;
    o.innerHTML='<div class="sc-box" role="dialog" aria-modal="true"><button class="sc-zu" type="button" aria-label="Schließen">✕</button><h2 id="scT">SILESCROW ID</h2><div id="scI"></div></div>';
    document.body.appendChild(o); box=o.querySelector('#scI');
    o.querySelector('.sc-zu').onclick=()=>zu();
    const e=document.createElement('div'); e.id='scEcke'; document.body.appendChild(e);
    const p=document.createElement('div'); p.id='scPop'; document.body.appendChild(p);
    ecke();
  }
  const q = id => o.querySelector('#'+id);
  function titel(t){ q('scT').textContent=t; }
  function msg(t,f){ const m=q('scM'); if(m){ m.textContent=t||''; m.className='sc-msg'+(f?' f':''); } }
  function busy(b,an){ if(!b) return; b.disabled=an; if(an){ b.dataset.t=b.textContent; b.textContent='⏳ …'; } else if(b.dataset.t) b.textContent=b.dataset.t; }
  function pflicht(){ return !konto() && SP && SP.pflicht!==false && location.protocol!=='file:'; }   // ohne ID kein Spiel – auch offline (erst nach der Registrierung geht offline)
  function zu(){ if(pflicht() && !['agb','support'].includes(ansicht)) return zeige('start'); if(['agb','support'].includes(ansicht) && !konto()) return zeige('start'); o.hidden=true; ansicht=null; }
  function zeige(s){
    bauen(); if(!s) s = konto() ? 'konto' : 'start';
    ansicht=s; o.hidden=false;
    o.querySelector('.sc-zu').hidden = s==='start' && pflicht();
    ({start:vStart, reg:vReg, login:vLogin, vergessen:vVergessen, konto:vKonto, freunde:vFreunde, support:vSupport, agb:vAgb, admin:vAdmin, gesperrt:vGesperrt}[s]||vStart)();
  }
  SC.oeffnen = s => zeige(s);
  SC.konto = konto;

  // Ecke oben links: 👤 Name (bzw. Anmelden), 🛡️ Admin, ☁️ Cloud-Stand
  function ecke(){
    const e=document.getElementById('scEcke'); if(!e) return;
    const k=konto(), sichtbar = !SP || !SP.imMenue || SP.imMenue();
    e.hidden=!sichtbar;
    const neu = FR.anfragen.length>0, sync=jget(SP?kSync():'-',null);
    e.innerHTML = `<button type="button" id="scE1">👤 ${k?esc(k.name):'Silescrow ID'}${neu?'<span class="neu"></span>':''}</button>`+
      (SC.admin?'<button type="button" id="scE2">🛡️</button>':'')+
      (k?`<span class="wolke">${!SC.netz?'📴 offline':sync&&sync.t?'☁️ '+uhr(sync.t):'☁️ …'}</span>`:'');
    e.querySelector('#scE1').onclick=()=>{ klick(); zeige(); };
    const a=e.querySelector('#scE2'); if(a) a.onclick=()=>{ klick(); zeige('admin'); };
  }
  setInterval(ecke, 2000);
  function klick(){ try{ SP&&SP.klick&&SP.klick(); }catch(e){} }

  // ---------- Ansichten: Start, Registrieren, Anmelden ----------
  function vStart(){
    titel('👤 SILESCROW ID');
    box.innerHTML = `<p>Willkommen bei <b>${esc(SP.name)}</b>!</p>
      <p class="klein">Mit deiner <b>Silescrow ID</b> spielst du online mit Freunden und dein Spielstand ist in der Cloud sicher. Eine ID gilt für alle Silescrow-Spiele.</p>
      <div class="sc-k"><button class="sc-b gold" id="scReg">✨ REGISTRIEREN</button><button class="sc-b" id="scLog">🔑 ANMELDEN</button></div>
      <p class="klein">Du hast schon eine Silescrow ID, z. B. vom <b>Silescrow Cup</b>? Dann einfach ANMELDEN.</p>
      <div class="sc-k"><button class="sc-b mini" id="scSup">💬 Support</button></div><div class="sc-msg" id="scM"></div>`;
    q('scReg').onclick=()=>zeige('reg'); q('scLog').onclick=()=>zeige('login'); q('scSup').onclick=()=>zeige('support');
    if(!SC.netz){ msg('📴 Kein Internet. Für die Registrierung oder Anmeldung brauchst du einmal Internet – danach kannst du auch offline gegen den Computer spielen.', true); q('scReg').disabled=q('scLog').disabled=true; }
  }
  function vReg(){
    titel('✨ REGISTRIEREN');
    const e=entwurf;
    box.innerHTML = `<label>Online-Name (3–12 Zeichen, a–z, 0–9, _)</label><input id="scN" maxlength="12" autocomplete="off" value="${esc(e.name||'')}">
      <label>E-Mail (für „PIN vergessen“)</label><input id="scMail" type="email" autocomplete="email" value="${esc(e.mail||'')}">
      <label>PIN (6 Ziffern)</label><input id="scP" inputmode="numeric" type="password" maxlength="6" autocomplete="new-password">
      <label>PIN wiederholen</label><input id="scP2" inputmode="numeric" type="password" maxlength="6" autocomplete="new-password">
      <label>Alter</label><div class="wahl"><button data-a="16">🧑 16 Jahre oder älter</button><button data-a="eltern">👪 Unter 16 – meine Eltern sind einverstanden</button></div>
      <div class="haken" id="scH"><i id="scHi"></i><span>Ich akzeptiere die <u>Nutzungsbedingungen</u> und den <u>Datenschutz</u>.</span></div>
      <div class="sc-k"><button class="sc-b mini" id="scAgb">📄 Lesen</button></div>
      <div class="sc-k"><button class="sc-b" id="scZ">◀ ZURÜCK</button><button class="sc-b gold" id="scOk">✔ ID ERSTELLEN</button></div><div class="sc-msg" id="scM"></div>`;
    const mal=()=>{ o.querySelectorAll('.wahl button').forEach(b=>b.classList.toggle('on', b.dataset.a===e.alter)); q('scHi').textContent=e.agb?'✔':''; };
    o.querySelectorAll('.wahl button').forEach(b=>b.onclick=()=>{ e.alter=b.dataset.a; mal(); });
    q('scH').onclick=()=>{ e.agb=!e.agb; mal(); }; mal();
    ['scP','scP2'].forEach(id=>q(id).oninput=function(){ this.value=this.value.replace(/\D/g,'').slice(0,6); });
    const merken=()=>{ e.name=nameNorm(q('scN').value); e.mail=q('scMail').value.trim().toLowerCase(); };
    q('scAgb').onclick=()=>{ merken(); entwurf.zurueck='reg'; zeige('agb'); };
    q('scZ').onclick=()=>{ merken(); zeige('start'); };
    q('scOk').onclick=async function(){
      merken(); const p=q('scP').value, p2=q('scP2').value; let f;
      if((f=namePruefen(e.name)) || (f=mailPruefen(e.mail)) || (f=pinPruefen(p))) return msg(f,true);
      if(pinZuEinfach(p)) return msg('Diese PIN ist zu leicht (z. B. 111111 oder 123456). Bitte eine andere.',true);
      if(p!==p2) return msg('Die beiden PINs sind nicht gleich.',true);
      if(!e.alter) return msg('Bitte wähle dein Alter.',true);
      if(!e.agb) return msg('Bitte setze den Haken bei den Nutzungsbedingungen.',true);
      const b=this; busy(b,true); msg('Prüfe den Namen …');
      let f2, uid;
      try{ f2=await fb(); await f2.bereit(); await f2.anon(); if(await f2.get('namen/'+e.name)){ busy(b,false); return msg('Der Name „'+e.name+'“ ist schon vergeben.',true); } }
      catch(x){ busy(b,false); return msg(fehlerText(x),true); }
      msg('ID wird erstellt …');
      try{ uid=await f2.neu(e.mail,p); }catch(x){ busy(b,false); return msg(fehlerText(x),true); }
      try{ const belegt=await f2.get('namen/'+e.name); if(belegt && belegt.uid!==uid) throw {code:'belegt'}; if(!belegt) await f2.set('namen/'+e.name,{uid}); }
      catch(x){ try{ await f2.ichLoeschen(); }catch(y){} busy(b,false); return msg('Der Name „'+e.name+'“ wurde gerade vergeben. Bitte einen anderen.',true); }
      const t=Date.now();
      try{
        // gemeinsames Konto (auch der Silescrow Cup erkennt es) + Bereich dieses Spiels
        await f2.set('spieler/'+uid, {name:e.name, email:e.mail, gesperrt:false, erstellt:t, zuletzt:t, alter:e.alter, agb:t, von:SP.id, geraet:geraet(), stand:'', standTs:0, standInfo:null});
        await f2.set(pfad('spieler/'+uid), {name:e.name, erstellt:t, zuletzt:t, stand:'', standTs:0});
      }catch(x){ busy(b,false); return msg(fehlerText(x),true); }
      try{ await f2.bestaetigen(); }catch(x){}
      kontoSetzen({uid, name:e.name, email:e.mail, seit:t}); entwurf={};
      nachAnmelden(true); zeige('konto'); msg('🎉 Willkommen, '+e.name+'! Deine Silescrow ID ist fertig.');
    };
  }
  function vLogin(){
    titel('🔑 ANMELDEN');
    box.innerHTML = `<label>E-Mail</label><input id="scMail" type="email" autocomplete="email" value="${esc(entwurf.mail||'')}">
      <label>PIN (6 Ziffern)</label><input id="scP" inputmode="numeric" type="password" maxlength="6" autocomplete="current-password">
      <div class="sc-k"><button class="sc-b" id="scZ">◀ ZURÜCK</button><button class="sc-b gold" id="scOk">🔑 ANMELDEN</button></div>
      <div class="sc-k"><button class="sc-b mini" id="scV">PIN vergessen?</button></div><div class="sc-msg" id="scM"></div>`;
    q('scP').oninput=function(){ this.value=this.value.replace(/\D/g,'').slice(0,6); };
    q('scZ').onclick=()=>zeige('start'); q('scV').onclick=()=>{ entwurf.mail=q('scMail').value.trim().toLowerCase(); zeige('vergessen'); };
    q('scOk').onclick=async function(){
      const m=q('scMail').value.trim().toLowerCase(), p=q('scP').value; let f;
      if((f=mailPruefen(m)) || (f=pinPruefen(p))) return msg(f,true);
      const s=pinSperre(m); if(s) return msg('Zu viele falsche PINs. Wieder möglich ab '+uhr(s)+'.',true);
      const b=this; busy(b,true); msg('Anmelden …');
      try{
        const f2=await fb(); await f2.bereit(); const uid=await f2.an(m,p); pinOk(m);
        const g=await f2.get('spieler/'+uid), d=await f2.get(pfad('spieler/'+uid));
        const name=(g&&g.name)||(d&&d.name)||m.split('@')[0];
        if(!d) await f2.set(pfad('spieler/'+uid), {name, erstellt:Date.now(), zuletzt:Date.now(), stand:'', standTs:0});
        kontoSetzen({uid, name, email:m, seit:(g&&g.erstellt)||Date.now()});
        nachAnmelden(true); zeige('konto'); msg('Willkommen zurück, '+name+'!');
      }catch(x){ busy(b,false);
        if(/invalid-credential|wrong-password|user-not-found|invalid-login/.test((x&&x.code)||'')){ const r=pinFalsch(m); return msg(r>0?'E-Mail oder PIN ist falsch. Noch '+r+' Versuche.':'Zu viele falsche PINs – kurz gesperrt.',true); }
        msg(fehlerText(x),true); }
    };
  }
  function vVergessen(){
    titel('🔑 PIN VERGESSEN');
    box.innerHTML = `<p class="klein">Wir schicken dir eine E-Mail. Dort legst du eine neue 6-stellige PIN fest.</p><label>E-Mail</label><input id="scMail" type="email" value="${esc(entwurf.mail||'')}">
      <div class="sc-k"><button class="sc-b" id="scZ">◀ ZURÜCK</button><button class="sc-b gold" id="scOk">✉️ SENDEN</button></div><div class="sc-msg" id="scM"></div>`;
    q('scZ').onclick=()=>zeige('login');
    q('scOk').onclick=async function(){ const m=q('scMail').value.trim().toLowerCase(), f=mailPruefen(m); if(f) return msg(f,true);
      busy(this,true); try{ const f2=await fb(); await f2.pinMail(m); msg('E-Mail ist unterwegs. Schau auch im Spam-Ordner nach.'); }catch(x){ msg(fehlerText(x),true); } busy(this,false); };
  }
  function vAgb(){
    titel('📄 NUTZUNG & DATENSCHUTZ');
    box.innerHTML = `<div class="agb"><p><b>Silescrow ID</b> – ein Konto für alle Silescrow-Spiele (z. B. Silescrow Cup, ${esc(SP.name)}).</p>
      <p><b>Was gespeichert wird:</b> dein Online-Name, deine E-Mail, deine Spielstände, deine Freundesliste und Support-Nachrichten. Die PIN wird nur verschlüsselt bei Google Firebase gespeichert – niemand kann sie lesen.</p>
      <p><b>Wofür:</b> damit du dich anmelden, auf anderen Geräten weiterspielen und mit Freunden online spielen kannst. Keine Werbung, kein Verkauf von Daten.</p>
      <p><b>Fair spielen:</b> keine Beleidigungen, keine Betrügereien. Wer sich nicht daran hält, kann gesperrt werden.</p>
      <p><b>Löschen:</b> Schreib dem Support, dann wird deine Silescrow ID mit allen Daten gelöscht.</p>
      <p><b>Unter 16:</b> nur mit Einverständnis deiner Eltern.</p></div>
      <div class="sc-k"><button class="sc-b" id="scZ">◀ ZURÜCK</button></div>`;
    q('scZ').onclick=()=>zeige(entwurf.zurueck||'start');
  }
  function vGesperrt(){
    titel('🚫 GESPERRT');
    box.innerHTML = `<p>Deine Silescrow ID ist gesperrt. Online spielen und Cloud-Speichern gehen nicht.</p><p class="klein">Offline gegen den Computer kannst du weiter spielen. Wenn du denkst, das ist ein Fehler, schreib dem Support.</p>
      <div class="sc-k"><button class="sc-b" id="scSup">💬 Support</button><button class="sc-b" id="scZ">OK</button></div>`;
    q('scSup').onclick=()=>zeige('support'); q('scZ').onclick=()=>{ o.hidden=true; ansicht=null; };
  }

  // ---------- Konto ----------
  function vKonto(){
    const k=konto(); if(!k) return zeige('start');
    titel('👤 '+k.name.toUpperCase());
    const s=jget(kSync(),null);
    box.innerHTML = `<p class="klein">Silescrow ID · ${esc(k.email||'')}</p>
      <p>${SC.gesperrt?'🚫 <b>Gesperrt</b>':!SC.netz?'📴 Offline – wird gesichert, sobald du wieder Internet hast':s&&s.t?'☁️ In der Cloud gesichert: '+uhr(s.t):'☁️ Noch nicht in der Cloud gesichert'}</p>
      <div class="sc-k"><button class="sc-b gold sc-online" id="scFr">👥 FREUNDE${FR.anfragen.length?' ('+FR.anfragen.length+')':''}</button><button class="sc-b sc-online" id="scSi">☁️ JETZT SICHERN</button></div>
      <div class="sc-k"><button class="sc-b sc-online" id="scSup">💬 SUPPORT</button>${SC.admin?'<button class="sc-b" id="scAd">🛡️ ADMIN</button>':''}</div>
      <div id="scNews"></div>
      <div class="sc-k"><button class="sc-b rot mini" id="scAb">Abmelden</button></div><div class="sc-msg" id="scM"></div>`;
    q('scFr').onclick=()=>zeige('freunde'); q('scSup').onclick=()=>zeige('support');
    q('scSi').onclick=async function(){ busy(this,true); const r=await hochladen(true); busy(this,false); msg(r==='ok'||r==='gleich'?'Gesichert ✔':r==='leer'?'Noch kein Spielstand zum Sichern.':r==='gross'?'Spielstand zu groß für die Cloud.':'Gerade nicht möglich – später automatisch.', r!=='ok'&&r!=='gleich'); vKontoWolke(); };
    if(q('scAd')) q('scAd').onclick=()=>zeige('admin');
    q('scAb').onclick=async()=>{ if(!confirm('Wirklich abmelden? Dein Spielstand bleibt auf diesem Gerät.')) return; await hochladen(false); try{ const f2=await fb(); await f2.ab(); }catch(e){}
      lsDel(kSync()); hoerenAus(); SC.admin=false; kontoSetzen(null); zeige('start'); };
    if(NEWS.length) q('scNews').innerHTML='<p class="klein" style="margin-top:12px">📰 Neuigkeiten</p>'+NEWS.slice(0,3).map(n=>`<div class="sc-row"><div class="n">${esc(n.text)}<small>${uhr(n.t)}</small></div></div>`).join('');
  }
  function vKontoWolke(){ if(ansicht==='konto') setTimeout(()=>{ if(ansicht==='konto') vKonto(); }, 900); }

  // ---------- Cloud-Speichern (spiele/<spiel>/spieler/<uid>) ----------
  let laeuft=false;
  async function hochladen(zwingen){
    const k=konto(); if(!k || SC.gesperrt || !SC.netz || laeuft) return 'nein';
    const roh = SP.sammeln && SP.sammeln(); if(!roh) return 'leer';
    const h=hash(roh), s=jget(kSync(),null);
    if(!zwingen && s && s.uid===k.uid && s.h===h) return 'gleich';
    laeuft=true;
    try{
      const f2=await fbIch(), stand=await packen(roh);
      if(stand.length>900000) return 'gross';
      const ts=(SP.zeit&&SP.zeit())||Date.now();
      await f2.set(pfad('spieler/'+k.uid), {name:k.name, stand, standTs:ts, zuletzt:Date.now(), version:SP.version||'', geraet:geraet(), info:(SP.info&&SP.info())||null}, true);
      lsSet(kSync(), JSON.stringify({uid:k.uid, h, ts, t:Date.now()})); ecke();
      return 'ok';
    }catch(e){ return 'offline'; }
    finally{ laeuft=false; }
  }
  SC.sichern = () => hochladen(false);
  // beim Anmelden / Start: neuerer Stand gewinnt, Admin-Löschung wird übernommen
  async function abgleich(){
    const k=konto(); if(!k) return;
    try{
      const f2=await fbIch(), d=await f2.get(pfad('spieler/'+k.uid)); if(!d) return hochladen(true);
      const gesehen=+lsGet('scAdminReset_'+SP.id)||0;
      if(d.adminReset && d.adminReset>gesehen){ lsSet('scAdminReset_'+SP.id, String(d.adminReset)); lsDel(kSync()); try{ SP.loeschen&&SP.loeschen(); }catch(e){} pop('🧹 <b>Neustart</b><br>Dein Spielstand wurde vom Admin zurückgesetzt.'); return; }
      const lokalTs=(SP.zeit&&SP.zeit())||0;
      if(d.stand && (d.standTs||0) > lokalTs+1000 && !(SP.inSpiel&&SP.inSpiel())){
        const roh=await auspacken(d.stand); if(roh){ SP.anwenden(roh); lsSet(kSync(), JSON.stringify({uid:k.uid, h:hash(roh), ts:d.standTs, t:Date.now()})); toast('☁️ Spielstand aus der Cloud geladen ('+uhr(d.standTs)+')'); ecke(); return; }
      }
      hochladen(false);
    }catch(e){}
  }
  setInterval(()=>{ if(konto()) hochladen(false); }, 60e3);
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && konto()) hochladen(false); });
  addEventListener('pagehide', ()=>{ if(konto()) hochladen(false); });

  // ---------- nach Start / Anmelden: Admin? gesperrt? Liste, Anwesenheit, Live-Listen ----------
  const FR = { liste:[], anfragen:[], einl:[], praes:{}, raeume:{}, aus:[] };
  let NEWS = [], hoerUid=null, praesT=0;
  async function nachAnmelden(neu){
    const k=konto(); if(!k || !SP || !SC.netz) return;
    try{
      const f2=await fbIch();
      SC.admin = !!(await f2.get('admins/'+k.uid).catch(()=>null));
      SC.gesperrt = !!(await f2.get('sperren/'+k.uid).catch(()=>null));
      if(SC.gesperrt){ zeige('gesperrt'); ecke(); return; }
      await f2.set(pfad('liste/'+k.uid), {name:k.name, email:k.email||'', zuletzt:Date.now(), version:SP.version||'', info:(SP.info&&SP.info())||null, erstellt:k.seit||0}, true);
      praesenz(); hoeren(); ecke(); abgleich();
      f2.liste(pfad('news'), 5).then(l=>{ NEWS=l; const n=l[0], g=lsGet('scNews_'+SP.id); if(n && n.id!==g && Date.now()-(n.t||0)<14*864e5){ lsSet('scNews_'+SP.id, n.id); pop('📰 <b>Neuigkeit</b><br>'+esc(n.text)); } }).catch(()=>{});
    }catch(e){ if(/nicht-angemeldet/.test((e&&e.code)||'') && SC.netz){ // Firebase-Sitzung weg (z. B. Browserdaten gelöscht): neu anmelden
        kontoSetzen(null); if(SP.pflicht!==false) zeige('start'); } }
  }
  function praesenz(){ const k=konto(); if(!k || document.hidden || !SC.netz) return; fbIch().then(f2=>f2.set('praesenz/'+k.uid, {name:k.name, t:Date.now(), spiel:SP.id})).catch(()=>{}); }
  setInterval(praesenz, 2*60e3);
  function hoerenAus(){ FR.aus.forEach(f=>{ try{ f(); }catch(e){} }); FR.aus=[]; FR.liste=[]; FR.anfragen=[]; FR.einl=[]; hoerUid=null; }
  function hoeren(){
    const k=konto(); if(!k || hoerUid===k.uid) return; hoerenAus(); hoerUid=k.uid;
    fbIch().then(f2=>{ if(!f2.hoere) return;
      FR.aus.push(f2.hoere('freunde/'+k.uid+'/liste', l=>{ FR.liste=l; freundeStatus(); if(ansicht==='freunde') vFreunde(); }));
      FR.aus.push(f2.hoere('anfragen/'+k.uid+'/von', l=>{ const neu=l.filter(x=>!FR.anfragen.some(y=>y.id===x.id)); FR.anfragen=l; ecke(); if(ansicht==='freunde') vFreunde();
        neu.forEach(x=>{ if(Date.now()-(x.t||0)<10*60e3) pop('👥 <b>'+esc(x.name)+'</b> möchte dein Freund sein.', [['Annehmen',()=>anfrageJa(x),1],['Später',null]]); }); }));
      FR.aus.push(f2.hoere('einladungen/'+k.uid+'/von', l=>{ l.forEach(x=>{ if(x.spiel!==SP.id) return; if(Date.now()-(x.t||0) > 10*60e3){ f2.del('einladungen/'+k.uid+'/von/'+x.id).catch(()=>{}); return; }
        if(FR.einl.includes(x.id+x.t)) return; FR.einl.push(x.id+x.t);
        pop('🎮 <b>'+esc(x.name)+'</b> lädt dich in seinen Raum ein!', [['Beitreten',()=>{ f2.del('einladungen/'+k.uid+'/von/'+x.id).catch(()=>{}); SP.beitreten&&SP.beitreten({code:x.code, schluessel:x.schluessel, name:x.name}); },1],['Nein',()=>f2.del('einladungen/'+k.uid+'/von/'+x.id).catch(()=>{})]], 60e3); }); }));
      FR.aus.push(f2.hoere(pfad('geschenke/'+k.uid+'/liste'), l=>l.forEach(geschenk)));
      FR.aus.push(f2.hoere(pfad('befehle/'+k.uid+'/liste'), l=>l.forEach(befehl)));
    }).catch(()=>{});
  }
  const gezeigt=new Set();
  function geschenk(g){
    if(gezeigt.has(g.id)) return; gezeigt.add(g.id);
    const k=konto(), weg=()=>fbIch().then(f2=>f2.del(pfad('geschenke/'+k.uid+'/liste/'+g.id))).catch(()=>{});
    const res = g.res && Object.entries(g.res).filter(([,v])=>v>0);
    const was = res&&res.length ? res.map(([r,v])=>v+' '+((SP.ressourcen||[]).find(x=>x[0]===r)||[r,r])[1]).join(', ') : '';
    pop(`${was?'🎁 <b>Geschenk vom Admin</b>':'✉️ <b>Nachricht vom Admin</b>'}${was?'<br>'+esc(was):''}${g.text?'<br>„'+esc(g.text)+'“':''}`,
      [[was?'Annehmen':'OK', ()=>{ if(was){ try{ SP.geschenk&&SP.geschenk(g.res); }catch(e){} } weg(); },1]]);
  }
  function befehl(b){
    if(gezeigt.has(b.id)) return; gezeigt.add(b.id);
    const k=konto(); fbIch().then(f2=>f2.del(pfad('befehle/'+k.uid+'/liste/'+b.id))).catch(()=>{});
    if(Date.now()-(b.t||0) > 10*60e3) return;
    if(b.art==='werfen'){ try{ SP.werfen&&SP.werfen(b.text); }catch(e){} pop('👢 <b>Du wurdest vom Admin aus dem Spiel genommen.</b>'+(b.text?'<br>„'+esc(b.text)+'“':'')); }
  }
  // kleine Hinweis-Karten oben
  function pop(html, knoepfe, dauer){
    bauen(); const p=document.createElement('div'); p.className='pop'; p.innerHTML=html+(knoepfe&&knoepfe.length?'<div class="sc-k">'+knoepfe.map((b,i)=>`<button data-i="${i}" class="${b[2]?'gold':''}">${esc(b[0])}</button>`).join('')+'</div>':'');
    document.getElementById('scPop').appendChild(p);
    const weg=()=>p.remove();
    p.querySelectorAll('button').forEach(b=>b.onclick=()=>{ klick(); weg(); const f=knoepfe[+b.dataset.i][1]; if(f) f(); });
    if(!knoepfe || !knoepfe.length) setTimeout(weg, 7000); else if(dauer) setTimeout(weg, dauer);
  }
  SC.pop = pop;

  // ---------- Freunde ----------
  function freundeStatus(){
    fbIch().then(f2=>FR.liste.forEach(f=>{
      f2.get('praesenz/'+f.id).then(p=>{ FR.praes[f.id]=p||null; if(ansicht==='freunde') vFreunde(); }).catch(()=>{});
      f2.get(pfad('raeume/'+f.id)).then(r=>{ FR.raeume[f.id]= r&&r.code&&Date.now()-(r.t||0)<ONLINE_MS ? r : null; if(ansicht==='freunde') vFreunde(); try{ SP.raeume&&SP.raeume(SC.freundesRaeume()); }catch(e){} }).catch(()=>{});
    })).catch(()=>{});
  }
  setInterval(()=>{ if(konto() && FR.liste.length && (ansicht==='freunde' || (SP.raeume && SP.zeigtRaeume && SP.zeigtRaeume()))) freundeStatus(); }, 15000);
  SC.freunde = () => FR.liste.map(f=>({id:f.id, name:f.name, online:onl(f.id)}));
  SC.freundesRaeume = () => FR.liste.map(f=>FR.raeume[f.id] ? Object.assign({uid:f.id}, FR.raeume[f.id]) : null).filter(Boolean);
  SC.freundeLaden = freundeStatus;
  const onl = id => { const p=FR.praes[id]; return !!(p && Date.now()-(p.t||0)<ONLINE_MS+60e3); };
  async function anfrageJa(a){
    const k=konto(), t=Date.now();
    try{ const f2=await fbIch(); await f2.set('freunde/'+k.uid+'/liste/'+a.id, {name:a.name||'', seit:t}); await f2.set('freunde/'+a.id+'/liste/'+k.uid, {name:k.name, seit:t}); await f2.del('anfragen/'+k.uid+'/von/'+a.id); toast('👥 '+a.name+' ist jetzt dein Freund'); }
    catch(e){ toast(fehlerText(e)); }
  }
  let suchErg=[];
  function vFreunde(){
    const k=konto(); if(!k) return zeige('start');
    titel('👥 FREUNDE');
    const akt = document.activeElement && document.activeElement.id==='scS' ? q('scS').value : (vFreunde.s||'');
    box.innerHTML = `<label>Freund suchen (Online-Name)</label><div style="display:flex;gap:6px"><input id="scS" maxlength="12" autocomplete="off" value="${esc(akt)}"><button class="sc-b mini" id="scSu">🔍</button></div>
      <div class="sc-list" id="scSE">${suchErg.map(x=>`<div class="sc-row"><div class="n">${esc(x.id)}</div>${x.uid===k.uid?'<small>du</small>':FR.liste.some(f=>f.id===x.uid)?'<small>✔ Freund</small>':`<button class="sc-b mini" data-add="${x.uid}" data-n="${esc(x.id)}">➕ Anfrage</button>`}</div>`).join('')}</div>
      ${FR.anfragen.length?'<p class="klein" style="margin-top:10px">Anfragen</p><div class="sc-list">'+FR.anfragen.map(a=>`<div class="sc-row"><div class="n">${esc(a.name)}</div><button class="sc-b mini gold" data-ja="${a.id}">✔</button><button class="sc-b mini rot" data-nein="${a.id}">✕</button></div>`).join('')+'</div>':''}
      <p class="klein" style="margin-top:10px">Deine Freunde (${FR.liste.length})</p>
      <div class="sc-list">${FR.liste.length?FR.liste.map(f=>{ const r=FR.raeume[f.id]; return `<div class="sc-row"><span class="dot ${onl(f.id)?'an':''}"></span><div class="n">${esc(f.name)}<small>${r?'🎮 hat einen Raum offen'+(r.schloss?' 🔒':''):onl(f.id)?'online':'offline'}</small></div>${r&&SP.beitreten?`<button class="sc-b mini gold" data-rein="${f.id}">Beitreten</button>`:''}<button class="sc-b mini rot" data-weg="${f.id}" title="Entfernen">✕</button></div>`; }).join(''):'<p class="klein">Noch keine Freunde – such oben nach ihrem Online-Namen.</p>'}</div>
      <div class="sc-k"><button class="sc-b" id="scZ">◀ ZURÜCK</button></div><div class="sc-msg" id="scM"></div>`;
    const such=async()=>{ const s=nameNorm(q('scS').value); vFreunde.s=s; if(s.length<2) return msg('Mindestens 2 Buchstaben.',true);
      try{ const f2=await fbIch(); suchErg=await f2.suche(s); vFreunde(); if(!suchErg.length) msg('Niemand gefunden.',true); }catch(e){ msg(fehlerText(e),true); } };
    q('scSu').onclick=such; q('scS').onkeydown=e=>{ if(e.key==='Enter') such(); };
    q('scZ').onclick=()=>zeige('konto');
    o.querySelectorAll('[data-add]').forEach(b=>b.onclick=async()=>{ try{ const f2=await fbIch(); await f2.set('anfragen/'+b.dataset.add+'/von/'+k.uid, {name:k.name, t:Date.now()}); b.outerHTML='<small>gesendet ✔</small>'; }catch(e){ msg(fehlerText(e),true); } });
    o.querySelectorAll('[data-ja]').forEach(b=>b.onclick=()=>anfrageJa(FR.anfragen.find(a=>a.id===b.dataset.ja)));
    o.querySelectorAll('[data-nein]').forEach(b=>b.onclick=async()=>{ try{ const f2=await fbIch(); await f2.del('anfragen/'+k.uid+'/von/'+b.dataset.nein); }catch(e){} });
    o.querySelectorAll('[data-weg]').forEach(b=>b.onclick=async()=>{ const f=FR.liste.find(x=>x.id===b.dataset.weg); if(!f || !confirm(f.name+' als Freund entfernen?')) return;
      try{ const f2=await fbIch(); await f2.del('freunde/'+k.uid+'/liste/'+f.id); await f2.del('freunde/'+f.id+'/liste/'+k.uid).catch(()=>{}); }catch(e){ msg(fehlerText(e),true); } });
    o.querySelectorAll('[data-rein]').forEach(b=>b.onclick=()=>{ const r=FR.raeume[b.dataset.rein]; o.hidden=true; ansicht=null; SP.beitreten({code:r.code, schloss:r.schloss, name:r.name}); });
  }
  // Einladen aus dem eigenen Raum heraus (nur dort gibt es den Knopf)
  SC.einladen = function(raum){
    if(!konto()) return zeige('start');
    bauen(); ansicht='einladen'; o.hidden=false; o.querySelector('.sc-zu').hidden=false; titel('👥 FREUNDE EINLADEN');
    const k=konto(), mal=()=>{ box.innerHTML = `<p class="klein">Tippe auf einen Freund – er bekommt sofort eine Einladung in deinen Raum (ohne Passwort).</p>
      <div class="sc-list">${FR.liste.length?FR.liste.map(f=>`<div class="sc-row"><span class="dot ${onl(f.id)?'an':''}"></span><div class="n">${esc(f.name)}<small>${onl(f.id)?'online':'offline'}</small></div><button class="sc-b mini gold" data-ein="${f.id}">📨 Einladen</button></div>`).join(''):'<p class="klein">Du hast noch keine Freunde. Füge sie über 👤 Silescrow ID → Freunde hinzu.</p>'}</div>
      <div class="sc-k"><button class="sc-b" id="scZ">FERTIG</button></div><div class="sc-msg" id="scM"></div>`;
      q('scZ').onclick=()=>{ o.hidden=true; ansicht=null; };
      o.querySelectorAll('[data-ein]').forEach(b=>b.onclick=async()=>{ busy(b,true);
        try{ const f2=await fbIch(); await f2.set('einladungen/'+b.dataset.ein+'/von/'+k.uid, {name:k.name, spiel:SP.id, code:String(raum.code), schluessel:raum.schluessel||'', t:Date.now()}); b.textContent='✔ Eingeladen'; }
        catch(e){ busy(b,false); msg(fehlerText(e),true); } }); };
    mal(); freundeStatus();
  };
  // eigenen Raum für Freunde sichtbar machen
  let raumIv=0;
  SC.raumOffen = function(raum){
    const k=konto(); if(!k) return; clearInterval(raumIv);
    const melden=()=>fbIch().then(f2=>f2.set(pfad('raeume/'+k.uid), {name:k.name, code:String(raum.code), schloss:!!raum.schloss, plaetze:raum.plaetze||0, t:Date.now()})).catch(()=>{});
    melden(); raumIv=setInterval(melden, 60e3);
  };
  SC.raumZu = function(){ clearInterval(raumIv); raumIv=0; const k=konto(); if(k) fbIch().then(f2=>f2.del(pfad('raeume/'+k.uid))).catch(()=>{}); };
  addEventListener('pagehide', ()=>{ if(raumIv) SC.raumZu(); });

  // ---------- Support ----------
  async function vSupport(){
    const k=konto(); titel('💬 SUPPORT');
    box.innerHTML = `<p class="klein">Schreib dem Admin – du bekommst hier die Antwort.</p><div class="chat" id="scC"><p class="klein">Lade …</p></div>
      <textarea id="scTx" rows="3" maxlength="400" placeholder="Deine Nachricht …"></textarea>
      <div class="sc-k"><button class="sc-b" id="scZ">◀ ZURÜCK</button><button class="sc-b gold" id="scOk">✉️ SENDEN</button></div><div class="sc-msg" id="scM"></div>`;
    q('scZ').onclick=()=>zeige(k?'konto':'start');
    let f2; try{ f2=await fb(); await f2.bereit(); if(!f2.ich()) await f2.anon(); }catch(e){ q('scC').innerHTML=''; return msg(fehlerText(e),true); }
    const uid=f2.ich().uid;
    const laden=()=>f2.liste('support/'+uid+'/nachrichten', 30).then(l=>{ if(ansicht!=='support') return; q('scC').innerHTML=l.length?l.reverse().map(n=>`<div class="${n.vonAdmin?'adm':''}">${n.vonAdmin?'🛡️ ':''}${esc(n.text)}<small style="display:block;font-size:11px;color:#aab">${uhr(n.t)}</small></div>`).join(''):'<p class="klein">Noch keine Nachrichten.</p>'; q('scC').scrollTop=1e9; f2.set('support/'+uid, {neuAdmin:false}, true).catch(()=>{}); }).catch(()=>{ q('scC').innerHTML=''; });
    laden();
    q('scOk').onclick=async function(){ const t=q('scTx').value.trim(); if(!t) return; busy(this,true); const j=Date.now();
      try{ await f2.set('support/'+uid, {name:k?k.name:'⚠️ nicht angemeldet', email:k?k.email:'', t:j, offen:true, geraet:geraet(), spiel:SP.id, ablauf:j+30*864e5}, true);
        await f2.add('support/'+uid+'/nachrichten', {text:t.slice(0,400), vonAdmin:false, t:j, ablauf:j+30*864e5, spiel:SP.id}); q('scTx').value=''; msg('Gesendet ✔'); laden(); }
      catch(e){ msg(fehlerText(e),true); } busy(this,false); };
  }

  // ---------- Admin ----------
  async function vAdmin(){
    if(!SC.admin) return zeige('konto');
    titel('🛡️ ADMIN – '+SP.name.toUpperCase());
    const tabs=[['spieler','👥 Spieler'],['alle','🎁 An alle'],['news','📰 News'],['support','💬 Support']];
    box.innerHTML = `<div class="tabs">${tabs.map(t=>`<button data-t="${t[0]}" class="${adminTab===t[0]?'on':''}">${t[1]}</button>`).join('')}</div><div id="scA"><p class="klein">Lade …</p></div><div class="sc-msg" id="scM"></div>`;
    o.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ adminTab=b.dataset.t; vAdmin(); });
    const A=q('scA'); let f2; try{ f2=await fbIch(); }catch(e){ return msg(fehlerText(e),true); }
    if(adminTab==='spieler') return adminSpieler(A,f2);
    if(adminTab==='alle') return adminGeschenk(A,f2,null);
    if(adminTab==='news') return adminNews(A,f2);
    if(adminTab==='support') return adminSupport(A,f2);
  }
  let adminFilter='';
  async function adminSpieler(A,f2){
    let l=[], pr=[], gs=[];
    try{ [l,pr,gs]=await Promise.all([f2.alle(pfad('liste')), f2.alle('praesenz').catch(()=>[]), f2.alle('sperren').catch(()=>[])]); }catch(e){ A.innerHTML=''; return msg(fehlerText(e),true); }
    const P=Object.fromEntries(pr.map(p=>[p.id,p])), S=new Set(gs.map(g=>g.id));
    l.forEach(x=>{ const p=P[x.id]; x.on = p && Date.now()-(p.t||0)<ONLINE_MS+60e3; x.hier = x.on && p.spiel===SP.id; x.ges=S.has(x.id); });
    l.sort((a,b)=>(b.on-a.on)||((b.zuletzt||0)-(a.zuletzt||0)));
    const mal=()=>{ const f=adminFilter.toLowerCase(), v=l.filter(x=>!f || (x.name||'').includes(f) || (x.email||'').includes(f));
      A.innerHTML = `<p class="klein">${l.length} Spieler · ${l.filter(x=>x.hier).length} gerade in ${esc(SP.name)} online</p><input id="scF" placeholder="Suchen (Name oder E-Mail)" value="${esc(adminFilter)}">
      <div class="sc-list">${v.map(x=>`<div class="sc-row"><span class="dot ${x.on?'an':''}"></span><div class="n">${x.ges?'🚫 ':''}${esc(x.name)}<small>${esc(x.email||'')} · ${x.hier?'spielt gerade':x.on?'online':'zuletzt '+uhr(x.zuletzt)} · V${esc(x.version||'?')}</small></div><button class="sc-b mini gold" data-sp="${x.id}">⚙️</button></div>`).join('')}</div>`;
      const fi=q('scF'); fi.oninput=()=>{ adminFilter=fi.value; const pos=fi.selectionStart; mal(); const n=q('scF'); n.focus(); n.setSelectionRange(pos,pos); };
      A.querySelectorAll('[data-sp]').forEach(b=>b.onclick=()=>adminEiner(A,f2,l.find(x=>x.id===b.dataset.sp))); };
    mal();
  }
  function adminEiner(A,f2,x){
    const k=konto();
    A.innerHTML = `<p><b>${esc(x.name)}</b> ${x.ges?'🚫 gesperrt':''}<br><span class="klein">${esc(x.email||'')} · ${x.hier?'spielt gerade':x.on?'online':'zuletzt '+uhr(x.zuletzt)} · V${esc(x.version||'?')}</span></p>
      ${x.info?`<p class="klein">${esc(Object.entries(x.info).map(([a,b])=>a+': '+b).join(' · '))}</p>`:''}
      <div class="sc-k"><button class="sc-b gold" id="aG">🎁 Geschenk / Nachricht</button></div>
      <div class="sc-k"><button class="sc-b" id="aW" ${x.hier?'':'disabled'}>👢 Aus dem Spiel werfen</button><button class="sc-b" id="aR">🧹 Spielstand löschen</button></div>
      <div class="sc-k"><button class="sc-b rot" id="aS">${x.ges?'✅ Entsperren':'🚫 Sperren'}</button></div>
      <div class="sc-k"><button class="sc-b" id="aZ">◀ ZURÜCK</button></div>`;
    q('aZ').onclick=()=>adminSpieler(A,f2);
    q('aG').onclick=()=>adminGeschenk(A,f2,x);
    q('aW').onclick=async()=>{ const t=prompt('Grund (optional):','')||''; try{ await f2.add(pfad('befehle/'+x.id+'/liste'), {art:'werfen', text:t.slice(0,200), t:Date.now(), von:k.name}); msg('👢 '+x.name+' wird aus dem Spiel genommen.'); }catch(e){ msg(fehlerText(e),true); } };
    q('aR').onclick=async()=>{ if(!confirm('Spielstand von '+x.name+' in '+SP.name+' wirklich löschen? Die Silescrow ID bleibt.')) return; const t=Date.now();
      try{ await f2.set(pfad('spieler/'+x.id), {stand:'', standTs:t, adminReset:t}, true); await f2.set(pfad('liste/'+x.id), {info:null}, true); msg('🧹 Gelöscht. Beim nächsten Start fängt '+x.name+' neu an.'); }catch(e){ msg(fehlerText(e),true); } };
    q('aS').onclick=async()=>{
      try{ if(x.ges){ await f2.del('sperren/'+x.id); x.ges=false; msg('✅ '+x.name+' ist entsperrt.'); }
        else { const g=prompt('Grund der Sperre:',''); if(g===null) return; await f2.set('sperren/'+x.id, {name:x.name, grund:g.slice(0,200), t:Date.now(), von:k.name}); await f2.add(pfad('befehle/'+x.id+'/liste'), {art:'werfen', text:'Gesperrt'+(g?': '+g:''), t:Date.now()}).catch(()=>{}); x.ges=true; msg('🚫 '+x.name+' ist in allen Silescrow-Spielen gesperrt.'); }
        adminEiner(A,f2,x); }catch(e){ msg(fehlerText(e),true); } };
  }
  function adminGeschenk(A,f2,x){
    const R=SP.ressourcen||[];
    A.innerHTML = `<p>${x?'An <b>'+esc(x.name)+'</b>':'An <b>alle Spieler</b> von '+esc(SP.name)}</p>
      ${R.length?'<div class="res">'+R.map(r=>`<label>${esc(r[1])}<input type="number" min="0" step="50" data-r="${r[0]}" value="0"></label>`).join('')+'</div>':''}
      <label>Nachricht (optional)</label><textarea id="aT" rows="2" maxlength="200"></textarea>
      <div class="sc-k">${x?'<button class="sc-b" id="aZ">◀ ZURÜCK</button>':''}<button class="sc-b gold" id="aOk">📨 SENDEN</button></div>`;
    if(x) q('aZ').onclick=()=>adminEiner(A,f2,x);
    q('aOk').onclick=async function(){
      const res={}; A.querySelectorAll('[data-r]').forEach(i=>{ const v=Math.max(0,Math.round(+i.value||0)); if(v) res[i.dataset.r]=v; });
      const text=q('aT').value.trim(); if(!Object.keys(res).length && !text) return msg('Bitte Rohstoffe oder eine Nachricht eingeben.',true);
      busy(this,true); const g={res, text, t:Date.now(), von:konto().name};
      try{ const ziel = x ? [x.id] : (await f2.alle(pfad('liste'))).map(y=>y.id);
        for(const id of ziel) await f2.add(pfad('geschenke/'+id+'/liste'), g);
        msg('✔ Gesendet an '+ziel.length+' Spieler.'); }catch(e){ msg(fehlerText(e),true); } busy(this,false); };
  }
  async function adminNews(A,f2){
    let l=[]; try{ l=await f2.liste(pfad('news'), 20); }catch(e){}
    A.innerHTML = `<label>Neue Nachricht im Hauptmenü (für alle)</label><textarea id="aT" rows="3" maxlength="300"></textarea>
      <div class="sc-k"><button class="sc-b gold" id="aOk">📰 VERÖFFENTLICHEN</button></div>
      <div class="sc-list">${l.map(n=>`<div class="sc-row"><div class="n">${esc(n.text)}<small>${uhr(n.t)}</small></div><button class="sc-b mini rot" data-d="${n.id}">✕</button></div>`).join('')}</div>`;
    q('aOk').onclick=async()=>{ const t=q('aT').value.trim(); if(!t) return; try{ await f2.add(pfad('news'), {text:t, t:Date.now(), von:konto().name}); msg('✔ Veröffentlicht'); adminNews(A,f2); }catch(e){ msg(fehlerText(e),true); } };
    A.querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{ try{ await f2.del(pfad('news/'+b.dataset.d)); adminNews(A,f2); }catch(e){ msg(fehlerText(e),true); } });
  }
  async function adminSupport(A,f2,uid){
    if(uid){
      let l=[]; try{ l=await f2.liste('support/'+uid+'/nachrichten', 40); }catch(e){}
      A.innerHTML = `<div class="chat">${l.reverse().map(n=>`<div class="${n.vonAdmin?'adm':''}">${esc(n.text)}<small style="display:block;font-size:11px;color:#aab">${uhr(n.t)}${n.spiel?' · '+esc(n.spiel):''}</small></div>`).join('')}</div>
        <textarea id="aT" rows="2" maxlength="400" placeholder="Antwort …"></textarea><div class="sc-k"><button class="sc-b" id="aZ">◀ ZURÜCK</button><button class="sc-b gold" id="aOk">✉️ ANTWORTEN</button></div>`;
      q('aZ').onclick=()=>adminSupport(A,f2);
      q('aOk').onclick=async()=>{ const t=q('aT').value.trim(); if(!t) return; const j=Date.now();
        try{ await f2.add('support/'+uid+'/nachrichten', {text:t, vonAdmin:true, t:j, ablauf:j+30*864e5}); await f2.set('support/'+uid, {neuAdmin:true, offen:false, tAdmin:j}, true); adminSupport(A,f2,uid); }catch(e){ msg(fehlerText(e),true); } };
      return;
    }
    let l=[]; try{ l=await f2.alle('support'); }catch(e){ return msg(fehlerText(e),true); }
    l.sort((a,b)=>(b.offen-a.offen)||((b.t||0)-(a.t||0)));
    A.innerHTML = `<div class="sc-list">${l.length?l.map(s=>`<div class="sc-row"><div class="n">${s.offen?'🔴 ':''}${esc(s.name||'?')}<small>${esc(s.email||'')} · ${uhr(s.t)}${s.spiel?' · '+esc(s.spiel):''}</small></div><button class="sc-b mini gold" data-u="${s.id}">Öffnen</button></div>`).join(''):'<p class="klein">Keine Support-Nachrichten.</p>'}</div>`;
    A.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>adminSupport(A,f2,b.dataset.u));
  }

  // ---------- Start ----------
  /* SC.init({
       id:'earth-empire', name:'Earth Empire', version:'1.54',
       sammeln:()=>string|null,  anwenden:(string)=>void,  zeit:()=>ms des lokalen Stands,  loeschen:()=>void,  info:()=>{...},
       ressourcen:[['food','Nahrung'],...],  geschenk:(res)=>void,  werfen:(grund)=>void,
       beitreten:({code,schluessel,schloss,name})=>void,  inSpiel:()=>bool,  imMenue:()=>bool,  netz:(an)=>void,
       toast:(t)=>void,  klick:()=>void,  pflicht:true }) */
  SC.init = function(cfg){
    SP = cfg; bauen(); SC.bereit = true; netzSetzen(navigator.onLine!==false);
    // Prüfen, ob wirklich Internet da ist (navigator.onLine lügt manchmal)
    if(SC.netz) fetch('version.txt?t='+Date.now(), {cache:'no-store'}).then(r=>{ if(!r.ok) throw 0; }).catch(()=>{ if(location.protocol!=='file:') netzSetzen(false); });
    if(konto()) nachAnmelden();
    const iv=setInterval(()=>{ if(SP.imMenue && !SP.imMenue()) return; clearInterval(iv); if(!konto() && pflicht()) zeige('start'); ecke(); }, 400);   // erst wenn das Hauptmenü da ist
  };
})();
