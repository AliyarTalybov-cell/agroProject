-- Таблицы для портала агронома (выполни в Supabase: SQL Editor → New query)

-- Простои техники (журнал и отчёты)
create table if not exists public.downtimes (
  id bigint primary key default (extract(epoch from now()) * 1000)::bigint,
  user_id uuid references auth.users(id),
  employee text not null,
  reason text not null,
  category text not null check (category in ('breakdown', 'rain', 'fuel', 'waiting')),
  start_iso timestamptz not null,
  end_iso timestamptz not null,
  duration_minutes int not null,
  field_id text,
  field_name text,
  operation text,
  created_at timestamptz default now()
);

-- Завершённые операции (журнал операций)
create table if not exists public.operations (
  id bigint primary key default (extract(epoch from now()) * 1000)::bigint,
  user_id uuid references auth.users(id),
  employee text not null,
  field_id text,
  field_name text,
  operation text,
  start_iso timestamptz not null,
  end_iso timestamptz not null,
  duration_minutes int not null,
  created_at timestamptz default now()
);

-- Разрешить анонимный доступ для чтения/записи (для старта; потом можно включить Auth и RLS)
alter table public.downtimes enable row level security;
alter table public.operations enable row level security;

create policy "Allow all for downtimes" on public.downtimes
  for all using (true) with check (true);

create policy "Allow all for operations" on public.operations
  for all using (true) with check (true);

-- Справочник причин простоя (для экрана оператора) + лог кто добавил
create table if not exists public.downtime_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  description text,
  category text not null check (category in ('breakdown', 'rain', 'fuel', 'waiting')),
  created_at timestamptz default now(),
  created_by text
);

-- Справочник операций для работы (для экрана оператора) + лог кто добавил
create table if not exists public.work_operations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  created_by text
);

alter table public.downtime_reasons enable row level security;
alter table public.work_operations enable row level security;

create policy "Allow all for downtime_reasons" on public.downtime_reasons
  for all using (true) with check (true);

create policy "Allow all for work_operations" on public.work_operations
  for all using (true) with check (true);

-- Профили пользователей (для выбора исполнителя в задачах; синхронизируется с auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text check (role in ('worker', 'manager')),
  phone text,
  position text,
  additional_info text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Если таблица profiles уже была создана без новых полей, выполни в SQL Editor:
-- alter table public.profiles add column if not exists phone text;
-- alter table public.profiles add column if not exists position text;
-- alter table public.profiles add column if not exists additional_info text;

-- Задачи (исполнитель = assignee_id; руководитель видит все, работник — только свои)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  assignee_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  priority text not null check (priority in ('high', 'medium', 'low')),
  field text not null,
  due_date text,
  status text not null check (status in ('todo', 'in_progress', 'review', 'done')),
  work_type text,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

create policy "Allow all for profiles" on public.profiles
  for all using (true) with check (true);

create policy "Allow all for tasks" on public.tasks
  for all using (true) with check (true);

-- Техника (справочник единиц техники)
create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  license_plate text not null,
  model text,
  equipment_type text,
  year int check (year is null or (year >= 1900 and year <= 2100)),
  purpose_crop text,
  "condition" text not null default 'operational' check ("condition" in ('operational', 'repair', 'decommissioned')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.equipment enable row level security;

create policy "Allow all for equipment" on public.equipment
  for all using (true) with check (true);

-- Если таблицы downtimes/operations уже были созданы без user_id, выполни в SQL Editor:
-- alter table public.downtimes add column if not exists user_id uuid references auth.users(id);
-- alter table public.operations add column if not exists user_id uuid references auth.users(id);
