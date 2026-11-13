const state = {
  lists: [],
  tasks: [],
  currentView: 'inbox',
  selectedTaskId: null,
  searchQuery: '',
  sortBy: 'priority',
  pomo: {
    minutes: 25,
    secondsLeft: 25 * 60,
    running: false,
    interval: null,
    activeTaskId: null
  }
};

// Web Audio API subtle chime for task completion & Pomodoro finish
function playChime(type = 'check') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'check') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    }
  } catch (e) {}
}

// API Helpers
async function fetchInitialData() {
  const [listsRes, tasksRes] = await Promise.all([
    fetch('/api/lists'),
    fetch('/api/tasks')
  ]);
  state.lists = await listsRes.json();
  state.tasks = await tasksRes.json();
  renderAll();
}

async function createTask(payload) {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const created = await res.json();
  state.tasks.unshift(created);
  state.selectedTaskId = created.id;
  renderAll();
}

async function updateTask(id, updates) {
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;
  state.tasks[idx] = { ...state.tasks[idx], ...updates };
  renderAll();

  await fetch(`/api/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
}

async function permanentlyDeleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  if (state.selectedTaskId === id) state.selectedTaskId = null;
  renderAll();
  await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
}

// Date Utilities
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function isWithinNext7Days(dateStr) {
  if (!dateStr) return false;
  const today = new Date(getTodayStr());
  const target = new Date(dateStr);
  const diffDays = (target - today) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 7;
}

// Filtering & Sorting
function getFilteredTasks() {
  const today = getTodayStr();
  let filtered = state.tasks.filter((t) => {
    if (state.currentView === 'trash') return t.deleted;
    if (t.deleted) return false;

    if (state.currentView === 'completed') return t.completed;
    if (t.completed) return false;

    if (state.currentView === 'inbox') return !t.list_id;
    if (state.currentView === 'today') return t.due_date === today;
    if (state.currentView === 'next7') return isWithinNext7Days(t.due_date);
    if (state.currentView === 'all') return true;

    // Custom course list ID
    return t.list_id === state.currentView;
  });

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.notes && t.notes.toLowerCase().includes(q))
    );
  }

  filtered.sort((a, b) => {
    if (state.sortBy === 'priority') return b.priority - a.priority;
    if (state.sortBy === 'dueDate') {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    return 0;
  });

  return filtered;
}

// Render Functions
function renderAll() {
  renderSidebar();
  renderTaskList();
  renderDetailPane();
}

function renderSidebar() {
  const today = getTodayStr();
  const activeTasks = state.tasks.filter((t) => !t.deleted && !t.completed);
  const completedTasks = state.tasks.filter((t) => !t.deleted && t.completed);
  const trashTasks = state.tasks.filter((t) => t.deleted);

  document.getElementById('count-inbox').textContent = activeTasks.filter((t) => !t.list_id).length;
  document.getElementById('count-today').textContent = activeTasks.filter((t) => t.due_date === today).length;
  document.getElementById('count-next7').textContent = activeTasks.filter((t) => isWithinNext7Days(t.due_date)).length;
  document.getElementById('count-all').textContent = activeTasks.length;
  document.getElementById('count-completed').textContent = completedTasks.length;
  document.getElementById('count-trash').textContent = trashTasks.length;

  // Comeback Progress Meter
  const totalNonDeleted = activeTasks.length + completedTasks.length;
  const pct = totalNonDeleted === 0 ? 0 : Math.round((completedTasks.length / totalNonDeleted) * 100);
  document.getElementById('comebackPercent').textContent = `${pct}%`;
  document.getElementById('comebackBar').style.width = `${pct}%`;
  document.getElementById('comebackStats').textContent = `${completedTasks.length} / ${totalNonDeleted} tasks conquered`;

  // Render custom course lists
  const listsContainer = document.getElementById('customListsContainer');
  listsContainer.innerHTML = '';

  state.lists.forEach((list) => {
    const count = activeTasks.filter((t) => t.list_id === list.id).length;
    const btn = document.createElement('button');
    btn.className = `nav-item ${state.currentView === list.id ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="list-dot" style="background:${list.color}"></span>
      <span class="nav-title">${list.icon} ${escapeHtml(list.name)}</span>
      <span class="badge">${count}</span>
      <span class="delete-list-btn" title="Delete List">✕</span>
    `;
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-list-btn')) {
        e.stopPropagation();
        deleteCustomList(list.id);
        return;
      }
      setView(list.id, `${list.icon} ${list.name}`);
    });
    listsContainer.appendChild(btn);
  });

  // Update list dropdowns
  const optionsHtml =
    `<option value="">📥 Inbox</option>` +
    state.lists.map((l) => `<option value="${l.id}">${l.icon} ${escapeHtml(l.name)}</option>`).join('');

  document.getElementById('quickListInput').innerHTML = optionsHtml;
  const detailListSelect = document.getElementById('detailListId');
  const currentDetailVal = detailListSelect.value;
  detailListSelect.innerHTML = optionsHtml;
  detailListSelect.value = currentDetailVal;
}

function renderTaskList() {
  const container = document.getElementById('taskListContainer');
  const tasks = getFilteredTasks();
  const today = getTodayStr();

  if (tasks.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:48px 16px; color:var(--text-muted);">
        <div style="font-size:32px; margin-bottom:8px;">✨</div>
        <p>No tasks here. Add a task above or enjoy the calm!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  tasks.forEach((task) => {
    const listObj = state.lists.find((l) => l.id === task.list_id);
    const doneSubtasks = (task.subtasks || []).filter((s) => s.done).length;
    const totalSubtasks = (task.subtasks || []).length;
    const isOverdue = task.due_date && task.due_date < today && !task.completed;

    const row = document.createElement('div');
    row.className = `task-row ${task.completed ? 'completed' : ''} ${
      state.selectedTaskId === task.id ? 'selected' : ''
    }`;

    row.innerHTML = `
      <div class="priority-check p-${task.priority}" title="Toggle Complete">
        ${task.completed ? '✓' : ''}
      </div>
      <div class="task-main">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-submeta">
          ${listObj ? `<span class="tag-pill" style="color:${listObj.color}">${listObj.icon} ${escapeHtml(listObj.name)}</span>` : ''}
          ${task.due_date ? `<span class="${isOverdue ? 'overdue' : ''}">📅 ${task.due_date}</span>` : ''}
          ${totalSubtasks > 0 ? `<span>☑️ ${doneSubtasks}/${totalSubtasks}</span>` : ''}
          ${task.pomodoros_completed > 0 ? `<span>🍅 ${task.pomodoros_completed}</span>` : ''}
        </div>
      </div>
    `;

    row.querySelector('.priority-check').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!task.completed) playChime('check');
      updateTask(task.id, { completed: !task.completed });
    });

    row.addEventListener('click', () => {
      state.selectedTaskId = task.id;
      renderTaskList();
      renderDetailPane();
    });

    container.appendChild(row);
  });
}

function renderDetailPane() {
  const emptyState = document.getElementById('emptyDetailState');
  const editor = document.getElementById('detailEditor');
  const task = state.tasks.find((t) => t.id === state.selectedTaskId);

  if (!task) {
    emptyState.classList.remove('hidden');
    editor.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  editor.classList.remove('hidden');

  document.getElementById('detailCompleted').checked = task.completed;
  document.getElementById('detailTitle').value = task.title;
  document.getElementById('detailDueDate').value = task.due_date || '';
  document.getElementById('detailPriority').value = String(task.priority || 0);
  document.getElementById('detailListId').value = task.list_id || '';
  document.getElementById('detailNotes').value = task.notes || '';
  document.getElementById('detailPomoCount').textContent = `${task.pomodoros_completed || 0} / ${task.pomodoros_target || 1}`;

  // Subtasks
  const subtasksContainer = document.getElementById('subtasksList');
  subtasksContainer.innerHTML = '';
  (task.subtasks || []).forEach((sub, index) => {
    const item = document.createElement('div');
    item.className = `subtask-item ${sub.done ? 'done' : ''}`;
    item.innerHTML = `
      <input type="checkbox" ${sub.done ? 'checked' : ''} />
      <span>${escapeHtml(sub.title)}</span>
      <button type="button" class="icon-btn small" title="Remove">✕</button>
    `;
    item.querySelector('input').addEventListener('change', (e) => {
      const updatedSubs = [...task.subtasks];
      updatedSubs[index].done = e.target.checked;
      updateTask(task.id, { subtasks: updatedSubs });
    });
    item.querySelector('button').addEventListener('click', () => {
      const updatedSubs = task.subtasks.filter((_, i) => i !== index);
      updateTask(task.id, { subtasks: updatedSubs });
    });
    subtasksContainer.appendChild(item);
  });
}

// View Switching
function setView(viewId, titleText) {
  state.currentView = viewId;
  document.getElementById('currentViewTitle').textContent = titleText;

  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === viewId);
  });

  // Auto-select custom list in quick-add dropdown
  const isCustomList = state.lists.some((l) => l.id === viewId);
  document.getElementById('quickListInput').value = isCustomList ? viewId : '';

  document.getElementById('sidebar').classList.remove('open');
  renderAll();
}

async function deleteCustomList(id) {
  await fetch(`/api/lists/${id}`, { method: 'DELETE' });
  state.lists = state.lists.filter((l) => l.id !== id);
  state.tasks.forEach((t) => {
    if (t.list_id === id) t.list_id = null;
  });
  if (state.currentView === id) setView('inbox', 'Inbox');
  else renderAll();
}

// Pomodoro Timer Logic
function updatePomoDisplay() {
  const mins = String(Math.floor(state.pomo.secondsLeft / 60)).padStart(2, '0');
  const secs = String(state.pomo.secondsLeft % 60).padStart(2, '0');
  document.getElementById('pomoDisplay').textContent = `${mins}:${secs}`;
}

function togglePomo() {
  const btn = document.getElementById('pomoStartBtn');
  if (state.pomo.running) {
    clearInterval(state.pomo.interval);
    state.pomo.running = false;
    btn.textContent = 'Resume';
  } else {
    state.pomo.running = true;
    btn.textContent = 'Pause';
    state.pomo.interval = setInterval(() => {
      if (state.pomo.secondsLeft > 0) {
        state.pomo.secondsLeft--;
        updatePomoDisplay();
      } else {
        clearInterval(state.pomo.interval);
        state.pomo.running = false;
        btn.textContent = 'Start Focus';
        playChime('pomo');
        if (state.pomo.activeTaskId && state.pomo.minutes === 25) {
          const task = state.tasks.find((t) => t.id === state.pomo.activeTaskId);
          if (task) {
            updateTask(task.id, { pomodoros_completed: (task.pomodoros_completed || 0) + 1 });
          }
        }
        state.pomo.secondsLeft = state.pomo.minutes * 60;
        updatePomoDisplay();
      }
    }, 1000);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  fetchInitialData();

  // Smart view clicks
  const viewNames = {
    inbox: '📥 Inbox',
    today: '📅 Today',
    next7: '🗓️ Next 7 Days',
    all: '📋 All Tasks',
    completed: '✅ Completed',
    trash: '🗑️ Trash'
  };

  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      setView(v, viewNames[v] || v);
    });
  });

  // Quick Add Task
  document.getElementById('quickAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('quickTitleInput');
    const title = titleInput.value.trim();
    if (!title) return;

    const due_date =
      document.getElementById('quickDateInput').value ||
      (state.currentView === 'today' ? getTodayStr() : '');

    createTask({
      title,
      due_date,
      priority: Number(document.getElementById('quickPriorityInput').value),
      list_id: document.getElementById('quickListInput').value || null
    });

    titleInput.value = '';
  });

  // Search & Sort
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderTaskList();
  });

  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderTaskList();
  });

  // Detail Pane Live Editing
  document.getElementById('detailCompleted').addEventListener('change', (e) => {
    if (!state.selectedTaskId) return;
    if (e.target.checked) playChime('check');
    updateTask(state.selectedTaskId, { completed: e.target.checked });
  });

  document.getElementById('detailTitle').addEventListener('change', (e) => {
    if (state.selectedTaskId && e.target.value.trim()) {
      updateTask(state.selectedTaskId, { title: e.target.value.trim() });
    }
  });

  document.getElementById('detailDueDate').addEventListener('change', (e) => {
    if (state.selectedTaskId) updateTask(state.selectedTaskId, { due_date: e.target.value });
  });

  document.getElementById('detailPriority').addEventListener('change', (e) => {
    if (state.selectedTaskId) updateTask(state.selectedTaskId, { priority: Number(e.target.value) });
  });

  document.getElementById('detailListId').addEventListener('change', (e) => {
    if (state.selectedTaskId) updateTask(state.selectedTaskId, { list_id: e.target.value || null });
  });

  document.getElementById('detailNotes').addEventListener('blur', (e) => {
    if (state.selectedTaskId) updateTask(state.selectedTaskId, { notes: e.target.value });
  });

  document.getElementById('addSubtaskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('newSubtaskInput');
    const text = input.value.trim();
    if (!text || !state.selectedTaskId) return;
    const task = state.tasks.find((t) => t.id === state.selectedTaskId);
    const updatedSubs = [...(task.subtasks || []), { id: Date.now().toString(), title: text, done: false }];
    updateTask(task.id, { subtasks: updatedSubs });
    input.value = '';
  });

  document.getElementById('deleteTaskBtn').addEventListener('click', () => {
    if (!state.selectedTaskId) return;
    const task = state.tasks.find((t) => t.id === state.selectedTaskId);
    if (task.deleted) {
      permanentlyDeleteTask(task.id);
    } else {
      updateTask(task.id, { deleted: true });
      state.selectedTaskId = null;
      renderDetailPane();
    }
  });

  document.getElementById('focusThisTaskBtn').addEventListener('click', () => {
    if (!state.selectedTaskId) return;
    const task = state.tasks.find((t) => t.id === state.selectedTaskId);
    state.pomo.activeTaskId = task.id;
    document.getElementById('pomoTaskLabel').textContent = `Focusing: ${task.title}`;
    if (!state.pomo.running) togglePomo();
  });

  // Pomodoro Controls
  document.getElementById('pomoStartBtn').addEventListener('click', togglePomo);
  document.getElementById('pomoResetBtn').addEventListener('click', () => {
    clearInterval(state.pomo.interval);
    state.pomo.running = false;
    state.pomo.secondsLeft = state.pomo.minutes * 60;
    document.getElementById('pomoStartBtn').textContent = 'Start Focus';
    updatePomoDisplay();
  });

  document.querySelectorAll('.pomo-mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pomo-mode').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      clearInterval(state.pomo.interval);
      state.pomo.running = false;
      state.pomo.minutes = Number(btn.dataset.minutes);
      state.pomo.secondsLeft = state.pomo.minutes * 60;
      document.getElementById('pomoStartBtn').textContent = 'Start Focus';
      updatePomoDisplay();
    });
  });

  // Add List Modal
  const modal = document.getElementById('addListModal');
  document.getElementById('openAddListBtn').addEventListener('click', () => modal.classList.remove('hidden'));
  document.getElementById('cancelAddListBtn').addEventListener('click', () => modal.classList.add('hidden'));

  document.getElementById('addListForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newListName').value.trim();
    const icon = document.getElementById('newListIcon').value;
    const color = document.getElementById('newListColor').value;
    if (!name) return;

    const res = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, icon, color })
    });
    const newList = await res.json();
    state.lists.push(newList);
    document.getElementById('newListName').value = '';
    modal.classList.add('hidden');
    renderSidebar();
  });

  // Theme & Mobile Menu
  document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
  });

  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
});
