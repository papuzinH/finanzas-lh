-- El recordatorio de declarar las fechas del resumen aparece el dia que ese resumen cierra.
-- "Ahora no" tiene que sobrevivir al cambio de dispositivo: la app se abre en el telefono y en
-- la compu, y en localStorage el aviso reaparece una vez por cada uno. Es la leccion del tour.
alter table public.credit_card_cycles
  add column if not exists reminder_dismissed_at timestamptz;

comment on column public.credit_card_cycles.reminder_dismissed_at is
  'Cuando el usuario dijo "ahora no" al pedido de declarar las fechas de este resumen. NULL = nunca.';
