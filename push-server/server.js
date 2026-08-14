// server.js — push-сервер с исправленным планированием напоминаний
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webPush = require('web-push');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');

const app = express();
app.use(cors());
app.use(express.json());

// --- VAPID ключи ---
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('❌ VAPID ключи не заданы в переменных окружения!');
  process.exit(1);
}

webPush.setVapidDetails(
  'mailto:ffirtes2718@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// --- Хранилище подписок (файл) ---
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

function loadSubscriptions() {
  try {
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveSubscriptions(subscriptions) {
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
}

let subscriptions = loadSubscriptions();

// --- Функция отправки Push-уведомлений ---
async function sendPushNotification(title, body, url, deviceId) {
  const payload = JSON.stringify({ title, body, url: url || '/' });

  let targetSubscriptions = subscriptions;
  if (deviceId) {
    const found = subscriptions.find(s => s.deviceId === deviceId);
    if (!found) {
      console.log(`⚠️ [Push] Устройство ${deviceId} не найдено. Всего подписок: ${subscriptions.length}`);
      return { successful: 0, failed: 0 };
    }
    targetSubscriptions = [found];
  }

  if (targetSubscriptions.length === 0) {
    console.log('ℹ️ [Push] Нет активных подписок для отправки.');
    return { successful: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    targetSubscriptions.map(item =>
      webPush.sendNotification(item.subscription, payload).catch(err => {
        if (err.statusCode === 410) {
          subscriptions = subscriptions.filter(s => s.deviceId !== item.deviceId);
          saveSubscriptions(subscriptions);
          console.log(`🗑️ [Push] Удалена недействительная подписка для ${item.deviceId}`);
        }
        throw err;
      })
    )
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`📤 [Push] Отправка завершена: ${successful} успешно, ${failed} ошибок.`);
  return { successful, failed };
}

// --- API Эндпоинты ---

// Пинг-эндпоинт для UptimeRobot
app.get('/api/ping', (req, res) => {
  res.json({ status: 'active', timestamp: new Date().toISOString() });
});

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/subscribe', (req, res) => {
  const { subscription, deviceId } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId обязателен' });
  }
  subscriptions = subscriptions.filter(s => s.deviceId !== deviceId);
  subscriptions.push({ deviceId, subscription });
  saveSubscriptions(subscriptions);
  console.log(`✅ [Subscribe] Подписка для ${deviceId} сохранена. Всего: ${subscriptions.length}`);
  res.status(201).json({ message: 'Подписка сохранена' });
});

app.post('/api/send-notification', async (req, res) => {
  const { title, body, url, deviceId } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Не указаны title и body' });
  }
  const result = await sendPushNotification(title, body, url || '/', deviceId);
  res.json({
    message: `Отправлено ${result.successful} уведомлений`,
    successful: result.successful,
    failed: result.failed
  });
});

// ======== ИСПРАВЛЕННЫЙ ЭНДПОИНТ ПЛАНИРОВАНИЯ ========
app.post('/api/schedule', async (req, res) => {
  try {
    const {
      taskId,
      text,
      startDateTime,
      reminderTime,
      reminderOffset,
      groupName,
      groupColor,
      url,
      deviceId,
      timeZone
    } = req.body;

    console.log('📥 [Server] Запрос на планирование:', req.body);

    if (!reminderTime) {
      return res.status(400).json({ error: 'Не передано время напоминания (reminderTime)' });
    }

    const scheduleDate = new Date(reminderTime);
    if (isNaN(scheduleDate.getTime())) {
      return res.status(400).json({ error: 'Некорректный формат даты reminderTime' });
    }

    // Отменяем старый таймер, если он существует
    if (schedule.scheduledJobs[taskId]) {
      schedule.scheduledJobs[taskId].cancel();
      console.log(`🔄 [Server] Отменён старый таймер для задачи ${taskId}`);
    }

    // Формируем сообщение заранее
    const title = `Напоминание: ${text}`;
    let timeStr = '';
    try {
      timeStr = new Date(startDateTime).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timeZone || 'UTC'
      });
    } catch (e) {
      timeStr = new Date(startDateTime).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    const body = `Группа: ${groupName || 'Без группы'} | Начало: ${timeStr}`;

    // Планируем задачу
    schedule.scheduleJob(taskId, scheduleDate, async function() {
      console.log(`⏰ [Push] Сработало напоминание для задачи: ${text}`);
      // ВАЖНО: вызываем реальную функцию отправки
      const result = await sendPushNotification(title, body, url || '/', deviceId);
      console.log(`📤 [Push] Результат отправки напоминания:`, result);
    });

    console.log(`✅ [Server] Напоминание запланировано на: ${scheduleDate.toLocaleString()}`);
    res.json({ status: 'success', scheduledFor: scheduleDate, message: 'Напоминание запланировано' });

  } catch (error) {
    console.error('❌ [Server] Ошибка в /api/schedule:', error);
    res.status(500).json({ error: error.message || 'Внутренняя ошибка сервера' });
  }
});

// Дополнительные эндпоинты для отладки
app.get('/api/subscriptions', (req, res) => {
  res.json({ count: subscriptions.length, subscriptions });
});

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Push-сервер запущен на порту ${PORT}`);
  console.log(`🔑 Публичный ключ: ${VAPID_PUBLIC_KEY}`);
});
