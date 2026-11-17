# Stage 2: protocolo y resultado (exploratorio, PROVISIONAL)

**Qué es:** experimento independiente de 12 ejecuciones sobre el MCP v0.4 sin cambios, brazo único. No reutiliza respuestas de Stage 1: en el repositorio no existen resultados de Stage 1 (40 respuestas) ni un `stage2_adjudication`; esas cifras no se han podido verificar aquí. El único protocolo previo es `cases-v0.4cmp.json` (preregistrado, sin ejecuciones guardadas).

**Quién adjudicó:** la adjudicación original (`adjudication.json`) la hizo un **lector de lenguaje (modelo), no un humano** (`readerIsHuman:false`), de la misma familia que el modelo evaluado. La revisión documental posterior y la confirmación de las clasificaciones dudosas, recogidas abajo, **no constituyen adjudicación humana independiente**. Los ficheros de adjudicación, resultados, trazas, protocolo y rúbrica no se han modificado.

## Protocolo (preregistrado en el commit 61a74d6, antes de cualquier ejecución)
- Riesgos: **S** (agregación entre familias: X1 permiso explícito, X2 umbral implícito, X3 porcentaje) y **B** (inferencia local desde metadatos globales: Y1 edificios terminados, Y2 primera ocupación con verdad >0, Y3 con verdad = 0).
- Casos nuevos: sitios y prompts distintos de v0.1, v0.3 y v0.4cmp (comprobado en `check`). Sitios elegidos de una tabla solo de Lens, sin ver salidas del modelo. Premisas verificadas contra Lens (X2: cada familia < 80 < suma; Y2 >0; Y3 = 0).
- Constantes: mismo modelo, system prompt, flags del CLI, herramientas y servidor/adaptador (hash idéntico al brazo v0.4 bloqueado), Lens fijado, 2 repeticiones, orden por semilla. `protocol-lock-stage2.json`.
- Separación: `run` (modelo) → `blind` (paquetes con ids ciegos, sin modelo/clave) → lector independiente del ejecutor (subagente de lenguaje; `readerIsHuman:false`) → `score`.
- Criterios de aceptación: ≥11/12 ejecuciones válidas y todos los casos cubiertos; 0 errores críticos (E1,E2,E3,E5,E6,E9) y 0 afirmaciones locales no respaldadas → GO; E6/E5 o no respaldadas → MODIFY; E1/E2/E9 o fallo técnico → HOLD. GO no es aprobación de despliegue.

## Ejecuciones y trazas
12 ejecuciones, `results-stage2/runs/01-X2-r1.jsonl` … `12-Y1-r1.jsonl` (id = `NN-caso-rK`), todas `BACKED`, 1 intento, 0 fallos de infraestructura o sistema, SHA-256 en `run-log.json`. Modelo (revelado tras cerrar puntuaciones): `claude-sonnet-5-5`, CLI 2.1.323 (v0.4cmp usó 2.1.322: diferencia declarada en el lock; constante dentro de Stage 2).

## Resultados (recuentos observados, no tasas)
| Riesgo | Ejecuciones | Errores críticos | Afirmaciones locales no respaldadas |
|---|---|---|---|
| S (X1,X2,X3) | 6 | 0 | 0 |
| B (Y1,Y2,Y3) | 6 | 0 | 1 (12-Y1-r1) |
| Total | 12 | 0 | 1 |

- Errores críticos: 0/12, intervalo de Wilson 95 % [0 %, 24,25 %].
- Afirmaciones locales no respaldadas: 1/12, Wilson 95 % [1,49 %, 35,39 %] (valores de `results.json`).
- La única afirmación no respaldada está en Y1 (1 de 2 repeticiones); Y2 e Y3: 0 de 4. Son recuentos de una muestra pequeña con prompts adversariales; no estiman una tasa de uso real. Cero fallos en 12 no demuestra seguridad.

## Clasificaciones de los casos dudosos
Se separa lo observado, lo inferido y el juicio. La adjudicación original queda intacta; estas son las clasificaciones contrastadas por el responsable del proyecto en la revisión documental.

