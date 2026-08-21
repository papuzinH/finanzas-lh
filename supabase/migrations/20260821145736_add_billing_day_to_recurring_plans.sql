-- Mensualidades de crédito que se postean solas al vencimiento.
-- Spec: docs/superpowers/specs/2026-08-21-mensualidades-credito-automaticas-design.md

-- 1) El dato que faltaba: qué día del mes factura el plan.
--    Nullable a propósito: se lee como `billing_day ?? 1`, así que los planes
--    existentes siguen funcionando sin backfill.
alter table public.recurring_plans
  add column if not exists billing_day integer;

alter table public.recurring_plans
  drop constraint if exists recurring_plans_billing_day_range;

alter table public.recurring_plans
  add constraint recurring_plans_billing_day_range
  check (billing_day is null or (billing_day between 1 and 31));

comment on column public.recurring_plans.billing_day is
  'Dia del mes en que el plan se factura (1-31). Se lee como billing_day ?? 1. En credito define en que resumen cae; en debito alimenta el "vence el X".';

-- 2) One-shot: las mensualidades de crédito ya registradas están fechadas al
--    día 01 del mes de CONSUMO, no al vencimiento del resumen. Se las re-fecha
--    con la misma regla que usan cuotas y compras (calculateCreditPaymentDate):
--    si el día de cobro es posterior al cierre, el consumo se va al resumen
--    siguiente; y si el vencimiento es anterior al cierre, cae un mes después.
--    Sólo toca filas anteriores al mes en curso y con día 01 (las que generó el
--    backfill viejo). Corre una única vez, registrada en schema_migrations.
with objetivo as (
  select t.id,
         t.date as consumo,
         pm.default_closing_day as cierre,
         pm.default_payment_day as vence
  from public.transactions t
  join public.payment_methods pm on pm.id = t.payment_method_id
  where t.recurring_plan_id is not null
    and pm.type = 'credit'
    and pm.default_closing_day is not null
    and pm.default_payment_day is not null
    and extract(day from t.date) = 1
    and t.date < date_trunc('month', current_date)
)
update public.transactions t
set date = (
      date_trunc('month', o.consumo)
      + (case when extract(day from o.consumo) > o.cierre then interval '1 month' else interval '0 month' end)
      + (case when o.vence < o.cierre then interval '1 month' else interval '0 month' end)
      + ((o.vence - 1) * interval '1 day')
    )::date
from objetivo o
where t.id = o.id;
