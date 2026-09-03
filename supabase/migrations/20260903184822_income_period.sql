-- A que mes cuenta un cobro. NULL = contá por la fecha del movimiento
-- (el comportamiento historico). Guarda siempre el dia 1 del mes elegido.
--
-- El CHECK hace que "solo aplica a ingresos" sea una regla del schema y no una
-- convencion: un gasto con income_period es un error de la base, no un bug silencioso.
-- La imputacion de un gasto ya la resuelve cycle_id.
alter table public.transactions
  add column income_period date,
  add constraint income_period_solo_ingresos
    check (income_period is null or type = 'income');

comment on column public.transactions.income_period is
  'Dia 1 del mes al que cuenta este ingreso. NULL = usar date. Solo para type = income.';

-- La preferencia: pre-elige la opcion del selector, NUNCA imputa sola.
-- NULL = el usuario todavia no contesto.
alter table public.users
  add column income_counts_next_month boolean;

comment on column public.users.income_counts_next_month is
  'true = lo que cobra en los ultimos dias del mes cuenta al mes siguiente. NULL = sin declarar.';
