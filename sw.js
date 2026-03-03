const CACHE_NAME = "elpadrino-cache-v4";
const urlsToCache = [
  "/ELJuegoDelPadrino/",
  "/ELJuegoDelPadrino/index.html",
  "/ELJuegoDelPadrino/manifest.json",
  "/ELJuegoDelPadrino/auth/login.html",
  "/ELJuegoDelPadrino/auth/register.html",
  "/ELJuegoDelPadrino/public/admin/index.html",
  "/ELJuegoDelPadrino/public/trabajador/index.html",
  "/ELJuegoDelPadrino/public/usuario/index.html",
  "/ELJuegoDelPadrino/public/usuario/recover/index.html",
  // JS
  "/ELJuegoDelPadrino/assets/js/admin.js",
  "/ELJuegoDelPadrino/assets/js/cloudinary.js",
  "/ELJuegoDelPadrino/assets/js/logica_juego.js",
  "/ELJuegoDelPadrino/assets/js/pagos.js",
  "/ELJuegoDelPadrino/assets/js/perfil.js",
  "/ELJuegoDelPadrino/assets/js/supabase.js",
  "/ELJuegoDelPadrino/assets/js/trabajador.js",
  "/ELJuegoDelPadrino/assets/js/usuario.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
