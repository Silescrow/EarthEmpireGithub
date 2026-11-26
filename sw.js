// EARTH EMPIRE – Service Worker: Spiel ohne Internet (z. B. im Flugzeug).
// Immer zuerst aus dem Netz (Updates kommen sofort). Ohne Internet: die zuletzt geladene Version aus dem Speicher.
const CACHE = 'earth-empire-v1';
const KERN = ['./', 'index.html', 'game.js', 'audio.js', 'online.js', 'silescrow.js', 'three.min.js', 'manifest.webmanifest',
  'menue.jpg', 'laden.jpg', 'weltkarte.png', 'icon-192.png', 'icon-512.png', 'musik_menue.mp3', 'musik_spiel.mp3'];
const STAMM = new URL('./', self.location.href).href;
const schluessel = r => { if (r.mode === 'navigate') return STAMM; const x = new URL(r.url); if (x.origin === location.origin) x.search = ''; return x.href; };   // ?v=1.53 egal
const ablegen = (k, res) => { if (res && (res.ok || res.type === 'opaque')) { const c = res.clone(); caches.open(CACHE).then(x => x.put(k, c)).catch(() => {}); } return res; };
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => Promise.all(KERN.map(f => c.add(f).catch(() => {}))))); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
// Die Seite schickt die Liste aller Modelle: was noch fehlt, wird im Hintergrund abgelegt
self.addEventListener('message', e => {
  const l = e.data && e.data.ablegen; if (!Array.isArray(l)) return;
  e.waitUntil(caches.open(CACHE).then(async c => { for (const f of l) { const k = new URL(f, STAMM).href; if (!(await c.match(k))) { try { await c.add(k); } catch (x) {} } } }));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin && !/(^|\.)unpkg\.com$|(^|\.)jsdelivr\.net$|^www\.gstatic\.com$/.test(u.host)) return;   // Datenbank und Online-Raum nie
  const k = schluessel(r);
  e.respondWith(fetch(r).then(res => ablegen(k, res)).catch(() => caches.match(k).then(m => m || Response.error())));
});
