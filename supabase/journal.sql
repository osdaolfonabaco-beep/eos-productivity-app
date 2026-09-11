-- Tabla del diario para Productividad.
-- Pegar en el editor SQL del proyecto y ejecutar una vez.
-- Depende de supabase/schema.sql (reutiliza la función public.set_updated_at).

begin;

create table public.journal_entries (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  date        date        not null,
  text        text        not null check (char_length(trim(text)) > 0),
  archived    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)   -- una entrada por día; escribir hoy es un upsert
);

create index journal_entries_user_id_date_idx on public.journal_entries (user_id, date desc);

create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

alter table public.journal_entries enable row level security;

create policy "journal entries are private to owner"
  on public.journal_entries
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.journal_entries to authenticated;

commit;
