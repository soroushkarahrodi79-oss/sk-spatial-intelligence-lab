# Erratum v0.2 — repetición de MEV-10

**No sustituye ni edita** `repeat-1.json`, `adjudication.json` ni `informe-v0.1.es.md`; los complementa. Los ficheros sellados de v0.1 (`cases.json`, `references.json`, `score.mjs`, `lens-pin.json`) no se han tocado (`eval.mjs verify` → `seal ok 51a7083c…d612`).

## Qué estaba mal

El informe v0.1 (§3) y la adjudicación de `repeat-1.json` describen la repetición de MEV-10 como «inestable: no llamó a ninguna herramienta» (E7 + E5), es decir, como un fallo de selección de herramienta del modelo.

## Qué muestra el registro crudo

Evento `init` de cada transcripción (`work/madrid-mcp-eval/`, no versionado; sha256 de la repetición `4c10c6a7…ba5619`, el mismo que `rawSha256` en `repeat-1.json`):

| Ejecución | `mcp_servers` | `tools` |
|---|---|---|
| Pase 1, MEV-10 | `madrid-evidence: connected` | 3 |
| Repetición, MEV-10 | `madrid-evidence: failed` | **0** |
| Repetición, MEV-28 | `madrid-evidence: connected` | 3 |

En la repetición de MEV-10 el modelo **no tenía herramientas**. El resultado es un fallo de infraestructura que el runner no detectó, no una decisión de selección del modelo. Sobre las 60 ejecuciones del pase 1 el servidor se conectó en las 30 del brazo mcp.

## Qué sigue siendo cierto

- La respuesta de la repetición afirma, sin consulta que la respalde, que «ningún ámbito contiene ese punto». Que algo así pueda presentarse sin respaldo es un riesgo real; v0.2 lo cubre con el verificador de transcripciones, que clasifica esa ejecución como `INFRA_FAILURE`.
- La causa del fallo de arranque es **desconocida**. No se capturó stderr. Un sondeo posterior de 44 arranques (20 secuenciales, 8 y 16 simultáneos; mediana 1,1 s, máximo 6,9 s) no reprodujo ningún fallo. Hipótesis sin verificar: fallo transitorio de arranque (carga, bloqueo de ficheros temporales o límite de tiempo del cliente).
- Con este dato **no hay evidencia de fallos de selección de herramienta del modelo**, ni de que no existan: 30 llamadas correctas en el pase 1 no acotan su frecuencia.

## Qué cambia en v0.2

`verify-transcript.mjs` (función pura, sin modelo): `INFRA_FAILURE` si el servidor no conectó o faltan herramientas; `BACKED` solo con una llamada correcta a madrid-evidence con resultado Lens (evidencia o abstención) y sin códigos de ámbito ausentes de los resultados; `UNBACKED` si la respuesta depende de Lens sin ese respaldo; `NO_LENS_CLAIM` en otro caso. `eval.mjs run` reintenta hasta 2 veces ante `INFRA_FAILURE` y guarda stderr; `eval.mjs score` añade `verification` a cada fila del brazo mcp y no puntúa un `INFRA_FAILURE` como respuesta del modelo.

Sobre las 30 transcripciones del pase 1: 28 `BACKED`, 2 `UNBACKED` (MEV-22 y MEV-26: rechazo e inyección; mencionan «ámbito» sin llamada, como se esperaba). La repetición de MEV-10: `INFRA_FAILURE`.

## Límites

«Depende de Lens» es una heurística léxica (recall incompleto, falsos positivos como una pregunta conceptual sobre «ámbito»); el respaldo es por respuesta, no por frase; solo se contrastan códigos de ámbito. Esto no hace que el modelo use la herramienta: impide que una respuesta sin consulta pase por verificada. Mide consistencia con Lens fijado, no validez científica.
