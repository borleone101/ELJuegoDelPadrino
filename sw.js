const CACHE_NAME = "elpadrino-cache-v1";

const urlsToCache = [

  // PRINCIPAL
  "/ELJuegoDelPadrino/",
  "/ELJuegoDelPadrino/index.html",
  "/ELJuegoDelPadrino/manifest.json",

  // AUTH
  "/ELJuegoDelPadrino/auth/login.html",
  "/ELJuegoDelPadrino/auth/register.html",

  // PUBLIC
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
  "/ELJuegoDelPadrino/assets/js/usuario.js",

  // LOGO
  "https://res.cloudinary.com/daxmlrngo/image/upload/v1772022052/9c927cfe-c983-4252-8945-a70b24c03eb1_rtrp4u.jpg"
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
