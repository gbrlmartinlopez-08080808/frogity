import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
  );
const files = walk('dist')
  .filter(
    (f) =>
      /\.(js|css|woff2?|ttf)$/.test(f) &&
      !f.includes('/ocr/') &&
      !f.includes('/pdfjs/'),
  )
  .map((f) => `./${f.slice(5)}`);
files.push('./index.html', './icon-512.png');
const version = createHash('sha256')
  .update(files.join('') + readFileSync('dist/index.html'))
  .digest('hex')
  .slice(0, 16);
writeFileSync(
  'dist/sw.js',
  `const CACHE='frogity-${version}';
self.addEventListener('message',e=>{if(e.data==='activate')self.skipWaiting();});
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(${JSON.stringify(files)}))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('frogity-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{ const u=new URL(e.request.url); if(u.origin!==location.origin || e.request.method!=='GET')return;
e.respondWith(e.request.mode==='navigate' ? fetch(e.request).catch(()=>caches.match('./index.html')) : caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{ if(r.ok&&!e.request.headers.has('range')){const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}))); });`,
);
