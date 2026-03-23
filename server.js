const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'todos.json');

const CREDENTIALS = { username: 'tmred38ai', password: '123test' };

// Ensure data directory and file exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

function readTodos() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeTodos(todos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2), 'utf8');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'todo-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (req.session.loggedIn) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Auth
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
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  res.json({ loggedIn: !!req.session.loggedIn });
});

// Todos
app.get('/api/todos', requireAuth, (req, res) => {
  res.json(readTodos());
});

app.post('/api/todos', requireAuth, (req, res) => {
  const { title, dueDate } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Tiêu đề không được trống' });
  }
  const todos = readTodos();
  const newTodo = {
    id: uuidv4(),
    title: title.trim(),
    dueDate: dueDate || null,
    completed: false,
    order: todos.length
  };
  todos.push(newTodo);
  writeTodos(todos);
  res.json(newTodo);
});

app.put('/api/todos/:id', requireAuth, (req, res) => {
  const todos = readTodos();
  const idx = todos.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
  todos[idx] = { ...todos[idx], ...req.body };
  writeTodos(todos);
  res.json(todos[idx]);
});

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  let todos = readTodos();
  todos = todos.filter(t => t.id !== req.params.id);
  writeTodos(todos);
  res.json({ success: true });
});

app.put('/api/todos-reorder', requireAuth, (req, res) => {
  const { orderedIds } = req.body;
  const todos = readTodos();
  const reordered = orderedIds.map((id, index) => {
    const todo = todos.find(t => t.id === id);
    return { ...todo, order: index };
  });
  writeTodos(reordered);
  res.json(reordered);
});

app.listen(PORT, () => {
  console.log(`Todo app running at http://localhost:${PORT}`);
});
