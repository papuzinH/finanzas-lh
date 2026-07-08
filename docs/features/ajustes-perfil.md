# Ajustes y Perfil (+ layout/navegación)

## Propósito
Hub de configuración de la app (`/ajustes`) con tres sub-pantallas — medios de pago, categorías y perfil/sesión — más el shell de layout que envuelve toda la app autenticada (nav mobile-first + sidebar desktop + chat + tour).

> Limpieza reciente (rama `chore/limpieza-proyecto`): el viejo `/perfil/page.tsx` y otras páginas legacy fueron **eliminados** (commit `0cbfbe6`), y `user-profile-sheet` fue borrado por huérfano junto a otros 11 componentes (commit `0519b89`). **`src/app/perfil/actions.ts` (con `signOut`) SIGUE VIVO** y es lo único que queda en `src/app/perfil/`.

## Rutas / entry points
- `/ajustes` — hub con cards de navegación.
- `/ajustes/medios` — gestión de medios de pago (Client Component).
- `/ajustes/categorias` — gestión de categorías (Server Component).
- `/ajustes/perfil` — cuenta, sesión, reinicio de tour (Client Component).
- En mobile se llega por el ítem "Más" del BottomNav; en desktop por "Ajustes" del sidebar.

## Archivos clave
| Archivo | Rol |
|---|---|
| `src/app/ajustes/page.tsx` | Hub: 3 links (Medios/Categorías/Perfil) con `ScreenHeader`; la card de medios lleva `data-tour="section-medios"` (target del tour) |
| `src/app/ajustes/medios/page.tsx` | Client: lista medios desde `useFinanceStore` (`getPaymentMethodStatus`, `getDefaultPaymentMethod`, `getUnassignedTransactionsCount`), cards `InstitutionalCard`/`PersonalDebtCard`, alta con `CreatePaymentMethodDialog`, pago de resúmenes con `RegisterCardPaymentDialog`, y banner de transacciones sin medio |
| `src/app/medios-pago/actions.ts` | Server actions de medios: `createPaymentMethod`/`updatePaymentMethod` (al marcar `is_default` **resetean el resto primero** — un solo default por usuario), `deletePaymentMethod`, `reassignAndDeletePaymentMethod` |
| `src/app/dashboard/transactions/actions.ts` | `assignDefaultToUnassignedTransactions()`: asigna el medio default a todas las tx con `payment_method_id == null` (lo dispara el banner de `/ajustes/medios`) |
| `src/app/ajustes/categorias/page.tsx` | Server: fetch de `categories` con `utils/supabase/server`, render con `CategoriesWithStats` (`src/app/categorias/_components/`) + `CreateCategoryDialog` |
| `src/app/categorias/actions.ts` | Server actions CRUD de categorías |
| `src/app/ajustes/perfil/page.tsx` | Client: avatar/email de auth (`authEmail`, `authAvatarUrl` del financeStore), info de cuenta (`first_name`, `telegram_chat_id`, `created_at`), botón "Reiniciar Tour Guiado" (`resetTour()` + `router.push('/')`) y "Cerrar sesión" |
| `src/app/perfil/actions.ts` | `signOut()`: `supabase.auth.signOut()` + `redirect('/login')` — vivo, importado por `/ajustes/perfil` |
| `src/components/layout/app-shell.tsx` | Shell client global: dispara `fetchAllData()` una vez, `FullPageLoader` hasta `isInitialized`, monta `MainNav` + `ChatWidgetWrapper` + `OnboardingTour`; se salta todo en `PUBLIC_ROUTES` (`/login`, `/auth`) y `ONBOARDING_ROUTES` (`/onboarding`) |
| `src/components/layout/main-nav.tsx` | Navegación única: BottomNav mobile (6 ítems: Inicio, Movimientos, Compromisos, Objetivos, Inversiones, **Más→/ajustes**) + sidebar desktop fija `w-64` (el `<main>` compensa con `md:pl-64`) |
| `src/components/medios-pago/*` | Cards y diálogos de medios (institutional-card, personal-debt-card, create-payment-method-dialog, register-card-payment-dialog) |

