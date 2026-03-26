let todos = [];
let folders = [];
let currentFolderId = null;
let dragSrcId = null;
let currentTodoId = null;
let saveTimeout = null;

// ── Sound ─────────────────────────────────────────────────────────────────────
function playTing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1108, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.7);
  } catch (e) {}
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const THEMES = ['semi', 'clear', 'frosted'];
let themeIdx = parseInt(localStorage.getItem('todoTheme') || '0');

function applyTheme() {
  THEMES.forEach(t => document.body.classList.remove('theme-' + t));
  document.body.classList.add('theme-' + THEMES[themeIdx]);
  const labels = { semi: 'Semi', clear: 'Clear', frosted: 'Frosted' };
  const btn = document.getElementById('btn-theme');
  if (btn) btn.title = 'Theme: ' + labels[THEMES[themeIdx]];
}

function cycleTheme() {
  themeIdx = (themeIdx + 1) % THEMES.length;
  localStorage.setItem('todoTheme', themeIdx);
  applyTheme();
}

// ── Background slider ─────────────────────────────────────────────────────────
function startBgSlider() {
  const slides = document.querySelectorAll('.bg-slide');
  if (!slides.length) return;
  let current = 0;
  setInterval(() => {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, 10000);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const me = await fetch('/api/me').then(r => r.json());
  if (!me.loggedIn) { window.location.href = '/'; return; }

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  applyTheme();
  document.getElementById('btn-theme').addEventListener('click', cycleTheme);
  startBgSlider();
  await loadFolders();
  await loadTodos();
  setupDetailEvents();

  // Add folder button
  document.getElementById('btn-add-folder').addEventListener('click', async () => {
    const name = prompt('Tên folder mới:');
    if (!name || !name.trim()) return;
    await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    await loadFolders();
  });
}

async function loadFolders() {
  const result = await fetch('/api/folders').then(r => r.json());
  folders = Array.isArray(result) ? result : [];
  renderSidebar();
}

async function loadTodos() {
  const url = currentFolderId ? `/api/todos?folderId=${currentFolderId}` : '/api/todos';
  todos = await fetch(url).then(r => r.json());
  render();
  scheduleReminders(todos);
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('folder-list');
  list.innerHTML = '';

  // "All" entry
  const allLi = document.createElement('li');
  allLi.className = 'folder-item' + (currentFolderId === null ? ' active' : '');
  allLi.innerHTML = `<span class="folder-icon">📋</span><span class="folder-name">Tất cả</span>`;
  allLi.addEventListener('click', () => selectFolder(null, 'Tất cả'));
  list.appendChild(allLi);

  // Folder entries
  folders.forEach(folder => {
    const li = document.createElement('li');
    li.className = 'folder-item' + (currentFolderId === folder.id ? ' active' : '');
    li.dataset.id = folder.id;
    li.innerHTML = `
      <span class="folder-icon">📁</span>
      <span class="folder-name">${escapeHtml(folder.name)}</span>
      <input class="folder-rename-input hidden" value="${escapeHtml(folder.name)}" />
      <div class="folder-actions">
        <button class="folder-edit-btn" title="Đổi tên">✏</button>
        <button class="folder-delete-btn" title="Xóa">✕</button>
      </div>
    `;

    li.querySelector('.folder-name').addEventListener('click', (e) => {
      e.stopPropagation();
      selectFolder(folder.id, folder.name);
    });
    li.querySelector('.folder-icon').addEventListener('click', () => selectFolder(folder.id, folder.name));

    // Rename
    const nameEl = li.querySelector('.folder-name');
    const input = li.querySelector('.folder-rename-input');
    const editBtn = li.querySelector('.folder-edit-btn');
    let editing = false;

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!editing) {
        editing = true;
        nameEl.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
        input.select();
        editBtn.textContent = '✓';
      } else {
        saveRename(folder.id, input, nameEl, editBtn);
        editing = false;
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { saveRename(folder.id, input, nameEl, editBtn); editing = false; }
      if (e.key === 'Escape') {
        input.value = folder.name;
        nameEl.classList.remove('hidden');
        input.classList.add('hidden');
        editBtn.textContent = '✏';
        editing = false;
      }
    });

    // Delete
    li.querySelector('.folder-delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Xóa folder "${folder.name}"? Các tasks bên trong sẽ không bị xóa.`)) return;
      await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' });
      if (currentFolderId === folder.id) selectFolder(null, 'Tất cả');
      await loadFolders();
    });

    list.appendChild(li);
  });
}

