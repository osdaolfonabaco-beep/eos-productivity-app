-- Tabla de ideas para Productividad.
-- Pegar en el editor SQL del proyecto y ejecutar una vez.
-- Depende de supabase/schema.sql (reutiliza la función public.set_updated_at).

begin;

create table public.ideas (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  text        text        not null check (char_length(trim(text)) > 0),
  status      text        not null default 'pendiente'
                          check (status in ('pendiente', 'en-marcha', 'descartada')),
  archived    boolean     not null default false,   -- distinto de "descartada"
  created_at  timestamptz not null default now(),   -- ordena la lista
  updated_at  timestamptz not null default now()
);

-- La lista es: no archivadas, del usuario, más recientes primero.
create index ideas_user_id_created_idx on public.ideas (user_id, created_at desc);

create trigger ideas_set_updated_at
  before update on public.ideas
  for each row execute function public.set_updated_at();

alter table public.ideas enable row level security;

create policy "ideas are private to owner"
  on public.ideas
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.ideas to authenticated;

commit;
