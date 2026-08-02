// script.js — вся логика приложения

document.addEventListener('DOMContentLoaded', () => {
    // Элементы DOM
    const taskForm = document.getElementById('taskForm');
    const taskInput = document.getElementById('taskInput');
    const taskList = document.getElementById('taskList');
    const totalSpan = document.getElementById('totalCount');
    const completedSpan = document.getElementById('completedCount');
    const incompleteSpan = document.getElementById('incompleteCount');

    // Массив задач (каждая задача — объект { id, text, completed })
    let tasks = [];

    // Загружаем задачи из localStorage, если есть
    const savedTasks = localStorage.getItem('tasks');
    if (savedTasks) {
        try {
            tasks = JSON.parse(savedTasks);
        } catch (_) {
            tasks = [];
        }
    }

    // Функция обновления статистики и сохранения
    function updateStatsAndSave() {
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const incomplete = total - completed;

        totalSpan.textContent = total;
        completedSpan.textContent = completed;
        incompleteSpan.textContent = incomplete;

        // Сохраняем в localStorage
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    // Функция рендеринга списка
    function renderTasks() {
        taskList.innerHTML = ''; // очищаем

        if (tasks.length === 0) {
            const emptyMsg = document.createElement('li');
            emptyMsg.className = 'task-item';
            emptyMsg.style.background = 'transparent';
            emptyMsg.style.border = 'none';
            emptyMsg.style.color = '#94a3b8';
            emptyMsg.style.justifyContent = 'center';
            emptyMsg.style.padding = '1.5rem 0';
            emptyMsg.textContent = 'Задач пока нет. Добавьте первую!';
            taskList.appendChild(emptyMsg);
            updateStatsAndSave();
            return;
        }

        // Сортируем: невыполненные сверху, выполненные снизу (для удобства)
        const sorted = [...tasks].sort((a, b) => {
            if (a.completed === b.completed) return 0;
            return a.completed ? 1 : -1;
        });

        sorted.forEach(task => {
            const li = document.createElement('li');
            li.className = 'task-item';
            if (task.completed) {
                li.classList.add('completed');
            }
            li.dataset.id = task.id;

            // Чекбокс
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = task.completed;
            checkbox.addEventListener('change', () => {
                task.completed = checkbox.checked;
                li.classList.toggle('completed', task.completed);
                updateStatsAndSave();
            });

            // Текст задачи
            const textSpan = document.createElement('span');
            textSpan.className = 'task-text';
            textSpan.textContent = task.text;

            // Кнопка удаления
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '✕';
            deleteBtn.setAttribute('aria-label', 'Удалить задачу');
            deleteBtn.addEventListener('click', () => {
                tasks = tasks.filter(t => t.id !== task.id);
                renderTasks(); // полный перерендер
            });

            li.appendChild(checkbox);
            li.appendChild(textSpan);
            li.appendChild(deleteBtn);
            taskList.appendChild(li);
        });

        updateStatsAndSave();
    }

    // Обработчик добавления задачи
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = taskInput.value.trim();
        if (text === '') {
            taskInput.focus();
            return;
        }

        const newTask = {
            id: Date.now() + Math.random().toString(36).slice(2, 6),
            text: text,
            completed: false
        };

        tasks.push(newTask);
        taskInput.value = '';
        taskInput.focus();
        renderTasks();
    });

    // Первоначальный рендер
    renderTasks();
});