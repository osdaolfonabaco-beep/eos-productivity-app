-- Módulo de Sueldo (ingresos) para Productividad.
-- Pegar en el editor SQL del proyecto y ejecutar una vez.
-- Depende de supabase/schema.sql (reutiliza la función public.set_updated_at).
--
-- Nota de diseño: fixed_expenses NO guarda una columna "cadence". La cadencia
-- (mensual / quincenal) se deriva de `quincena` en la capa de datos
-- ('ambas' = quincenal, 'primera'/'segunda' = mensual) para no arrastrar un
-- dato redundante que podría desincronizarse. Ver src/data/fixedExpenses.ts.

begin;

-- ============================================================
--  salary_periods — el sueldo registrado para una quincena
-- ============================================================
create table public.salary_periods (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid()
                           references auth.users (id) on delete cascade,
  period_start date        not null,
  period_end   date        not null check (period_end > period_start),
  amount       bigint      not null check (amount >= 0),
  archived     boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, period_start)
);

create trigger salary_periods_set_updated_at
  before update on public.salary_periods
  for each row execute function public.set_updated_at();

-- ============================================================
--  fixed_expenses — gastos fijos recurrentes
-- ============================================================
create table public.fixed_expenses (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  name        text        not null check (char_length(trim(name)) > 0),
  amount      bigint      not null check (amount > 0),
  quincena    text        not null check (quincena in ('primera', 'segunda', 'ambas')),
  archived    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index fixed_expenses_user_id_idx on public.fixed_expenses (user_id);

create trigger fixed_expenses_set_updated_at
  before update on public.fixed_expenses
  for each row execute function public.set_updated_at();

-- ============================================================
--  savings_goal — la meta de ahorro (una sola activa a la vez)
-- ============================================================
create table public.savings_goal (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid()
                            references auth.users (id) on delete cascade,
  name          text        not null check (char_length(trim(name)) > 0),
  target_amount bigint      not null check (target_amount > 0),
  target_date   date,
  archived      boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Respaldo a nivel de base de datos de la regla "una sola meta activa": índice
-- único parcial sobre las filas no archivadas. La capa de datos ya lo valida
-- antes de insertar; esto es la última línea de defensa.
create unique index savings_goal_one_active_idx
  on public.savings_goal (user_id)
  where not archived;

create trigger savings_goal_set_updated_at
  before update on public.savings_goal
  for each row execute function public.set_updated_at();

-- ============================================================
--  savings_contributions — aportes anotados bajo la meta
-- ============================================================
create table public.savings_contributions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  goal_id     uuid        not null references public.savings_goal (id) on delete cascade,
  date        date        not null,
  amount      bigint      not null check (amount > 0),
  archived    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index savings_contributions_user_id_idx on public.savings_contributions (user_id);
create index savings_contributions_goal_id_idx on public.savings_contributions (goal_id);

create trigger savings_contributions_set_updated_at
  before update on public.savings_contributions
  for each row execute function public.set_updated_at();

-- ============================================================
--  Row Level Security — igual patrón que el resto del esquema:
--  sin política no se ve nada; estas son las únicas que abren acceso, y solo
--  a las filas propias. Las hijas exigen además que el padre sea del usuario.
-- ============================================================
alter table public.salary_periods        enable row level security;
alter table public.fixed_expenses        enable row level security;
alter table public.savings_goal          enable row level security;
alter table public.savings_contributions enable row level security;

create policy "salary periods are private to owner"
  on public.salary_periods
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "fixed expenses are private to owner"
  on public.fixed_expenses
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "savings goal is private to owner"
  on public.savings_goal
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "savings contributions are private to owner"
  on public.savings_contributions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.savings_goal g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );

-- ============================================================
--  Permisos del rol autenticado (RLS sigue mandando por encima)
-- ============================================================
grant select, insert, update, delete on public.salary_periods        to authenticated;
grant select, insert, update, delete on public.fixed_expenses        to authenticated;
grant select, insert, update, delete on public.savings_goal          to authenticated;
grant select, insert, update, delete on public.savings_contributions to authenticated;

commit;
