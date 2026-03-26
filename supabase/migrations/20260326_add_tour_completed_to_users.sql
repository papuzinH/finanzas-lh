-- Agrega columna para persistir el estado del tour guiado entre dispositivos
ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_completed BOOLEAN NOT NULL DEFAULT false;
