// push-server/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webPush = require('web-push');

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. Генерация VAPID ключей (выполнить один раз) ---
// Запустите в терминале: npx web-push generate-vapid-keys
// и вставьте полученные ключи в переменные окружения (.env)
// или прямо в код (не рекомендуется для продакшена).

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'ВАШ_ПУБЛИЧНЫЙ_КЛЮЧ';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'ВАШ_ПРИВАТНЫЙ_КЛЮЧ';

webPush.setVapidDetails(
  'mailto:your-email@example.com', // замените на свой email
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// --- 2. Хранилище подписок (в памяти, при перезапуске теряется) ---
// Для продакшена используйте базу данных (например, lowdb, MongoDB).
let subscriptions = [];

// --- 3. Эндпоинты API ---

// 3.1. Сохранение подписки от клиента
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  // Проверяем, нет ли уже такой подписки
  const exists = subscriptions.some(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    subscriptions.push(subscription);
    console.log('Подписка сохранена. Всего подписок:', subscriptions.length);
  }
  res.status(201).json({ message: 'Подписка сохранена' });
});

// 3.2. Отправка уведомления (вызывается из клиента при создании задачи)
app.post('/api/send-notification', async (req, res) => {
  const { title, body, url } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'Не указаны title и body' });
  }

  const payload = JSON.stringify({
    title,
    body,
    url: url || '/'
  });

  // Отправляем всем сохранённым подпискам
  const results = await Promise.allSettled(
    subscriptions.map(sub => webPush.sendNotification(sub, payload))
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`Отправлено ${successful} уведомлений, ошибок: ${failed}`);

  res.json({
    message: `Отправлено ${successful} уведомлений`,
    successful,
    failed
  });
});

// 3.3. Получение публичного ключа (для клиента)
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// 3.4. (Опционально) Просмотр активных подписок (для отладки)
app.get('/api/subscriptions', (req, res) => {
  res.json({ count: subscriptions.length, subscriptions });
});

// --- 4. Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Push-сервер запущен на порту ${PORT}`);
  console.log(`Публичный VAPID ключ: ${VAPID_PUBLIC_KEY}`);
});