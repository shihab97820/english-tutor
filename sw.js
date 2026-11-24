/* sw.js — Service worker
   নিয়ম: "Network first" — ইন্টারনেট থাকলে সবসময় GitHub থেকে নতুন ফাইল আনে,
   তাই কোড আপডেট করলেই ফোনের অ্যাপ নতুন হয়ে যায়। ইন্টারনেট না থাকলে শুধু তখন
   আগের সেভ করা কপি চালায়। কোড বদলালে নিচের VERSION একটু বাড়িয়ে দেওয়া ভালো। */
const VERSION = 'v1.4.0';
const CACHE = 'english-tutor-' + VERSION;
const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/storage.js',
  'js/avatar.js',
  'js/speech.js',
  'js/prompts.js',
  'js/ai.js',
  'js/mistakes.js',
  'js/tutor.js',
  'js/practice.js',
  'js/roleplay.js',
  'js/settings.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('english-tutor-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // AI API-র অনুরোধে হাত দিই না

  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(hit =>
          hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())
        )
      )
  );
});
