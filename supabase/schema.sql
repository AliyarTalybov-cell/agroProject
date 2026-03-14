-- Таблицы для портала агронома (выполни в Supabase: SQL Editor → New query)

-- Простои техники (журнал и отчёты)
create table if not exists public.downtimes (
  id bigint primary key default (extract(epoch from now()) * 1000)::bigint,
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
