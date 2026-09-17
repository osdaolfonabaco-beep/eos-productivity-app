-- Reversión de supabase/mentor-purpose.sql.
-- Pegar en el editor SQL del proyecto y ejecutar SOLO si hay que deshacer
-- el "para qué" del mentor. Borra `mentor_purpose` y todo su contenido
-- (índice, trigger y política caen solos con ella) -- no toca ninguna
-- otra tabla.

begin;

revoke select, insert, update, delete on public.mentor_purpose from authenticated;

drop table if exists public.mentor_purpose;

commit;
