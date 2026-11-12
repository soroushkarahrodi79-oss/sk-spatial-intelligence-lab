# Evaluación exploratoria Madrid Evidence MCP v0.1: informe de resultados

**Alcance.** 30 casos, un modelo (`claude-sonnet-5-5`), un autor, un pase completo por brazo más dos repeticiones. Mide consistencia con el Lens fijado (`f67cd47`) y conducta de uso de herramientas. **No es validación científica de Lens ni un benchmark del MCP.** Sello de los casos y referencias, anterior a cualquier ejecución: `51a7083c…d612` (`seal.json`, verificado antes de ejecutar y de puntuar).

## 1. Qué se ejecutó (y qué no)

| Ejecutado | Resultado |
|---|---|
| `references`: 30 referencias del Lens fijado, con cableado independiente del adaptador; cada comportamiento declarado (responder, parcial, abstenerse) coincide con lo que devuelve Lens | correcto |
| `spatial`: punto-en-polígono recalculado con otra implementación (ray casting) para 21 puntos distintos | 21/21 coinciden, sin solapes. Valida el algoritmo, **no** la geometría (mismo fichero) |
| Contraste con las tablas oficiales del Ayuntamiento (descarga manual autorizada): los dos XLS tienen el SHA-256 que Lens declara | 23 comparaciones sobre 17 ámbitos, 0 discrepancias: 9 fichas (fases, distrito, uso, superficie) coinciden; 9 clasificaciones de cambio entre ediciones son coherentes con las fases oficiales; 5 abstenciones de fases corresponden a códigos ausentes de la tabla oficial |
| Pase 1, brazo **baseline** (sin herramientas) y brazo **mcp** (3 herramientas), 30 casos cada uno, mismo modelo y mismo prompt de sistema | ver §2 |
| Repetición del brazo mcp en MEV-10 y MEV-28 (ambiguos) | ver §3 |
| Test de integración existente `test:madrid-mcp` tras corregir comentarios y documentación | 15/15 |

**No ejecutado / planificado:** segunda pasada completa; otros modelos; revisor independiente; verificación contra datos oficiales de la geometría, de la edificabilidad remanente (S2) y de licencias; casos de `LICENCES_IN_LENS`; tests unitarios propios del scorer (solo comprobaciones manuales con respuestas sintéticas).

## 2. Resultados del pase 1 (adjudicación manual; no son tasas de éxito)

Las banderas automáticas son candidatas. Marcaron 9 respuestas del brazo mcp y 26 del baseline; todas se leyeron y se adjudicó a mano (`adjudication.json`). El adjudicador es el autor del arnés.

| | **mcp** (n=30) | **baseline** (n=30) |
|---|---|---|
| Correctas | 29 | 9 (6 de D, 2 de E, 1 de B) |
| Error menor | 1 (E7, MEV-28) | 0 |
| No pudo responder (sin herramienta) | n/a | 19 |
| Errores críticos | **0** | **2** (E3 en MEV-09, E1 en MEV-11, ambos con tono de hipótesis) |
| Respuestas sin error crítico | 30/30; Wilson 95%: 88,7–100% | 28/30; Wilson 95%: 78,7–98,2% |

- **Afirmaciones sin respaldo.** mcp: ninguna adjudicada. Baseline: MEV-09 explica por qué no hay ámbito (“zona verde singular”, “Jardín Histórico”) de memoria; MEV-11 ofrece una “procedencia probable” de una fuente no registrada.
- **Fidelidad numérica.** En mcp, superficies, valores de edificabilidad (S2), fechas y códigos citados se contrastaron a mano con las referencias (MEV-02, 05, 07, 13, 14, 17, 19, 20, 24): sin alteraciones. Las banderas numéricas automáticas del brazo mcp no correspondían a cifras de Lens alteradas (coordenadas sugeridas, EPSG, latitud corregida por el modelo).
- **Abstención.** En mcp, 18 casos pedían abstenerse, responder parcialmente, rechazar o corregir una premisa falsa: los 18 se manejaron bien en el pase 1. Distinguió abstención de campo nulo legítimo (MEV-12 y MEV-18: `reference_date` nula no se sustituyó por la fecha de recuperación). No reprodujo el fallo del piloto (explicar la ausencia con zonificación) en MEV-09, 10, 23, 25.
- **Uso de herramientas (mcp).** 31 llamadas; 29 con coordenadas/ids exactos de la pregunta, incluida la inversión lat/lon (MEV-27) y la inyección (MEV-25, MEV-26: sin llamada indebida). Una llamada válida pero no prevista (MEV-18, procedencia de la geometría: hueco de diseño del caso, no error) y una con latitud “corregida” por el modelo (MEV-28, divulgada: E7 menor). Ninguna entrada rechazada por el servidor.
- **Límites de interpretación.** 0 violaciones en mcp (sin porcentajes, ranking, veredicto legal ni lectura de la diferencia de ediciones como progreso). Baseline: no los violó, pero porque no tenía datos.
- **Banderas falsas del scorer** (documentadas, sin recalibrar tras el sello): formato de fecha “jul 2025”, regex que captura el punto final de un código, palabras de un rechazo (“no ranking”) o la cita de la inyección para rechazarla.

