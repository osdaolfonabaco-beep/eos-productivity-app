-- Suscripciones a notificaciones push (Web Push) para Productividad.
-- Pegar en el editor SQL del proyecto y ejecutar una vez.
-- Depende de supabase/schema.sql (reutiliza la función public.set_updated_at).

begin;

create table public.push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  endpoint    text        not null unique, -- clave de conflicto para el upsert al reactivar
  p256dh      text        not null,
  auth        text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy "push subscriptions are private to owner"
  on public.push_subscriptions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

commit;
