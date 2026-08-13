if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log('Service Worker зарегистрирован!'))
    .catch(err => console.log('Ошибка регистрации SW:', err));
} else {
  console.log('Service Worker не зарегистрирован');
}

(function() {
    let tasks = [];
    let groups = [];

    // ============================================================
    // УНИКАЛЬНЫЙ ИДЕНТИФИКАТОР УСТРОЙСТВА
    // ============================================================
    function getDeviceId() {
      let deviceId = localStorage.getItem('deviceId');
      if (!deviceId) {
        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('deviceId', deviceId);
      }
      return deviceId;
    }

    // ============================================================
    // PUSH-УВЕДОМЛЕНИЯ
    // ============================================================

    const PUSH_SERVER_URL = 'https://task-planner-7cbp.onrender.com';

    async function getVapidPublicKey() {
        try {
            const response = await fetch(`${PUSH_SERVER_URL}/api/vapid-public-key`);
            const data = await response.json();
            return data.publicKey;
        } catch (error) {
            console.error('Не удалось получить VAPID ключ:', error);
            return null;
        }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function subscribeToPush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.log('Push не поддерживается');
            return;
        }

        if (Notification.permission === 'denied') {
            console.log('Разрешение отклонено');
            return;
        }

        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.log('Разрешение не получено');
                return;
            }
        }

        try {
            const swRegistration = await navigator.serviceWorker.ready;
            let subscription = await swRegistration.pushManager.getSubscription();
            if (subscription) {
                console.log('Уже подписаны');
                return;
            }

            const publicKey = await getVapidPublicKey();
            if (!publicKey) {
                console.error('Не удалось получить публичный ключ');
                return;
            }

            const applicationServerKey = urlBase64ToUint8Array(publicKey);

            subscription = await swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            });

            const deviceId = getDeviceId();
            const response = await fetch(`${PUSH_SERVER_URL}/api/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: subscription,
                    deviceId: deviceId
                })
            });

            if (response.ok) {
                console.log('Подписка сохранена на сервере для устройства', deviceId);
            } else {
                console.error('Ошибка сохранения подписки');
            }
        } catch (error) {
            console.error('Ошибка подписки:', error);
        }
    }

    async function sendTaskNotification(taskTitle, taskDate) {
        try {
            const response = await fetch(`${PUSH_SERVER_URL}/api/send-notification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `📋 Новая задача: ${taskTitle}`,
                    body: `Задача на ${formatDate(taskDate)}. Не забудьте выполнить!`,
                    url: window.location.href,
                    deviceId: getDeviceId()
                })
            });
            const result = await response.json();
            console.log('Уведомление отправлено:', result);
        } catch (error) {
            console.error('Ошибка отправки уведомления:', error);
        }
    }

    async function scheduleReminder(taskId, text, date, startTime, groupName, groupColor) {
        if (!startTime) return;
        try {
            const startDateTime = `${date}T${startTime}:00`;
            const response = await fetch(`${PUSH_SERVER_URL}/api/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: taskId,
                    text: text,
                    startDateTime: startDateTime,
                    groupName: groupName || 'Без группы',
                    groupColor: groupColor || '#6b7280',
                    url: window.location.href,
                    deviceId: getDeviceId()
                })
            });
            const result = await response.json();
            console.log('Напоминание запланировано:', result);
        } catch (error) {
            console.error('Ошибка планирования напоминания:', error);
        }
    }

    // --- Загрузка / сохранение ---
    function loadData() {
        const storedTasks = localStorage.getItem('tasks');
        if (storedTasks) {
            try { tasks = JSON.parse(storedTasks); }
            catch (_) { tasks = []; }
        }
        const storedGroups = localStorage.getItem('groups');
        if (storedGroups) {
            try { groups = JSON.parse(storedGroups); }
            catch (_) { groups = []; }
        }
        if (groups.length === 0) {
            groups = [
                { id: 'g1', name: 'Работа', color: '#3b82f6' },
                { id: 'g2', name: 'Личное', color: '#10b981' },
                { id: 'g3', name: 'Тренировка', color: '#f59e0b' },
            ];
            saveData();
        }

        tasks.forEach(task => {
            if (task.completed !== undefined && task.completedDates === undefined) {
                task.completedDates = task.completed ? [task.date] : [];
                delete task.completed;
            }
            if (task.completedDates === undefined) {
                task.completedDates = [];
            }
            if (task.pinnedDates === undefined) {
                task.pinnedDates = [];
            }
        });
        saveData();
    }

    function saveData() {
        localStorage.setItem('tasks', JSON.stringify(tasks));
        localStorage.setItem('groups', JSON.stringify(groups));
    }

    // --- Вспомогательные функции ---
    function parseLocalDate(dateStr) {
        const parts = dateStr.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function formatLocalDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getToday() {
        return formatLocalDate(new Date());
    }

    function getTomorrow() {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return formatLocalDate(d);
    }

    function getDayName(dateStr) {
        const d = parseLocalDate(dateStr);
        return d.toLocaleDateString('ru-RU', { weekday: 'short' });
    }

    function formatDateWithDay(dateStr) {
        const today = getToday();
        const tomorrow = getTomorrow();
        const dateObj = parseLocalDate(dateStr);
        if (dateStr === today) return `Сегодня, ${getDayName(dateStr)}.`;
        if (dateStr === tomorrow) return `Завтра, ${getDayName(dateStr)}.`;
        return `${dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${getDayName(dateStr)}.`;
    }

    function formatDate(dateStr) {
        const d = parseLocalDate(dateStr);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatDateShort(dateStr) {
        const d = parseLocalDate(dateStr);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    function getWeekDays(refDate) {
        const d = parseLocalDate(refDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d);
        monday.setDate(diff);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const dt = new Date(monday);
            dt.setDate(monday.getDate() + i);
            days.push(formatLocalDate(dt));
        }
        return days;
    }

    function getMonthDays(year, month) {
        const days = [];
        const date = new Date(year, month - 1, 1);
        while (date.getMonth() === month - 1) {
            days.push(formatLocalDate(date));
            date.setDate(date.getDate() + 1);
        }
        return days;
    }

    function getTimeDisplay(task) {
        if (task.startTime && task.endTime) {
            return `${task.startTime} – ${task.endTime}`;
        } else if (task.startTime) {
            return `${task.startTime}`;
        } else {
            return 'На весь день';
        }
    }

    // --- Проверка видимости задачи на дату ---
    function isTaskVisibleOnDate(task, dateStr) {
        if (task.repeatEnd && dateStr > task.repeatEnd) return false;

        if (!task.repeatType || task.repeatType === 'none') {
            return task.date === dateStr;
        }

        if (dateStr < task.date) return false;

        const d = parseLocalDate(dateStr);
        const dayOfWeek = d.getDay();

        if (task.repeatType === 'daily') {
            return true;
        } else if (task.repeatType === 'weekly') {
            if (!task.repeatDays || task.repeatDays.length === 0) return false;
            return task.repeatDays.includes(dayOfWeek);
        }
        return false;
    }

    function getTasksForDate(dateStr) {
        return tasks.filter(task => isTaskVisibleOnDate(task, dateStr));
    }

    function getAllTasks() {
        return tasks;
    }

    // --- Формирование строки повторения ---
    function getRepeatDisplay(task) {
        if (!task.repeatType || task.repeatType === 'none') return null;

        let parts = [];
        const dayNames = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

        if (task.repeatType === 'daily') {
            parts.push('Ежедневно');
        } else if (task.repeatType === 'weekly') {
            if (task.repeatDays && task.repeatDays.length > 0) {
                const sorted = [...task.repeatDays].sort((a, b) => a - b);
                const dayStr = sorted.map(d => dayNames[d]).join(', ');
                parts.push(`Еженедельно: ${dayStr}`);
            } else {
                parts.push('Еженедельно');
            }
        }

        if (task.repeatEnd) {
            parts.push(`до ${formatDateShort(task.repeatEnd)}`);
        }

        return parts.join(' ');
    }

    // --- Функция сортировки задач для списка ---
    function sortTasks(tasks, currentDate) {
        return tasks.slice().sort((a, b) => {
            const aPinned = a.pinnedDates && (a.pinnedDates.includes(currentDate) || a.pinnedDates.includes('all'));
            const bPinned = b.pinnedDates && (b.pinnedDates.includes(currentDate) || b.pinnedDates.includes('all'));
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;

            const aCompleted = a.completedDates && a.completedDates.includes(currentDate);
            const bCompleted = b.completedDates && b.completedDates.includes(currentDate);
            if (!aCompleted && bCompleted) return -1;
            if (aCompleted && !bCompleted) return 1;

            if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
            if (a.startTime) return -1;
            if (b.startTime) return 1;
            return 0;
        });
    }

    // --- Создание элемента задачи ---
    function createTaskElement(task, currentDate, onUpdate, isGlobal) {
        const li = document.createElement('li');
        let isCompleted = false;
        if (task.repeatType === 'none') {
            isCompleted = task.completedDates && task.completedDates.includes(task.date);
        } else {
            isCompleted = task.completedDates && task.completedDates.includes(currentDate);
        }
        li.className = 'task-item' + (isCompleted ? ' completed' : '');
        li.dataset.id = task.id;

        const grp = task.groupId ? groups.find(g => g.id === task.groupId) : null;

        // Метка группы
        const label = document.createElement('div');
        label.className = 'task-group-label';

        const colorSpan = document.createElement('span');
        colorSpan.className = 'group-color';
        colorSpan.style.backgroundColor = task.color || (grp ? grp.color : '#6b7280');
        label.appendChild(colorSpan);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'group-name';
        nameSpan.textContent = grp ? grp.name : 'Без группы';
        label.appendChild(nameSpan);

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'color-picker-input';
        colorInput.value = task.color || (grp ? grp.color : '#6b7280');
        label.appendChild(colorInput);

        label.addEventListener('click', function(e) {
            e.stopPropagation();
            colorInput.click();
        });

        colorInput.addEventListener('input', function() {
            task.color = this.value;
            colorSpan.style.backgroundColor = this.value;
            saveData();
        });

        // Время и повторение
        const timeWrapper = document.createElement('div');
        timeWrapper.className = 'task-time-wrapper';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'task-time';
        timeSpan.textContent = getTimeDisplay(task);

        const startInput = document.createElement('input');
        startInput.type = 'time';
        startInput.className = 'edit-time-input';
        startInput.value = task.startTime || '';

        const endInput = document.createElement('input');
        endInput.type = 'time';
        endInput.className = 'edit-time-input';
        endInput.value = task.endTime || '';

        const separator = document.createElement('span');
        separator.className = 'edit-time-separator';
        separator.textContent = ' – ';

        const repeatInfo = document.createElement('span');
        repeatInfo.className = 'task-repeat-info';
        const repeatText = getRepeatDisplay(task);
        if (repeatText) {
            repeatInfo.textContent = repeatText;
        } else {
            repeatInfo.style.display = 'none';
        }

        timeWrapper.appendChild(timeSpan);
        timeWrapper.appendChild(startInput);
        timeWrapper.appendChild(separator);
        timeWrapper.appendChild(endInput);
        timeWrapper.appendChild(repeatInfo);

        // Кнопки действий (звёздочка, карандаш, крестик)
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'task-actions';

        const pinBtn = document.createElement('button');
        pinBtn.className = 'pin-btn';
        const isPinned = task.pinnedDates && (task.pinnedDates.includes(currentDate) || task.pinnedDates.includes('all'));
        pinBtn.textContent = isPinned ? '★' : '☆';
        pinBtn.setAttribute('aria-label', 'Закрепить задачу');
        pinBtn.title = isPinned ? 'Открепить' : 'Закрепить';
        pinBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!task.pinnedDates) task.pinnedDates = [];

            if (isGlobal) {
                const idx = task.pinnedDates.indexOf('all');
                if (idx !== -1) {
                    task.pinnedDates.splice(idx, 1);
                } else {
                    task.pinnedDates.push('all');
                }
            } else {
                const idx = task.pinnedDates.indexOf(currentDate);
                if (idx !== -1) {
                    task.pinnedDates.splice(idx, 1);
                } else {
                    task.pinnedDates.push(currentDate);
                }
            }
            saveData();
            if (onUpdate) onUpdate();
        });
        actionsContainer.appendChild(pinBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.innerHTML = '✎';
        editBtn.setAttribute('aria-label', 'Редактировать задачу');
        editBtn.title = 'Редактировать';
        actionsContainer.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '✕';
        deleteBtn.setAttribute('aria-label', 'Удалить задачу');
        deleteBtn.title = 'Удалить';
        deleteBtn.addEventListener('click', () => {
            tasks = tasks.filter(t => t.id !== task.id);
            saveData();
            if (onUpdate) onUpdate();
        });
        actionsContainer.appendChild(deleteBtn);

        // Текст задачи
        const textSpan = document.createElement('span');
        textSpan.className = 'task-text';
        textSpan.textContent = task.text;

        textSpan.addEventListener('click', function(e) {
            if (textSpan.classList.contains('editing')) return;
            e.stopPropagation();

            let toggleDate;
            if (task.repeatType === 'none') {
                toggleDate = task.date;
            } else {
                toggleDate = currentDate;
            }

            if (!task.completedDates) task.completedDates = [];
            const index = task.completedDates.indexOf(toggleDate);
            if (index !== -1) {
                task.completedDates.splice(index, 1);
            } else {
                task.completedDates.push(toggleDate);
            }

            const newIsCompleted = task.completedDates.includes(toggleDate);
            li.classList.toggle('completed', newIsCompleted);
            saveData();
            if (onUpdate) onUpdate();
        });

        // Редактирование
        let isEditing = false;
        let originalText = task.text;
        let originalStart = task.startTime || '';
        let originalEnd = task.endTime || '';

        function updateData() {
            const newText = textSpan.textContent.trim();
            if (newText === '') {
                cancelEdit();
                return false;
            }
            const newStart = startInput.value;
            const newEnd = endInput.value;
            if (newStart && newEnd && newStart > newEnd) {
                startInput.setCustomValidity('Время начала не может быть позже времени окончания');
                startInput.reportValidity();
                return false;
            } else {
                startInput.setCustomValidity('');
            }
            task.text = newText;
            task.startTime = newStart || '';
            task.endTime = newEnd || '';
            saveData();
            return true;
        }

        function startEditing() {
            if (isEditing) return;
            isEditing = true;
            originalText = textSpan.textContent;
            originalStart = task.startTime || '';
            originalEnd = task.endTime || '';

            timeSpan.style.display = 'none';
            startInput.classList.add('editing');
            endInput.classList.add('editing');
            separator.classList.add('editing');
            startInput.value = task.startTime || '';
            endInput.value = task.endTime || '';

            textSpan.contentEditable = true;
            textSpan.classList.add('editing');
            textSpan.focus();
            const range = document.createRange();
            range.selectNodeContents(textSpan);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }

        function saveEdit() {
            if (!isEditing) return;
            if (updateData()) {
                finishEditing();
                if (onUpdate) onUpdate();
            }
        }

        function cancelEdit() {
            if (!isEditing) return;
            textSpan.textContent = originalText;
            task.startTime = originalStart;
            task.endTime = originalEnd;
            finishEditing();
            timeSpan.textContent = getTimeDisplay(task);
            if (onUpdate) onUpdate();
        }

        function finishEditing() {
            isEditing = false;
            textSpan.contentEditable = false;
            textSpan.classList.remove('editing');
            startInput.classList.remove('editing');
            endInput.classList.remove('editing');
            separator.classList.remove('editing');
            timeSpan.style.display = 'inline';
            textSpan.textContent = task.text;
            timeSpan.textContent = getTimeDisplay(task);
            startInput.setCustomValidity('');
        }

        editBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (isEditing) {
                saveEdit();
            } else {
                startEditing();
            }
        });

        textSpan.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        textSpan.addEventListener('blur', function(e) {
            if (isEditing) {
                const related = e.relatedTarget;
                if (related === startInput || related === endInput) {
                    updateData();
                    return;
                }
                saveEdit();
            }
        });

        textSpan.addEventListener('click', function(e) {
            if (isEditing) e.stopPropagation();
        });

        startInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        startInput.addEventListener('blur', function(e) {
            if (isEditing) {
                const related = e.relatedTarget;
                if (related === textSpan || related === endInput) {
                    updateData();
                    return;
                }
                saveEdit();
            }
        });

        startInput.addEventListener('click', function(e) {
            e.stopPropagation();
        });

        endInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        endInput.addEventListener('blur', function(e) {
            if (isEditing) {
                const related = e.relatedTarget;
                if (related === textSpan || related === startInput) {
                    updateData();
                    return;
                }
                saveEdit();
            }
        });

        endInput.addEventListener('click', function(e) {
            e.stopPropagation();
        });

        // Сборка
        li.appendChild(label);
        li.appendChild(timeWrapper);
        li.appendChild(actionsContainer);
        li.appendChild(textSpan);

        return li;
    }

    // --- Рендеринг групп ---
    function renderGroups() {
        const container = document.getElementById('groupsList');
        if (!container) return;
        container.innerHTML = '';
        groups.forEach(grp => {
            const div = document.createElement('div');
            div.className = 'group-item';
            const colorSpan = document.createElement('span');
            colorSpan.className = 'group-color';
            colorSpan.style.backgroundColor = grp.color;
            const nameSpan = document.createElement('span');
            nameSpan.className = 'group-name';
            nameSpan.textContent = grp.name;
            const delBtn = document.createElement('button');
            delBtn.className = 'group-delete';
            delBtn.textContent = '✕';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                groups = groups.filter(g => g.id !== grp.id);
                saveData();
                renderGroups();
                populateGroupSelect();
            });
            div.appendChild(colorSpan);
            div.appendChild(nameSpan);
            div.appendChild(delBtn);
            container.appendChild(div);
        });
    }

    // --- Заполнение селекта групп ---
    function populateGroupSelect() {
        const select = document.getElementById('groupSelect');
        if (!select) return;
        select.innerHTML = '<option value="">Без группы</option>';
        groups.forEach(grp => {
            const opt = document.createElement('option');
            opt.value = grp.id;
            opt.textContent = grp.name;
            opt.style.color = grp.color;
            select.appendChild(opt);
        });
    }

    // --- Формирование заголовка для задач на дату ---
    function getTasksTitle(date) {
        const today = getToday();
        const tomorrow = getTomorrow();
        const dateStr = formatDate(date);
        if (date === today) return `Задачи на сегодня, ${dateStr}`;
        if (date === tomorrow) return `Задачи на завтра, ${dateStr}`;
        return `Задачи на ${dateStr}`;
    }

    // --- Поиск текущей и следующей задачи (с учётом будущих дней до 7 дней) ---
    function findNextTaskInFuture(now) {
        for (let offset = 1; offset <= 7; offset++) {
            const d = new Date(now);
            d.setDate(d.getDate() + offset);
            const dateStr = formatLocalDate(d);
            const tasksForDate = getTasksForDate(dateStr);
            const withTime = tasksForDate.filter(t => t.startTime);
            if (withTime.length === 0) continue;

            const withMinutes = withTime.map(t => {
                const parts = t.startTime.split(':').map(Number);
                const startMinutes = parts[0] * 60 + parts[1];
                return { task: t, startMinutes };
            });

            withMinutes.sort((a, b) => a.startMinutes - b.startMinutes);

            return { next: withMinutes[0].task, nextDate: dateStr };
        }
        return { next: null, nextDate: null };
    }

    function findCurrentAndNextTasks(date) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const todayStr = formatLocalDate(now);

        const todayTasks = getTasksForDate(todayStr);
        const withTime = todayTasks.filter(t => t.startTime);

        const withMinutes = withTime.map(t => {
            const parts = t.startTime.split(':').map(Number);
            const startMinutes = parts[0] * 60 + parts[1];
            let endMinutes = null;
            if (t.endTime) {
                const endParts = t.endTime.split(':').map(Number);
                endMinutes = endParts[0] * 60 + endParts[1];
            }
            return { task: t, startMinutes, endMinutes };
        });

        withMinutes.sort((a, b) => a.startMinutes - b.startMinutes);

        let current = null;
        for (let item of withMinutes) {
            if (item.endMinutes !== null && item.startMinutes <= currentTime && currentTime < item.endMinutes) {
                current = item.task;
                break;
            }
        }

        let next = null;
        for (let item of withMinutes) {
            if (item.startMinutes > currentTime) {
                if (!current || item.task.id !== current.id) {
                    next = item.task;
                    break;
                }
            }
        }

        if (next) {
            return { current, next, nextDate: todayStr };
        }

        const future = findNextTaskInFuture(now);
        return { current, next: future.next, nextDate: future.nextDate };
    }

    function parseTime(timeStr) {
        const parts = timeStr.split(':').map(Number);
        return parts[0] * 60 + parts[1];
    }

    // --- Рендеринг блока "Текущая / Следующая задача" ---
    function renderNextTask(date) {
        const container = document.getElementById('nextTaskContainer');
        if (!container) return;

        const { current, next, nextDate } = findCurrentAndNextTasks(date);

        if (!current && !next) {
            container.innerHTML = '<div class="next-task-empty">Нет предстоящих задач</div>';
            return;
        }

        let html = '';

        if (current) {
            const grp = current.groupId ? groups.find(g => g.id === current.groupId) : null;
            const timeDisplay = getTimeDisplay(current);
            const dateDisplay = formatDateWithDay(getToday());
            html += `
                <div class="next-task-item current">
                    <div class="next-header">Текущая задача</div>
                    <div class="next-details">
                        <span class="next-time">${dateDisplay} ${timeDisplay}</span>
                        <span class="next-group">
                            <span class="group-color-dot" style="background:${current.color || (grp ? grp.color : '#6b7280')};"></span>
                            ${grp ? grp.name : 'Без группы'}
                        </span>
                        <span class="next-text">${current.text}</span>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="next-task-item current">
                    <div class="next-header">Текущая задача</div>
                    <div class="next-details" style="font-size: 0.9rem; color: #94a3b8; opacity: 0.8;">
                        Нет задачи
                    </div>
                </div>
            `;
        }

        if (next) {
            const grp = next.groupId ? groups.find(g => g.id === next.groupId) : null;
            const timeDisplay = getTimeDisplay(next);
            const dateDisplay = formatDateWithDay(nextDate);
            html += `
                <div class="next-task-item next">
                    <div class="next-header">Следующая задача</div>
                    <div class="next-details">
                        <span class="next-time">${dateDisplay} ${timeDisplay}</span>
                        <span class="next-group">
                            <span class="group-color-dot" style="background:${next.color || (grp ? grp.color : '#6b7280')};"></span>
                            ${grp ? grp.name : 'Без группы'}
                        </span>
                        <span class="next-text">${next.text}</span>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    // --- Рендеринг задач на выбранную дату (левая панель) ---
    function renderTasksForSelectedDate(date) {
        const container = document.getElementById('selectedDateTasksList');
        if (!container) return;
        const titleEl = document.getElementById('selectedDateTitle');
        if (titleEl) {
            titleEl.textContent = getTasksTitle(date);
        }

        const tasksForDate = getTasksForDate(date);
        const sorted = sortTasks(tasksForDate, date);

        container.innerHTML = '';
        if (sorted.length === 0) {
            container.innerHTML = '<li class="task-item" style="justify-content:center; background:transparent; border:none; color:#94a3b8; padding:1rem 0;">Нет задач</li>';
        } else {
            sorted.forEach(task => {
                const li = createTaskElement(task, date, () => {
                    renderTasksForSelectedDate(date);
                    if (currentView !== 'all') renderCalendar();
                    renderNextTask(date);
                }, false);
                container.appendChild(li);
            });
        }
        renderNextTask(date);
    }

    // --- Рендеринг всех задач (вид "Все задачи") ---
    function renderAllTasksView(container) {
        if (!container) return;
        container.innerHTML = '';
        const allTasks = getAllTasks();
        if (allTasks.length === 0) {
            container.innerHTML = '<p style="color:#94a3b8; padding:1rem;">Нет задач</p>';
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'all-tasks-view';
        const today = getToday();
        const sorted = sortTasks(allTasks, today);
        sorted.forEach(task => {
            const li = createTaskElement(task, today, () => {
                renderAllTasksView(container);
                if (currentView !== 'all') renderCalendar();
                renderTasksForSelectedDate(selectedDate);
            }, true);
            wrapper.appendChild(li);
        });
        container.appendChild(wrapper);
    }

    // --- Календарь ---
    let currentView = 'week';
    let selectedDate = getToday();
    let customStart = getToday();
    let customEnd = getToday();

    function highlightSelectedDate() {
        document.querySelectorAll('.calendar-cell.selected').forEach(el => el.classList.remove('selected'));
        const cell = document.querySelector(`.calendar-cell[data-date="${selectedDate}"]`);
        if (cell) {
            cell.classList.add('selected');
        }
    }

    function renderCalendar() {
        const container = document.getElementById('calendarView');
        if (!container) return;
        const titleEl = document.getElementById('calendarTitle');
        const controls = document.getElementById('calendarControls');
        const customContainer = document.getElementById('customRangeContainer');

        if (currentView === 'all') {
            if (controls) controls.style.display = 'none';
            if (customContainer) customContainer.style.display = 'none';
            renderAllTasksView(container);
            return;
        } else {
            if (controls) controls.style.display = 'flex';
        }

        let daysArray = [];

        if (currentView === 'week') {
            const week = getWeekDays(selectedDate);
            daysArray = week;
            if (titleEl) titleEl.textContent = `Неделя ${formatDate(week[0])} – ${formatDate(week[6])}`;
        } else if (currentView === 'month') {
            const d = parseLocalDate(selectedDate);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            daysArray = getMonthDays(year, month);
            let monthName = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
            monthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
            if (titleEl) titleEl.textContent = monthName;
        } else if (currentView === 'custom') {
            const start = document.getElementById('customStart')?.value;
            const end = document.getElementById('customEnd')?.value;
            if (start && end) {
                customStart = start;
                customEnd = end;
                const s = parseLocalDate(start);
                const e = parseLocalDate(end);
                daysArray = [];
                let cur = new Date(s);
                while (cur <= e) {
                    daysArray.push(formatLocalDate(cur));
                    cur.setDate(cur.getDate() + 1);
                }
                if (titleEl) titleEl.textContent = `${formatDate(start)} – ${formatDate(end)}`;
            } else {
                container.innerHTML = '<p style="color:#94a3b8; padding:1rem;">Выберите даты начала и конца</p>';
                return;
            }
        }

        const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        let html = `<div class="${currentView}-view">`;
        html += `<div class="calendar-weekdays">`;
        weekDays.forEach(wd => {
            html += `<span class="weekday-label">${wd}</span>`;
        });
        html += `</div>`;
        html += `<div class="calendar-grid">`;
        const todayStr = getToday();
        if (currentView === 'month') {
            const d = parseLocalDate(selectedDate);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const firstDay = new Date(year, month - 1, 1).getDay();
            const offset = (firstDay === 0) ? 6 : firstDay - 1;
            for (let i = 0; i < offset; i++) {
                html += `<div class="calendar-cell empty"></div>`;
            }
        }
        daysArray.forEach(day => {
            const dayTasks = getTasksForDate(day);
            const hasTasks = dayTasks.length > 0;
            const isToday = day === todayStr;
            const dt = parseLocalDate(day);
            const dayNum = dt.getDate();
            html += `<div class="calendar-cell ${hasTasks ? 'has-tasks' : ''} ${isToday ? 'today' : ''}" data-date="${day}">
                        <span class="day-number">${dayNum}</span>
                        ${hasTasks ? `<span class="task-badge">${dayTasks.length}</span>` : ''}
                    </div>`;
        });
        html += `</div></div>`;
        container.innerHTML = html;

        attachDateClickHandlers('.calendar-cell:not(.empty)');
        highlightSelectedDate();
        renderTasksForSelectedDate(selectedDate);
    }

    function attachDateClickHandlers(selector) {
        document.querySelectorAll(selector).forEach(el => {
            el.removeEventListener('click', handleDateClick);
            el.addEventListener('click', handleDateClick);
        });
    }

    function handleDateClick(e) {
        const date = this.dataset.date;
        if (date) {
            selectedDate = date;
            document.querySelectorAll('.calendar-cell.selected').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            renderAll();
        }
    }

    // --- Вкладки ---
    function switchTab(tabId) {
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const pane = document.getElementById('tab-' + tabId);
        if (pane) pane.classList.add('active');
        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (btn) btn.classList.add('active');

        if (tabId === 'settings') renderSettings();
        if (tabId === 'calendar') renderCalendar();
    }

    // --- Страница настроек ---
    function renderSettings() {
        const container = document.getElementById('settingsContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="settings-card">
                <h4>Очистка данных</h4>
                <p>Удалить все задачи и группы. Это действие необратимо.</p>
                <button class="settings-btn danger" id="clearAllDataBtn">Очистить всё</button>
            </div>
            <div class="settings-card">
                <h4>Экспорт данных</h4>
                <p>Скачать все задачи и группы в формате JSON.</p>
                <button class="settings-btn primary" id="exportDataBtn">Экспортировать</button>
            </div>
            <div class="settings-card">
                <h4>Импорт данных</h4>
                <p>Загрузить задачи и группы из JSON-файла. Существующие данные будут заменены.</p>
                <input type="file" id="importFileInput" accept=".json" style="display:none;" />
                <button class="settings-btn secondary" id="importDataBtn">Импортировать</button>
            </div>
        `;

        document.getElementById('clearAllDataBtn').addEventListener('click', function() {
            if (confirm('Вы уверены, что хотите удалить все задачи и группы? Это действие необратимо!')) {
                tasks = [];
                groups = [];
                saveData();
                renderAll();
                renderSettings();
                alert('Все данные очищены.');
            }
        });

        document.getElementById('exportDataBtn').addEventListener('click', function() {
            const data = { tasks, groups };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `task-planner-backup-${getToday()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('importDataBtn').addEventListener('click', function() {
            document.getElementById('importFileInput').click();
        });

        document.getElementById('importFileInput').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.tasks && data.groups) {
                        if (confirm('Импорт заменит все текущие задачи и группы. Продолжить?')) {
                            tasks = data.tasks;
                            groups = data.groups;
                            saveData();
                            renderAll();
                            renderSettings();
                            alert('Данные успешно импортированы.');
                        }
                    } else {
                        alert('Неверный формат файла: отсутствуют поля tasks или groups.');
                    }
                } catch (err) {
                    alert('Ошибка чтения файла: ' + err.message);
                }
            };
            reader.readAsText(file);
            this.value = '';
        });
    }

    // --- Основная функция обновления ---
    function renderAll() {
        renderTasksForSelectedDate(selectedDate);
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
            const tabId = activeTab.dataset.tab;
            if (tabId === 'calendar') renderCalendar();
            else if (tabId === 'settings') renderSettings();
        }
        renderGroups();
        populateGroupSelect();
        updateDateTime();
    }

    // --- Обновление даты и времени ---
    function updateDateTime() {
        const dateEl = document.getElementById('todayDate');
        const timeEl = document.getElementById('currentTime');
        if (!dateEl || !timeEl) return;
        const now = new Date();
        const dateStr = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        dateEl.textContent = dateStr;
        timeEl.textContent = timeStr;
        renderNextTask(selectedDate);
    }

    // --- Переключение режима добавления / просмотра ---
    function toggleAddMode() {
        const todayContainer = document.getElementById('selectedDateTasksContainer');
        const addContainer = document.getElementById('addTaskContainer');
        const toggleBtn = document.getElementById('toggleAddModeBtn');
        if (!todayContainer || !addContainer || !toggleBtn) return;

        if (todayContainer.classList.contains('hidden')) {
            todayContainer.classList.remove('hidden');
            addContainer.classList.add('hidden');
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = '+';
            renderTasksForSelectedDate(selectedDate);
        } else {
            todayContainer.classList.add('hidden');
            addContainer.classList.remove('hidden');
            toggleBtn.classList.add('active');
            toggleBtn.textContent = '✕';
        }
    }

    // --- Инициализация ---
    function init() {
        loadData();
        renderGroups();
        populateGroupSelect();

        const toggleBtn = document.getElementById('toggleAddModeBtn');
        if (toggleBtn) toggleBtn.addEventListener('click', toggleAddMode);

        const taskDateInput = document.getElementById('taskDate');
        if (taskDateInput) taskDateInput.value = getToday();

        // Добавление группы
        const addGroupBtn = document.getElementById('addGroupBtn');
        if (addGroupBtn) {
            addGroupBtn.addEventListener('click', function() {
                const nameInput = document.getElementById('groupNameInput');
                const colorInput = document.getElementById('groupColorInput');
                if (!nameInput || !colorInput) return;
                const name = nameInput.value.trim();
                if (!name) {
                    nameInput.setCustomValidity('Введите название группы');
                    nameInput.reportValidity();
                    return;
                }
                nameInput.setCustomValidity('');
                const newGroup = {
                    id: 'g' + Date.now(),
                    name: name,
                    color: colorInput.value,
                };
                groups.push(newGroup);
                saveData();
                renderGroups();
                populateGroupSelect();
                nameInput.value = '';
            });
        }

        const groupSelect = document.getElementById('groupSelect');
        if (groupSelect) {
            groupSelect.addEventListener('change', function() {
                const selectedId = this.value;
                const taskInput = document.getElementById('taskInput');
                if (!taskInput) return;
                if (selectedId) {
                    const grp = groups.find(g => g.id === selectedId);
                    if (grp) {
                        taskInput.value = grp.name;
                    }
                } else {
                    taskInput.value = '';
                }
            });
        }

        // Повторение: кнопки
        const dayButtons = document.querySelectorAll('.day-btn');
        const noneBtn = document.querySelector('.repeat-btn[data-value="none"]');
        const dailyBtn = document.querySelector('.repeat-btn[data-value="daily"]');

        dayButtons.forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                this.classList.toggle('active');
                const anyDayActive = Array.from(dayButtons).some(b => b.classList.contains('active'));
                if (anyDayActive) {
                    if (noneBtn) noneBtn.classList.remove('active');
                    if (dailyBtn) dailyBtn.classList.remove('active');
                }
            });
        });

        if (noneBtn) {
            noneBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                dayButtons.forEach(b => b.classList.remove('active'));
                if (dailyBtn) dailyBtn.classList.remove('active');
                this.classList.add('active');
            });
        }

        if (dailyBtn) {
            dailyBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                dayButtons.forEach(b => b.classList.remove('active'));
                if (noneBtn) noneBtn.classList.remove('active');
                this.classList.add('active');
            });
        }

        // Добавление задачи
        const taskForm = document.getElementById('taskForm');
        if (taskForm) {
            taskForm.addEventListener('submit', function(e) {
                e.preventDefault();

                const input = document.getElementById('taskInput');
                if (!input) return;
                const text = input.value.trim();
                if (!text) {
                    input.setCustomValidity('Введите текст задачи');
                    input.reportValidity();
                    return;
                } else {
                    input.setCustomValidity('');
                }

                const date = document.getElementById('taskDate')?.value || getToday();
                const startTime = document.getElementById('startTime')?.value || '';
                const endTime = document.getElementById('endTime')?.value || '';
                const repeatEnd = document.getElementById('repeatEnd')?.value || '';

                if (startTime && endTime && startTime > endTime) {
                    const startInput = document.getElementById('startTime');
                    if (startInput) {
                        startInput.setCustomValidity('Время начала не может быть позже времени окончания');
                        startInput.reportValidity();
                    }
                    return;
                } else {
                    const startInput = document.getElementById('startTime');
                    if (startInput) startInput.setCustomValidity('');
                }

                if (repeatEnd && date > repeatEnd) {
                    const repeatEndInput = document.getElementById('repeatEnd');
                    if (repeatEndInput) {
                        repeatEndInput.setCustomValidity('Дата задачи не может быть позже даты окончания повторения');
                        repeatEndInput.reportValidity();
                    }
                    return;
                } else {
                    const repeatEndInput = document.getElementById('repeatEnd');
                    if (repeatEndInput) repeatEndInput.setCustomValidity('');
                }

                let repeatType = 'none';
                let repeatDays = [];

                if (noneBtn && noneBtn.classList.contains('active')) {
                    repeatType = 'none';
                } else if (dailyBtn && dailyBtn.classList.contains('active')) {
                    repeatType = 'daily';
                } else {
                    const activeDays = Array.from(dayButtons).filter(b => b.classList.contains('active'));
                    if (activeDays.length > 0) {
                        repeatType = 'weekly';
                        repeatDays = activeDays.map(b => parseInt(b.dataset.value));
                    } else {
                        repeatType = 'none';
                    }
                }

                const groupId = document.getElementById('groupSelect')?.value || null;
                let color = '#94a3b8';
                if (groupId) {
                    const grp = groups.find(g => g.id === groupId);
                    if (grp) color = grp.color;
                }

                const newTask = {
                    id: 'task' + Date.now(),
                    text: text,
                    date: date,
                    startTime: startTime,
                    endTime: endTime,
                    color: color,
                    groupId: groupId,
                    repeatType: repeatType,
                    repeatDays: repeatDays,
                    repeatEnd: repeatEnd || null,
                    completedDates: [],
                    pinnedDates: [],
                };

                tasks.push(newTask);
                saveData();

                // Планируем напоминание (если есть время начала)
                if (newTask.startTime) {
                    const groupName = newTask.groupId
                        ? groups.find(g => g.id === newTask.groupId)?.name || 'Без группы'
                        : 'Без группы';
                    const groupColor = newTask.groupId
                        ? groups.find(g => g.id === newTask.groupId)?.color || '#6b7280'
                        : '#6b7280';
                    scheduleReminder(newTask.id, newTask.text, newTask.date, newTask.startTime, groupName, groupColor);
                }

                // ====== ОТПРАВКА PUSH-УВЕДОМЛЕНИЯ ======
                //sendTaskNotification(newTask.text, newTask.date); // мгновенное уведомление
                // =========================================

                input.value = '';
                if (document.getElementById('repeatEnd')) document.getElementById('repeatEnd').value = '';
                if (document.getElementById('groupSelect')) document.getElementById('groupSelect').value = '';
                dayButtons.forEach(b => b.classList.remove('active'));
                if (dailyBtn) dailyBtn.classList.remove('active');
                if (noneBtn) noneBtn.classList.add('active');

                const todayContainer = document.getElementById('selectedDateTasksContainer');
                if (todayContainer && todayContainer.classList.contains('hidden')) {
                    toggleAddMode();
                }
                renderAll();
            });
        }

        // Переключение вкладок
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                switchTab(this.dataset.tab);
            });
        });

        // Переключение видов
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const wasActive = this.classList.contains('active');
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentView = this.dataset.view;

                if (wasActive && currentView !== 'all' && currentView !== 'custom') {
                    selectedDate = getToday();
                }

                const customContainer = document.getElementById('customRangeContainer');
                if (customContainer) {
                    if (currentView === 'custom') {
                        customContainer.style.display = 'flex';
                        const cs = document.getElementById('customStart');
                        const ce = document.getElementById('customEnd');
                        if (cs) cs.value = customStart;
                        if (ce) ce.value = customEnd;
                    } else {
                        customContainer.style.display = 'none';
                    }
                }
                const controls = document.getElementById('calendarControls');
                if (controls) {
                    controls.style.display = (currentView === 'all') ? 'none' : 'flex';
                }
                renderCalendar();
            });
        });

        // Навигация
        document.getElementById('calendarPrev')?.addEventListener('click', function() {
            if (currentView === 'all') return;
            const d = parseLocalDate(selectedDate);
            if (currentView === 'week') d.setDate(d.getDate() - 7);
            else if (currentView === 'month') d.setMonth(d.getMonth() - 1);
            else if (currentView === 'custom') {
                return;
            }
            selectedDate = formatLocalDate(d);
            renderAll();
        });

        document.getElementById('calendarNext')?.addEventListener('click', function() {
            if (currentView === 'all') return;
            const d = parseLocalDate(selectedDate);
            if (currentView === 'week') d.setDate(d.getDate() + 7);
            else if (currentView === 'month') d.setMonth(d.getMonth() + 1);
            else if (currentView === 'custom') {
                return;
            }
            selectedDate = formatLocalDate(d);
            renderAll();
        });

        document.getElementById('applyCustomRange')?.addEventListener('click', function() {
            const start = document.getElementById('customStart')?.value;
            const end = document.getElementById('customEnd')?.value;
            if (!start || !end) {
                const ce = document.getElementById('customEnd');
                if (ce) {
                    ce.setCustomValidity('Выберите обе даты');
                    ce.reportValidity();
                }
                return;
            }
            if (start > end) {
                const ce = document.getElementById('customEnd');
                if (ce) {
                    ce.setCustomValidity('Дата начала не может быть позже даты конца');
                    ce.reportValidity();
                }
                return;
            }
            const ce = document.getElementById('customEnd');
            if (ce) ce.setCustomValidity('');
            customStart = start;
            customEnd = end;
            renderCalendar();
        });

        // Старт
        const todayContainer = document.getElementById('selectedDateTasksContainer');
        const addContainer = document.getElementById('addTaskContainer');
        if (todayContainer) todayContainer.classList.remove('hidden');
        if (addContainer) addContainer.classList.add('hidden');
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = '+';
        }

        switchTab('calendar');
        currentView = 'week';
        const weekViewBtn = document.querySelector('.view-btn[data-view="week"]');
        if (weekViewBtn) weekViewBtn.classList.add('active');
        const customContainer = document.getElementById('customRangeContainer');
        if (customContainer) customContainer.style.display = 'none';
        if (noneBtn) noneBtn.classList.add('active');

        updateDateTime();
        renderAll();
        setInterval(updateDateTime, 1000);

        // ----- ПОДПИСКА НА PUSH (после регистрации SW) -----
        // Ждём, пока Service Worker точно зарегистрируется, затем подписываемся.
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(() => {
                // Можно подписываться сразу, если разрешение уже дано или ещё не запрошено
                if (Notification.permission === 'granted' || Notification.permission === 'default') {
                    subscribeToPush();
                }
            });
        }
        // ----------------------------------------------------
    }

    document.addEventListener('DOMContentLoaded', init);
})();
