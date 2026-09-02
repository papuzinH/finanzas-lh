-- Backfill de los ciclos de tarjeta.
--
-- No cambia ningun monto ni ninguna pertenencia: escribe EXPLICITAMENTE la
-- agrupacion que los datos ya tenian implicita en el mes de t.date, y unifica
-- las fechas mostradas dentro del mismo mes. Mismo criterio que el Plan 1 del
-- disponible anclado (2026-08-20).
--
-- El invariante lo verifica scripts/verificar-migracion-ciclos.mjs: el total a
-- pagar de cada tarjeta, por mes, identico antes y despues.
--
-- Spec: docs/superpowers/specs/2026-09-01-ciclos-tarjeta-design.md

-- 1. Ciclos retroactivos desde los defaults de cada tarjeta configurada.
--    Rango: sep-2025 (el movimiento de credito mas viejo) a ago-2027 (la ultima
--    cuota futura), con un mes de margen a cada lado.
--    El clamp `least(dia, ultimo dia del mes)` replica lo que hace generarCiclos.
with tarjetas as (
  select id, user_id, default_closing_day as cd, default_payment_day as pd
  from public.payment_methods
  where type = 'credit'
    and default_closing_day is not null
    and default_payment_day is not null
),
meses as (
  select generate_series(date '2025-08-01', date '2027-09-01', interval '1 month')::date as m
)
insert into public.credit_card_cycles (user_id, payment_method_id, closing_date, due_date, source)
select
  t.user_id,
  t.id,
  make_date(
    extract(year from x.m)::int, extract(month from x.m)::int,
    least(t.cd, extract(day from (x.m + interval '1 month - 1 day'))::int)
  ),
  make_date(
    extract(year from p.mp)::int, extract(month from p.mp)::int,
    least(t.pd, extract(day from (p.mp + interval '1 month - 1 day'))::int)
  ),
  'generated'
from tarjetas t
cross join meses x
cross join lateral (
  -- pd > cd: vence en el mismo mes del cierre. pd <= cd: el mes siguiente.
  select case when t.pd > t.cd then x.m else (x.m + interval '1 month')::date end as mp
) p
on conflict (payment_method_id, closing_date) do nothing;

-- 2. cycle_id de cada consumo: el ciclo cuyo VENCIMIENTO cae en el mes de su
--    t.date. Es exactamente la regla que hoy aplica computePaymentMethodStatus
--    (sameMonthYear(t.date, nextPaymentDate)), escrita como dato.
update public.transactions t
set cycle_id = c.id
from public.credit_card_cycles c
where t.payment_method_id = c.payment_method_id
  and t.cycle_id is null
  and date_trunc('month', c.due_date) = date_trunc('month', t.date);

-- 3. Los pagos de tarjeta se imputan al resumen que saldan. El join va por
--    card_payment_for y NO por payment_method_id: el pago sale del medio
--    financiador (Mercado Pago), no de la tarjeta.
update public.transactions t
set cycle_id = c.id
from public.credit_card_cycles c
where t.card_payment_for = c.payment_method_id
  and t.cycle_id is null
  and date_trunc('month', c.due_date) = date_trunc('month', t.date);

-- 4. purchase_date de las cuotas: installment_plans.purchase_date existe y es
--    NOT NULL desde siempre. Las demas quedan NULL a proposito -- created_at
--    mide cuando se ANOTO el movimiento, no cuando se compro, y el usuario
--    carga en tandas: rellenar con eso seria inventar el dato.
update public.transactions t
set purchase_date = ip.purchase_date
from public.installment_plans ip
where t.installment_plan_id = ip.id
  and t.purchase_date is null;

-- 5. Realineado de t.date al vencimiento de SU ciclo, con guard: solo si cae en
--    el mismo mes. Si cruzara de mes, la fila NO se toca -- esa es la diferencia
--    entre unificar como se muestra una fecha y mover plata de un resumen a otro.
--    Medido antes de escribir esta migracion: hoy 0 filas cruzarian.
--    Excluye los PAGOS (card_payment_for is null): en un pago t.date es el dia
--    real en que el usuario pago (payCreditCardCycle lo toma de su input), no
--    un vencimiento -- reescribirlo corre la fecha real de un movimiento de
--    plata y desalinea el saldo del medio financiador. El pago conserva el
--    cycle_id que le puso el paso 3, asi que hasCardPaymentInCycle lo sigue
--    encontrando igual.
update public.transactions t
set date = c.due_date
from public.credit_card_cycles c
where t.cycle_id = c.id
  and t.card_payment_for is null
  and t.date <> c.due_date
  and date_trunc('month', t.date) = date_trunc('month', c.due_date);
