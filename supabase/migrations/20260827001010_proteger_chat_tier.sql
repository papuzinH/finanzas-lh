-- Auditoría 2026-08-26 (M1): la policy de `users` es ALL sobre la fila propia y
-- `authenticated` tiene UPDATE sobre la columna, así que desde el browser
-- cualquier usuario podía hacer update users set chat_tier = 'pro' y pasar de
-- 30 a 300 mensajes de Gemini por día. Ninguna action ni pantalla escribe
-- chat_tier, así que el trigger no rompe nada: sólo service_role puede
-- cambiarlo (y hoy nadie lo cambia; cuando exista el freemium, será el server).

create or replace function public.proteger_chat_tier()
returns trigger
language plpgsql
as $$
begin
  if new.chat_tier is distinct from old.chat_tier
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'chat_tier sólo lo cambia el servidor' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists users_proteger_chat_tier on public.users;
create trigger users_proteger_chat_tier
  before update on public.users
  for each row execute function public.proteger_chat_tier();
