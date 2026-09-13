-- Metas semanales para Productividad.
-- Pegar en el editor SQL del proyecto y ejecutar una vez.
-- Depende de supabase/schema.sql (reutiliza la función public.set_updated_at).

begin;

create table public.weekly_goals (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  week_start  date        not null,   -- el lunes de la semana a la que pertenece
  text        text        not null check (char_length(trim(text)) > 0),
  resultado   text        check (resultado in ('cumplida', 'no-cumplida')),
  archived    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index weekly_goals_user_week_idx on public.weekly_goals (user_id, week_start);

create trigger weekly_goals_set_updated_at
  before update on public.weekly_goals
  for each row execute function public.set_updated_at();

alter table public.weekly_goals enable row level security;

create policy "weekly goals are private to owner"
  on public.weekly_goals
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.weekly_goals to authenticated;

-- Avances y retrocesos anotados bajo una meta. Bitácora de solo-añadir: sin
-- columna "archived", como habit_entries y payments (sus equivalentes).
create table public.goal_updates (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  goal_id     uuid        not null references public.weekly_goals (id) on delete cascade,
  date        date        not null,
  text        text        not null check (char_length(trim(text)) > 0),
  direction   text        not null check (direction in ('acerca', 'aleja')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index goal_updates_goal_id_idx on public.goal_updates (goal_id);

create trigger goal_updates_set_updated_at
  before update on public.goal_updates
  for each row execute function public.set_updated_at();

alter table public.goal_updates enable row level security;

-- with check estricto, como habit_entries/payments: la meta referenciada
-- también debe ser del usuario.
create policy "goal updates are private to owner"
  on public.goal_updates
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.weekly_goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.goal_updates to authenticated;

commit;
