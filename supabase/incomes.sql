-- Módulo de Ingresos para Productividad (sección Dinero).
-- Pegar en el editor SQL del proyecto y ejecutar. Depende de
-- supabase/schema.sql (reutiliza la función public.set_updated_at).
--
-- A diferencia del resto de supabase/*.sql, este archivo SÍ está escrito
-- para poder ejecutarse más de una vez sin romper nada (comprobaciones de
-- existencia en table/index, drop-if-exists antes de policy/trigger). Es
-- una desviación deliberada de la convención del resto del esquema, pedida
-- para este módulo en concreto.
--
-- El sueldo de la quincena NO vive aquí: sigue en `salary_periods`
-- (supabase/salary.sql). La interfaz lo mostrará como una entrada sintética
-- en la lista de ingresos, calculada al leer, nunca guardada en esta tabla
-- — así se evita contarlo dos veces en el disponible.

begin;

-- ============================================================
--  incomes — ingresos sueltos (aparte del sueldo de la quincena)
-- ============================================================
create table if not exists public.incomes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  date        date        not null,
  -- Tope superior a propósito: no limita nada real, es la red que un
  -- dedazo al teclear no puede saltarse (100.000.000.000 = cien mil
  -- millones de pesos). La interfaz valida lo mismo, pero esta es la
  -- única comprobación que no se puede evitar.
  amount      bigint      not null check (amount > 0 and amount <= 100000000000),
  -- Categoría de texto libre a propósito, no lista cerrada: es personal y
  -- abierta (a diferencia de debts.status o fixed_expenses.quincena, que
  -- son estados fijos), así que una lista cerrada obligaría a una
  -- migración cada vez que aparezca una categoría nueva.
  category    text                 check (category is null or char_length(trim(category)) > 0),
  note        text                 check (note is null or char_length(trim(note)) > 0),
  archived    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Cubre "por usuario" (como prefijo) y "por rango de fechas" (agrupar por
-- quincena) con un solo índice — mismo criterio que habit_entries y tasks.
create index if not exists incomes_user_id_date_idx on public.incomes (user_id, date);

drop trigger if exists incomes_set_updated_at on public.incomes;
create trigger incomes_set_updated_at
  before update on public.incomes
  for each row execute function public.set_updated_at();

-- ============================================================
--  Row Level Security — mismo patrón que habits/debts/fixed_expenses:
--  sin política no se ve nada; esta es la única que abre acceso, y solo a
--  las filas propias. Sin tabla padre que comprobar (a diferencia de
--  payments o savings_contributions).
-- ============================================================
alter table public.incomes enable row level security;

drop policy if exists "incomes are private to owner" on public.incomes;
create policy "incomes are private to owner"
  on public.incomes
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
--  Permisos del rol autenticado (RLS sigue mandando por encima)
-- ============================================================
grant select, insert, update, delete on public.incomes to authenticated;

commit;