## Tablas DB (¿users.id numérico o UUID de auth?)
| Tabla | user_id |
|---|---|
| `payment_methods` | **numérico** (`users.id`) — así filtra el financeStore y el chat |
| `transactions` (para `assignDefaultToUnassignedTransactions`) | **numérico** |
| `categories` | **UUID de auth** (`auth.uid()`); `/ajustes/categorias/page.tsx:13` filtra `.eq('user_id', user.id)` con el UUID — correcto para esta tabla |
| `users` (perfil, `first_name`, `tour_completed`) | doble identidad `id` numérico + `auth_user_id` UUID — ver gotcha detallado en `docs/features/onboarding-auth.md` |

Confundir numérico y UUID produce queries que **nunca matchean sin tirar error** (gotcha crítico de todo el repo).

## Flujos principales
1. **Marcar un medio como predeterminado**: toggle "Predeterminado" en crear/editar (oculto para `is_personal`). La action resetea `is_default=false` en todos los medios del usuario y recién después marca el elegido → invariante de un solo default. El default es el que usa el chatbot cuando el usuario no aclara medio.
2. **Banner de no-asignadas**: si `getUnassignedTransactionsCount() > 0` y hay default, `/ajustes/medios` ofrece asignarlas todas con `assignDefaultToUnassignedTransactions()` y refresca el store.
3. **Borrar un medio con dependencias**: `reassignAndDeletePaymentMethod` mueve transacciones/planes al medio destino antes de borrar.
4. **Registrar pago de tarjeta de meses anteriores**: `RegisterCardPaymentDialog` → `payCreditCardCycle` (crea transacción `expense` con `card_payment_for` en el medio financiador; neutra para el Disponible Real global — ver sección "Medios de pago" de CLAUDE.md).
5. **Cerrar sesión / reiniciar tour**: `/ajustes/perfil` → `signOut()` (redirect `/login`) o `resetTour()` (resetea el onboardingStore, marca `tour_completed=false` en DB y navega a `/`).

## Invariantes y gotchas
- **Un solo `is_default` por usuario**: cualquier código nuevo que setee default debe replicar el patrón reset-then-set de `medios-pago/actions.ts`.
- `/ajustes/medios` es Client y lee TODO del `useFinanceStore` (regla del repo: los Client Components nunca fetchean directo); `/ajustes/categorias` es Server y fetchea con `utils/supabase/server`.
- Las actions de medios viven en `src/app/medios-pago/` y las de categorías en `src/app/categorias/` (no bajo `/ajustes/`): las rutas de ajustes son solo la UI; no dupliques actions ahí.
- El hub `/ajustes` es el paso final del tour (`data-tour="section-medios"` y el FAB del chat `data-tour="fab"`): si cambiás esos atributos, actualizá `TOUR_STEPS_BY_ROUTE` en `onboardingStore.ts`.
- Mobile-first: páginas con `pb-24`/`pb-28` para clearear el BottomNav; el shell agrega `pb-20 md:pb-0 md:pl-64` al `<main>`.
- UI con tokens semánticos del design system (`bg-bg`, `bg-surface`, `border-[1.5px] border-border`, `ScreenHeader`, `<Button>`/`<Card>` propios) — nunca colores Tailwind crudos.
- `/ajustes/perfil` muestra "Google OAuth" hardcodeado como método de autenticación (hoy es el único proveedor).

## Tests
Sin tests dedicados de estas pantallas ni de sus actions. La lógica que consumen sí está testeada vía el store: `src/lib/store/__tests__/` (ej. `financeStore.test.ts`, `disponible-real.test.ts` cubren `getPaymentMethodStatus`/`getDefaultPaymentMethod` y el efecto de los pagos de tarjeta) y `src/lib/finance/__tests__/balances.test.ts`.

## Docs relacionados
- `CLAUDE.md` — secciones «Medios de pago», «Store», «UI» (fuente de verdad de invariantes de default, pago de tarjeta y tokens visuales).
- `docs/features/onboarding-auth.md` — tour y doble identidad de `users`.
- Prototipos visuales: `design_handoff_chanchito/prototypes/app/ui.jsx` (BottomNav/ScreenHeader) y `Chanchito App.html`.
