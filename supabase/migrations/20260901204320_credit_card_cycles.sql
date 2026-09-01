-- El resumen de tarjeta como entidad.
--
-- Por que: el cierre no es un dia fijo del mes. Verificado contra dos resumenes
-- reales de Galicia (1-sep-2026): la Visa cerro 23-jul, 20-ago y 24-sep --los tres
-- jueves-- contra un "dia 20" configurado. La app acertaba un ciclo de cada tres.
--
-- La pertenencia de una compra a su resumen pasa a estar ESCRITA (transactions.cycle_id)
-- en vez de derivarse de sameMonthYear(t.date, vencimiento). Ese es el invariante que
-- hace posible todo lo demas: declarar un cierre nuevo no mueve ninguna transaccion,
-- asi que el usuario puede corregir las fechas sin que se le re-fechen las cuotas.
--
-- default_closing_day / default_payment_day SOBREVIVEN como generador de los ciclos
-- futuros, no como verdad de los ya materializados.
--
-- Spec: docs/superpowers/specs/2026-09-01-ciclos-tarjeta-design.md

create table if not exists public.credit_card_cycles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  closing_date      date not null,
  due_date          date not null,
  -- 'generated' = la app lo estimo desde los defaults de la tarjeta.
  -- 'declared'  = el usuario lo leyo del resumen. Una regeneracion NUNCA pisa un declarado.
  source            text not null default 'generated' check (source in ('generated', 'declared')),
  created_at        timestamptz not null default now(),
  constraint credit_card_cycles_due_after_closing check (due_date >= closing_date),
  unique (payment_method_id, closing_date)
);

comment on table public.credit_card_cycles is
  'Un resumen de tarjeta. La pertenencia de una transaccion sale de transactions.cycle_id, no de la aritmetica de meses.';

create index if not exists credit_card_cycles_method_closing_idx
  on public.credit_card_cycles (payment_method_id, closing_date);

alter table public.credit_card_cycles enable row level security;

-- Mismo alcance que transactions_owner / payment_methods_owner: el dueno y nadie mas.
-- Se usa auth.uid() directo y no get_current_user_int_id(): esa funcion declara
-- RETURNS uuid y su cuerpo es "SELECT auth.uid()" -- el nombre quedo del modelo viejo.
create policy credit_card_cycles_owner on public.credit_card_cycles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.transactions
  add column if not exists cycle_id uuid references public.credit_card_cycles(id) on delete set null,
  -- Cuando se compro. Hoy en credito `date` es el VENCIMIENTO calculado y la fecha de
  -- compra no se guarda en ningun lado: al investigar el caso que origino el spec no
  -- hubo con que determinarla (created_at mide cuando se anoto, y se carga en tandas).
  add column if not exists purchase_date date;

comment on column public.transactions.cycle_id is
  'A que resumen pertenece. En un pago de tarjeta (card_payment_for) es el resumen que salda.';
comment on column public.transactions.purchase_date is
  'Fecha real de la compra. NULL = no se conoce (movimientos anteriores a esta columna).';

create index if not exists transactions_cycle_idx on public.transactions (cycle_id);
