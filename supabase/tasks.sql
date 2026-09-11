-- Tabla de tareas diarias para Productividad.
-- Pegar en el editor SQL del proyecto y ejecutar una vez.
-- Depende de supabase/schema.sql (reutiliza la función public.set_updated_at).

begin;

create table public.tasks (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  text        text        not null check (char_length(trim(text)) > 0),
  date        date,                              -- opcional: null = sin fecha
  done        boolean     not null default false,
  archived    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Para agrupar por fecha (hoy / atrasadas / próximas / sin fecha).
create index tasks_user_id_date_idx on public.tasks (user_id, date);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

create policy "tasks are private to owner"
  on public.tasks
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.tasks to authenticated;

commit;
