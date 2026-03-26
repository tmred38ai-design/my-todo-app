-- ─────────────────────────────────────────────────────────────────────────────
-- INITIAL SETUP (run this first if you haven't already)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date,
  completed boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
alter table todos disable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: task details (run to add new features)
-- ─────────────────────────────────────────────────────────────────────────────
alter table todos
  add column if not exists notes text,
  add column if not exists reminder_at timestamptz,
  add column if not exists reminder_repeat text default 'none';

-- Sub-tasks
create table if not exists subtasks (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
alter table subtasks disable row level security;

-- Attachments metadata
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
alter table attachments disable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: folders
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
alter table folders disable row level security;

alter table todos add column if not exists folder_id uuid references folders(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE BUCKET: create manually in Supabase Dashboard
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Go to Storage tab in Supabase Dashboard
-- 2. Click "New bucket"
-- 3. Name: todo-attachments
-- 4. Check "Public bucket" (so files are accessible via public URL)
-- 5. Click Save
-- ─────────────────────────────────────────────────────────────────────────────
