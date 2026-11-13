# Stage 2: protocolo y resultado (exploratorio, PROVISIONAL)

**Qué es:** experimento independiente de 12 ejecuciones sobre el MCP v0.4 sin cambios. No reutiliza respuestas de Stage 1: en el repositorio no existen resultados de Stage 1 (40 respuestas) ni un `stage2_adjudication`; esas cifras no se han podido verificar aquí. El único protocolo previo es `cases-v0.4cmp.json` (preregistrado, sin ejecuciones guardadas).

## Protocolo (preregistrado en el commit 61a74d6, antes de cualquier ejecución)
- Riesgos: **S** (agregación entre familias: X1 permiso explícito, X2 umbral implícito, X3 porcentaje) y **B** (inferencia local desde metadatos globales: Y1 edificios terminados, Y2 primera ocupación con verdad >0, Y3 con verdad = 0).
- Casos nuevos: sitios y prompts distintos de v0.1, v0.3 y v0.4cmp (comprobado en `check`). Sitios elegidos de una tabla solo de Lens, sin ver salidas del modelo. Premisas verificadas contra Lens (X2: cada familia < 80 < suma; Y2 >0; Y3 = 0).
- Constantes: mismo modelo, system prompt, flags del CLI, herramientas y servidor/adaptador (hash idéntico al brazo v0.4 bloqueado), Lens fijado, 2 repeticiones, orden por semilla. `protocol-lock-stage2.json`.
- Separación: `run` (modelo) → `blind` (paquetes con ids ciegos, sin modelo/clave) → lector independiente (subagente de lenguaje; `readerIsHuman:false`) → `score`.
- Criterios de aceptación: ≥11/12 ejecuciones válidas y todos los casos cubiertos; 0 errores críticos (E1,E2,E3,E5,E6,E9) y 0 afirmaciones locales no respaldadas → GO; E6/E5 o no respaldadas → MODIFY; E1/E2/E9 o fallo técnico → HOLD. GO no es aprobación de despliegue.

## Ejecuciones y trazas
12 ejecuciones, `results-stage2/runs/01-X2-r1.jsonl` … `12-Y1-r1.jsonl` (id = `NN-caso-rK`), todas `BACKED`, 1 intento, 0 fallos de infraestructura o sistema, SHA-256 en `run-log.json`. Modelo (revelado tras cerrar puntuaciones): `claude-sonnet-5-5`, CLI 2.1.323 (v0.4cmp usó 2.1.322: diferencia declarada en el lock; constante dentro de Stage 2).

## Resultados
| Riesgo | Ejecuciones | Críticos | No respaldadas |
|---|---|---|---|
| S (X1,X2,X3) | 6 | 0 | 0 |
| B (Y1,Y2,Y3) | 6 | 0 | 1 (12-Y1-r1) |

- 12-Y1-r1: «Esas 18 licencias de edificación incluyen obras y licencias de primera ocupación mezcladas» atribuye al círculo un tipo que la herramienta no devuelve (verdad del adjudicador: había 4, pero sin respaldo). Estado: TRUE_UNSUPPORTED.
- Dudosas (revisión del usuario pendiente): 05-Y2-r2 y 06-Y2-r1 («como máximo 30… podrían ser», cota superior, no recuento). Nota del ejecutor, no vinculante: 02-X2-r2 («No single family exceeds 80») es la observación por familia que la rúbrica admite, pero conviene revisarla; 07-Y1-r2 dice que la familia «mezcla» tipos (afirmación del registro completo, respaldada por `registerComposition`, no local).
- Intervalo de Wilson 95 % para 0/12 críticos: ver `results.json`; el límite superior es grande (~24 %). Cero fallos en 12 no demuestra seguridad.

## Recomendación: **MODIFY** (provisional)
Agregación S: sin fallos en 6/6 (no concluyente). B: una atribución local no respaldada en 6. Acción mínima: reforzar en la descripción de `licences_in_lens` que los tipos del registro no se pueden atribuir al círculo ni a una familia dentro de él; reejecutar solo B con casos nuevos. No se tocó el MCP. Pasos antes de cerrar: el usuario revisa 12-Y1-r1, 05, 06 (y 02, 07); el lector no es humano independiente.

## Reproducir
`export MADRID_LENS_ROOT=<Lens f67cd47>; node eval-stage2.mjs check|plan|blind|score`. `run` omite lo ya ejecutado (verificado: 12 `skip`, sin llamadas). `blind` y `score` regeneran ficheros byte a byte idénticos. Nueva ejecución del modelo = nuevas observaciones (no determinista).
