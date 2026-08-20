-- Marca si el usuario ya paso por la puesta a punto del modelo de bolsillo.
-- No se puede derivar de los datos: alguien que SALTEA el flujo queda indistinguible
-- de alguien que nunca lo vio, y el flujo le aparecería para siempre.
-- Aditiva, con default: los usuarios existentes arrancan en false (les toca el flujo);
-- el onboarding de los nuevos la deja en true al terminar.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pocket_setup_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.pocket_setup_completed IS
  'true = el usuario ya declaro sus saldos, reservas y ritmo (o salteo el flujo). false = el middleware lo manda a /puesta-a-punto.';