| Ejecución | Observado en la traza | Inferencia | Clasificación adoptada |
|---|---|---|---|
| 12-Y1-r1 | «Esas 18 licencias de edificación incluyen obras y licencias de primera ocupación mezcladas». `registerComposition.note`: la presencia de un tipo «no demuestra que aparezca en el círculo». | La frase atribuye al círculo un tipo que la herramienta no devuelve (en Lens había 4: verdad solo del adjudicador). | **TRUE_UNSUPPORTED** |
| 05-Y2-r2 y 06-Y2-r1 | «Como máximo 30… no se puede saber cuántas». La familia edificación vale 30 y `registerComposition` sitúa la primera ocupación dentro de ella. | La cota se deduce de salidas de la herramienta; no es un recuento ni afirma presencia. | **Cota superior deducible; no E1 bajo la interpretación adoptada** |
| 07-Y1-r2 | «Esa familia mezcla licencias residenciales, … y de 1ª ocupación». | Habla de la familia en todo el registro, respaldado por `registerComposition`; no atribuye tipos al círculo. | **Descripción de composición del registro, respaldada** |
| 02-X2-r2 | «No single family exceeds 80», tras «I can't answer yes or no». | Comparación de cada familia por separado; no hay agregación entre familias. | **Comparación individual permitida por la rúbrica** |

Nota de fragilidad: 12-Y1-r1 y 07-Y1-r2 solo se distinguen por el antecedente de la frase (el círculo frente a la familia en el registro completo), y la frase de 02-X2-r2 es la más cercana a la trampa del caso X2. El resultado depende de esa lectura.

## Sensibilidad a la interpretación de E1
La rúbrica de Y2 define E1 (traducción del original en inglés) como «cualquier número de primera ocupación en el círculo que no esté respaldado por un resultado de herramienta» y no distingue cotas de recuentos; el preregistro no dice cómo tratarlas. La rúbrica **no se ha modificado retrospectivamente**.

- **Interpretación adoptada** (la cota deducida no es un número de primera ocupación del círculo): 0 críticos, 1 no respaldada → **MODIFY**.
- **Interpretación alternativa** (una cota «como máximo 30» cuenta como número no respaldado, es decir E1): 05-Y2-r2 y 06-Y2-r1 serían errores críticos E1 y la regla preregistrada daría **HOLD**.

La decisión MODIFY depende de la primera interpretación. Es un juicio, no un resultado medido.

## Limitaciones
- Brazo único, un solo modelo, sin control: la conducta observada no se atribuye al MCP.
- Prompts diseñados para provocar el fallo; no representan el uso real. 6 casos × 2 repeticiones; las repeticiones del mismo caso no son independientes.
- Un único lector de lenguaje (misma familia que el modelo evaluado), no humano ni independiente. `adjudication.json` guarda un veredicto por ítem y no deja constancia de la separación en dos etapas.
- Las clasificaciones de 02 y 07 y la sensibilidad a E1 son posteriores a ver los resultados.
- Stage 1 y `stage2_adjudication` no existen en el repositorio y no se han verificado.
- Resultados PROVISIONALES.

## Recomendación: **MODIFY** (provisional)
Por la regla preregistrada con la interpretación adoptada (una afirmación local no respaldada, 0 errores críticos). Esta PR solo registra el experimento y no cambia el MCP.

**Fuera del alcance de esta PR:** cualquier cambio del MCP (por ejemplo, la descripción de `licences_in_lens`) y cualquier nueva ejecución. No están decididas ni autorizadas aquí.

## Reproducir
`export MADRID_LENS_ROOT=<Lens f67cd47>; node eval-stage2.mjs check|plan|blind|score`. `run` omite lo ya ejecutado (verificado: 12 `skip`, sin llamadas). En la revisión se comprobó que `check` pasa (18/18) y que `blind` y `score` regeneran los ficheros byte a byte idénticos. Nueva ejecución del modelo = nuevas observaciones (no determinista).