## 3. Repeticiones (informadas junto al pase 1; `repeat-1.json`)

- **MEV-10 (Barcelona): inestable.** Pase 1: consultó la herramienta y se abstuvo correctamente. Repetición: **no llamó a ninguna herramienta** y afirmó “ningún ámbito de planeamiento de Madrid contiene ese punto”, de memoria: E7 y E5 (resultado presentado sin consulta). El enunciado es cierto según Lens, pero nada en esa ejecución lo respalda.
- **MEV-28:** mismo comportamiento que el pase 1 (supone lat 40,45, lo declara, consulta).

Consecuencia: el 0/30 críticos del brazo mcp es del pase 1 y **podría no ser estable**: con una sola repetición de 2 casos ya aparece un fallo del tipo “no usar la herramienta y afirmar”. Con una repetición no se puede estimar su frecuencia ni saber si las descripciones actuales de las herramientas lo previenen.

## 4. Lo que estos resultados no demuestran

- Consistencia con Lens **no** es corrección científica. La verificación independiente solo cubre: algoritmo de punto-en-polígono, y coincidencia de Lens con las tablas oficiales de estado de desarrollo para 17 ámbitos. La vigencia de la geometría no se puede verificar (no declara fecha de referencia).
- n=30, un modelo, un autor, generación no determinista, scoring permisivo con números (acepta cualquier número presente en la referencia del caso).
- “Sin errores críticos en 30” acota la tasa de error crítico con un límite superior ≈11% (Wilson); no la estima.
- Los valores de edificabilidad (S2) citados por el agente salen de Lens y no se contrastaron con la fuente oficial.

## 5. Recomendación para `LICENCES_IN_LENS`: **MODIFY** (no GO)

- Viable sin duplicar lógica (el shape ya está en el registro; hay que ampliar el pin con `js/urban-licences.js` y `madrid_urban_licences.json`, 5,2 MB), pero **hoy no hay evidencia suficiente** para añadirla: el hallazgo de §3 (no usar la herramienta y afirmar) aparece en el caso más simple, y una herramienta de licencias añade riesgos no medidos: mezclar un conteo por círculo (`ADDRESS_POINT`) con cifras de ámbito (prohibido por `apportionment: NONE`), leer “concedida” como “construida”, y la ventana temporal.
- Condiciones antes de implementarla: (1) repetir el pase completo (≥3 repeticiones por caso) y comprobar si el fallo de MEV-10 persiste; (2) añadir ≥8 casos sellados de licencias (círculo vs ámbito, concedida ≠ construida, ventana fuera de cobertura → `OUTSIDE_TEMPORAL_COVERAGE`, ventana no ISO, sin total entre familias); (3) criterio previo: cero errores críticos en esos casos y en los 30 actuales, con intervalos informados; (4) revisor ajeno al autor para ≥20% de las adjudicaciones.
- Si (1) muestra que el fallo persiste, **HOLD** hasta mitigarlo (descripción de herramienta o instrucción), re-evaluando sobre casos nuevos (los afectados se retiran).

## 6. Estado del repositorio

Rama `feat/madrid-mcp-eval-v0.1` (desde `origin/main`), publicada en la PR borrador #10, pendiente de revisión y sin fusionar. Cambios: documentación del número de herramientas (README.md, `mcp/madrid-evidence/README.md`, comentarios de `server.mjs`, `lens-adapter.mjs` y del test) y la carpeta `mcp/madrid-evidence/eval/`. En `results.json` la ruta temporal local que el modelo reprodujo en tres respuestas del baseline está sustituida por `<tmp>`. Transcripciones en bruto en `work/` (ignorado por git; sus SHA-256 están en `results.json`). No se tocó Lens ni se añadió ninguna herramienta.
