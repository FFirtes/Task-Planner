// push-server/server.js
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

// --- Чтение VAPID ключей ---
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

// --- Хранилище подписок (файл) ---
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

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

// --- Хранилище напоминаний ---
let reminders = [];

function loadReminders() {
  try {
    const data = fs.readFileSync(REMINDERS_FILE, 'utf8');
    reminders = JSON.parse(data);
  } catch (e) {
    reminders = [];
  }
}

function saveReminders() {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

// --- Вспомогательная функция отправки уведомлений ---
async function sendPushNotification(title, body, url, deviceId) {
  const payload = JSON.stringify({ title, body, url: url || '/' });

  let targetSubscriptions = subscriptions;
  if (deviceId) {
    const found = subscriptions.find(s => s.deviceId === deviceId);
    if (!found) {
      console.log(`⚠️ Устройство ${deviceId} не найдено. Всего подписок: ${subscriptions.length}`);
      return { successful: 0, failed: 0 };
    }
    targetSubscriptions = [found];
  }

  if (targetSubscriptions.length === 0) {
    console.log('ℹ️ Нет подписок для отправки');
    return { successful: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    targetSubscriptions.map(item =>
      webPush.sendNotification(item.subscription, payload).catch(err => {
        // Если подписка недействительна (410 Gone), удаляем её
        if (err.statusCode === 410) {
          subscriptions = subscriptions.filter(s => s.deviceId !== item.deviceId);
          saveSubscriptions(subscriptions);
          console.log(`🗑️ Удалена недействительная подписка для ${item.deviceId}`);
        }
        throw err;
      })
    )
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`📤 Отправлено: ${successful} успешно, ${failed} ошибок`);
  return { successful, failed };
}

// --- Планирование напоминания ---
function scheduleReminder(reminder) {
  const remindAt = new Date(reminder.remindAt);
  if (remindAt <= new Date()) {
    console.log(`⏳ Время напоминания для задачи "${reminder.text}" уже прошло, пропускаем.`);
    return;
  }

  const job = schedule.scheduleJob(reminder.id, remindAt, function() {
    console.log(`⏰ Напоминание для "${reminder.text}" сработало в ${new Date().toISOString()}`);
    console.log(`⏰ Отправка напоминания для задачи: ${reminder.text}`);
    const title = `⏰ Напоминание: ${reminder.text}`;
    const timeStr = new Date(reminder.startDateTime).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const body = `Группа: ${reminder.groupName} | Начало: ${timeStr}`;
    sendPushNotification(title, body, reminder.url, reminder.deviceId);

    // Удаляем напоминание после отправки
    reminders = reminders.filter(r => r.id !== reminder.id);
    saveReminders();
  });

  console.log(`📅 Напоминание для "${reminder.text}" (устройство ${reminder.deviceId}) запланировано на ${remindAt.toLocaleString('ru-RU')}`);
}

// --- Восстановление напоминаний при запуске ---
function restoreReminders() {
  loadReminders();
  console.log(`🔔 Восстановлено ${reminders.length} напоминаний.`);
  reminders.forEach(rem => {
    if (new Date(rem.remindAt) > new Date()) {
      scheduleReminder(rem);
    } else {
      console.log(`⏳ Пропускаем просроченное напоминание для "${rem.text}"`);
    }
  });
}

// --- API ---

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/subscribe', (req, res) => {
  const { subscription, deviceId } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId обязателен' });
  }
  // Удаляем старую подписку для этого deviceId
  subscriptions = subscriptions.filter(s => s.deviceId !== deviceId);
  subscriptions.push({ deviceId, subscription });
  saveSubscriptions(subscriptions);
  console.log(`✅ Подписка для ${deviceId} сохранена. Всего: ${subscriptions.length}`);
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

app.post('/api/schedule', (req, res) => {
  const { taskId, text, startDateTime, groupName, groupColor, url, deviceId } = req.body;

  if (!taskId || !text || !startDateTime) {
    return res.status(400).json({ error: 'Не указаны taskId, text или startDateTime' });
  }

  const start = new Date(startDateTime);
  if (isNaN(start.getTime())) {
    return res.status(400).json({ error: 'Неверный формат даты/времени' });
  }

  const now = new Date();
  const remindAt = new Date(start.getTime() - 30 * 60 * 1000); // за 30 минут

  if (remindAt <= now) {
    return res.json({
      message: 'Время начала уже прошло или менее 30 минут, напоминание не запланировано'
    });
  }

  const reminder = {
    id: taskId,
    text: text,
    startDateTime: start.toISOString(),
    remindAt: remindAt.toISOString(),
    groupName: groupName || 'Без группы',
    groupColor: groupColor || '#6b7280',
    url: url || '/',
    deviceId: deviceId || null   // если нет deviceId, отправляем всем (обратная совместимость)
  };

  reminders.push(reminder);
  saveReminders();
  scheduleReminder(reminder);

  res.json({
    message: 'Напоминание запланировано',
    reminder: reminder
  });
});

app.get('/api/subscriptions', (req, res) => {
  res.json({ count: subscriptions.length, subscriptions });
});

app.get('/api/reminders', (req, res) => {
  res.json({ count: reminders.length, reminders });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Push-сервер запущен на порту ${PORT}`);
  console.log(`🔑 Публичный ключ: ${VAPID_PUBLIC_KEY}`);
  restoreReminders();
});