async function saveRename(id, input, nameEl, editBtn) {
  const newName = input.value.trim();
  if (!newName) return;
  const res = await fetch(`/api/folders/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName })
  });
  const updated = await res.json();
  // Update title if this folder is selected
  if (currentFolderId === id) {
    document.getElementById('current-folder-title').textContent = '📁 ' + updated.name;
  }
  nameEl.textContent = updated.name;
  nameEl.classList.remove('hidden');
  input.classList.add('hidden');
  editBtn.textContent = '✏';
  await loadFolders();
}

function selectFolder(folderId, folderName) {
  currentFolderId = folderId;
  const titleEl = document.getElementById('current-folder-title');
  titleEl.textContent = folderId ? '📁 ' + folderName : '📋 Todo';

  renderSidebar();

  // Slide-in animation
  const main = document.getElementById('main-content');
  main.classList.remove('slide-in');
  void main.offsetWidth; // force reflow
  main.classList.add('slide-in');

  loadTodos();
}

// ── Reminders ─────────────────────────────────────────────────────────────────
function scheduleReminders(todoList) {
  todoList.forEach(todo => {
    if (!todo.reminderAt || todo.completed) return;
    const delay = new Date(todo.reminderAt).getTime() - Date.now();
    if (delay > 0 && delay < 8 * 60 * 60 * 1000) {
      setTimeout(() => {
        if (Notification.permission === 'granted') {
          new Notification(`⏰ ${todo.title}`, {
            body: todo.dueDate ? `Deadline: ${formatDate(todo.dueDate)}` : 'Bạn có việc cần làm!'
          });
        }
      }, delay);
    }
  });
}

// ── Render list ───────────────────────────────────────────────────────────────
function isOverdue(todo) {
  if (!todo.dueDate || todo.completed) return false;
  return todo.dueDate < new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function makeTodoItem(todo, isDone) {
  const li = document.createElement('li');
  li.className = 'todo-item' +
    (isDone ? ' completed' : '') +
    (!isDone && isOverdue(todo) ? ' overdue' : '');
  li.dataset.id = todo.id;

  const badgeHtml = todo.subtasksTotal > 0
    ? `<span class="subtask-badge ${todo.subtasksDone === todo.subtasksTotal ? 'all-done' : ''}">${todo.subtasksDone}/${todo.subtasksTotal}</span>`
    : '';
  const dueHtml = todo.dueDate
    ? `<span class="todo-due ${!isDone && isOverdue(todo) ? 'overdue-label' : ''}">${!isDone && isOverdue(todo) ? '⚠ ' : '📅 '}${formatDate(todo.dueDate)}</span>`
    : '';

  li.innerHTML = `
    ${!isDone ? '<span class="drag-handle" title="Kéo để sắp xếp">⠿</span>' : ''}
    <div class="todo-body" title="Xem chi tiết">
      <div class="todo-title-row">
        <span class="todo-title">${escapeHtml(todo.title)}</span>
        ${badgeHtml}
      </div>
      ${dueHtml}
    </div>
    <div class="todo-actions">
      ${!isDone
        ? `<button class="btn-done" title="Đánh dấu xong">✓</button>`
        : `<button class="btn-undo" title="Hoàn tác">↩</button>`}
      <button class="btn-delete" title="Xóa">✕</button>
    </div>
  `;

  li.querySelector('.todo-body').addEventListener('click', () => openDetail(todo.id));
  li.querySelector(isDone ? '.btn-undo' : '.btn-done').addEventListener('click', (e) => {
    e.stopPropagation();
    isDone ? undoTodo(todo.id) : completeTodo(todo.id);
  });
  li.querySelector('.btn-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTodo(todo.id);
  });

  if (!isDone) {
    li.draggable = true;
    li.addEventListener('dragstart', onDragStart);
    li.addEventListener('dragover', onDragOver);
    li.addEventListener('drop', onDrop);
    li.addEventListener('dragend', onDragEnd);
  }

  return li;
}

function render() {
  const active = todos.filter(t => !t.completed);
  const done = todos.filter(t => t.completed);

  const list = document.getElementById('todo-list');
  const empty = document.getElementById('empty-state');
  const doneSection = document.getElementById('done-section');
  const doneList = document.getElementById('done-list');
  const doneCount = document.getElementById('done-count');

  // Active list
  list.innerHTML = '';
  if (active.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    active.forEach(todo => list.appendChild(makeTodoItem(todo, false)));
  }

  // Done section
  if (done.length === 0) {
    doneSection.classList.add('hidden');
  } else {
    doneSection.classList.remove('hidden');
    doneCount.textContent = done.length;
    doneList.innerHTML = '';
    done.forEach(todo => doneList.appendChild(makeTodoItem(todo, true)));
  }
}

// ── Drag & drop ───────────────────────────────────────────────────────────────
function onDragStart(e) {
  dragSrcId = this.dataset.id;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.todo-item').forEach(el => el.classList.remove('drag-over'));
  this.classList.add('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  const targetId = this.dataset.id;
  if (dragSrcId === targetId) return;
  const srcIdx = todos.findIndex(t => t.id === dragSrcId);
  const tgtIdx = todos.findIndex(t => t.id === targetId);
  const [moved] = todos.splice(srcIdx, 1);
  todos.splice(tgtIdx, 0, moved);
  render();
  saveOrder();
}

function onDragEnd() {
  document.querySelectorAll('.todo-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
}

async function saveOrder() {
  await fetch('/api/todos-reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: todos.map(t => t.id) })
  });
}

// ── List actions ──────────────────────────────────────────────────────────────
async function completeTodo(id) {
  playTing();
  await fetch(`/api/todos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: true })
  });
  await loadTodos();
  if (currentTodoId === id) closeDetail();
}

