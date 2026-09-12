-- Tarea programada de recordatorios: reminder_log + el cron que llama a
-- send-reminders cada 5 minutos.
-- Pegar en el editor SQL del proyecto y ejecutar una vez. Depende de
-- supabase/schema.sql (auth.users ya existe, claro).
--
-- ANTES DE EJECUTAR, reemplaza:
--   'https://TU-PROYECTO.supabase.co'  -> tu Project URL (Settings -> API)
--   'EL-VALOR-DE-TU-CRON-SECRET'       -> el MISMO valor que pusiste con
--                                          `supabase secrets set CRON_SECRET=...`
--   'EL-VALOR-DE-TU-ANON-KEY'          -> tu clave pública/anon (la misma de
--                                          VITE_SUPABASE_ANON_KEY; no es secreta)
--
-- Si CRON_SECRET aquí y el que tiene la función (supabase secrets set) no
-- coinciden EXACTAMENTE, el cron recibe 401 en cada intento.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://TU-PROYECTO.supabase.co', 'project_url');
select vault.create_secret('EL-VALOR-DE-TU-CRON-SECRET', 'cron_secret');
select vault.create_secret('EL-VALOR-DE-TU-ANON-KEY', 'anon_key');

-- Como mucho un recordatorio por usuario y día. send-reminders la consulta
-- antes de enviar y la marca antes de intentar el envío (para no reintentar
-- en el siguiente tick aunque el push falle). Sin políticas: solo la usa la
-- función con la service role (que ignora RLS); una persona no tiene por qué
-- ver ni tocar esto directamente.
create table public.reminder_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  date     date not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.reminder_log enable row level security;

select cron.schedule(
  'send-reminders-cada-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para comprobar que el cron está programado:
--   select * from cron.job;
-- Para ver las últimas ejecuciones y si fallaron:
--   select * from cron.job_run_details order by start_time desc limit 20;
-- Para quitarlo si algo sale mal:
--   select cron.unschedule('send-reminders-cada-5-min');
