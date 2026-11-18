/* FrescoKart app service worker: opens the app with no signal, keeps photos on the phone, never stores orders.
   App code is fetched from the network first, so a new version shows on the next open. Change VERSION to clear old caches. */
var VERSION = "fk-app-1";
var SHELL = ["/app/", "/app/app.css", "/app/app.js", "/app/menu.js", "/app/manifest.webmanifest", "/app/icon-192.png", "/img/symbol-colour.svg"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(req, fallback) {
  return fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(fallback || req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(fallback || req).then(function (hit) { return hit || Response.error(); });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;  // fonts and WhatsApp go straight to the network
  if (url.pathname.indexOf("/api/") === 0 || url.pathname.indexOf("/admin") === 0) return;  // orders and status are always live
  if (req.mode === "navigate") { e.respondWith(networkFirst(req, "/app/")); return; }
  if (url.pathname.indexOf("/img/") === 0) { e.respondWith(cacheFirst(req)); return; }
  if (url.pathname.indexOf("/app/") === 0) { e.respondWith(networkFirst(req)); return; }
});
