-- El "para qué" del mentor para Productividad.
-- Pegar en el editor SQL del proyecto y ejecutar. Depende de
-- supabase/schema.sql (reutiliza la función public.set_updated_at).
--
-- Escrito para poder ejecutarse más de una vez sin romper nada
-- (comprobaciones de existencia en table/index, drop-if-exists antes de
-- policy/trigger) -- mismo criterio que supabase/mentor.sql.
--
-- Una sola fila por usuario, que se reescribe -- mismo patrón que
-- mentor_summary y journal_key. La diferencia de fondo con mentor_summary
-- es quién escribe: mentor_summary lo escribe el mentor (la IA), como
-- efecto de un análisis; esto lo escribe el usuario, a mano, cuando
-- quiere. Por eso es una tabla aparte y no columnas nuevas en
-- mentor_summary: dueños distintos, frecuencias de escritura distintas, y
-- sin el campo previous_contenido de mentor_summary (esa red de un paso
-- es contra una reescritura de IA que puede salir mal; aquí no hay IA
-- escribiendo, no aplica).
--
-- Tres campos de texto libre, los tres opcionales -- alguien puede querer
-- responder solo uno:
--   objetivo    -- qué está intentando lograr
--   plazo       -- en qué plazo
--   dificultad  -- qué le está costando
-- Normalizados con el criterio del resto del esquema: nunca cadena vacía,
-- o nulo o con contenido (ver el check de cada columna más abajo).
--
-- Si los tres quedan vacíos, la fila se BORRA -- lo hace la capa de datos
-- (mentorPurpose.ts), no un trigger aquí. Una fila con los tres campos en
-- null pero con reviewed_at puesto sería peor que no tener fila: para
-- saber si el usuario ya escribió su propósito habría que mirar el
-- contenido en vez de la sola existencia de la fila, y el aviso de "más
-- de un mes sin revisarse" avisaría sobre un propósito que en realidad no
-- existe. Que quede dicho aquí para cuando se escriba ese módulo.
--
-- reviewed_at es NOT NULL con default now(): si la fila existe, se creó
-- en algún momento, y eso ya cuenta como una revisión. Un nulo ahí sería
-- un caso más que tratar en la aplicación sin representar ningún estado
-- real -- toda fila nace revisada. Es distinto de updated_at a propósito:
-- updated_at es metadata de infraestructura que cambia con cualquier
-- update de la fila; reviewed_at es un hecho del dominio ("el usuario
-- confirmó que esto sigue vigente") que la aplicación pone también al
-- confirmar vigencia sin tocar el texto -- mismo criterio que
-- mentor_analyses.incluyo_dinero: un hecho explícito, no algo inferido de
-- un efecto secundario.

begin;

create table if not exists public.mentor_purpose (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid()
                            references auth.users (id) on delete cascade,
  -- Los tres topes son distintos a propósito porque son cosas distintas:
  -- el objetivo necesita espacio para que la respuesta sea honesta y no
  -- una frase de relleno (1200 caracteres, varios párrafos cortos); el
  -- plazo es una frase, no un párrafo (200 caracteres bastan de sobra);
  -- la dificultad es intermedia, normalmente un párrafo (800 caracteres).
  -- El total (2200 caracteres en el peor caso) sigue siendo barato frente
  -- al resto de lo que ya viaja a la IA en cada análisis.
  objetivo      text,
  plazo         text,
  dificultad    text,
  reviewed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (objetivo   is null or (char_length(trim(objetivo))   > 0 and char_length(objetivo)   <= 1200)),
  check (plazo      is null or (char_length(trim(plazo))      > 0 and char_length(plazo)      <=  200)),
  check (dificultad is null or (char_length(trim(dificultad)) > 0 and char_length(dificultad) <=  800)),
  unique (user_id)
);

drop trigger if exists mentor_purpose_set_updated_at on public.mentor_purpose;
create trigger mentor_purpose_set_updated_at
  before update on public.mentor_purpose
  for each row execute function public.set_updated_at();

alter table public.mentor_purpose enable row level security;

drop policy if exists "mentor purpose is private to owner" on public.mentor_purpose;
create policy "mentor purpose is private to owner"
  on public.mentor_purpose
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.mentor_purpose to authenticated;

commit;
