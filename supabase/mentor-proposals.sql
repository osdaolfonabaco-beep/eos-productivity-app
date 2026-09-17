-- Propuestas del mentor para Productividad.
-- Pegar en el editor SQL del proyecto y ejecutar. Depende de
-- supabase/schema.sql (reutiliza la función public.set_updated_at) y de
-- supabase/mentor.sql (analisis_id referencia a mentor_analyses).
--
-- Escrito para poder ejecutarse más de una vez sin romper nada
-- (comprobaciones de existencia en table/index, drop-if-exists antes de
-- policy/trigger) -- mismo criterio que supabase/mentor.sql y
-- supabase/mentor-purpose.sql.
--
-- El ciclo: el mentor propone UNA cosa al final de cada análisis semanal.
-- El usuario la acepta o la descarta. Si la acepta, queda activa dos
-- semanas; al vencer se cierra diciendo si funcionó, si sigue en ello, o
-- si se descarta.
--
-- Dos columnas para dos preguntas distintas, a propósito -- mismo criterio
-- que weekly_goals.resultado (aparte de si la meta sigue viva):
--   status    -- en qué etapa del ciclo va. Lista cerrada:
--                'propuesta'  -- recién generada, sin decisión del usuario.
--                'aceptada'   -- el usuario la aceptó, corriendo el plazo.
--                'descartada' -- el usuario la descartó sin aceptarla
--                                nunca. Terminal.
--                'cerrada'    -- se aceptó y llegó al vencimiento.
--                                Terminal.
--   resultado -- cómo terminó, solo tiene sentido si status = 'cerrada'.
--                Lista cerrada: 'funciono' | 'en-progreso' | 'descartada'.
--                Este 'descartada' NO es el mismo que status = 'descartada'
--                de arriba: uno es "nunca se aceptó", el otro es "se
--                aceptó y se abandonó durante las dos semanas". Viven en
--                columnas distintas justo para que no choquen.
--
-- vence_en se GUARDA, no se calcula desde aceptada_en con una expresión
-- generada: hoy son dos semanas fijas, pero si esa duración cambia
-- mañana, una columna generada recalcularía con la regla nueva el
-- vencimiento de propuestas ya aceptadas bajo la regla vieja en cuanto se
-- tocara la expresión -- cambiaría un hecho que ya ocurrió. Se calcula una
-- sola vez en la aplicación al aceptar (aceptada_en + duración vigente
-- ese día) y se escribe tal cual, mismo criterio que incluyo_dinero en
-- mentor_analyses: un hecho de esa fila, congelado en el momento en que
-- ocurre.
--
-- No hay una columna "propuesta_en": created_at ya es exactamente eso (la
-- fila nace en status = 'propuesta' y ese instante no cambia después), no
-- hace falta duplicarlo con un nombre de dominio como sí lo justifica
-- reviewed_at en mentor_purpose (que sí puede moverse sin tocar el
-- contenido).
--
-- Cuatro checks atan la forma de los datos al estado, para que no pueda
-- quedar una fila a medias -- ver el comentario junto a la tabla.
--
-- PENDIENTE PARA CUANDO SE ESCRIBA EL MÓDULO (lógica de aplicación, nada
-- que hacer aquí): una propuesta 'aceptada' solo sale de ese estado si
-- alguien la cierra a mano. Si el usuario no vuelve a abrir la app, esa
-- propuesta queda "activa" para siempre y el índice único de más abajo
-- bloquearía cualquier propuesta nueva -- un mentor bloqueado por algo de
-- hace tres meses es peor que uno sin propuestas. La aplicación debe
-- detectar una propuesta 'aceptada' cuyo vence_en ya pasó hace más de
-- otras dos semanas sin cerrar, y cerrarla sola con resultado =
-- 'descartada' (poniendo cerrada_en al mismo tiempo). El esquema no lo
-- impide: los cuatro checks de abajo se cumplen igual poniendo status,
-- resultado y cerrada_en a la vez, sin tocar aceptada_en/vence_en que ya
-- estaban puestos de cuando se aceptó.
--
-- analisis_id es opcional y usa "on delete set null", no "on delete
-- cascade": a diferencia de goal_updates o savings_contributions (donde
-- el hijo no tiene sentido sin el padre), aquí la propuesta es un
-- artefacto propio del mentor -- el análisis es solo su origen. Si ese
-- mentor_analyses se archiva (el camino normal) la fila sigue existiendo
-- y la referencia sigue siendo válida sin más; si alguna vez se borrara,
-- la propuesta debe sobrevivir igual, solo pierde el rastro de qué
-- análisis la generó.
--
-- contenido, no "propuesta" ni "texto": mismo criterio que mentor_analyses
-- y mentor_summary (evitar "text" como nombre de columna porque también
-- es un tipo), aplicado también al nombre de dominio para que la familia
-- mentor_* use la misma palabra en las tres tablas que tienen texto libre
-- del mentor.

