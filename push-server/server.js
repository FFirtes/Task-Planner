require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webPush = require('web-push');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors()); // разрешаем запросы с любых доменов
app.use(express.json());

// --- Чтение VAPID ключей из переменных окружения ---
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('❌ VAPID ключи не заданы в переменных окружения!');
  process.exit(1);
}

webPush.setVapidDetails(
  'mailto:ffirtes2718@gmail.com', // замените на свой email
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// --- Хранилище подписок (файл на диске) ---
// Render даёт доступ к файловой системе, но файл может сброситься при перезапуске.
// Для продакшена лучше использовать базу данных, но для начала подойдёт и файл.
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

function loadSubscriptions() {
  try {
    const data = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveSubscriptions(subscriptions) {
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
}

let subscriptions = loadSubscriptions();

// --- API ---

// Получить публичный ключ (для клиента)
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Сохранить подписку
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  // Удаляем дубликаты
  subscriptions = subscriptions.filter(s => s.endpoint !== subscription.endpoint);
  subscriptions.push(subscription);
  saveSubscriptions(subscriptions);
  console.log(`✅ Подписка сохранена. Всего: ${subscriptions.length}`);
  res.status(201).json({ message: 'Подписка сохранена' });
});

// Отправить уведомление
app.post('/api/send-notification', async (req, res) => {
  const { title, body, url } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Не указаны title и body' });
  }

  const payload = JSON.stringify({ title, body, url: url || '/' });

  if (subscriptions.length === 0) {
    return res.json({ message: 'Нет подписок', successful: 0, failed: 0 });
  }

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webPush.sendNotification(sub, payload).catch(err => {
        // Если подписка недействительна (410 Gone), удаляем её
        if (err.statusCode === 410) {
          subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
          saveSubscriptions(subscriptions);
          console.log('🗑️ Удалена недействительная подписка');
        }
        throw err;
      })
    )
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`📤 Отправлено: ${successful} успешно, ${failed} ошибок`);

  res.json({
    message: `Отправлено ${successful} уведомлений`,
    successful,
    failed
  });
});

// (Опционально) Просмотр подписок для отладки
app.get('/api/subscriptions', (req, res) => {
  res.json({ count: subscriptions.length, subscriptions });
});

// --- Запуск ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Push-сервер запущен на порту ${PORT}`);
  console.log(`🔑 Публичный ключ: ${VAPID_PUBLIC_KEY}`);
});
