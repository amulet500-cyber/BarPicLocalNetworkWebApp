const CACHE_NAME = 'shop-v1'; // ตั้งชื่อนี้ไว้เลยครับ ไม่ต้องคอยเปลี่ยนเลขแล้ว
const ASSETS = [
  './',
  './index.html',
  'https://unpkg.com/dexie/dist/dexie.js',
  'https://unpkg.com/html5-qrcode'
];

// 1. ติดตั้ง Service Worker และดึงไฟล์จำเป็นเข้า Cache
self.addEventListener('install', (e) => {
  self.skipWaiting(); // บังคับให้เบราว์เซอร์สลับมาใช้ SW ตัวใหม่ทันที ไม่ต้องรอดึงเชง
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
    }).then(() => self.clients.claim()) // เข้าควบคุมหน้าเว็บทันที
  );
});

// 3. จัดการการดึงข้อมูล (พระเอกของเราอยู่ตรงนี้ครับ)
self.addEventListener('fetch', (e) => {
  
  // กรณีที่ 1: ถ้าเป็นการโหลดหน้าเว็บ (index.html) 
  // ให้ใช้สูตร "Network-First" (ดึงจากเน็ตก่อน ถ้าเน็ตหลุดค่อยเอาจาก Cache)
  if (e.request.mode === 'navigate' || e.request.url.includes('index.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // กรณีที่ 2: ถ้าเป็นไฟล์อื่นๆ เช่น ไลบรารีบาร์โค้ด หรือ Dexie.js
  // ให้ใช้สูตร "Cache-First" (ดึงจากเครื่องก่อนเพื่อความรวดเร็วและประหยัดเน็ต)
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});