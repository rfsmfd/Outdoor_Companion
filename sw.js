/* Outdoor Companion — service worker (offline support).
 *
 * The app was deliberately built WITHOUT a service worker for a long time to avoid the
 * classic trap: a worker that serves a cached HTML shell can strand users on a stale old
 * build after a new one ships. This worker is written specifically to NOT do that:
 *
 *   • The app shell (index.html / navigations) is NETWORK-FIRST — when you have any signal
 *     you always get the freshest build straight off GitHub Pages; the cached copy is used
 *     ONLY when the network fails (i.e. you're truly offline in the field). So there is no
 *     stale-build risk while online.
 *   • Third-party libraries (Leaflet, Firebase, etc.) live at VERSION-LOCKED URLs, so they
 *     can be cached forever safely — a new library version is a new URL, fetched fresh.
 *   • Map tiles are cached two ways: a rolling "runtime" cache of whatever you've panned
 *     over recently, and a "saved" cache that the in-app "Save this area" button fills on
 *     purpose so a property is available with zero signal.
 *   • Firestore, auth, weather (Open-Meteo), and parcel queries are NEVER intercepted —
 *     they always go straight to the network and simply fail gracefully when offline.
 *
 * Bump VERSION on every build so old shell/lib caches are cleared on activate. The tile
 * caches are intentionally NOT version-suffixed — saved offline maps survive app updates.
 */
var VERSION = 'b430';
var SHELL_CACHE = 'oc-shell-' + VERSION;
var LIB_CACHE   = 'oc-lib-' + VERSION;
var TILE_RUNTIME = 'oc-tiles-runtime';   // rolling, auto-filled as you pan (LRU-trimmed)
var TILE_SAVED   = 'oc-tiles-saved';     // filled on purpose by "Save this area", never evicted
var TILE_RUNTIME_MAX = 1500;             // cap the rolling tile cache so it can't grow forever
// A 1×1 transparent PNG, served for tiles that can't be fetched offline (clean blank, not an error).
var BLANK_TILE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Version-locked third-party assets — safe to precache once and serve forever.
var LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdn.jsdelivr.net/npm/leaflet-rotate@0.2.8/dist/leaflet-rotate.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js',
  'https://cdn.jsdelivr.net/npm/d3-array@3',
  'https://cdn.jsdelivr.net/npm/d3-contour@4',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exif-js/2.3.0/exif.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.0/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/suncalc/1.9.0/suncalc.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/esri-leaflet/3.1.0/esri-leaflet.min.js',
  'https://unpkg.com/leaflet-imageoverlay-rotated@0.2.1/Leaflet.ImageOverlay.Rotated.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions-compat.js'
];

// Hosts whose responses are version-locked libraries / fonts → cache-first.
var LIB_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// Map-tile hosts → tile caching strategy.
var TILE_HOSTS = ['server.arcgisonline.com', 'basemap.nationalmap.gov', 'tile.openstreetmap.org', 'tile.opentopomap.org'];

function hostMatches(url, list){
  for (var i = 0; i < list.length; i++){ if (url.hostname.indexOf(list[i]) >= 0) return true; }
  return false;
}

