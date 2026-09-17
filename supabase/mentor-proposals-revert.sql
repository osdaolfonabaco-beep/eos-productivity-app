-- Reversión de supabase/mentor-proposals.sql.
-- Pegar en el editor SQL del proyecto y ejecutar SOLO si hay que deshacer
-- las propuestas del mentor. Borra `mentor_proposals` y todo su contenido
-- (índices, trigger y política caen solos con ella) -- no toca
-- mentor_analyses ni ninguna otra tabla: la referencia era "on delete set
-- null" desde mentor_proposals hacia mentor_analyses, nunca al revés.

begin;

revoke select, insert, update, delete on public.mentor_proposals from authenticated;

drop table if exists public.mentor_proposals;

commit;
