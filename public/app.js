let todos = [];
let dragSrcId = null;

async function init() {
  const me = await fetch('/api/me').then(r => r.json());
  if (!me.loggedIn) { window.location.href = '/'; return; }
  await loadTodos();
}

async function loadTodos() {
  todos = await fetch('/api/todos').then(r => r.json());
  render();
}

function isOverdue(todo) {
  if (!todo.dueDate || todo.completed) return false;
  const today = new Date().toISOString().split('T')[0];
  return todo.dueDate < today;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function render() {
  const list = document.getElementById('todo-list');
  const empty = document.getElementById('empty-state');

  if (todos.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = '';
  todos.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item' +
      (todo.completed ? ' completed' : '') +
      (isOverdue(todo) ? ' overdue' : '');
    li.draggable = true;
    li.dataset.id = todo.id;

    li.innerHTML = `
      <span class="drag-handle" title="Kéo để sắp xếp">⠿</span>
      <div class="todo-body">
        <span class="todo-title">${escapeHtml(todo.title)}</span>
        ${todo.dueDate ? `<span class="todo-due ${isOverdue(todo) ? 'overdue-label' : ''}">${isOverdue(todo) ? '⚠ ' : ''}${formatDate(todo.dueDate)}</span>` : ''}
      </div>
      <div class="todo-actions">
        ${!todo.completed
          ? `<button class="btn-done" onclick="completeTodo('${todo.id}')" title="Đánh dấu xong">✓ Done</button>`
          : `<button class="btn-undo" onclick="undoTodo('${todo.id}')" title="Hoàn tác">↩ Undo</button>`
        }
        <button class="btn-delete" onclick="deleteTodo('${todo.id}')" title="Xóa">✕</button>
      </div>
    `;

    li.addEventListener('dragstart', onDragStart);
    li.addEventListener('dragover', onDragOver);
    li.addEventListener('drop', onDrop);
    li.addEventListener('dragend', onDragEnd);

    list.appendChild(li);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Drag & drop
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
  document.querySelectorAll('.todo-item').forEach(el => {
    el.classList.remove('dragging', 'drag-over');
  });
}

async function saveOrder() {
  await fetch('/api/todos-reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: todos.map(t => t.id) })
  });
}

// Actions
async function completeTodo(id) {
  await fetch(`/api/todos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: true })
  });
  await loadTodos();
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
  await fetch(`/api/todos/${id}`, { method: 'DELETE' });
  await loadTodos();
}

// Add form
document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('new-title').value.trim();
  const dueDate = document.getElementById('new-due').value;
  if (!title) return;

  await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, dueDate: dueDate || null })
  });

  document.getElementById('new-title').value = '';
  document.getElementById('new-due').value = '';
  await loadTodos();
});

// Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

init();
