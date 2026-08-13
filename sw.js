// sw.js — минимальная версия для push-уведомлений (без кеширования)

self.addEventListener('install', event => {
  // Пропускаем установку и сразу активируемся
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Принимаем контроль над всеми клиентами
  event.waitUntil(clients.claim());
});

// Обработчик push-сообщений
self.addEventListener('push', event => {
  let data = { title: 'Уведомление', body: 'Новое уведомление', url: '/' };
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Уведомление', body: event.data.text() || 'Новое уведомление', url: '/' };
  }

  const options = {
    body: data.body,
    icon: './icons/icon-192x192.png',   // проверьте, что этот файл существует
    badge: './icons/icon-192x192.png',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Обработчик клика по уведомлению
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (let client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});