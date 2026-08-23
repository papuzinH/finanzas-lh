# Usuario demo (Emi)

## Propósito
Usuario ficticio en la base DEV para capturas de la landing y el video del
portfolio. Nunca existe en producción. Spec:
`docs/superpowers/specs/2026-08-22-landing-michanchito-design.md`.

## Comandos
- `npm run seed:demo` — lo (re)crea en DEV. Idempotente; exige
  `SEED_TARGET_REF` en `.env.local` y aborta si la URL no lo contiene.
- `npm run capture:demo` — captura home/compromisos/inversiones a
  `public/landing/` (390×844 @2x, tema día, < 150 KB c/u). Requiere el build
  de producción corriendo (`npm run build && npx next start -p 3100`).

## Env (en `.env.local`, no commitear)
`DEMO_USER_EMAIL` · `DEMO_USER_PASSWORD` · `SEED_TARGET_REF` (ref del
proyecto DEV).

## Gotchas
- El provider **Email** está habilitado solo en DEV; la UI
  sigue ofreciendo únicamente Google.
- Las fechas del seed son **relativas a hoy**: re-correr seeder + capturas
  regenera todo sin envejecer.
- El mes corriente de las suscripciones no se siembra: lo postea
  `syncAutomaticRecurringCharges` en la primera carga (el motor real).
- La sesión de captura se inyecta como cookies `@supabase/ssr`
  (`sb-<ref>-auth-token`, "base64-" + base64url, chunks de 3180). Si el
  formato cambia con una versión nueva de `@supabase/ssr`, el script falla
  con instrucciones.
- `market_prices`/`exchange_rates` de DEV reciben precios `source:
  'seed-demo'` para que el portfolio valúe sin banner.
- `captura-home.png` sale con la tarjeta de "Tu plata libre" **colapsada**
  (estado inicial de `balance-card.tsx`, `expanded=false`): no muestra la
  línea "Guardado en reservas" aunque el seed carga una cuenta `reserve`
  ("Colchón", $1.500.000). Para capturarla habría que hacer click en la
  tarjeta antes del screenshot.
- `captura-compromisos.png` sale en la tab **Cuotas** (default de
  `/compromisos` sin query `?tab=`): no muestra las suscripciones
  (Netflix/Spotify/Gimnasio), que viven en la tab Mensualidades
  (`/compromisos?tab=mensualidades`). Un solo archivo no puede mostrar
  ambas tabs a la vez.
- El hero de la landing redibuja el disponible con `DISPONIBLE_DEMO`
  (`src/components/landing/constantes.ts`): al regenerar capturas,
  actualizarlo en el mismo commit.
