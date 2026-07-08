# Inversiones (portfolio bimonetario)

## Propósito
Tracker de inversiones v2 basado en **activos + transacciones** (`investment_assets` / `investment_transactions`): el usuario carga compras/ventas y la app calcula posición, PPC, valor actual y P&L (realizado y no realizado) en ARS o dólar (MEP / CCL / USDT). Soporta 13 tipos de activo (`stock, cedear, bond, on, bopreal, lecap, boncap, plazo_fijo, money_market, crypto, stablecoin, fci, etf`), cotizaciones automáticas multi-fuente (Yahoo, scraping IOL, CoinGecko) y una card de "Ahorros" sueltos (tabla `savings`, ARS/USD sin ticker).

## Rutas / entry points
- **`/inversiones`** → `src/app/inversiones/page.tsx` (Server Component trivial) que renderiza `InversionesClient` (`'use client'`, 3 tabs: Dashboard / Portfolio / Cargar).
- **`POST /api/investments/update-prices`** → `src/app/api/investments/update-prices/route.ts`: refresca precios de todos los activos activos del usuario vía `runUpdatePrices`. Lo llama el botón de refresh de `PricesStatusBar`, el retry de `FailedPricesDialog` y un **auto-refresh** en `inversiones-client.tsx` (una vez por montaje, si `lastUpdate` > 1 h o faltan pairs de `exchange_rates`).

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/app/inversiones/inversiones-client.tsx` | UI completa (hero, métricas, tabs, auto-refresh de precios) |
| `src/app/inversiones/actions.ts` | Server actions: `quickAdd` (alta principal), `createAsset`, `createTransaction`, `deleteAsset` (soft-delete `is_active=false`), `deleteTransaction`, `createSaving`/`deleteSaving`, `updateMarketPrices`, `createInvestment` (legacy v1) |
| `src/lib/investments/update-prices-core.ts` | `runUpdatePrices(supabase, userId)`: batches de 5, upsert en `market_prices` + upsert de `exchange_rates` (Blue/MEP/CCL/USDT) |
| `src/lib/investments/prices/dispatcher.ts` | `fetchPriceForAsset`: router por `asset_type`; calcula CCL implícito de CEDEARs; devuelve `null` para plazo_fijo/money_market |
| `src/lib/investments/prices/yahoo.ts` | Stocks/CEDEARs BCBA (sufijo `.BA`) y precio USD exterior (chart API) |
| `src/lib/investments/prices/iol.ts` | Scraping IOL con **cheerio** (`span[data-field="UltimoPrecio"]`): bonos, ONs, letras, FCIs, o `data_source_url` explícita |
| `src/lib/investments/prices/coingecko.ts` | Cripto/stablecoins (map ticker→coinId, USD+ARS) |
| `src/lib/investments/prices/exchange-rates.ts` | `fetchAllRates()`: dolarapi.com (blue/bolsa/contadoconliqui) + USDT vía CoinGecko |
| `src/components/inversiones/quick-add-form.tsx` | **Formulario de alta** (RHF + Zod). Campos condicionales: TNA/vencimiento para plazo fijo, entidad para money market |
| `src/components/inversiones/portfolio-list.tsx`, `portfolio-distribution.tsx`, `prices-status-bar.tsx`, `failed-prices-dialog.tsx`, `savings-card.tsx`, `asset-type-badge.tsx`, `asset-type-picker.tsx`, `currency-toggle.tsx`, `profit-badge.tsx`, `price-source-badge.tsx` | Piezas de UI |
| `src/lib/schemas/investment-asset.ts`, `investment-transaction.ts` | Schemas Zod v2 (`ASSET_TYPES`, `TRANSACTION_TYPES`) |
| `src/lib/schemas/investment.ts` | **@deprecated** (schema v1); aún importado por `inversiones/actions.ts` para `createInvestment` y re-exporta los schemas v2 |
| `supabase/migrations/20260331_investment_tracker_v2.sql` | Crea tablas v2, altera `market_prices`, migra datos desde `investments` v1, RLS |

> OJO: `create-investment-dialog`, `payment-calendar` y `risk-analysis` fueron **eliminados** (huérfanos, limpieza de proyecto). El alta se hace exclusivamente con `QuickAddForm` en el tab "Cargar".

## Getters del store (`lib/store/financeStore.ts`)
- `getPortfolioStatus(displayCurrency?)` — núcleo: por activo calcula posición (`buys − sells`), PPC en ARS, precio actual (con casos especiales: plazo fijo/MM devengan `capital × (1 + TNA·días/365)` desde `metadata.start_date`; activos USD usan `price_usd × MEP` o `ccl_implicit` para CEDEARs) y P&L. Devuelve totales + `totalSavings` (tabla `savings` convertida a ARS por MEP). Conversión de display: MEP/CCL/USDT desde `exchange_rates` con **fallback a dólar blue** y último recurso `1`.
- `getPortfolioDistribution()` — agrupa `currentValue` por `asset_type` (con colores hardcodeados hex — excepción histórica al design system).
- `getUpcomingPayments(days=90)` — cupones desde `market_prices.next_coupon_date/amount` × posición. Hoy nada escribe esas columnas desde la app (quedaron para n8n/backend), así que suele devolver vacío.
- `getAssetDetail(assetId)` — detalle por activo (transacciones, PPC, proyección de plazo fijo).
- `getBenchmarkComparison(period)` — **stub**: devuelve todo `null` ("Wave 9").

## Tablas DB (criterio de `user_id` — gotcha crítico del repo)
| Tabla | Filtro | Notas |
|---|---|---|
| `investment_assets` | **UUID de auth** (`auth.users.id`, RLS `user_id = auth.uid()`) | Soft-delete con `is_active` |
| `investment_transactions` | **UUID de auth** | `type: buy/sell/dividend/coupon/interest`; `total_amount = qty × price` calculado en la action |
| `investments` (v1, legacy) | **UUID de auth** (como texto; RLS `user_id = auth.uid()::text`) | Migrada a v2 por la migración; el store todavía la fetchea a `state.investments` |
| `savings` | **UUID de auth** | Tenencias sueltas ARS/USD |
| `market_prices` | **global, sin user_id** (keyed por `ticker` único) | RLS: solo policy de SELECT en migraciones versionadas (ver gotchas) |
| `exchange_rates` | **global** (keyed por `pair` único: `USD_ARS_BLUE/MEP/CCL`, `USDT_ARS`) | RLS: SELECT authenticated; INSERT/UPDATE **solo service_role** |

Las server actions usan `user.id` de `supabase.auth.getUser()` (el UUID) — correcto para todas estas tablas. **Nunca** usar acá el id numérico de `public.users` (ese es para `transactions`/`payment_methods`/etc.).

## Flujos principales
1. **Alta (quickAdd)**: normaliza ticker base para bonos/ONs/BOPREAL (`AL30D/AL30C → AL30`), busca o crea el `investment_asset` (metadata: `tna` guardada como decimal /100, `end_date`, `entity`, `start_date` para PF/MM), crea la `investment_transaction` tipo `buy`, y si el asset es nuevo (y no PF/MM) intenta un fetch inicial de precio → upsert en `market_prices`.
2. **Actualización de precios**: `runUpdatePrices` recorre los activos activos en batches de 5 → `fetchPriceForAsset` → upsert `market_prices` (incluye `price_usd`, `ccl_implicit`, `source`); PF/MM cuentan como "updated" sin fetch. Al final upsertea `exchange_rates` con `fetchAllRates()`. Devuelve `{ updated, failed[], rates_updated }`; los tickers fallidos alimentan `FailedPricesDialog`.
3. **Renta fija**: IOL cotiza por cada 100 VN → el dispatcher divide `raw / 100` para precio por nominal.
4. **Baja**: `deleteAsset` = `is_active=false` (las transacciones quedan); `deleteTransaction` sí borra.
5. **Chatbot**: la tool `get_portfolio_status` (`lib/ai/tools/readTools.ts`) delega en `handlePortfolio` (`lib/ai/handlers.ts`), que lee la tabla **legacy `investments`** y NO el modelo v2 (ver gotchas).

## Invariantes y gotchas
- **Todos los cálculos internos son en ARS**; `displayCurrency` solo convierte al final (`convertArsToDisplay`). Las compras en USD se convierten a ARS por MEP para el costo.
- **RLS vs. escritura de precios**: según las migraciones versionadas, `market_prices` solo tiene policy de SELECT y `exchange_rates` solo permite escritura a `service_role`; sin embargo `runUpdatePrices` upsertea con el **cliente del usuario autenticado**. Si las policies reales de la DB no fueron ampliadas por fuera del repo, esos upserts fallan silenciosamente (error solo logueado, `failed[]`/`rates_updated=false`). Revisar el dashboard antes de asumir un bug de scraping.
- **`get_portfolio_status` del chat lee `investments` (v1) filtrando por `ctx.userId` numérico**, pero `investments.user_id` es UUID → en la práctica no matchea (deuda conocida; el chat responde "no tenés inversiones"). No "arreglar" copiando lógica: migrar la tool al modelo v2 reusando cálculos puros.
- `updateMarketPrices` existe como server action pero la UI usa el endpoint POST (permite leer `failed[]`).
- Los precios `plazo_fijo`/`money_market` **no** vienen del mercado: se devengan en el getter.
- La `metadata.tna` se guarda como **decimal** (`data.tna / 100` en `quickAdd`).
- No hay página de detalle por activo: `getAssetDetail` se consume desde `PortfolioList` (expandible).

## Tests
- No hay tests dedicados a los getters de portfolio en `lib/store/__tests__/` (los archivos existentes cubren balances/goals/analysis).
- Tool del chat: `src/lib/ai/tools/__tests__/readToolsB.test.ts` (`get_portfolio_status` con mock de Supabase).
- Verificación manual: cargar un activo en el tab "Cargar" y refrescar precios desde la status bar.

## Docs relacionados
- `CLAUDE.md` — sección Store (`getPortfolioStatus`) y reglas Server/Client.
- `supabase/migrations/20260331_investment_tracker_v2.sql` (modelo v2 + migración de datos v1) y `20260323_enable_rls_core_tables.sql` (criterio UUID/entero por tabla, RLS de `investments`/`savings`/`market_prices`).
- No existe spec de superpowers para esta feature (predatan el flujo de specs).
