# Подключение Supabase к проекту

## 1. Создать проект на Supabase

1. Зайди на [supabase.com](https://supabase.com) и войди в аккаунт.
2. **New Project** → укажи имя, пароль БД, регион.
3. Дождись создания проекта.

## 2. Создать таблицы

1. В дашборде Supabase открой **SQL Editor**.
2. Нажми **New query**.
3. Скопируй содержимое файла `supabase/schema.sql` из корня репозитория и вставь в редактор.
4. Нажми **Run** — создадутся таблицы `downtimes` и `operations` и политики доступа.

## 3. Взять ключи API

1. В дашборде: **Project Settings** (иконка шестерёнки) → **API**.
2. Скопируй:
   - **Project URL** (например `https://xxxx.supabase.co`);
   - **anon public** ключ (длинная строка `eyJ...`).

## 4. Настроить фронтенд

1. В папке `frontend` создай файл `.env.local` (он не попадёт в git).
2. Добавь строки (подставь свои значения):

```
VITE_SUPABASE_URL=https://твой-проект.supabase.co
VITE_SUPABASE_ANON_KEY=твой_anon_ключ
```

3. Перезапусти dev-сервер (`npm run dev`).

## 5. Использование в коде

Клиент уже подключён в `src/lib/supabase.ts`:

- `supabase` — клиент (будет `null`, если переменные не заданы).
- `isSupabaseConfigured()` — проверка, настроен ли Supabase.

Пример запроса:

```ts
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

if (isSupabaseConfigured() && supabase) {
  const { data } = await supabase.from('downtimes').select('*').order('start_iso', { ascending: false })
  console.log(data)
}
```

Дальше можно постепенно переводить данные с localStorage на Supabase (отчёты, простои, операции).

## 6. Регистрация и вход (без подтверждения почты)

В приложении включены регистрация и вход по email и паролю через Supabase Auth.

Чтобы новые пользователи могли входить сразу после регистрации **без подтверждения по email**:

1. В дашборде Supabase открой **Authentication** → **Providers** → **Email**.
2. Выключи опцию **Confirm email** (подтверждение по почте).
3. Сохрани изменения.

После этого при регистрации пользователь сразу считается авторизованным.

## 7. Справочники: причины простоя и операции

В `supabase/schema.sql` добавлены таблицы `downtime_reasons` и `work_operations` (с полями `created_by` и `created_at` для лога). На странице **Поля** внизу появится блок «Справочники для экрана оператора»: там можно добавлять причины простоя и операции; на экране оператора при «Начать простой» и «Начать операцию» будут подставляться эти данные из БД.

**Если видишь ошибку «Could not find the table 'public.downtime_reasons' in the schema cache»** — таблицы ещё не созданы. В Supabase открой **SQL Editor** → **New query**, вставь и выполни (**Run**) этот блок:

```sql
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
```

После успешного выполнения обнови страницу «Поля» — блок справочников должен загрузиться без ошибки.
