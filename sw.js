const CACHE_NAME = 'shop-v1'; 
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  'https://unpkg.com/dexie/dist/dexie.js',
  'https://unpkg.com/html5-qrcode',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js'
];

// 1. ติดตั้ง Service Worker และดึงไฟล์จำเป็นเข้า Cache
self.addEventListener('install', (e) => {
  self.skipWaiting(); 
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 2. เคลียร์ของเก่า และเข้าควบคุมหน้าเว็บ
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim()) 
  );
});

// 3. จัดการการดึงข้อมูล
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate' || e.request.url.includes('index.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});