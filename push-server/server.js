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
async function sendPushNotification(title, body, url) {
  const payload = JSON.stringify({ title, body, url: url || '/' });

  if (subscriptions.length === 0) {
    console.log('ℹ️ Нет подписок для отправки');
    return { successful: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webPush.sendNotification(sub, payload).catch(err => {
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
  return { successful, failed };
}

// --- Планирование напоминания ---
function scheduleReminder(reminder) {
  const remindAt = new Date(reminder.remindAt);
  // Если время уже прошло, не планируем
  if (remindAt <= new Date()) {
    console.log(`⏳ Время напоминания для задачи "${reminder.text}" уже прошло, пропускаем.`);
    return;
  }

  const job = schedule.scheduleJob(reminder.id, remindAt, function() {
    console.log(`⏰ Отправка напоминания для задачи: ${reminder.text}`);
    const title = `⏰ Напоминание: ${reminder.text}`;
    const timeStr = new Date(reminder.startDateTime).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const body = `Группа: ${reminder.groupName} | Начало: ${timeStr}`;
    sendPushNotification(title, body, reminder.url);

    // Удаляем напоминание после отправки
    reminders = reminders.filter(r => r.id !== reminder.id);
    saveReminders();
  });

  console.log(`📅 Напоминание для "${reminder.text}" запланировано на ${remindAt.toLocaleString('ru-RU')}`);
}

// --- Восстановление напоминаний при запуске ---
function restoreReminders() {
  loadReminders();
  console.log(`🔔 Восстановлено ${reminders.length} напоминаний.`);
  reminders.forEach(rem => {
    // Проверяем, не истекло ли время
    if (new Date(rem.remindAt) > new Date()) {
      scheduleReminder(rem);
    } else {
      console.log(`⏳ Пропускаем просроченное напоминание для "${rem.text}"`);
    }
  });
}

// --- API ---

// Получить публичный ключ
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Сохранить подписку
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  subscriptions = subscriptions.filter(s => s.endpoint !== subscription.endpoint);
  subscriptions.push(subscription);
  saveSubscriptions(subscriptions);
  console.log(`✅ Подписка сохранена. Всего: ${subscriptions.length}`);
  res.status(201).json({ message: 'Подписка сохранена' });
});

// Отправить немедленное уведомление (при создании задачи)
app.post('/api/send-notification', async (req, res) => {
  const { title, body, url } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Не указаны title и body' });
  }
  const result = await sendPushNotification(title, body, url || '/');
  res.json({
    message: `Отправлено ${result.successful} уведомлений`,
    successful: result.successful,
    failed: result.failed
  });
});

// Запланировать напоминание
app.post('/api/schedule', (req, res) => {
  const { taskId, text, startDateTime, groupName, groupColor, url } = req.body;

  // Валидация
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

  // Создаём объект напоминания
  const reminder = {
    id: taskId,
    text: text,
    startDateTime: start.toISOString(),
    remindAt: remindAt.toISOString(),
    groupName: groupName || 'Без группы',
    groupColor: groupColor || '#6b7280',
    url: url || '/'
  };

  // Сохраняем и планируем
  reminders.push(reminder);
  saveReminders();
  scheduleReminder(reminder);

  res.json({
    message: 'Напоминание запланировано',
    reminder: reminder
  });
});

// (Опционально) Просмотр подписок
app.get('/api/subscriptions', (req, res) => {
  res.json({ count: subscriptions.length, subscriptions });
});

// (Опционально) Просмотр запланированных напоминаний
app.get('/api/reminders', (req, res) => {
  res.json({ count: reminders.length, reminders });
});

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Push-сервер запущен на порту ${PORT}`);
  console.log(`🔑 Публичный ключ: ${VAPID_PUBLIC_KEY}`);
  // Восстанавливаем напоминания после старта
  restoreReminders();
});