begin;

-- ============================================================
--  mentor_proposals — cada propuesta que el mentor hizo
-- ============================================================
create table if not exists public.mentor_proposals (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid()
                            references auth.users (id) on delete cascade,
  contenido     text        not null check (char_length(trim(contenido)) > 0),
  status        text        not null default 'propuesta'
                            check (status in ('propuesta', 'aceptada', 'descartada', 'cerrada')),
  -- Solo tiene valor cuando status = 'cerrada' -- ver el check más abajo.
  -- 'descartada' aquí es un resultado de cierre (se aceptó y se abandonó
  -- durante el plazo), no el status 'descartada' de arriba (nunca se
  -- aceptó): mismo texto, columnas distintas, no se pisan.
  resultado     text        check (resultado in ('funciono', 'en-progreso', 'descartada')),
  -- Puesto una sola vez, al aceptar. No se toca después aunque la
  -- propuesta se cierre.
  aceptada_en   timestamptz,
  -- Guardado, no calculado -- ver el comentario grande de arriba.
  vence_en      date,
  -- Puesto una sola vez, al cerrar (a mano o por el cierre automático por
  -- vencimiento -- ver el comentario grande de arriba).
  cerrada_en    timestamptz,
  -- Opcional: de qué análisis salió esta propuesta. "on delete set null"
  -- porque la propuesta sobrevive al análisis -- ver el comentario grande
  -- de arriba.
  analisis_id   uuid        references public.mentor_analyses (id) on delete set null,
  archived      boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Los cuatro checks de abajo atan la forma de la fila a su etapa: nunca
  -- puede haber una propuesta 'aceptada'/'cerrada' sin aceptada_en o
  -- vence_en, ni una 'cerrada' sin cerrada_en o resultado, ni al revés
  -- (un resultado puesto en una fila que no está cerrada). El cierre
  -- automático por vencimiento (ver arriba) los cumple igual: pone los
  -- tres campos de cierre a la vez, sin tocar aceptada_en/vence_en que ya
  -- estaban puestos de cuando se aceptó.
  check ((status in ('aceptada', 'cerrada')) = (aceptada_en is not null)),
  check ((status in ('aceptada', 'cerrada')) = (vence_en    is not null)),
  check ((status = 'cerrada') = (cerrada_en is not null)),
  check ((status = 'cerrada') = (resultado  is not null))
);

-- Una sola propuesta activa a la vez: respaldo a nivel de base de datos de
-- la misma regla que savings_goal_one_active_idx, sobre las filas cuyo
-- status todavía no cerró el ciclo (ni 'descartada' ni 'cerrada' cuentan
-- como activas) y que no estén archivadas. La capa de datos ya lo valida
-- antes de insertar; esto es la última línea de defensa.
create unique index if not exists mentor_proposals_one_active_idx
  on public.mentor_proposals (user_id)
  where status in ('propuesta', 'aceptada') and not archived;

-- "La propuesta activa" (cubierto también por el índice de arriba) y "las
-- últimas descartadas": mismo criterio que
-- mentor_analyses_user_tipo_created_idx -- filtra por status, ordena por
-- fecha de creación.
create index if not exists mentor_proposals_user_status_created_idx
  on public.mentor_proposals (user_id, status, created_at desc);

drop trigger if exists mentor_proposals_set_updated_at on public.mentor_proposals;
create trigger mentor_proposals_set_updated_at
  before update on public.mentor_proposals
  for each row execute function public.set_updated_at();

alter table public.mentor_proposals enable row level security;

drop policy if exists "mentor proposals are private to owner" on public.mentor_proposals;
create policy "mentor proposals are private to owner"
  on public.mentor_proposals
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.mentor_proposals to authenticated;

commit;
