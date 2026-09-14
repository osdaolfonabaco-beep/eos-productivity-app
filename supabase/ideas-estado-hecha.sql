-- Ideas: añade el estado 'hecha' y la columna `closed_at`.
-- Pegar en el editor SQL del proyecto y ejecutar una vez.
-- Depende de haber corrido ya supabase/ideas.sql.
--
-- No migra ninguna idea existente: todas siguen con su estado y su
-- closed_at (null) tal como estaban.

begin;

-- El CHECK original solo dejaba 'pendiente' / 'en-marcha' / 'descartada'; se
-- amplía, no se elimina, para admitir también 'hecha'.
alter table public.ideas
  drop constraint ideas_status_check;

-- Si el nombre no coincide (Postgres a veces lo numera distinto), búscalo con:
--
-- select conname from pg_constraint
-- where conrelid = 'public.ideas'::regclass and contype = 'c';

alter table public.ideas
  add constraint ideas_status_check
  check (status in ('pendiente', 'en-marcha', 'descartada', 'hecha'));

-- Cuándo pasó la idea a 'hecha' o a 'descartada'; null mientras sigue
-- abierta o si nunca se cerró. La fija la app (setIdeaStatus en
-- src/data/ideas.ts) al cambiar el estado -- no un trigger -- para que
-- editar el texto de una idea ya cerrada no toque este valor, a diferencia
-- de `updated_at`.
alter table public.ideas
  add column closed_at timestamptz null;

commit;
