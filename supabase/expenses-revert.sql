-- Reversión de supabase/expenses.sql.
-- Pegar en el editor SQL del proyecto y ejecutar SOLO si hay que deshacer
-- el módulo de Gastos reales. Borra la tabla `expenses` y todo su
-- contenido (índices, trigger y política caen solos con ella) — no toca
-- `fixed_expenses` ni ninguna otra tabla de Dinero.

begin;

revoke select, insert, update, delete on public.expenses from authenticated;

drop table if exists public.expenses;

commit;
