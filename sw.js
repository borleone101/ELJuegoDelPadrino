const CACHE_NAME = "elpadrino-cache-v2";

const urlsToCache = [

  "./",
  "./index.html",
  "./manifest.json",

  "./auth/login.html",
  "./auth/register.html",

  "./public/admin/index.html",
  "./public/trabajador/index.html",
  "./public/usuario/index.html",
  "./public/usuario/recover/index.html",

  "./assets/js/admin.js",
  "./assets/js/cloudinary.js",
  "./assets/js/logica_juego.js",
  "./assets/js/pagos.js",
  "./assets/js/perfil.js",
  "./assets/js/supabase.js",
  "./assets/js/trabajador.js",
  "./assets/js/usuario.js"

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
