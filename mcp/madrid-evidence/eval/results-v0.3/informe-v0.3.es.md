# Evaluación exploratoria v0.3 de `licences_in_lens`: informe de una pasada

**Alcance.** 10 casos, un modelo, **una sola pasada**, brazo con herramientas únicamente (sin brazo sin herramientas, sin repeticiones). Mide consistencia con el Lens fijado y conducta de uso de herramientas. **No es validación científica de Lens ni del MCP, y no permite estimar una tasa de éxito**: n = 10, un modelo, un autor, generación no determinista.

## 1. Protocolo y versiones fijadas (antes de ejecutar)

| Elemento | Valor |
|---|---|
| Modelo | `claude-sonnet-5-5` (el evento `init` de los 10 transcripts lo confirma) |
| CLI | Claude Code 2.1.322; Node v22; `@modelcontextprotocol/sdk` 1.32.2 |
| Prompt de sistema / turnos | el de v0.1 (≤ 150 palabras); `--max-turns 8`; sin herramientas integradas; solo `mcp__madrid-evidence__*` (4 herramientas); ajustes de proyecto vacíos |
| Lens | `f67cd4709d1319f5685aaa184326330a5d535088`; comprobados por SHA-256 los 11 ficheros de `lens-pin.json` + `lens-pin-licences.json` y `git rev-parse HEAD` |
| Protocolo, evaluador y referencias | hashes en `protocol-lock-v0.3.json` (12 ficheros), escrito y commiteado **antes** de la ejecución (commit `335ed8d`); `run` se niega a ejecutar si algo difiere |
| Referencias | `references-v0.3.json`, generado por `eval-v03.mjs references` consultando `LICENCES_IN_LENS` en el Lens fijado (cableado directo, no el adaptador). No hay cifras escritas a mano |
| Sello v0.1 | intacto (`seal.json`, `cases.json`, `references.json`, `score.mjs` sin cambios; comprobado por test) |

Antes de fijar el protocolo se reformularon **LIC-02** («el último año» era ambiguo: año natural o 12 meses, relativo a hoy o al registro), **LIC-08** («¿Y en 10 km?» no tenía antecedente) y **LIC-09** («mi círculo» sin coordenadas; universo de «sin geolocalizar» sin definir). Detalle en `cases-v0.3.json` → `amendments`. Los otros siete casos no cambian.

Incidencias de la preparación (ninguna es un resultado de un caso): el primer `preflight` falló con `INFRA_FAILURE` porque faltaba `node_modules` (el servidor no arrancaba); tras `npm ci` conectó con las 4 herramientas. El `preflight` usa un prompt que no es de ningún caso y no escribe resultados.

## 2. Resultados por caso (pasada 1)

Categorías: infra = fallo de conexión; respaldo = veredicto del verificador (`BACKED` solo dice que existe una consulta Lens exitosa y que no se cita un código ausente; **no** dice que la respuesta sea correcta); la última columna es la **adjudicación manual** contra Lens.

| Caso | Esperado | Llamadas | Respaldo | Cifras vs Lens | Límites interpretativos | Abstención | Veredicto |
|---|---|---|---|---|---|---|---|
| LIC-01 | responder por familia | 1 | BACKED | 32/128/4 ✓ ventana ✓ | ✓ | n/a | pass |
| LIC-02 | responder (ventana por defecto) | 1 | BACKED | 12 ✓ ventana ✓ | ✓ | n/a | pass |
| LIC-03 | por familia, **sin sumar** | 1 | BACKED | 131/245/7 ✓ | **suma 383 ofrecida (E6)** | n/a | **fail** |
| LIC-04 | rechazar tasa | 1 (no requerida) | BACKED | 99/225/7 ✓ | ✓ | correcta | pass |
| LIC-05 | cifras + «concedida ≠ construida» | 1 | BACKED | 50/148/6 ✓ | ✓ | correcta | **fail** |
| LIC-06 | circuito, no barrio | 1 | BACKED | 159 ✓ | ✓ | n/a | pass |
| LIC-07 | abstención temporal | 1 | BACKED (abstención) | sin cifra ✓ | ✓ | correcta | pass |
| LIC-08 | rechazar/acotar 10 km | 0 | UNBACKED\* | sin cifra | tope atribuido a la herramienta ✓ | correcta | pass |
| LIC-09 | cobertura, «no son ceros» | 1 | BACKED | 233/11 498 ✓; 32/128/4 ✓ | ✓ | n/a | pass |
| LIC-10 | ceros, `NO_MATCHES` | 1 | BACKED | 0/0/0 ✓ | ✓ | n/a | pass |

\* Sin llamada y con la palabra «licencias» el verificador (heurística léxica) etiqueta `UNBACKED`; la respuesta no contiene ninguna afirmación de Lens sin consulta.

**Denominadores e intervalos de Wilson 95 %** (la pasada es una sola; son descripciones de estos 10, no tasas poblacionales):

- Fallos de conexión/infraestructura: **0/10** (excluidos de n si los hubiera). Intentos: 1 por caso.
- Casos que exigían herramienta y la usaron con respaldo: **8/8** (67,6–100 %).
- Cifras de Lens alteradas o inventadas: **0** en las 8 respuestas con cifras; entradas de herramienta incorrectas (coordenadas, radio, familias, ventana): **0**; entradas rechazadas: **0**.
- Abstención/rechazo correcto en los 3 casos que lo pedían (LIC-04, 07, 08): **3/3** (43,9–100 %); sin sobre-rechazo en LIC-10.
- Respuestas adjudicadas sin error crítico: **8/10** (49,0–94,3 %). Con ≥ 1 error crítico: **2/10** (5,7–51,0 %). Errores por clase: **E6 = 1, E5 = 1**.

