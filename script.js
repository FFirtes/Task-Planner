(function() {
    // --- Хранилище задач ---
    let tasks = [];

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ЛОКАЛЬНЫМИ ДАТАМИ ---

    // Преобразует строку "YYYY-MM-DD" в объект Date (локальное время, без UTC)
    function parseLocalDate(dateStr) {
        const parts = dateStr.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    // Форматирует объект Date в строку "YYYY-MM-DD" (локальное время)
    function formatLocalDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Возвращает сегодняшнюю дату в формате "YYYY-MM-DD" (локальное время)
    function getToday() {
        return formatLocalDate(new Date());
    }

    // Форматирует дату в читаемый вид: "2 авг. 2026 г." (локальное время)
    function formatDate(dateStr) {
        const d = parseLocalDate(dateStr);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // Краткий формат: "2 авг."
    function formatDateShort(dateStr) {
        const d = parseLocalDate(dateStr);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    // Возвращает массив из 7 дат (понедельник – воскресенье) для указанной даты (локальное время)
    function getWeekDays(refDate) {
        const d = parseLocalDate(refDate);
        const day = d.getDay(); // 0 - воскресенье
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

    // Возвращает массив всех дней указанного месяца (локальное время)
    function getMonthDays(year, month) {
        const days = [];
        const date = new Date(year, month - 1, 1);
        while (date.getMonth() === month - 1) {
            days.push(formatLocalDate(date));
            date.setDate(date.getDate() + 1);
        }
        return days;
    }

    // Фильтрует задачи по дате (сравнение строк YYYY-MM-DD)
    function getTasksForDate(date) {
        return tasks.filter(t => t.date === date);
    }

    // Фильтрует задачи по диапазону дат
    function getTasksForRange(startDate, endDate) {
        return tasks.filter(t => t.date >= startDate && t.date <= endDate);
    }

    // Формирует строку времени для отображения (если время не указано — "На весь день")
    function getTimeDisplay(task) {
        if (task.startTime && task.endTime) {
            return `${task.startTime} – ${task.endTime}`;
        } else if (task.startTime) {
            return `${task.startTime}`;
        } else {
            return 'На весь день';
        }
    }

    // --- Загрузка и сохранение задач ---
    function loadTasks() {
        const stored = localStorage.getItem('tasks');
        if (stored) {
            try { tasks = JSON.parse(stored); }
            catch (_) { tasks = []; }
        }
        if (tasks.length === 0) {
            const today = getToday();
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

    // --- Рендеринг левой панели (задачи на выбранную дату) ---
    function renderLeftPanelForDate(date) {
        const listContainer = document.getElementById('taskListForDate');
        const titleEl = document.getElementById('selectedDateTitle');
        titleEl.textContent = `Задачи на ${formatDate(date)}`;

        const tasksForDate = getTasksForDate(date);
        listContainer.innerHTML = '';

        if (tasksForDate.length === 0) {
            listContainer.innerHTML = '<li class="task-item" style="justify-content:center; background:transparent; border:none; color:#94a3b8; padding:1rem 0;">Нет задач</li>';
        } else {
            tasksForDate.forEach(task => {
                const li = document.createElement('li');
                li.className = 'task-item' + (task.completed ? ' completed' : '');
                li.dataset.id = task.id;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = task.completed;
                checkbox.className = 'task-checkbox';
                checkbox.addEventListener('change', () => {
                    task.completed = checkbox.checked;
                    saveTasks();
                    renderAll();
                });

                const timeSpan = document.createElement('span');
                timeSpan.className = 'task-time';
                timeSpan.textContent = getTimeDisplay(task);

                const textSpan = document.createElement('span');
                textSpan.className = 'task-text';
                textSpan.textContent = task.text;

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
                li.appendChild(timeSpan);
                li.appendChild(textSpan);
                li.appendChild(deleteBtn);
                listContainer.appendChild(li);
            });
        }

        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        document.getElementById('totalCount').textContent = total;
        document.getElementById('completedCount').textContent = completed;
        document.getElementById('incompleteCount').textContent = total - completed;
    }

    // --- Рендеринг списка всех задач (вид "Все задачи") ---
    function renderAllTasksView(container) {
        container.innerHTML = '';
        if (tasks.length === 0) {
            container.innerHTML = '<p style="color:#94a3b8; padding:1rem;">Нет задач</p>';
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'all-tasks-view';
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
            checkbox.className = 'task-checkbox';
            checkbox.addEventListener('change', () => {
                task.completed = checkbox.checked;
                saveTasks();
                renderAll();
            });

            const timeSpan = document.createElement('span');
            timeSpan.className = 'task-time';
            timeSpan.textContent = getTimeDisplay(task);

            const textSpan = document.createElement('span');
            textSpan.className = 'task-text';
            textSpan.textContent = task.text;

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
            li.appendChild(timeSpan);
            li.appendChild(textSpan);
            li.appendChild(deleteBtn);
            wrapper.appendChild(li);
        });
        container.appendChild(wrapper);
    }

    // --- Календарь ---
    let currentView = 'day';
    let selectedDate = getToday();
    let customStart = getToday();
    let customEnd = getToday();

    function renderCalendar() {
        const container = document.getElementById('calendarView');
        const titleEl = document.getElementById('calendarTitle');
        const controls = document.getElementById('calendarControls');
        const customContainer = document.getElementById('customRangeContainer');

        if (currentView === 'all') {
            controls.style.display = 'none';
            customContainer.style.display = 'none';
            renderAllTasksView(container);
            return;
        } else {
            controls.style.display = 'flex';
        }

        let daysArray = [];

        if (currentView === 'day') {
            daysArray = [selectedDate];
            titleEl.textContent = formatDate(selectedDate);
        } else if (currentView === 'week') {
            const week = getWeekDays(selectedDate);
            daysArray = week;
            titleEl.textContent = `Неделя ${formatDate(week[0])} – ${formatDate(week[6])}`;
        } else if (currentView === 'month') {
            const d = parseLocalDate(selectedDate);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            daysArray = getMonthDays(year, month);
            titleEl.textContent = `${d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`;
        } else if (currentView === 'custom') {
            const start = document.getElementById('customStart').value;
            const end = document.getElementById('customEnd').value;
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
                titleEl.textContent = `${formatDate(start)} – ${formatDate(end)}`;
            } else {
                container.innerHTML = '<p style="color:#94a3b8; padding:1rem;">Выберите даты начала и конца</p>';
                return;
            }
        }

        // Отрисовка календаря
        if (currentView === 'day') {
            container.innerHTML = `<div class="day-view"><h4>${formatDate(selectedDate)}</h4></div>`;
        } else if (currentView === 'week') {
            let html = '<div class="week-view">';
            const todayStr = getToday();
            daysArray.forEach(day => {
                const dayTasks = getTasksForDate(day);
                const hasTasks = dayTasks.length > 0;
                const isToday = day === todayStr;
                const d = parseLocalDate(day);
                const dayNum = d.getDate();
                const dayLabel = d.toLocaleDateString('ru-RU', { weekday: 'short' });
                html += `<div class="week-cell ${hasTasks ? 'has-tasks' : ''} ${isToday ? 'today' : ''}" data-date="${day}">
                            <span class="day-number">${dayNum}</span>
                            <span class="day-label">${dayLabel}</span>
                            <div class="task-indicator">
                                ${hasTasks ? `<span class="task-dot"></span><span class="task-dot"></span>` : ''}
                            </div>
                            <span style="font-size:0.65rem; color:#64748b;">${dayTasks.length} задач</span>
                        </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
            attachDateClickHandlers('.week-cell');
        } else if (currentView === 'month') {
            const d = parseLocalDate(selectedDate);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const firstDay = new Date(year, month - 1, 1).getDay();
            const offset = (firstDay === 0) ? 6 : firstDay - 1;
            let html = '<div class="month-view">';
            const weekDays = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
            weekDays.forEach(wd => {
                html += `<div style="font-weight:600; font-size:0.7rem; color:#64748b; text-align:center;">${wd}</div>`;
            });
            const todayStr = getToday();
            for (let i = 0; i < offset; i++) {
                html += `<div class="month-cell empty"></div>`;
            }
            daysArray.forEach(day => {
                const dayTasks = getTasksForDate(day);
                const hasTasks = dayTasks.length > 0;
                const isToday = day === todayStr;
                const dt = parseLocalDate(day);
                const dayNum = dt.getDate();
                const dayLabel = dt.toLocaleDateString('ru-RU', { weekday: 'short' });
                html += `<div class="month-cell ${hasTasks ? 'has-tasks' : ''} ${isToday ? 'today' : ''}" data-date="${day}">
                            <span class="day-number">${dayNum}</span>
                            <span class="day-label">${dayLabel}</span>
                            <div class="task-indicator">
                                ${hasTasks ? `<span class="task-dot"></span><span class="task-dot"></span>` : ''}
                            </div>
                            <span style="font-size:0.65rem; color:#64748b;">${dayTasks.length} задач</span>
                        </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
            attachDateClickHandlers('.month-cell:not(.empty)');
        } else if (currentView === 'custom') {
            let html = '<div class="custom-view">';
            const todayStr = getToday();
            daysArray.forEach(day => {
                const dayTasks = getTasksForDate(day);
                const hasTasks = dayTasks.length > 0;
                const isToday = day === todayStr;
                const dt = parseLocalDate(day);
                const dayNum = dt.getDate();
                const dayLabel = dt.toLocaleDateString('ru-RU', { weekday: 'short' });
                html += `<div class="custom-cell ${hasTasks ? 'has-tasks' : ''} ${isToday ? 'today' : ''}" data-date="${day}">
                            <span class="day-number">${dayNum}</span>
                            <span class="day-label">${dayLabel}</span>
                            <div class="task-indicator">
                                ${hasTasks ? `<span class="task-dot"></span><span class="task-dot"></span>` : ''}
                            </div>
                            <span style="font-size:0.65rem; color:#64748b;">${dayTasks.length} задач</span>
                        </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
            attachDateClickHandlers('.custom-cell');
        }

        renderLeftPanelForDate(selectedDate);
    }

    // Универсальный обработчик кликов по ячейкам с датами
    function attachDateClickHandlers(selector) {
        document.querySelectorAll(selector).forEach(el => {
            el.addEventListener('click', function() {
                const date = this.dataset.date;
                if (date) {
                    selectedDate = date;
                    document.querySelectorAll(selector).forEach(c => c.style.outline = 'none');
                    this.style.outline = '2px solid #3b82f6';
                    if (currentView !== 'all') {
                        renderAll();
                    } else {
                        renderLeftPanelForDate(selectedDate);
                    }
                }
            });
        });
    }

    // --- Вкладки ---
    function switchTab(tabId) {
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('tab-' + tabId).classList.add('active');
        document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');

        if (tabId === 'archive') renderArchive();
        if (tabId === 'stats') renderStats();
        if (tabId === 'calendar') renderCalendar();
    }

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
                li.innerHTML = `<span class="task-time">${getTimeDisplay(t)}</span>
                                <span class="task-text">${t.text}</span>
                                <span style="color:green; margin-left:auto;">✅</span>`;
                archiveList.appendChild(li);
            });
        }
    }

    function renderStats() {
        const container = document.getElementById('statsDetail');
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const incomplete = total - completed;
        const today = getToday();
        const todayTasks = getTasksForDate(today);
        const todayCompleted = todayTasks.filter(t => t.completed).length;
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

    // Главная функция обновления
    function renderAll() {
        renderLeftPanelForDate(selectedDate);
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
            const tabId = activeTab.dataset.tab;
            if (tabId === 'calendar') renderCalendar();
            else if (tabId === 'archive') renderArchive();
            else if (tabId === 'stats') renderStats();
        }
    }

    // --- Инициализация ---
    function init() {
        loadTasks();
        document.getElementById('taskDate').value = getToday();

        // ---- ВАЛИДАЦИЯ ВРЕМЕНИ ПРИ ДОБАВЛЕНИИ ЗАДАЧИ ----
        const startTimeInput = document.getElementById('startTime');
        const endTimeInput = document.getElementById('endTime');

        startTimeInput.addEventListener('input', function() {
            this.setCustomValidity('');
        });
        endTimeInput.addEventListener('input', function() {
            document.getElementById('startTime').setCustomValidity('');
        });

        document.getElementById('taskForm').addEventListener('submit', function(e) {
            e.preventDefault();

            const input = document.getElementById('taskInput');
            const text = input.value.trim();
            if (!text) {
                input.setCustomValidity('Введите текст задачи');
                input.reportValidity();
                return;
            } else {
                input.setCustomValidity('');
            }

            const startVal = startTimeInput.value;
            const endVal = endTimeInput.value;
            if (startVal && endVal && startVal > endVal) {
                startTimeInput.setCustomValidity('Время начала не может быть позже времени окончания');
                startTimeInput.reportValidity();
                return;
            } else {
                startTimeInput.setCustomValidity('');
            }

            const date = document.getElementById('taskDate').value || getToday();
            const newTask = {
                id: Date.now() + Math.random().toString(36).slice(2, 6),
                text: text,
                completed: false,
                date: date,
                startTime: startVal || '',
                endTime: endVal || ''
            };
            tasks.push(newTask);
            saveTasks();
            input.value = '';
            renderAll();
            if (document.querySelector('.tab-btn.active')?.dataset.tab === 'calendar') {
                renderCalendar();
            }
        });

        // ---- ВАЛИДАЦИЯ ДИАПАЗОНА "СВОЙ ПРОМЕЖУТОК" (максимум 31 день) ----
        const customStartInput = document.getElementById('customStart');
        const customEndInput = document.getElementById('customEnd');

        customStartInput.addEventListener('input', function() {
            customEndInput.setCustomValidity('');
        });
        customEndInput.addEventListener('input', function() {
            this.setCustomValidity('');
        });

        document.getElementById('applyCustomRange').addEventListener('click', function() {
            customStartInput.setCustomValidity('');
            customEndInput.setCustomValidity('');

            const start = customStartInput.value;
            const end = customEndInput.value;

            if (!start || !end) {
                customEndInput.setCustomValidity('Выберите обе даты');
                customEndInput.reportValidity();
                return;
            }
            if (start > end) {
                customEndInput.setCustomValidity('Дата начала не может быть позже даты конца');
                customEndInput.reportValidity();
                return;
            }

            const diffTime = Math.abs(parseLocalDate(end) - parseLocalDate(start));
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            // Лимит: не более 31 календарного дня 
            if (diffDays > 30) {
                customEndInput.setCustomValidity('Диапазон не должен превышать 31 день');
                customEndInput.reportValidity();
                return;
            }

            customStart = start;
            customEnd = end;
            renderCalendar();
        });

        // Переключение вкладок
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                switchTab(this.dataset.tab);
            });
        });

        // Переключение видов календаря
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentView = this.dataset.view;
                const customContainer = document.getElementById('customRangeContainer');
                if (currentView === 'custom') {
                    customContainer.style.display = 'flex';
                    customStartInput.value = customStart;
                    customEndInput.value = customEnd;
                } else {
                    customContainer.style.display = 'none';
                }
                const controls = document.getElementById('calendarControls');
                controls.style.display = (currentView === 'all') ? 'none' : 'flex';
                renderCalendar();
            });
        });

        // Навигация календаря
        document.getElementById('calendarPrev').addEventListener('click', function() {
            if (currentView === 'all') return;
            const d = parseLocalDate(selectedDate);
            if (currentView === 'day') d.setDate(d.getDate() - 1);
            else if (currentView === 'week') d.setDate(d.getDate() - 7);
            else if (currentView === 'month') d.setMonth(d.getMonth() - 1);
            else return;
            selectedDate = formatLocalDate(d);
            renderAll();
        });

        document.getElementById('calendarNext').addEventListener('click', function() {
            if (currentView === 'all') return;
            const d = parseLocalDate(selectedDate);
            if (currentView === 'day') d.setDate(d.getDate() + 1);
            else if (currentView === 'week') d.setDate(d.getDate() + 7);
            else if (currentView === 'month') d.setMonth(d.getMonth() + 1);
            else return;
            selectedDate = formatLocalDate(d);
            renderAll();
        });

        // Старт
        switchTab('calendar');
        currentView = 'day';
        document.querySelector('.view-btn[data-view="day"]').classList.add('active');
        document.getElementById('customRangeContainer').style.display = 'none';
        renderAll();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
