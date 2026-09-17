-- Historial del mentor para Productividad.
-- Pegar en el editor SQL del proyecto y ejecutar. Depende de
-- supabase/schema.sql (reutiliza la función public.set_updated_at).
--
-- A diferencia de schema.sql, este archivo SÍ está escrito para poder
-- ejecutarse más de una vez sin romper nada (comprobaciones de existencia
-- en table/index, drop-if-exists antes de policy/trigger) — mismo criterio
-- que supabase/incomes.sql y supabase/expenses.sql.
--
-- Dos tablas:
--   mentor_analyses — cada análisis que el mentor produjo, de solo-añadir
--     (como habit_entries o payments): nunca se sobrescribe, se archiva.
--   mentor_summary  — el resumen acumulado que el mentor mantiene sobre lo
--     que lleva observado: una sola fila por usuario que se reescribe, mismo
--     patrón que journal_key.
--
-- Ninguna de las dos columnas de texto se llama "text": en Postgres "text"
-- también es el nombre de un TIPO de dato, y una columna con ese nombre hace
-- ambiguas las consultas y los mensajes de error de cualquier `cast` o
-- función que mencione el tipo. Se llaman "contenido" en las dos tablas,
-- rompiendo a propósito con el nombre que usan ideas/weekly_goals/
-- goal_updates/day_comments/journal_entries para lo mismo.
--
-- El análisis de una idea suelta ("Analizar con IA" en la pestaña Ideas) NO
-- entra aquí: es otra función, vive y muere en el estado de esa tarjeta
-- (ver IdeaCard.tsx) y no forma parte del historial del mentor.

begin;

-- ============================================================
--  mentor_analyses — cada análisis que el mentor produjo
-- ============================================================
create table if not exists public.mentor_analyses (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid()
                            references auth.users (id) on delete cascade,
  -- Lista cerrada, no texto libre: "tipo" es un discriminante técnico que ya
  -- existe como unión cerrada en el cliente ('diario' | 'semanal' | 'mensual'
  -- en src/data/analysis.ts), igual que status/quincena/resultado/direction
  -- en el resto del esquema. No es un campo personal y abierto como
  -- incomes.category, que sí es texto libre a propósito.
  tipo          text        not null check (tipo in ('diario', 'semanal', 'mensual')),
  -- Un rango cubre los tres tipos sin columnas nuevas cuando "mensual" se
  -- implemente de verdad: diario es period_start = period_end (un solo
  -- día), semanal es lunes-domingo, mensual sería el primer y último día
  -- del mes. Mismos nombres que salary_periods.period_start/period_end.
  period_start  date        not null,
  period_end    date        not null,
  -- Copia exacta del tipo Tone del cliente (src/data/preferences.ts):
  -- mismo criterio de lista cerrada que "tono" en user_metadata.
  tono          text        not null check (tono in ('directo', 'equilibrado', 'breve')),
  -- Qué vio el mentor al escribir este análisis, sin guardar los datos en
  -- sí: hoy ningún payload (diario/semanal) incluye Dinero todavía, así que
  -- esto siempre nace en false; el día que exista el interruptor "el mentor
  -- ve Dinero" (una preferencia en user_metadata, no una columna aquí:
  -- ver el comentario grande más abajo, junto a mentor_summary), cada fila
  -- nueva registrará si ESE análisis en concreto llegó a incluirlo. Es un
  -- hecho histórico de la fila, no el ajuste en vivo -- los dos coexisten
  -- sin pisarse. Booleano explícito, no un jsonb de "flags": mismo criterio
  -- que el resto del esquema, que no guarda blobs de datos de dominio.
  incluyo_dinero boolean    not null default false,
  contenido     text        not null check (char_length(trim(contenido)) > 0),
  archived      boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (period_end >= period_start),
  -- Un análisis diario se refiere a un solo día: mismo criterio que el
  -- índice único parcial de savings_goal ("la capa de datos ya lo valida
  -- antes de insertar; esto es la última línea de defensa").
  check (tipo <> 'diario' or period_start = period_end)
);

-- "Los últimos 3-4 análisis de un tipo": user_id + tipo como filtro, fecha
-- de creación para el orden. Se usa created_at y no period_start porque
-- "los últimos" se lee como "los más recientemente producidos" -- si el
-- mentor se pide dos veces el mismo día, el segundo debe salir primero, y
-- ahí period_start (el mismo día en los dos) no distingue. Un solo índice
-- compuesto basta con el volumen de una app de un solo usuario.
create index if not exists mentor_analyses_user_tipo_created_idx
  on public.mentor_analyses (user_id, tipo, created_at desc);

drop trigger if exists mentor_analyses_set_updated_at on public.mentor_analyses;
create trigger mentor_analyses_set_updated_at
  before update on public.mentor_analyses
  for each row execute function public.set_updated_at();

alter table public.mentor_analyses enable row level security;

drop policy if exists "mentor analyses are private to owner" on public.mentor_analyses;
create policy "mentor analyses are private to owner"
  on public.mentor_analyses
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.mentor_analyses to authenticated;

-- ============================================================
--  mentor_summary — el resumen acumulado, una fila por usuario
--  Mismo patrón que journal_key: unique(user_id), sin "archived" (no
--  aplica a una fila que se reescribe, no a una lista).
-- ============================================================
create table if not exists public.mentor_summary (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null default auth.uid()
                                    references auth.users (id) on delete cascade,
  contenido             text        not null check (char_length(trim(contenido)) > 0),
  -- Red de un paso: si una reescritura del resumen sale peor que la
  -- anterior (un bug, una respuesta rara del modelo), se puede volver atrás
  -- sin tener que regenerarlo con más llamadas a la IA. Nullable y sin
  -- check de no-vacío a propósito: al principio (primer resumen que se
  -- escribe) todavía no hay un "anterior" que guardar aquí.
  previous_contenido    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id)
);

drop trigger if exists mentor_summary_set_updated_at on public.mentor_summary;
create trigger mentor_summary_set_updated_at
  before update on public.mentor_summary
  for each row execute function public.set_updated_at();

alter table public.mentor_summary enable row level security;

drop policy if exists "mentor summary is private to owner" on public.mentor_summary;
create policy "mentor summary is private to owner"
  on public.mentor_summary
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.mentor_summary to authenticated;

commit;
