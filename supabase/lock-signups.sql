-- OPCIONAL — cerrar el registro a un solo correo (el tuyo).
--
-- Pegar DESPUÉS de tu primer inicio de sesión con enlace mágico, para que tu
-- usuario ya exista. Sustituye el correo antes de ejecutar.
--
-- Alternativa sin SQL: Authentication -> Sign In / Providers ->
-- "Allow new users to sign up" = off.

create or replace function public.only_owner_can_sign_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) is distinct from lower('TU-CORREO@EJEMPLO.COM') then
    raise exception 'Registro cerrado';
  end if;
  return new;
end;
$$;

create trigger enforce_single_user
  before insert on auth.users
  for each row execute function public.only_owner_can_sign_up();

-- Para revertir:
--   drop trigger enforce_single_user on auth.users;
--   drop function public.only_owner_can_sign_up();
