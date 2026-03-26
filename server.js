const express = require('express');
const cookieSession = require('cookie-session');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const CREDENTIALS = { username: 'tmred38ai', password: '123test' };

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 } // 4MB
});

// ── Transforms ────────────────────────────────────────────────────────────────
function toTodo(row) {
  const subtasks = row.subtasks || [];
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    completed: row.completed,
    order: row.order_index,
    folderId: row.folder_id || null,
    notes: row.notes || '',
    reminderAt: row.reminder_at || null,
    reminderRepeat: row.reminder_repeat || 'none',
    subtasksTotal: subtasks.length,
    subtasksDone: subtasks.filter(s => s.completed).length
  };
}

function toFolder(row) {
  return { id: row.id, name: row.name, order: row.order_index };
}

function toSubtask(row) {
  return {
    id: row.id,
    todoId: row.todo_id,
    title: row.title,
    completed: row.completed,
    order: row.order_index
  };
}

function toAttachment(row) {
  const { data } = supabase.storage
    .from('todo-attachments')
    .getPublicUrl(row.storage_path);
  return {
    id: row.id,
    todoId: row.todo_id,
    filename: row.filename,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    url: data.publicUrl
  };
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieSession({
  name: 'session',
  secret: process.env.SESSION_SECRET || 'todo-secret-key',
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: 'lax'
}));

function requireAuth(req, res, next) {
  if (req.session.loggedIn) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
    req.session.loggedIn = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Sai username hoặc password' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  res.json({ loggedIn: !!req.session.loggedIn });
});

// ── Folders ───────────────────────────────────────────────────────────────────
app.get('/api/folders', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('folders').select('*').order('order_index');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(toFolder));
});

app.post('/api/folders', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tên không được trống' });
  const { data: existing } = await supabase.from('folders').select('order_index').order('order_index', { ascending: false }).limit(1);
  const nextOrder = existing && existing.length > 0 ? existing[0].order_index + 1 : 0;
  const { data, error } = await supabase.from('folders').insert({ name: name.trim(), order_index: nextOrder }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toFolder(data));
});

app.put('/api/folders/:id', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tên không được trống' });
  const { data, error } = await supabase.from('folders').update({ name: name.trim() }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toFolder(data));
});

app.delete('/api/folders/:id', requireAuth, async (req, res) => {
  await supabase.from('todos').update({ folder_id: null }).eq('folder_id', req.params.id);
  await supabase.from('folders').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// ── Todos list ────────────────────────────────────────────────────────────────
app.get('/api/todos', requireAuth, async (req, res) => {
  let query = supabase.from('todos').select('*, subtasks(id, completed)').order('order_index', { ascending: true });
  if (req.query.folderId) query = query.eq('folder_id', req.query.folderId);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(toTodo));
});

// Todo detail with subtasks + attachments
app.get('/api/todos/:id', requireAuth, async (req, res) => {
  const [todoRes, subtasksRes, attachmentsRes] = await Promise.all([
    supabase.from('todos').select('*').eq('id', req.params.id).single(),
    supabase.from('subtasks').select('*').eq('todo_id', req.params.id).order('order_index'),
    supabase.from('attachments').select('*').eq('todo_id', req.params.id).order('created_at')
  ]);
  if (todoRes.error) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...toTodo(todoRes.data),
    subtasks: (subtasksRes.data || []).map(toSubtask),
    attachments: (attachmentsRes.data || []).map(toAttachment)
  });
});

// Create todo
app.post('/api/todos', requireAuth, async (req, res) => {
  const { title, dueDate } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Tiêu đề không được trống' });
  }
  const { data: existing } = await supabase
    .from('todos').select('order_index').order('order_index', { ascending: false }).limit(1);
  const nextOrder = existing && existing.length > 0 ? existing[0].order_index + 1 : 0;
  const { data, error } = await supabase
    .from('todos')
    .insert({ title: title.trim(), due_date: dueDate || null, folder_id: req.body.folderId || null, completed: false, order_index: nextOrder })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toTodo(data));
});

// Update todo (title, completed, dueDate, notes, reminderAt, reminderRepeat)
app.put('/api/todos/:id', requireAuth, async (req, res) => {
  const updates = {};
  if (req.body.completed !== undefined) updates.completed = req.body.completed;
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.dueDate !== undefined) updates.due_date = req.body.dueDate;
  if (req.body.notes !== undefined) updates.notes = req.body.notes;
  if (req.body.reminderAt !== undefined) updates.reminder_at = req.body.reminderAt;
  if (req.body.reminderRepeat !== undefined) updates.reminder_repeat = req.body.reminderRepeat;
  const { data, error } = await supabase
    .from('todos').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toTodo(data));
});

// Delete todo (cascade via DB, also clean up storage)
app.delete('/api/todos/:id', requireAuth, async (req, res) => {
  const { data: atts } = await supabase
    .from('attachments').select('storage_path').eq('todo_id', req.params.id);
  if (atts && atts.length > 0) {
    await supabase.storage.from('todo-attachments').remove(atts.map(a => a.storage_path));
  }
  await supabase.from('todos').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// Reorder todos
app.put('/api/todos-reorder', requireAuth, async (req, res) => {
  const { orderedIds } = req.body;
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('todos').update({ order_index: index }).eq('id', id)
    )
  );
  const { data } = await supabase
    .from('todos').select('*').order('order_index', { ascending: true });
  res.json(data.map(toTodo));
});

// ── Subtasks ──────────────────────────────────────────────────────────────────
app.post('/api/todos/:id/subtasks', requireAuth, async (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Tiêu đề không được trống' });
  const { data: existing } = await supabase
    .from('subtasks').select('order_index').eq('todo_id', req.params.id)
    .order('order_index', { ascending: false }).limit(1);
  const nextOrder = existing && existing.length > 0 ? existing[0].order_index + 1 : 0;
  const { data, error } = await supabase
    .from('subtasks')
    .insert({ todo_id: req.params.id, title: title.trim(), completed: false, order_index: nextOrder })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toSubtask(data));
});

app.put('/api/todos/:id/subtasks/:sid', requireAuth, async (req, res) => {
  const updates = {};
  if (req.body.completed !== undefined) updates.completed = req.body.completed;
  if (req.body.title !== undefined) updates.title = req.body.title;
  const { data, error } = await supabase
    .from('subtasks').update(updates).eq('id', req.params.sid).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toSubtask(data));
});

app.delete('/api/todos/:id/subtasks/:sid', requireAuth, async (req, res) => {
  await supabase.from('subtasks').delete().eq('id', req.params.sid);
  res.json({ success: true });
});

// ── Attachments ───────────────────────────────────────────────────────────────
app.post('/api/todos/:id/attachments', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = path.extname(req.file.originalname);
  const storagePath = `${req.params.id}/${Date.now()}${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('todo-attachments')
    .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return res.status(500).json({ error: uploadError.message });
  const { data, error } = await supabase
    .from('attachments')
    .insert({
      todo_id: req.params.id,
      filename: req.file.originalname,
      storage_path: storagePath,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toAttachment(data));
});

app.delete('/api/todos/:id/attachments/:aid', requireAuth, async (req, res) => {
  const { data } = await supabase
    .from('attachments').select('storage_path').eq('id', req.params.aid).single();
  if (data) await supabase.storage.from('todo-attachments').remove([data.storage_path]);
  await supabase.from('attachments').delete().eq('id', req.params.aid);
  res.json({ success: true });
});

// ── Export ────────────────────────────────────────────────────────────────────
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Todo app running at http://localhost:${PORT}`);
  });
}
