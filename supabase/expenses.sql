-- Módulo de Gastos reales para Productividad (sección Dinero).
-- Pegar en el editor SQL del proyecto y ejecutar. Depende de
-- supabase/schema.sql (reutiliza la función public.set_updated_at) y de
-- supabase/salary.sql (referencia opcional a fixed_expenses).
--
-- A diferencia de schema.sql/salary.sql, este archivo SÍ está escrito para
-- poder ejecutarse más de una vez sin romper nada (comprobaciones de
-- existencia en table/index, drop-if-exists antes de policy/trigger) —
-- mismo criterio que supabase/incomes.sql.
--
-- fixed_expenses pasa a ser una PLANTILLA (lo que esperas pagar cada
-- quincena); ya no se resta sola de nada. Esta tabla guarda lo que
-- realmente gastaste. Un gasto real puede venir de una plantilla
-- (fixed_expense_id) o ser suelto (fixed_expense_id null).
--
-- Importante: la fecha de un gasto puede caer fuera de la quincena de la
-- plantilla que referencia — por ejemplo, pagar con retraso el día 17 un
-- gasto que la plantilla marca como de la primera quincena. Eso es válido
-- y NO se impide con ninguna restricción. El gasto cuenta siempre en la
-- quincena de SU FECHA, nunca en la de la plantilla; la plantilla solo
-- sirve para prellenar el monto y para comparar lo previsto con lo
-- gastado, no para fijar cuándo "debe" contar.

begin;

-- ============================================================
--  expenses — gastos reales (lo que se gastó de verdad, con fecha y monto)
-- ============================================================
create table if not exists public.expenses (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null default auth.uid()
                                references auth.users (id) on delete cascade,
  date              date        not null,
  -- Mismo tope que incomes: no limita nada real, es la red contra un
  -- dedazo al teclear (100.000.000.000 = cien mil millones de pesos).
  amount            bigint      not null check (amount > 0 and amount <= 100000000000),
  concept           text        not null check (char_length(trim(concept)) > 0),
  -- Categoría y nota: mismo criterio que incomes — nunca cadena vacía,
  -- o null o con contenido.
  category          text                 check (category is null or char_length(trim(category)) > 0),
  note              text                 check (note is null or char_length(trim(note)) > 0),
  -- Referencia opcional a la plantilla de la que vino. on delete set null
  -- a propósito: si la plantilla se borra de verdad (no archivar, que no
  -- toca esta columna para nada), el gasto real ya ocurrió y no debe
  -- desaparecer ni arrastrarse con ella — solo pierde la trazabilidad
  -- hacia una plantilla que ya no existe.
  fixed_expense_id  uuid                 references public.fixed_expenses (id) on delete set null,
  archived          boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Cubre "por usuario" (como prefijo) y "por rango de fechas" (agrupar por
-- quincena) con un solo índice — mismo criterio que incomes y habit_entries.
create index if not exists expenses_user_id_date_idx on public.expenses (user_id, date);

-- Para "¿esta plantilla ya se pagó en esta quincena?": exists contra
-- fixed_expense_id filtrando por rango de fechas, siempre juntos.
create index if not exists expenses_fixed_expense_id_date_idx on public.expenses (fixed_expense_id, date);

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ============================================================
--  Row Level Security — mismo patrón que payments/savings_contributions:
--  sin política no se ve nada; esta es la única que abre acceso, y solo a
--  las filas propias. Como la referencia a fixed_expenses es opcional, el
--  with check solo exige que la plantilla sea del usuario cuando hay una.
-- ============================================================
alter table public.expenses enable row level security;

drop policy if exists "expenses are private to owner" on public.expenses;
create policy "expenses are private to owner"
  on public.expenses
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      fixed_expense_id is null
      or exists (
        select 1 from public.fixed_expenses fe
        where fe.id = fixed_expense_id and fe.user_id = auth.uid()
      )
    )
  );

-- ============================================================
--  Permisos del rol autenticado (RLS sigue mandando por encima)
-- ============================================================
grant select, insert, update, delete on public.expenses to authenticated;

commit;