self.addEventListener('install', function(e){
  self.skipWaiting(); // take over as soon as possible; the network-first shell keeps builds fresh
  e.waitUntil(
    caches.open(LIB_CACHE).then(function(cache){
      // Precache each lib individually and tolerate any single failure — one 404 must not
      // abort the whole install (which cache.addAll would do). Use CORS (every CDN here sends
      // Access-Control-Allow-Origin: *) so responses are TYPED — an opaque no-cors response
      // gets refused by strict MIME checking when re-served to a <script>. Only cache OK
      // responses, so a dead URL is never cached as a 404 HTML page.
      return Promise.all(LIBS.map(function(u){
        return fetch(new Request(u, { mode: 'cors', credentials: 'omit' }))
          .then(function(r){ if (r && r.ok) return cache.put(u, r); })
          .catch(function(){});
      }));
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        // Drop old versioned shell/lib caches; keep the tile caches across updates.
        if ((k.indexOf('oc-shell-') === 0 && k !== SHELL_CACHE) ||
            (k.indexOf('oc-lib-') === 0 && k !== LIB_CACHE)){ return caches.delete(k); }
        return null;
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Fetch a tile with a few immediate retries — smooths over transient connection resets that
// happen when many tiles are requested at once (the retry lands after the burst clears).
function fetchTileWithRetry(req, tries){
  return fetch(req).then(function(res){
    // A network-level failure can resolve as an "error" type response rather than rejecting;
    // treat that as a retryable failure too.
    if (res && res.type === 'error' && tries > 1) return fetchTileWithRetry(req, tries - 1);
    return res;
  }).catch(function(err){
    if (tries > 1) return fetchTileWithRetry(req, tries - 1);
    throw err;
  });
}

// Trim a cache to a max number of entries (oldest first — cache.keys() is insertion order).
function trimCache(name, max){
  caches.open(name).then(function(cache){
    cache.keys().then(function(keys){
      if (keys.length <= max) return;
      for (var i = 0; i < keys.length - max; i++){ cache.delete(keys[i]); }
    });
  });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;               // never touch writes (Firestore, storage, etc.)
  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 1) App shell / navigations → NETWORK-FIRST. Fresh build when online; cached only when offline.
  var sameOrigin = (url.origin === self.location.origin);
  var looksLikeShell = sameOrigin && (url.pathname === '/' || /\/(index\.html)?$/.test(url.pathname));
  if (req.mode === 'navigate' || looksLikeShell){
    e.respondWith(
      // {cache:'no-store'} makes the network-first shell TRULY network-first: without it the
      // browser's own HTTP cache can hand back a stale index.html (GitHub Pages stamps it with a
      // ~10-min max-age), so users sat on an old build for up to 10 minutes after a deploy even
      // though the SW "fetched" it. Bypassing the HTTP cache guarantees the freshest build online;
      // the cached copy below is still the offline fallback.
      fetch(req, { cache: 'no-store' }).then(function(res){
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){
          if (hit) return hit;
          // Fall back to any cached shell entry (single-page app — any copy will do).
          return caches.open(SHELL_CACHE).then(function(c){
            return c.keys().then(function(keys){ return keys.length ? c.match(keys[0]) : undefined; });
          });
        });
      })
    );
    return;
  }

  // 2) Map tiles → saved cache, then runtime cache, then network (fill runtime + LRU-trim).
  if (hostMatches(url, TILE_HOSTS)){
    e.respondWith(
      caches.open(TILE_SAVED).then(function(saved){
        return saved.match(req).then(function(savedHit){
          if (savedHit) return savedHit;
          return caches.open(TILE_RUNTIME).then(function(runtime){
            return runtime.match(req).then(function(runHit){
              if (runHit) return runHit;
              // Fetch AS-IS (a map <img> tile request is already no-cors), with a couple of retries:
              // a burst of concurrent tile requests to one host can trip transient connection resets,
              // and an immediate retry once the burst clears almost always succeeds — this keeps tiles
              // from flashing blank and keeps net::ERR_FAILED out of the console.
              return fetchTileWithRetry(req, 3).then(function(res){
                runtime.put(req, res.clone());
                trimCache(TILE_RUNTIME, TILE_RUNTIME_MAX);
                return res;
              }).catch(function(){
                // Truly offline / not cached → serve a transparent tile so the map shows a clean blank
                // instead of a hard error. Real 404s never reach here — a 404 resolves as a response,
                // not a rejection, so the existing tileerror toast still fires for "no imagery here".
                return runHit || fetch(BLANK_TILE);
              });
            });
          });
        });
      })
    );
    return;
  }

  // 3) Version-locked libraries / fonts → CACHE-FIRST, keyed by URL string. A cross-origin
  //    <script>/<link> request arrives in no-cors mode (opaque, un-executable), so we fetch a
  //    fresh CORS request to get a TYPED response and cache only OK ones.
  if (hostMatches(url, LIB_HOSTS)){
    e.respondWith(
      caches.match(url.href).then(function(hit){
        if (hit) return hit;
        return fetch(new Request(url.href, { mode: 'cors', credentials: 'omit' })).then(function(res){
          if (res && res.ok){ var copy = res.clone(); caches.open(LIB_CACHE).then(function(c){ c.put(url.href, copy); }); }
          return res;
        }).catch(function(){ return fetch(req); }); // offline or CORS-blocked → default load (may still work from HTTP cache)
      })
    );
    return;
  }

  // 4) Everything else (Firestore, auth, Open-Meteo weather, VGIN parcels) → untouched network.
});
