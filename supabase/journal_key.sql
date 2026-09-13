-- Cifrado del diario: la DEK envuelta para cada usuario.
-- Pegar en el editor SQL del proyecto y ejecutar una vez.
-- Depende de supabase/schema.sql (reutiliza la función public.set_updated_at).
--
-- Una sola fila por usuario. La DEK (la clave que cifra cada nota) nunca se
-- guarda en claro: aquí solo viven sus dos envolturas AES-GCM — una derivada
-- de la contraseña, otra del código de recuperación — junto con la sal y el
-- IV de cada una. El detalle criptográfico vive en src/lib/journalCrypto.ts.

begin;

create table public.journal_key (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null default auth.uid()
                                    references auth.users (id) on delete cascade,
  wrapped_dek_password  text        not null,
  salt_password         text        not null,
  iv_password           text        not null,
  wrapped_dek_recovery  text        not null,
  salt_recovery         text        not null,
  iv_recovery           text        not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id)
);

create trigger journal_key_set_updated_at
  before update on public.journal_key
  for each row execute function public.set_updated_at();

alter table public.journal_key enable row level security;

create policy "journal key is private to owner"
  on public.journal_key
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.journal_key to authenticated;

commit;