async function undoTodo(id) {
  await fetch(`/api/todos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: false })
  });
  await loadTodos();
}

async function deleteTodo(id) {
  if (!confirm('Xóa task này?')) return;
  await fetch(`/api/todos/${id}`, { method: 'DELETE' });
  if (currentTodoId === id) closeDetail();
  await loadTodos();
}

// ── Detail panel ──────────────────────────────────────────────────────────────
async function openDetail(id) {
  currentTodoId = id;
  const todo = await fetch(`/api/todos/${id}`).then(r => r.json());

  document.getElementById('detail-title').value = todo.title;
  document.getElementById('detail-due').value = todo.dueDate || '';
  document.getElementById('detail-notes').value = todo.notes || '';
  document.getElementById('detail-repeat').value = todo.reminderRepeat || 'none';

  if (todo.reminderAt) {
    // Convert UTC ISO to local datetime-local string
    const dt = new Date(todo.reminderAt);
    const pad = n => String(n).padStart(2, '0');
    const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    document.getElementById('detail-reminder').value = local;
  } else {
    document.getElementById('detail-reminder').value = '';
  }

  renderSubtasks(todo.subtasks || []);
  renderAttachments(todo.attachments || []);

  document.getElementById('detail-overlay').classList.remove('hidden');
  document.body.classList.add('panel-open');
}

function closeDetail() {
  clearTimeout(saveTimeout);
  currentTodoId = null;
  document.getElementById('detail-overlay').classList.add('hidden');
  document.body.classList.remove('panel-open');
  loadTodos();
}

function setupDetailEvents() {
  document.getElementById('detail-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('detail-overlay')) closeDetail();
  });
  document.getElementById('detail-close').addEventListener('click', closeDetail);

  document.getElementById('detail-title').addEventListener('input', triggerAutoSave);
  document.getElementById('detail-notes').addEventListener('input', triggerAutoSave);
  document.getElementById('detail-due').addEventListener('change', saveDetail);
  document.getElementById('detail-reminder').addEventListener('change', saveDetail);
  document.getElementById('detail-repeat').addEventListener('change', saveDetail);

  document.getElementById('subtask-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-subtask');
    const title = input.value.trim();
    if (!title || !currentTodoId) return;
    await fetch(`/api/todos/${currentTodoId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    input.value = '';
    await refreshSubtasks();
  });

  document.getElementById('attachment-input').addEventListener('change', async (e) => {
    if (!currentTodoId) return;
    const files = Array.from(e.target.files);
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`/api/todos/${currentTodoId}/attachments`, { method: 'POST', body: fd });
    }
    e.target.value = '';
    await refreshAttachments();
  });
}

function triggerAutoSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveDetail, 600);
}

