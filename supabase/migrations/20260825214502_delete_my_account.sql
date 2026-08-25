-- delete_my_account(): borra TODO lo del usuario que llama, en una sola
-- transacción, incluida su fila de public.users.
--
-- SECURITY DEFINER sin parámetros: el usuario sale de auth.uid(), así que ni
-- desde el browser (anon key + sesión) se puede borrar a otro. Mismo patrón que
-- check_and_increment_chat_usage(). La cuenta de Auth (auth.users) NO se toca
-- acá: la borra el server action deleteMyAccount (app/perfil/actions.ts) con
-- service_role, después de que esto termine bien.
--
-- Orden FK-safe: varias FKs hacia users, payment_methods, categories,
-- installment_plans y recurring_plans son NO ACTION, así que primero las hojas
-- y después lo referenciado. staging_plans queda afuera a propósito: user_id
-- smallint, tabla legacy sin uso en la app.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'delete_my_account: sin sesión' using errcode = '28000';
  end if;

  delete from public.pending_detections        where user_id = uid;
  delete from public.savings_goal_contributions where user_id = uid;
  delete from public.investment_transactions   where user_id = uid;
  delete from public.transactions              where user_id = uid;
  delete from public.internal_transfers        where user_id = uid;
  delete from public.installment_plans         where user_id = uid;
  delete from public.recurring_plans           where user_id = uid;
  delete from public.category_budgets          where user_id = uid;
  delete from public.savings_goals             where user_id = uid;
  delete from public.savings                   where user_id = uid;
  delete from public.investments               where user_id = uid;
  delete from public.investment_assets         where user_id = uid;
  delete from public.payment_methods           where user_id = uid;
  delete from public.categories                where user_id = uid;
  delete from public.chat_usage                where user_id = uid;
  delete from public.users                     where id = uid;
end;
$$;

-- Solo usuarios logueados (y service_role). Nunca anon ni public.
revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.delete_my_account() to service_role;
