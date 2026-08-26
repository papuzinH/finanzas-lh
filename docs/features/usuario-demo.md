# Usuario demo (Emi)

## Propósito
Usuario ficticio en la base DEV (`hgxuxoqyrooaariimqmg`, «Chanchito DEV»,
cuenta B / org STUDIO) para capturas de la landing y el video del portfolio.
Spec: `docs/superpowers/specs/2026-08-22-landing-michanchito-design.md`.

⚠️ Historia (para no repetirla): entre el 22-ago y el 26-ago-2026 **la base
DEV no existía** — este doc la nombraba igual, y el demo vivió en producción
con el guard aprobando exactamente lo que decía impedir (comparaba la URL
contra el `SEED_TARGET_REF` del mismo `.env.local`). Desde el 26-ago DEV es
real y el guard tiene el ref de producción hardcodeado como prohibido. La Emi
vieja de producción puede seguir existiendo hasta que se la borre (pendiente
opcional); con el provider email apagado en prod ya no puede ni loguearse.

## Comandos
- `npm run seed:demo` — lo (re)crea en DEV. Idempotente; guard en dos capas:
  producción prohibida por ref hardcodeado + la URL tiene que coincidir con
  `SEED_TARGET_REF`.
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
