-- Esquema de Productividad en Supabase.
-- Pegar entero en el editor SQL del proyecto y ejecutar una vez.
-- Todo va dentro de una transacción: si algo falla, no queda nada a medias.
--
-- El login por enlace mágico no lleva SQL (Authentication -> Providers -> Email,
-- ya viene activo; desde el cliente es supabase.auth.signInWithOtp).
-- Para cerrar el registro a tu correo, ver supabase/lock-signups.sql.

begin;

-- ============================================================
--  Trigger compartido: mantiene updated_at en cada UPDATE.
--  updated_at es infraestructura para la sincronización (resolver
--  "quién ganó" fila a fila); las entidades actuales no la tienen.
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================
--  habits
-- ============================================================
create table public.habits (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  name        text        not null check (char_length(trim(name)) > 0),
  archived    boolean     not null default false,
  sort_order  integer     not null default 0,   -- "order" es palabra reservada
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index habits_user_id_idx on public.habits (user_id);

create trigger habits_set_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

-- ============================================================
--  habit_entries
-- ============================================================
create table public.habit_entries (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  habit_id    uuid        not null references public.habits (id) on delete cascade,
  date        date        not null,   -- el cliente envía 'YYYY-MM-DD'
  done        boolean     not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (habit_id, date)             -- (hábito, día) es único; habilita upsert
);

-- La restricción unique ya indexa (habit_id, ...). Este índice cubre la
-- consulta de la semana: user_id (lo añade RLS) + rango de fechas.
create index habit_entries_user_id_date_idx on public.habit_entries (user_id, date);

create trigger habit_entries_set_updated_at
  before update on public.habit_entries
  for each row execute function public.set_updated_at();

-- ============================================================
--  debts
-- ============================================================
create table public.debts (
  id               uuid         primary key default gen_random_uuid(),
  user_id          uuid         not null default auth.uid()
                                references auth.users (id) on delete cascade,
  name             text         not null check (char_length(trim(name)) > 0),
  opening_balance  bigint       not null check (opening_balance >= 0),
  annual_rate      numeric(6,3)          check (annual_rate is null or annual_rate >= 0),
  monthly_payment  bigint       not null default 0 check (monthly_payment >= 0),
  status           text         not null check (status in ('al-dia', 'en-mora')),
  archived         boolean      not null default false,
  sort_order       integer      not null default 0,
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);

create index debts_user_id_idx on public.debts (user_id);

create trigger debts_set_updated_at
  before update on public.debts
  for each row execute function public.set_updated_at();

-- ============================================================
--  payments
-- ============================================================
create table public.payments (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  debt_id     uuid        not null references public.debts (id) on delete cascade,
  date        date        not null,
  amount      bigint      not null check (amount > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index payments_user_id_idx on public.payments (user_id);
create index payments_debt_id_idx on public.payments (debt_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ============================================================
--  Row Level Security
--  Con RLS activo y sin política, nadie ve nada (incluido tú).
--  Estas políticas son lo único que abre acceso, y solo a tus filas.
--  No hay política "to anon": las peticiones sin sesión quedan fuera.
-- ============================================================
alter table public.habits        enable row level security;
alter table public.habit_entries enable row level security;
alter table public.debts         enable row level security;
alter table public.payments      enable row level security;

create policy "habits are private to owner"
  on public.habits
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "debts are private to owner"
  on public.debts
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Hijas: además de ser tuya, el hábito/deuda referenciado también tiene
-- que ser tuyo (with check estricto; aplica a INSERT y UPDATE).
create policy "habit_entries are private to owner"
  on public.habit_entries
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = auth.uid()
    )
  );

create policy "payments are private to owner"
  on public.payments
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.debts d
      where d.id = debt_id and d.user_id = auth.uid()
    )
  );

-- ============================================================
--  Permisos del rol autenticado (RLS sigue mandando por encima)
-- ============================================================
grant select, insert, update, delete on public.habits        to authenticated;
grant select, insert, update, delete on public.habit_entries to authenticated;
grant select, insert, update, delete on public.debts         to authenticated;
grant select, insert, update, delete on public.payments      to authenticated;

commit;
