-- Reversión de supabase/incomes.sql.
-- Pegar en el editor SQL del proyecto y ejecutar SOLO si hay que deshacer
-- el módulo de Ingresos. Borra la tabla `incomes` y todo su contenido
-- (índice, trigger y política caen solos con ella) — no toca
-- `salary_periods`, `fixed_expenses` ni ninguna otra tabla de Dinero.

begin;

revoke select, insert, update, delete on public.incomes from authenticated;

drop table if exists public.incomes;

commit;