async function saveDetail() {
  if (!currentTodoId) return;
  const reminderVal = document.getElementById('detail-reminder').value;
  await fetch(`/api/todos/${currentTodoId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: document.getElementById('detail-title').value.trim() || undefined,
      dueDate: document.getElementById('detail-due').value || null,
      notes: document.getElementById('detail-notes').value,
      reminderAt: reminderVal ? new Date(reminderVal).toISOString() : null,
      reminderRepeat: document.getElementById('detail-repeat').value
    })
  });
  // Sync title/dueDate back to the list
  const idx = todos.findIndex(t => t.id === currentTodoId);
  if (idx !== -1) {
    const newTitle = document.getElementById('detail-title').value.trim();
    if (newTitle) todos[idx].title = newTitle;
    todos[idx].dueDate = document.getElementById('detail-due').value || null;
    render();
  }
}

// ── Subtasks ──────────────────────────────────────────────────────────────────
async function refreshSubtasks() {
  const todo = await fetch(`/api/todos/${currentTodoId}`).then(r => r.json());
  renderSubtasks(todo.subtasks || []);
}

function renderSubtasks(subtasks) {
  const list = document.getElementById('subtask-list');
  list.innerHTML = '';

  subtasks.forEach(st => {
    const li = document.createElement('li');
    li.className = 'subtask-item' + (st.completed ? ' completed' : '');

    li.innerHTML = `
      <input type="checkbox" class="subtask-check" ${st.completed ? 'checked' : ''} />
      <span class="subtask-title">${escapeHtml(st.title)}</span>
      <input type="text" class="subtask-edit-input hidden" value="${escapeHtml(st.title)}" />
      <button class="subtask-edit-btn" title="Sửa">✏</button>
      <button class="subtask-delete-btn" title="Xóa">✕</button>
    `;

    const check = li.querySelector('.subtask-check');
    const titleSpan = li.querySelector('.subtask-title');
    const editInput = li.querySelector('.subtask-edit-input');
    const editBtn = li.querySelector('.subtask-edit-btn');
    const deleteBtn = li.querySelector('.subtask-delete-btn');
    let isEditing = false;

    check.addEventListener('change', async () => {
      if (check.checked) playTing();
      await fetch(`/api/todos/${currentTodoId}/subtasks/${st.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: check.checked })
      });
      await refreshSubtasks();
    });

    editBtn.addEventListener('click', async () => {
      if (!isEditing) {
        isEditing = true;
        titleSpan.classList.add('hidden');
        editInput.classList.remove('hidden');
        editInput.focus();
        editBtn.textContent = '✓';
      } else {
        const newTitle = editInput.value.trim();
        if (newTitle) await saveSubtaskTitle(st.id, newTitle);
        else await refreshSubtasks();
      }
    });

    editInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const newTitle = editInput.value.trim();
        if (newTitle) await saveSubtaskTitle(st.id, newTitle);
      }
      if (e.key === 'Escape') {
        isEditing = false;
        editInput.value = st.title;
        titleSpan.classList.remove('hidden');
        editInput.classList.add('hidden');
        editBtn.textContent = '✏';
      }
    });

    deleteBtn.addEventListener('click', async () => {
      await fetch(`/api/todos/${currentTodoId}/subtasks/${st.id}`, { method: 'DELETE' });
      await refreshSubtasks();
    });

    list.appendChild(li);
  });
}

async function saveSubtaskTitle(sid, title) {
  await fetch(`/api/todos/${currentTodoId}/subtasks/${sid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  await refreshSubtasks();
}

// ── Attachments ───────────────────────────────────────────────────────────────
async function refreshAttachments() {
  const todo = await fetch(`/api/todos/${currentTodoId}`).then(r => r.json());
  renderAttachments(todo.attachments || []);
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAttachments(attachments) {
  const list = document.getElementById('attachment-list');
  list.innerHTML = '';

  attachments.forEach(att => {
    const li = document.createElement('li');
    li.className = 'attachment-item';
    const isImage = att.mimeType && att.mimeType.startsWith('image/');
    li.innerHTML = `
      ${isImage
        ? `<img src="${att.url}" alt="${escapeHtml(att.filename)}" class="att-thumb" />`
        : `<span class="att-icon">📎</span>`}
      <a href="${att.url}" target="_blank" class="att-name" title="${escapeHtml(att.filename)}">${escapeHtml(att.filename)}</a>
      <span class="att-size">${formatBytes(att.sizeBytes)}</span>
      <button class="att-delete" title="Xóa">✕</button>
    `;
    li.querySelector('.att-delete').addEventListener('click', async () => {
      await fetch(`/api/todos/${currentTodoId}/attachments/${att.id}`, { method: 'DELETE' });
      await refreshAttachments();
    });
    list.appendChild(li);
  });
}

// ── Add form ──────────────────────────────────────────────────────────────────
document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('new-title').value.trim();
  const dueDate = document.getElementById('new-due').value;
  if (!title) return;
  await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, dueDate: dueDate || null, folderId: currentFolderId })
  });
  document.getElementById('new-title').value = '';
  document.getElementById('new-due').value = '';
  await loadTodos();
});

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

init();
