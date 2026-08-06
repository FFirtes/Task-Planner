const CACHE_NAME = 'task-planner-v1';
const urlsToCache = [
  '/Task-Planner/',
  '/Task-Planner/index.html',
  '/Task-Planner/style.css',
  '/Task-Planner/script.js'
  // добавьте сюда все важные файлы вашего приложения
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});