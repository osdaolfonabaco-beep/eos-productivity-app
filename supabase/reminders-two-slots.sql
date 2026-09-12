-- Migración: reminder_log pasa de "un recordatorio al día" a "un
-- recordatorio al día POR SLOT" (hasta dos horarios independientes por
-- persona). Pegar en el editor SQL y ejecutar una vez -- tu tabla
-- reminder_log ya existe (de supabase/reminders-cron.sql), esto la ajusta
-- en el sitio, sin perder las filas que ya tenga.
--
-- Las filas existentes (de cuando solo había un horario) se tratan como
-- "slot 0" -- es lo que corresponde: eran, en efecto, ese único recordatorio.

alter table public.reminder_log add column slot smallint not null default 0;
alter table public.reminder_log add constraint reminder_log_slot_check check (slot in (0, 1));
alter table public.reminder_log drop constraint reminder_log_pkey;
alter table public.reminder_log add primary key (user_id, date, slot);
alter table public.reminder_log alter column slot drop default;

-- No hace falta volver a desplegar nada ni tocar los secretos: send-reminders
-- ya sabe leer los dos horarios (o el antiguo formato de uno solo, mientras
-- no hayas vuelto a abrir Ajustes) y usar "slot" en sus consultas.
