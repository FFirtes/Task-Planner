require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webPush = require('web-push');
const fs = require('fs');
const path = require('path');

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
  'mailto:ffirtes2718@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// --- Хранилище подписок и напоминаний (файлы) ---
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

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
let reminders = [];

function loadReminders() {
  try {
    reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
  } catch (e) {
    reminders = [];
  }
}

function saveReminders() {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

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

// --- Обработка и проверка накопившихся напоминаний ---
async function processPendingReminders() {
  const now = new Date();
  const remainingReminders = [];

  for (const rem of reminders) {
    const remindAt = new Date(rem.remindAt);

    // Если время напоминания наступило или уже прошло
    if (remindAt <= now) {
      const diffMinutes = Math.floor((now - remindAt) / (1000 * 60));

      // Допускаем отправку с задержкой до 24 часов (на случай перезапуска или сна)
      if (diffMinutes <= 24 * 60) {
        console.log(`⏰ [Trigger] Срабатывание для "${rem.text}" (запланировано: ${rem.remindAt}, задержка: ${diffMinutes} мин)`);

        let timeStr = '';
        try {
          timeStr = new Date(rem.startDateTime).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: rem.timeZone || 'UTC'
          });
        } catch (e) {
          timeStr = new Date(rem.startDateTime).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
          });
        }

        const title = `Напоминание: ${rem.text}`;
        const body = `Группа: ${rem.groupName} | Начало: ${timeStr}`;

        await sendPushNotification(title, body, rem.url, rem.deviceId);
      } else {
        console.log(`⏳ [Skip] Напоминание для "${rem.text}" просрочено более чем на 24ч, пропускаем.`);
      }
    } else {
      // Время ещё не наступило — сохраняем в очереди
      remainingReminders.push(rem);
    }
  }

  if (reminders.length !== remainingReminders.length) {
    reminders = remainingReminders;
    saveReminders();
  }
}

// Запуск фоновой проверки каждые 30 секунд
setInterval(() => {
  processPendingReminders();
}, 30 * 1000);

// --- API Эндпоинты ---

// Пинг-эндпоинт для внешних сервисов удержания активности
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

const schedule = require('node-schedule'); // Убедитесь, что библиотека установлена (npm i node-schedule)

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
            deviceId 
        } = req.body;

        console.log('📥 [Server] Запрос на планирование:', req.body);

        if (!reminderTime) {
            return res.status(400).json({ error: 'Не передано время напоминания (reminderTime)' });
        }

        const scheduleDate = new Date(reminderTime);

        if (isNaN(scheduleDate.getTime())) {
            return res.status(400).json({ error: 'Некорректный формат даты reminderTime' });
        }

        // Если задача с таким ID уже была запланирована ранее — отменяем старый таймер
        if (schedule.scheduledJobs[taskId]) {
            schedule.scheduledJobs[taskId].cancel();
        }

        // Планируем отправку
        schedule.scheduleJob(taskId, scheduleDate, async function() {
            console.log(`⏰ [Push] Сработало напоминание для задачи: ${text}`);
            
            // ВАЖНО: Вызовите вашу существующую функцию отправки Push
            // Убедитесь, что название функции совпадает с той, что уже есть у вас в server.js!
            /* 
            if (typeof sendNotification === 'function') {
                await sendNotification(deviceId, {
                    title: `⏰ Напоминание: ${groupName || 'Задача'}`,
                    body: text,
                    url: url
                });
            } 
            */
        });

        console.log(`✅ [Server] Напоминание запланировано на: ${scheduleDate.toLocaleString()}`);
        return res.json({ status: 'success', scheduledFor: scheduleDate });

    } catch (error) {
        console.error('❌ [Server] Ошибка в /api/schedule:', error);
        // Возвращаем JSON с ошибкой вместо падения в HTML
        return res.status(500).json({ error: error.message || 'Внутренняя ошибка сервера' });
    }
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
  loadReminders();
  processPendingReminders(); // Немедленная проверка пропущенных задач при запуске
});
