-- Journal: columnas para el texto cifrado.
-- Pegar en el editor SQL y ejecutar una vez. Depende de haber corrido ya
-- supabase/journal.sql y supabase/journal_key.sql.
--
-- Este paso NO toca la columna `text` existente ni migra notas viejas: eso es
-- un paso aparte, para no arriesgar pérdida de datos a medio camino. Mientras
-- `encrypted` sea `false`, la nota sigue viviendo sin cifrar en `text`.

begin;

alter table public.journal_entries
  add column ciphertext text,
  add column iv         text,
  add column encrypted  boolean not null default false;

commit;
