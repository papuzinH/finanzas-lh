-- Popup de novedades: hasta qué versión leyó el changelog cada usuario.
--
-- Va en la base y no en localStorage porque Chanchito es una PWA que el mismo
-- usuario abre en el teléfono y en la computadora: con localStorage el popup
-- aparecería una vez por dispositivo. Además el tour ya mostró el costo del
-- patrón híbrido — su sync es unidireccional y reactivarlo pide un UPDATE acá
-- MÁS un localStorage.removeItem en el navegador.
--
-- NULL = nunca vio ninguna. Es el estado en el que quedan los usuarios que ya
-- existen, y para ellos la primera versión publicada sí aparece (se la
-- perdieron). Al recién registrado lo cubre la otra condición, que es de
-- aplicación y no de schema: sólo se muestran versiones posteriores a su alta.
--
-- Es un dato del propio usuario sobre su propia fila: las políticas RLS de
-- `users` ya lo cubren, no hace falta ninguna nueva.
--
-- Spec: docs/superpowers/specs/2026-09-01-popup-novedades-design.md

alter table public.users
  add column if not exists last_seen_version text;

comment on column public.users.last_seen_version is
  'Última versión del changelog que el usuario cerró (llave interna de src/lib/novedades/versiones.ts). NULL = ninguna.';
