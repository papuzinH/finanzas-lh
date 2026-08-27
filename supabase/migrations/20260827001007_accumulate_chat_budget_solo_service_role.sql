-- Auditoría 2026-08-26 (H3): accumulate_chat_budget era ejecutable por
-- `authenticated` con los tokens como parámetro. Desde el browser, con la
-- sesión de cualquier usuario, ~90 llamadas con 200k+200k tokens "gastaban"
-- los USD 50 del presupuesto mensual y check_and_increment_chat_usage devolvía
-- budget_exceeded para todos hasta fin de mes. No costaba plata real (no
-- llama a Gemini), pero apagaba el asistente y falseaba la contabilidad.
--
-- Ahora la acumula sólo el server, con service_role (route.ts usa
-- createAdminClient()). Se saca el chequeo de auth.uid(), que con service_role
-- es NULL, y se revoca EXECUTE a todo lo que no sea service_role.
-- check_and_increment_chat_usage y delete_my_account siguen como están: sólo
-- afectan al propio usuario.

create or replace function public.accumulate_chat_budget(p_input_tokens integer, p_output_tokens integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_period    text := to_char(now(), 'YYYY-MM');
  v_in_price  numeric;
  v_out_price numeric;
  v_max       integer;
  v_in        integer;
  v_out       integer;
  v_cost      numeric;
begin
  select input_price_per_1m, output_price_per_1m, max_tokens_per_call
    into v_in_price, v_out_price, v_max
    from chat_config where id = true;

  v_in  := least(greatest(coalesce(p_input_tokens, 0), 0), v_max);
  v_out := least(greatest(coalesce(p_output_tokens, 0), 0), v_max);

  v_cost := (v_in::numeric  / 1000000 * v_in_price)
          + (v_out::numeric / 1000000 * v_out_price);

  insert into chat_budget (period, request_count, input_tokens, output_tokens, estimated_cost_usd, updated_at)
  values (v_period, 1, v_in, v_out, v_cost, now())
  on conflict (period) do update set
    request_count      = chat_budget.request_count      + 1,
    input_tokens       = chat_budget.input_tokens       + v_in,
    output_tokens      = chat_budget.output_tokens      + v_out,
    estimated_cost_usd = chat_budget.estimated_cost_usd + v_cost,
    updated_at         = now();
end;
$$;

revoke all on function public.accumulate_chat_budget(integer, integer) from public;
revoke all on function public.accumulate_chat_budget(integer, integer) from anon;
revoke all on function public.accumulate_chat_budget(integer, integer) from authenticated;
grant execute on function public.accumulate_chat_budget(integer, integer) to service_role;
