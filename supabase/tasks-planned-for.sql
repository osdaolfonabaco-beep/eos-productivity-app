-- Tareas: planificación en una ventana móvil de 7 días.
-- Pegar en el editor SQL y ejecutar una vez. Depende de supabase/schema.sql
-- (la tabla tasks ya existe, ver supabase/tasks.sql).
--
-- `planned_for` es el día para el que se planificó la tarea, elegido por el
-- usuario entre hoy y hoy + 6 (la ventana se calcula en cada lectura, con
-- src/data/tasks.ts; nunca se guarda un rango). NULL sigue significando
-- "tarea de hoy", el comportamiento actual — esta migración no toca las
-- tareas existentes ni les asigna fecha.
--
-- Es una columna distinta de `date` (que siempre es el día en que se creó la
-- tarea, sin que la interfaz lo muestre ni lo deje cambiar): `planned_for` es
-- la intención del usuario; `date` sigue siendo solo el ancla de creación.

begin;

alter table public.tasks
  add column planned_for date;

-- Para agrupar por día en la vista de planificación.
create index tasks_user_id_planned_for_idx on public.tasks (user_id, planned_for);

commit;
