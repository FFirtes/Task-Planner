// script.js
(function() {
    // --- Модель данных ---
    let tasks = [];

    // Загрузка из localStorage
    function loadTasks() {
        const stored = localStorage.getItem('tasks');
        if (stored) {
            try { tasks = JSON.parse(stored); }
            catch (_) { tasks = []; }
        }
        // Если нет задач, добавим несколько примеров для наглядности
        if (tasks.length === 0) {
            const today = new Date().toISOString().split('T')[0];
            tasks = [
                { id: '1', text: 'Позвонить клиенту', completed: false, date: today, startTime: '10:00', endTime: '10:30' },
                { id: '2', text: 'Подготовить отчёт', completed: true, date: today, startTime: '14:00', endTime: '16:00' },
                { id: '3', text: 'Запланировать встречу', completed: false, date: today, startTime: '17:00', endTime: '18:00' },
            ];
            saveTasks();
        }
    }

    function saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    // --- Вспомогательные функции ---
    function getToday() {
        return new Date().toISOString().split('T')[0];
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatDateShort(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    function getWeekDays(refDate) {
        const d = new Date(refDate + 'T00:00:00');
        const day = d.getDay(); // 0 - воскресенье
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // понедельник
        const monday = new Date(d);
        monday.setDate(diff);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const dt = new Date(monday);
            dt.setDate(monday.getDate() + i);
            days.push(dt.toISOString().split('T')[0]);
        }
        return days;
    }

    function getMonthDays(year, month) {
        const days = [];
        const date = new Date(year, month - 1, 1);
        while (date.getMonth() === month - 1) {
            days.push(date.toISOString().split('T')[0]);
            date.setDate(date.getDate() + 1);
        }
        return days;
    }

    function getTasksForDate(date) {
        return tasks.filter(t => t.date === date);
    }

    function getTasksForRange(startDate, endDate) {
        return tasks.filter(t => t.date >= startDate && t.date <= endDate);
    }

    // --- Рендеринг левой панели (список всех задач и статистика) ---
    function renderLeftPanel() {
        const taskList = document.getElementById('taskList');
        taskList.innerHTML = '';

        if (tasks.length === 0) {
            taskList.innerHTML = '<li class="task-item" style="justify-content:center; background:transparent; border:none; color:#94a3b8; padding:1rem 0;">Задач нет</li>';
        } else {
            // сортируем по дате (сначала новые) и по статусу (невыполненные сверху)
            const sorted = [...tasks].sort((a, b) => {
                if (a.completed !== b.completed) return a.completed ? 1 : -1;
                return a.date.localeCompare(b.date);
            });
            sorted.forEach(task => {
                const li = document.createElement('li');
                li.className = 'task-item' + (task.completed ? ' completed' : '');
                li.dataset.id = task.id;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = task.completed;
                checkbox.addEventListener('change', () => {
                    task.completed = checkbox.checked;
                    saveTasks();
                    renderAll();
                });

                const textSpan = document.createElement('span');
                textSpan.className = 'task-text';
                textSpan.textContent = task.text;

                const metaSpan = document.createElement('span');
                metaSpan.className = 'task-meta';
                metaSpan.textContent = task.date + (task.startTime ? ' ' + task.startTime : '');

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.innerHTML = '✕';
                deleteBtn.setAttribute('aria-label', 'Удалить задачу');
                deleteBtn.addEventListener('click', () => {
                    tasks = tasks.filter(t => t.id !== task.id);
                    saveTasks();
                    renderAll();
                });

                li.appendChild(checkbox);
                li.appendChild(textSpan);
                li.appendChild(metaSpan);
                li.appendChild(deleteBtn);
                taskList.appendChild(li);
            });
        }

        // Обновляем статистику
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        document.getElementById('totalCount').textContent = total;
        document.getElementById('completedCount').textContent = completed;
        document.getElementById('incompleteCount').textContent = total - completed;
    }

    // --- Рендеринг правой панели (вкладки) ---
    // Текущее состояние календаря
    let currentView = 'day'; // 'day', 'week', 'month', 'custom'
    let selectedDate = getToday(); // для day, week, month - опорная дата
    let customStart = getToday();
    let customEnd = getToday();

    function renderCalendar() {
        const container = document.getElementById('calendarView');
        const titleEl = document.getElementById('calendarTitle');

        // Определяем диапазон дат для отображения
        let displayRange = { start: selectedDate, end: selectedDate };
        let daysArray = [];

        if (currentView === 'day') {
            daysArray = [selectedDate];
            titleEl.textContent = formatDate(selectedDate);
        } else if (currentView === 'week') {
            const week = getWeekDays(selectedDate);
            daysArray = week;
            titleEl.textContent = `Неделя ${formatDate(week[0])} – ${formatDate(week[6])}`;
        } else if (currentView === 'month') {
            const d = new Date(selectedDate + 'T00:00:00');
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            daysArray = getMonthDays(year, month);
            titleEl.textContent = `${d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`;
        } else if (currentView === 'custom') {
            // свой промежуток: показываем задачи за диапазон
            const start = document.getElementById('customStart').value;
            const end = document.getElementById('customEnd').value;
            if (start && end) {
                customStart = start;
                customEnd = end;
                // строим список дней в диапазоне
                const s = new Date(start + 'T00:00:00');
                const e = new Date(end + 'T00:00:00');
                daysArray = [];
                let cur = new Date(s);
                while (cur <= e) {
                    daysArray.push(cur.toISOString().split('T')[0]);
                    cur.setDate(cur.getDate() + 1);
                }
                titleEl.textContent = `${formatDate(start)} – ${formatDate(end)}`;
            } else {
                container.innerHTML = '<p style="color:#94a3b8; padding:1rem;">Выберите даты начала и конца</p>';
                return;
            }
        }

        // Рендеринг в зависимости от вида
        if (currentView === 'day') {
            let html = `<div class="day-view"><h4>${formatDate(selectedDate)}</h4>`;
            const dayTasks = getTasksForDate(selectedDate);
            if (dayTasks.length === 0) {
                html += '<p style="color:#94a3b8;">Нет задач</p>';
            } else {
                html += '<ul style="list-style:none; display:flex; flex-direction:column; gap:0.3rem;">';
                dayTasks.forEach(t => {
                    html += `<li class="task-item" style="background:white; ${t.completed ? 'opacity:0.6;' : ''}">
                                <span class="task-text">${t.text}</span>
                                <span class="task-meta">${t.startTime || ''} ${t.endTime ? '-'+t.endTime : ''}</span>
                                <span style="font-size:0.7rem; color:${t.completed ? 'green' : '#94a3b8'};">${t.completed ? '✅' : '⏳'}</span>
                            </li>`;
                });
                html += '</ul>';
            }
            html += '</div>';
            container.innerHTML = html;
        } else if (currentView === 'week') {
            let html = '<div class="week-view">';
            daysArray.forEach(day => {
                const dayTasks = getTasksForDate(day);
                html += `<div class="week-day">
                            <div class="day-label">${formatDateShort(day)}</div>
                            <div class="day-tasks" data-date="${day}">${dayTasks.length} задач</div>
                        </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
            // Добавляем обработчики клика по дням недели для перехода в день
            document.querySelectorAll('.day-tasks').forEach(el => {
                el.addEventListener('click', function() {
                    const date = this.dataset.date;
                    if (date) {
                        selectedDate = date;
                        currentView = 'day';
                        // Обновим активные кнопки
                        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                        document.querySelector('.view-btn[data-view="day"]').classList.add('active');
                        renderAll();
                    }
                });
            });
        } else if (currentView === 'month') {
            const d = new Date(selectedDate + 'T00:00:00');
            const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).getDay(); // 0 - вс
            // смещение для понедельника
            const offset = (firstDay === 0) ? 6 : firstDay - 1;
            let html = '<div class="month-view">';
            // Заголовки дней недели
            const weekDays = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
            weekDays.forEach(wd => {
                html += `<div style="font-weight:600; font-size:0.7rem; color:#64748b; text-align:center;">${wd}</div>`;
            });
            // Пустые ячейки до первого дня
            for (let i = 0; i < offset; i++) {
                html += `<div class="month-cell" style="background:transparent; border:none;"></div>`;
            }
            // Дни месяца
            daysArray.forEach(day => {
                const dayTasks = getTasksForDate(day);
                const hasTasks = dayTasks.length > 0;
                const dayNum = new Date(day + 'T00:00:00').getDate();
                html += `<div class="month-cell ${hasTasks ? 'has-tasks' : ''}" data-date="${day}">
                            ${dayNum}
                            ${hasTasks ? `<span class="task-count">${dayTasks.length}</span>` : ''}
                        </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
            // Обработчики клика по дням
            document.querySelectorAll('.month-cell[data-date]').forEach(el => {
                el.addEventListener('click', function() {
                    const date = this.dataset.date;
                    if (date) {
                        selectedDate = date;
                        currentView = 'day';
                        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                        document.querySelector('.view-btn[data-view="day"]').classList.add('active');
                        renderAll();
                    }
                });
            });
        } else if (currentView === 'custom') {
            // Показываем задачи за диапазон, сгруппированные по дням
            let html = `<div style="display:flex; flex-direction:column; gap:0.8rem;">`;
            const rangeTasks = getTasksForRange(customStart, customEnd);
            if (rangeTasks.length === 0) {
                html += '<p style="color:#94a3b8;">Нет задач в этом диапазоне</p>';
            } else {
                // группировка по датам
                const groups = {};
                rangeTasks.forEach(t => {
                    if (!groups[t.date]) groups[t.date] = [];
                    groups[t.date].push(t);
                });
                const sortedDates = Object.keys(groups).sort();
                sortedDates.forEach(date => {
                    html += `<div style="background:#f8fafc; padding:0.5rem 1rem; border-radius:12px;">
                                <strong>${formatDate(date)}</strong>
                                <ul style="list-style:none; margin-top:0.3rem;">
                    `;
                    groups[date].forEach(t => {
                        html += `<li style="display:flex; gap:0.5rem; align-items:center; font-size:0.9rem;">
                                    <span>${t.text}</span>
                                    <span style="font-size:0.7rem; color:#94a3b8;">${t.startTime || ''}</span>
                                    <span style="font-size:0.7rem; color:${t.completed ? 'green' : '#94a3b8'};">${t.completed ? '✅' : '⏳'}</span>
                                </li>`;
                    });
                    html += `</ul></div>`;
                });
            }
            html += '</div>';
            container.innerHTML = html;
        }
    }

    // --- Вкладки ---
    function switchTab(tabId) {
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('tab-' + tabId).classList.add('active');
        document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');

        // Если переключились на архив или статистику, обновляем их содержимое
        if (tabId === 'archive') renderArchive();
        if (tabId === 'stats') renderStats();
        if (tabId === 'calendar') renderCalendar();
    }

    // --- Архив ---
    function renderArchive() {
        const archiveList = document.getElementById('archiveList');
        const completedTasks = tasks.filter(t => t.completed);
        archiveList.innerHTML = '';
        if (completedTasks.length === 0) {
            archiveList.innerHTML = '<li class="task-item" style="justify-content:center; background:transparent; border:none; color:#94a3b8;">Нет выполненных задач</li>';
        } else {
            completedTasks.sort((a, b) => a.date.localeCompare(b.date));
            completedTasks.forEach(t => {
                const li = document.createElement('li');
                li.className = 'task-item';
                li.innerHTML = `<span class="task-text">${t.text}</span>
                                <span class="task-meta">${t.date} ${t.startTime || ''}</span>
                                <span style="color:green;">✅</span>`;
                archiveList.appendChild(li);
            });
        }
    }

    // --- Статистика ---
    function renderStats() {
        const container = document.getElementById('statsDetail');
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const incomplete = total - completed;

        // Задачи на сегодня
        const today = getToday();
        const todayTasks = getTasksForDate(today);
        const todayCompleted = todayTasks.filter(t => t.completed).length;

        // Задачи за неделю (текущая неделя)
        const weekDays = getWeekDays(today);
        const weekTasks = tasks.filter(t => weekDays.includes(t.date));
        const weekCompleted = weekTasks.filter(t => t.completed).length;

        let html = `
            <div class="stat-row"><span class="label">Всего задач</span><span class="value">${total}</span></div>
            <div class="stat-row"><span class="label">Выполнено</span><span class="value">${completed}</span></div>
            <div class="stat-row"><span class="label">Не выполнено</span><span class="value">${incomplete}</span></div>
            <div class="stat-row"><span class="label">Задач на сегодня</span><span class="value">${todayTasks.length}</span></div>
            <div class="stat-row"><span class="label">Выполнено сегодня</span><span class="value">${todayCompleted}</span></div>
            <div class="stat-row"><span class="label">Задач за неделю</span><span class="value">${weekTasks.length}</span></div>
            <div class="stat-row"><span class="label">Выполнено за неделю</span><span class="value">${weekCompleted}</span></div>
        `;
        container.innerHTML = html;
    }

    // --- Общий рендеринг ---
    function renderAll() {
        renderLeftPanel();
        // Обновляем только активную вкладку
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
            const tabId = activeTab.dataset.tab;
            if (tabId === 'calendar') renderCalendar();
            else if (tabId === 'archive') renderArchive();
            else if (tabId === 'stats') renderStats();
        }
    }

    // --- Инициализация событий ---
    function init() {
        loadTasks();

        // Установить дату по умолчанию сегодня
        document.getElementById('taskDate').value = getToday();

        // Обработчик добавления задачи
        document.getElementById('taskForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const input = document.getElementById('taskInput');
            const text = input.value.trim();
            if (!text) return;

            const date = document.getElementById('taskDate').value || getToday();
            const startTime = document.getElementById('startTime').value || '';
            const endTime = document.getElementById('endTime').value || '';

            const newTask = {
                id: Date.now() + Math.random().toString(36).slice(2, 6),
                text: text,
                completed: false,
                date: date,
                startTime: startTime,
                endTime: endTime
            };
            tasks.push(newTask);
            saveTasks();
            input.value = '';
            renderAll();
            // Переключим на календарь, чтобы увидеть добавленную задачу
            switchTab('calendar');
            // Если текущий вид день, покажем эту дату
            if (currentView === 'day') {
                selectedDate = date;
                renderCalendar();
            }
        });

        // Переключение вкладок
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const tab = this.dataset.tab;
                switchTab(tab);
            });
        });

        // Переключение видов календаря
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentView = this.dataset.view;

                // Если выбран custom, показываем поля ввода
                const customContainer = document.getElementById('customRangeContainer');
                if (currentView === 'custom') {
                    // Создаем элементы если их нет
                    if (!document.getElementById('customRangeContainer')) {
                        const div = document.createElement('div');
                        div.id = 'customRangeContainer';
                        div.className = 'custom-range';
                        div.innerHTML = `
                            <label>С <input type="date" id="customStart" value="${customStart}"></label>
                            <label>По <input type="date" id="customEnd" value="${customEnd}"></label>
                            <button id="applyCustomRange" style="padding:0.3rem 1rem; border:none; background:#3b82f6; color:white; border-radius:20px; cursor:pointer;">Применить</button>
                        `;
                        document.getElementById('calendarView').before(div);
                        document.getElementById('applyCustomRange').addEventListener('click', function() {
                            const start = document.getElementById('customStart').value;
                            const end = document.getElementById('customEnd').value;
                            if (start && end && start <= end) {
                                customStart = start;
                                customEnd = end;
                                renderCalendar();
                            } else {
                                alert('Укажите корректный диапазон дат');
                            }
                        });
                    } else {
                        document.getElementById('customRangeContainer').style.display = 'flex';
                    }
                } else {
                    const container = document.getElementById('customRangeContainer');
                    if (container) container.style.display = 'none';
                }
                renderCalendar();
            });
        });

        // Кнопки навигации календаря
        document.getElementById('calendarPrev').addEventListener('click', function() {
            const d = new Date(selectedDate + 'T00:00:00');
            if (currentView === 'day') {
                d.setDate(d.getDate() - 1);
            } else if (currentView === 'week') {
                d.setDate(d.getDate() - 7);
            } else if (currentView === 'month') {
                d.setMonth(d.getMonth() - 1);
            } else if (currentView === 'custom') {
                // для custom навигация не имеет смысла
                return;
            }
            selectedDate = d.toISOString().split('T')[0];
            renderCalendar();
        });

        document.getElementById('calendarNext').addEventListener('click', function() {
            const d = new Date(selectedDate + 'T00:00:00');
            if (currentView === 'day') {
                d.setDate(d.getDate() + 1);
            } else if (currentView === 'week') {
                d.setDate(d.getDate() + 7);
            } else if (currentView === 'month') {
                d.setMonth(d.getMonth() + 1);
            } else if (currentView === 'custom') {
                return;
            }
            selectedDate = d.toISOString().split('T')[0];
            renderCalendar();
        });

        // Инициализация: вкладка календарь, вид день
        switchTab('calendar');
        currentView = 'day';
        document.querySelector('.view-btn[data-view="day"]').classList.add('active');
        renderCalendar();

        // Заполним левую панель
        renderLeftPanel();

        // Если есть custom контейнер, скрыть
        const customContainer = document.getElementById('customRangeContainer');
        if (customContainer) customContainer.style.display = 'none';
    }

    document.addEventListener('DOMContentLoaded', init);
})();
