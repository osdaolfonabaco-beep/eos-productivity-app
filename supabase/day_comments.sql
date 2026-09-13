-- Comentario del día para Productividad.
-- Pegar en el editor SQL del proyecto y ejecutar una vez.
-- Depende de supabase/schema.sql (reutiliza la función public.set_updated_at).
--
-- Distinto del journal: este texto SÍ se manda a la IA en el análisis diario
-- y semanal (la interfaz lo deja claro junto al campo). Un comentario por
-- día; guardar el de hoy es un upsert.

begin;

create table public.day_comments (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  date        date        not null,
  text        text        not null check (char_length(trim(text)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);

create index day_comments_user_id_date_idx on public.day_comments (user_id, date);

create trigger day_comments_set_updated_at
  before update on public.day_comments
  for each row execute function public.set_updated_at();

alter table public.day_comments enable row level security;

create policy "day comments are private to owner"
  on public.day_comments
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.day_comments to authenticated;

commit;
