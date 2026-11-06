// Service Worker для Axis
const CACHE_NAME = "tehnadzor-dev";
const OFFLINE_URL = "index.html";
const MANIFEST_URL = "manifest.json";
const BYPASS_CACHE_EXTENSIONS = [".css", ".js", ".html"];
const STATIC_PAGES = [
  "",
  "index.html",
  "404.html",
  "about.html",
  "login.html",
  "privacy.html",
  "profile.html",
  "register.html"
];
const STATIC_ASSETS = [
  "dist/app.js",
  "dist/app/ui/theme.js",
  "dist/shared/i18n/index.js",
  "dist/infrastructure/api/client.js",
  "dist/app/pdf/pdf-font.js",
  "dist/app/ui/datepicker.js",
  "dist/app/ui/system-ui.js",
  "dist/app/ui/lazy-libs.js",
  "dist/app/modules/geometry.js",
  "dist/app/modules/reinforcement.js",
  "dist/app/modules/strength.js",
  "dist/app/modules/summary.js",
  "dist/app/modules/knowledge.js",
  "dist/app/modules/journal.js",
  "dist/app/services/ifc-import-worker.js",
  "dist/app/vendor/ifc-model.bundle.js",
  "dist/app/vendor/web-ifc.wasm",
  "dist/auth.js",
  "dist/config.js",
  "dist/utils.js",
  "dist/firebase.js",
  "dist/app/modules/reinforcement/data.js",
  "dist/app/modules/geometry/data.js",
  "dist/app/modules/journal/data.js",
  "dist/app/modules/summary/data.js",
  "dist/modules/summary/analytics-block.css",
  "dist/modules/summary/analytics-block.html",
  "fonts/Roboto-Regular.ttf",
  "favicon.ico",
  "icons/favicon-32.png",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

function normalizeAssetPath(asset: string | null | undefined) {
  const normalized = String(asset || "").trim();
  if (!normalized) return null;
  if (
    normalized.startsWith("data:") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("tel:") ||
    normalized.startsWith("#")
  ) {
    return null;
  }

  try {
    const scopeUrl = new URL(self.registration.scope);
    const url = new URL(normalized, scopeUrl);
    if (url.origin !== self.location.origin) return null;
    if (!url.pathname.startsWith(scopeUrl.pathname)) return null;

    const scopedPath = url.pathname.slice(scopeUrl.pathname.length);
    return `${scopedPath}${url.search}`;
  } catch (error) {
    console.warn("[SW] Некорректный путь ресурса:", normalized, error);
    return null;
  }
}

function uniqueAssets(assets: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      assets
        .map((asset) => normalizeAssetPath(asset))
        .filter((asset): asset is string => !!asset)
    )
  );
}

function extractAssetPathsFromHtml(html: string) {
  const assetMatches = Array.from(
    html.matchAll(/<(?:link|script)\b[^>]+(?:href|src)=["']([^"'#]+)["']/gi)
  );
  return assetMatches.map((match) => match[1] || "");
}

async function fetchTextAsset(assetPath: string) {
  const response = await fetch(new URL(assetPath, self.registration.scope).toString(), {
    cache: "reload"
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${assetPath}`);
  }
  return response.text();
}

async function discoverInstallAssets() {
  const discoveredAssets: string[] = [];

  try {
    const html = await fetchTextAsset(OFFLINE_URL);
    discoveredAssets.push(...extractAssetPathsFromHtml(html));
  } catch (error) {
    console.warn("[SW] Не удалось разобрать index.html для precache:", error);
  }

  try {
    const manifestText = await fetchTextAsset(MANIFEST_URL);
    const manifest = JSON.parse(manifestText) as {
      icons?: Array<{ src?: string }>;
      shortcuts?: Array<{ url?: string; icons?: Array<{ src?: string }> }>;
    };
    discoveredAssets.push(
      ...(manifest.icons || []).map((icon) => icon.src || ""),
      ...(manifest.shortcuts || []).flatMap((shortcut) => [
        shortcut.url || "",
        ...((shortcut.icons || []).map((icon) => icon.src || ""))
      ])
    );
  } catch (error) {
    console.warn("[SW] Не удалось разобрать manifest.json для precache:", error);
  }

  return uniqueAssets([...STATIC_PAGES, MANIFEST_URL, ...STATIC_ASSETS, ...discoveredAssets]);
}

// Установка Service Worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log("[SW] Кеширование статических ресурсов");

      const installAssets = await discoverInstallAssets();
      const urls = installAssets.map((asset) =>
        new URL(asset, self.registration.scope).toString()
      );

      const results = await Promise.allSettled(
        urls.map(async (url) => {
          const response = await fetch(url, { cache: 'reload' });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
          }
          await cache.put(url, response);
        })
      );

      results.forEach((result, idx) => {
        if (result.status === "rejected") {
          console.warn("[SW] Не удалось закешировать:", urls[idx], result.reason);
        }
      });
      await self.skipWaiting();
    })()
  );
});

// Активация - очистка старых кешей
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames
        .filter(name => name.startsWith("tehnadzor-") && name !== CACHE_NAME)
        .map(name => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

// Стратегия: Network First, fallback to Cache
self.addEventListener("fetch", (event) => {
  // Пропускаем не-GET запросы
  if (event.request.method !== "GET") return;
  
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  const path = url.pathname.slice(scope.pathname.length);
  // Firebase Hosting auth handlers and private API traffic bypass the cache.
  if (path.startsWith("__/") || url.pathname.includes("/documents/") ||
      event.request.headers.has("Authorization")) return;

  const shouldBypassCache = event.request.mode === "navigate" ||
    BYPASS_CACHE_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
  const request = shouldBypassCache
    ? new Request(event.request, { cache: "no-store" })
    : event.request;

  const networkResponse = fetch(request);
  event.waitUntil(networkResponse.then(async response => {
    if (response.status === 200 && response.type === "basic" &&
        !/private|no-store/i.test(response.headers.get("Cache-Control") || "")) {
      const copy = response.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, copy);
    }
  }, () => {}).catch(error => {
    console.warn("[SW] Could not cache resource:", url.pathname, error);
  }));
  event.respondWith(networkResponse.catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    if (cachedResponse) return cachedResponse;
    if (event.request.mode === "navigate") {
      const offlineResponse = await cache.match(new URL(OFFLINE_URL, scope).toString());
      if (offlineResponse) return offlineResponse;
    }
    return new Response("Offline", { status: 503 });
  }));
});

// Уведомления о новой версии
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});

