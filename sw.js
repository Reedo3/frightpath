/* sw.js — offline-first service worker for FrightPath.
 * Parks have bad signal: cache every local asset on install, serve cache-first.
 * No external requests exist at runtime, so the whole app works offline.
 */
'use strict';

const CACHE = 'frightpath-v1';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'optimizer.js',
  'manifest.json',
  'parks/hhn35.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
