/**
 * El changelog que ve el usuario cuando sale una versión nueva.
 *
 * Esta lista es la ÚNICA fuente de verdad de las versiones: no sale de
 * `package.json` (que sigue en 0.1.0 desde que nació el proyecto y no lo lee
 * nadie), porque sincronizar dos lugares es un lugar de más donde equivocarse.
 *
 * Cómo se agrega una versión, al publicar:
 *   1. Una entrada nueva ARRIBA de todo.
 *   2. `fecha` = el día que se mergea a `produccion`, en 'YYYY-MM-DD'.
 *   3. `version` es una llave interna — al usuario NO se le muestra el número.
 *
 * ⚠️ Regla de redacción: **cada release tiene que poder leerse solo.** Como se
 * muestra únicamente la más reciente, quien se saltea una versión nunca la ve,
 * así que un item no puede dar por sentado que el usuario vio el anterior
 * ("ahora además también…" está prohibido). En rioplatense y sin jerga técnica:
 * del otro lado hay alguien que vino a mirar cuánta plata le queda.
 *
 * Spec: docs/superpowers/specs/2026-09-01-popup-novedades-design.md
 */
export type Version = {
  /** Llave interna que se guarda en `users.last_seen_version`. No se muestra. */
  version: string
  /** Día de publicación, 'YYYY-MM-DD'. */
  fecha: string
  /** Una línea. Es lo primero (y a veces lo único) que el usuario lee. */
  titulo: string
  /** De 2 a 4 líneas. Más que eso deja de ser un changelog corto. */
  items: string[]
}

/** La más reciente primero. Con la lista vacía, el popup no se le muestra a nadie. */
export const VERSIONES: Version[] = [
  {
    version: '1.0.0',
    // ⚠️ Si el release sale otro día, mover esta fecha: es la que decide quién
    // ve el popup. Un usuario dado de alta DESPUÉS de esta fecha no lo ve, y si
    // la fecha queda vieja, quien se registre en el medio se lo pierde.
    fecha: '2026-09-02',
    titulo: 'Las tarjetas ahora cuentan bien los dólares',
    items: [
      'Tu plata libre ya no ignora lo que compraste en dólares con la tarjeta.',
      'Si te vence un resumen y no lo marcaste, te lo avisamos en el inicio.',
      'Podés ver en qué se te fue la plata mes a mes, en pesos de hoy.',
    ],
  },
]
