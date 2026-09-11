-- Journal: permitir varias notas por día.
-- Pegar en el editor SQL y ejecutar una vez. Depende de haber corrido ya
-- supabase/journal.sql. No toca columnas, índices, RLS ni el trigger: todo
-- eso sigue sirviendo igual con varias filas por (user_id, date).

alter table public.journal_entries
  drop constraint journal_entries_user_id_date_key;

-- Si el nombre no coincide (Postgres a veces lo numera distinto), busca el
-- real con esto y sustitúyelo arriba:
--
-- select conname from pg_constraint
-- where conrelid = 'public.journal_entries'::regclass and contype = 'u';
