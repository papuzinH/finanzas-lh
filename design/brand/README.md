# Marca Chanchito — assets definitivos

Identidad cerrada el 2026-08-13 (mesa iterativa Pancho + Figma de Lauti).
Documento de decisiones: artifact «Identidad Chanchito» · Vectores editables: [Figma](https://www.figma.com/design/HUsKfDZxqnwnDCf4qjgTpW)

## Piezas

| Archivo | Qué es | Uso |
|---|---|---|
| `chancho.svg` | El chancho definitivo (esculpido en Figma, nodo 18:9). Perfil, ranura, ojo y fosa de grabado, cola de rulo. | Logo, hero del login, avatar del chat, sellos de categoría (recolorear la tinta). |
| `sello.svg` | Sello S·C Fiscal: dos círculos + puntitos, lema en arcos, chancho ladrillo. **Textos en curvas** (no dependen de fuentes). | Login, confirmación «registrado», marca de agua de resúmenes (rotado, translúcido). |
| `cinta.svg` | La cinta base (trazada de la ref de Lauti + esculpida en Figma). Frente abierto: toma el color del fondo. | Base para componer. |
| `cinta-sol.svg` | Cinta + sol amanecer apoyado en la franja superior. | Headers de momentos, logros. |
| `cinta-el-que-guarda.svg` | Cinta + sol + «EL QUE GUARDA, TIENE» | Login. |
| `cinta-guita-clara.svg` | Cinta + sol + «GUITA, CLARA» | Claim / momentos de marca. |
| `cinta-sin-apuro.svg` | Cinta + sol + «SIN APURO, PERO TODOS LOS DÍAS» | Rachas, empty states. |
| `sol.svg` | El sol suelto (13 rayos alternados). | Componer sobre otras piezas. |

## Colores

- Tinta navy `#1C2A47` · ranura/detalles claros `#F4EDDC`
- Celestes de la cinta (medidos de la referencia): `#70AADE` / `#64A3DB` / pliegue `#4791D5`
- Sol dorado `#E3A938` · sello ladrillo `#AE4A3C` (variantes: navy, verde sello `#41705B`)

## Tipografías del sistema

Fugaz One (display) · Asap (cuerpo — Omnibus-Type, BA) · Bitter (sello/cintas/citas — Huerta, BA).
Los textos de sello y cintas ya están convertidos a curvas: no requieren fuentes cargadas.

## Notas técnicas

- Las frases de las cintas van **entre las dos franjas celestes**, arqueadas (R≈450, medido del gap real).
- El generador paramétrico del sol y el pipeline de texto-a-curvas (opentype.js) están en el scratchpad de la sesión Pancho 2026-08-13; el método quedó documentado en la memoria de Pancho (`replica-vectorial-metodo`).
- Para réplicas exactas de referencias: tracing por capas + potrace (nunca dibujo a mano). Ver memoria citada.
