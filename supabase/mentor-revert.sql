-- Reversión de supabase/mentor.sql.
-- Pegar en el editor SQL del proyecto y ejecutar SOLO si hay que deshacer
-- el historial del mentor. Borra `mentor_analyses` y `mentor_summary` y todo
-- su contenido (índice, triggers y políticas caen solos con ellas) — no
-- toca ninguna otra tabla.

begin;

revoke select, insert, update, delete on public.mentor_analyses from authenticated;
revoke select, insert, update, delete on public.mentor_summary from authenticated;

drop table if exists public.mentor_analyses;
drop table if exists public.mentor_summary;

commit;
