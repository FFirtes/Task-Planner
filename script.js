// script.js — вся логика приложения
(function() {
    let tasks = [];

    // --- Работа с датами (локальное время) ---
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

    function getTasksForDate(date) {
        return tasks.filter(t => t.date === date);
    }

    function getTasksForRange(startDate, endDate) {
        return tasks.filter(t => t.date >= startDate && t.date <= endDate);
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

    // --- Загрузка / сохранение ---
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

    // --- Создание элемента задачи с поддержкой редактирования времени и текста ---
    function createTaskElement(task, onUpdate) {
        const li = document.createElement('li');
        li.className = 'task-item' + (task.completed ? ' completed' : '');
        li.dataset.id = task.id;

        // Чекбокс
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.className = 'task-checkbox';
        checkbox.addEventListener('change', () => {
            task.completed = checkbox.checked;
            saveTasks();
            if (onUpdate) onUpdate();
        });

        // Статическое время
        const timeSpan = document.createElement('span');
        timeSpan.className = 'task-time';
        timeSpan.textContent = getTimeDisplay(task);

        // Поля редактирования времени
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

        // Текст задачи
        const textSpan = document.createElement('span');
        textSpan.className = 'task-text';
        textSpan.textContent = task.text;

        // Кнопка редактирования
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.innerHTML = '✎';
        editBtn.setAttribute('aria-label', 'Редактировать задачу');
        editBtn.title = 'Редактировать';

        // Кнопка удаления
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '✕';
        deleteBtn.setAttribute('aria-label', 'Удалить задачу');
        deleteBtn.addEventListener('click', () => {
            tasks = tasks.filter(t => t.id !== task.id);
            saveTasks();
            if (onUpdate) onUpdate();
        });

        // --- Логика редактирования ---
        let isEditing = false;
        let originalText = task.text;
        let originalStart = task.startTime || '';
        let originalEnd = task.endTime || '';

        // Функция обновления данных задачи без завершения режима
        function updateData() {
            const newText = textSpan.textContent.trim();
            if (newText === '') {
                // Если текст пустой, отменяем
                cancelEdit();
                return;
            }
            const newStart = startInput.value;
            const newEnd = endInput.value;
            if (newStart && newEnd && newStart > newEnd) {
                alert('Время начала не может быть позже времени окончания');
                return false;
            }
            task.text = newText;
            task.startTime = newStart || '';
            task.endTime = newEnd || '';
            saveTasks();
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
        }

        // Обработчики событий для кнопки редактирования
        editBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (isEditing) {
                saveEdit();
            } else {
                startEditing();
            }
        });

        // Обработчики для текста
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
                // Если фокус переходит на одно из полей времени, не завершаем редактирование
                const related = e.relatedTarget;
                if (related === startInput || related === endInput) {
                    // Просто обновляем данные, не завершая
                    updateData();
                    return;
                }
                // Иначе сохраняем и завершаем
                saveEdit();
            }
        });

        textSpan.addEventListener('click', function(e) {
            if (isEditing) e.stopPropagation();
        });

        // Обработчики для полей времени
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

        // Сборка элемента: чекбокс, статическое время, поля времени (скрыты), текст, карандаш, крестик
        li.appendChild(checkbox);
        li.appendChild(timeSpan);
        li.appendChild(startInput);
        li.appendChild(separator);
        li.appendChild(endInput);
        li.appendChild(textSpan);
        li.appendChild(editBtn);
        li.appendChild(deleteBtn);

        return li;
    }

    // --- Рендеринг задач для выбранной даты ---
    function renderTasksForDate(date) {
        const listContainer = document.getElementById('tasksForDateList');
        const titleEl = document.getElementById('tasksForDateTitle');
        titleEl.textContent = `Задачи на ${formatDate(date)}`;

        const tasksForDate = getTasksForDate(date);
        tasksForDate.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
            return 0;
        });

        listContainer.innerHTML = '';
        if (tasksForDate.length === 0) {
            listContainer.innerHTML = '<li class="task-item" style="justify-content:center; background:transparent; border:none; color:#94a3b8; padding:1rem 0;">Нет задач</li>';
        } else {
            tasksForDate.forEach(task => {
                const li = createTaskElement(task, () => {
                    renderTasksForDate(date);
                    const activeTab = document.querySelector('.tab-btn.active');
                    if (activeTab && activeTab.dataset.tab === 'calendar') {
                        renderCalendar();
                    }
                });
                listContainer.appendChild(li);
            });
        }
    }

    // --- Рендеринг списка всех задач ---
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
            const li = createTaskElement(task, () => {
                renderAllTasksView(container);
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab && activeTab.dataset.tab === 'calendar') {
                    renderCalendar();
                }
            });
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

        if (currentView === 'day') {
            container.innerHTML = '';
        } else {
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
        }

        renderTasksForDate(selectedDate);
    }

    function attachDateClickHandlers(selector) {
        document.querySelectorAll(selector).forEach(el => {
            el.addEventListener('click', function() {
                const date = this.dataset.date;
                if (date) {
                    selectedDate = date;
                    document.querySelectorAll(selector).forEach(c => c.style.outline = 'none');
                    this.style.outline = '2px solid #3b82f6';
                    renderAll();
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
            completedTasks.forEach(task => {
                const li = createTaskElement(task, () => {
                    renderArchive();
                    const activeTab = document.querySelector('.tab-btn.active');
                    if (activeTab && activeTab.dataset.tab === 'calendar') {
                        renderCalendar();
                    }
                });
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

    function renderAll() {
        renderTasksForDate(selectedDate);
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

        // Валидация времени при добавлении
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
        });

        // Валидация custom диапазона
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

        // Переключение видов
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

        // Навигация
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
