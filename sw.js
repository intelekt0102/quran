/* Қуръон тиловати — service worker (oflayn ishlash)
 *
 * Nimalar keshlanadi:
 *  1) Ilova qobig'i (index.html, .js bazalar, manifest, ikonkalar) — o'rnatilganda darrov.
 *  2) Sahifa rasmlari (jsDelivr) — ko'rilgan sari; oflayn rejimda ko'rilgan sahifalar ochiladi.
 *  3) Shriftlar (Google Fonts) — ko'rilgan sari.
 * Audio (Hugging Face) KESHLANMAYDI: katta fayllar va Range so'rovlari.
 *
 * Yangi versiya chiqarganda CACHE_VERSION ni oshiring (masalan v2).
 */
const CACHE_VERSION = 'v3';
const SHELL_CACHE = `quran-shell-${CACHE_VERSION}`;
const IMAGE_CACHE = 'quran-images-v1';   // rasmlar versiyaga bog'lanmagan: yangilanganda qayta yuklanmasin
const FONT_CACHE = 'quran-fonts-v1';
const MAX_IMAGES = 700;                  // 604 sahifa + ozgina zaxira

const SHELL_FILES = [
  './',
  './index.html',
  './overlays_data.js',
  './translation.js',
  './Alijon_qori_timings.js',
  './Husary_qori_timings.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, IMAGE_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
  }
}

// Keshdan darrov beradi, orqada yangilaydi (HTTP 304 bo'lsa deyarli trafik sarflamaydi)
async function staleWhileRevalidate(request, cacheName, fetchInit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(fetchInit ? new Request(request.url, fetchInit) : request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

// Keshda bo'lsa — keshdan; bo'lmasa tarmoqdan olib saqlaydi
async function cacheFirst(request, cacheName, fetchInit, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(fetchInit ? new Request(request.url, fetchInit) : request);
    if (res && res.ok) {
      await cache.put(request, res.clone());
      if (max) trimCache(cacheName, max);
    }
    return res;
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Audio va Range so'rovlari — brauzerga qoldiramiz
  if (req.headers.has('range') || req.destination === 'audio' || req.destination === 'video') return;
  if (url.hostname === 'huggingface.co' || url.hostname.endsWith('.hf.co')) return;

  // Sahifa rasmlari (jsDelivr). 'cors' rejimi: opaque javob kvotani 7 MB dan "to'ldirib" yubormasligi uchun
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(req, IMAGE_CACHE, { mode: 'cors', credentials: 'omit' }, MAX_IMAGES));
    return;
  }

  // Shriftlar
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE, { mode: 'cors', credentials: 'omit' }));
    return;
  }

  // Ilova qobig'i (o'z domenimiz)
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(
        staleWhileRevalidate(req, SHELL_CACHE).then((res) =>
          res && res.type !== 'error' ? res : caches.match('./index.html')
        )
      );
      return;
    }
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
  }
});