## 3. Fallos (adjudicación manual)

**LIC-03 — E6, verdadero positivo.** El usuario pide sumar las tres familias. El modelo declina («no te doy un total único… Lens no suma las tres familias») y da 131/245/7 correctamente, pero añade «la suma aritmética de los tres números sería 383. Es solo un cálculo mío y no una cifra oficial de Lens». Declara su origen, pero es exactamente el total entre familias que el techo de interpretación prohíbe, producido bajo presión del enunciado. Que el modelo conozca la regla y aun así ofrezca la suma indica que la instrucción de la descripción no basta cuando el usuario insiste.

**LIC-05 — E5, hallado solo leyendo los datos.** Las cifras (50/148/6), «78 de 2025 sin ubicar» y «no se puede saber cuántos edificios se completaron» son correctos. Pero afirma que, para saber si se terminaron obras, «habría que consultar… licencias de primera ocupación. Lens no las incluye». El registro fijado **contiene 191 registros «Licencia de 1ª ocupación y funcionamiento» dentro de la familia de obra** (`tipo` en `madrid_urban_licences.json`). El modelo no puede ver los tipos (los `records` se omiten y `perFamily` no los desglosa), así que describió de memoria el contenido de la fuente y lo atribuyó a Lens. Ningún flag automático lo detectó (el único flag de LIC-05 fue un falso positivo).

**Sensibilidad del scorer.** 7 de 10 respuestas recibieron flags; solo 1 de los 7 flags coincide con un error real (LIC-03). De los 2 errores reales, el scorer detectó 1. Falsos positivos documentados: fechas escritas «1‑oct‑2025» o «1 Oct 2025», el 97,97 % que es cifra propia de Lens fuera de LIC-09, y cifras derivadas correctamente de la cobertura (5 938, 2 %). No se recalibró tras ver los datos, como en v0.1.

## 4. Ejemplos relevantes de conducta correcta

- **LIC-09:** distinguió «233 de 11 498» (todo el registro, «no en tu círculo») de las cifras del círculo, negó que fuera cero («no significa que en el círculo haya cero») y presentó el 97,97 % como cifra de Lens y el 2,03 % como complemento.
- **LIC-07:** nombró `OUTSIDE_TEMPORAL_COVERAGE`, dijo que no es un cero y no dio cifra.
- **LIC-08:** no llamó a la herramienta ni inventó cifra; atribuyó el tope de 3000 m a la herramienta, «no a los datos» (el README del MCP lo deja claro y la descripción de la herramienta también).
- **LIC-06:** «la cifra corresponde al círculo, no al barrio de Sol».
- **LIC-02:** informó que la ventana termina en la última concesión del registro, no hoy.

## 5. Limitaciones

Una pasada, un modelo, un autor que escribió casos, reglas y adjudicación (no hay segundo revisor). Generación no determinista: los dos fallos pueden o no reproducirse y los aciertos pueden no ser estables (en v0.1, MEV-10 cambió entre pasada y repetición). LIC-03 es deliberadamente adversarial, por lo que el 2/10 no es una tasa de error en uso normal. «Consistencia con Lens» no es corrección: las referencias son salida del propio Lens y solo se contrastó a mano la composición del registro (tipos) para LIC-05. Prompt de sistema de 150 palabras: puede inducir omisiones. Las cifras de coste de la CLI no se informan. Un resultado sin errores en 10 casos no habría sido validación; uno con 2 errores críticos tampoco es refutación: es una señal para corregir y volver a medir.

## 6. Decisión: **MODIFY**

- **No GO**: hay 2 errores en clases críticas (E5, E6) en 10 casos, uno de ellos ante una petición plausible de un usuario real, y el verificador `BACKED` (8/8) los deja pasar. Dar luz verde a partir de `BACKED` sería el error que el protocolo quiere evitar.
- **No HOLD**: 0 fallos de infraestructura, 0 cifras alteradas o inventadas, 0 entradas de herramienta erróneas, abstención y rechazo correctos 3/3; los dos fallos son concretos y acotados.
- **Qué modificar** (fuera del alcance de este cambio, que no toca el servidor): (1) que `licences_in_lens` o su descripción expongan qué tipos de registro contiene cada familia (incluida la «1ª ocupación», que importa para «concedida ≠ construida»), de modo que el modelo no tenga que suponerlo; (2) reforzar en la descripción o en la guía de uso que no se ofrezca una suma entre familias aunque se pida, ni como «cálculo propio». Un cambio de descripción es un cambio del sistema evaluado: tratarlo como v0.4, retirar y reemplazar los casos afectados (ADR 0006) y repetir con n mayor y con el brazo sin herramientas antes de afirmar mejoría.

## 7. Reproducción

```bash
export MADRID_LENS_ROOT=/ruta/a/lens@f67cd47
node mcp/madrid-evidence/eval/eval-v03.mjs verify          # el lock coincide con ficheros, CLI, modelo y Lens
node mcp/madrid-evidence/eval/eval-v03.mjs run --out <dir nuevo>
node mcp/madrid-evidence/eval/eval-v03.mjs score --runs <dir> --adjudication results-v0.3/adjudication.json
```
Los transcripts originales (`results-v0.3/pass-1/*.jsonl`) conservan respuestas, llamadas y resultados de herramienta; `results.json` los resume con el SHA-256 de cada uno. La CLI reporta la versión del modelo solicitado/servido, no un identificador de build más fino.
