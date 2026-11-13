# Spatial Investigation Studio v0.2: experimento «Claude como selector de afirmaciones»

**Estado: HOLD. Conservado como investigación tras la decisión estratégica PIVOT; no es una funcionalidad aprobada ni está integrado en Studio.** Experimento offline. Ninguna llamada a un modelo real, ningún SDK, ninguna clave, ningún cambio en Studio v0.1, en el MCP ni en los protocolos sellados.** No hay resultados de Claude en este documento porque no se ha ejecutado ninguno. Los números de las tablas provienen de proveedores *simulados* (guiones deterministas) y de mediciones del propio paquete; no dicen nada sobre el comportamiento de un modelo.

Principio: la IA puede mejorar cómo se explora la evidencia, pero no debe modificar qué hechos están respaldados por ella.

## 1. Qué se inspeccionó (y qué no existe)

| Hecho verificado | Dónde |
|---|---|
| Rama `claude/spatial-investigation-studio-v0.2-4tf7jg` = `origin/main` = `1ca851a`, árbol limpio. El `main` local está 10 commits atrasado; no se usó. Lens en `f67cd47`, el commit fijado. | `git` |
| Studio v0.1 no tiene LLM ni campo de pregunta: entrada = punto + radio (250/500/1000) + ventana opcional. | `studio/mcp-session.mjs` `parseInvestigation` |
| `buildView` ya liga cada valor mostrado a un puntero JSON del registro MCP crudo; las notas de interfaz no llevan cifras. Es la base natural del paquete. | `studio/public/evidence-view.mjs` |
| Todo llega al DOM por `textContent` (sin `innerHTML`). | `studio/public/app.js` |
| Ya existe prior art del mismo patrón para GeoImpact (ADR 0007, `provider-contract.mjs`): el modelo solo selecciona/ordena ids, hash del informe, validación, fallback. **Está atado a `verifyAnswerEvidence` y a informes GeoImpact**, así que se reutiliza el diseño, no el módulo. Reutilizado de verdad: `wilson`/`summarize` de `geoimpact-copilot/evaluation/metrics.mjs`. | `geoimpact-copilot/provider-contract/`, `docs/geoimpact-v0.3-claude-integration-design.md` |
| La especificación GeoImpact prohíbe SDK, claves y red hasta superar su gate (≥300 casos independientes, etc.). Este experimento no lo supera ni lo pretende. | `claude-evaluation-spec.json` |
| v0.3: 10 casos, un modelo, una pasada: **E6 en LIC-03** (ofrece «la suma sería 383… cálculo mío») y **E5 en LIC-05** (afirma «Lens no incluye primera ocupación»; el registro tiene 191). El verificador `BACKED` pasó 8/8 y el scorer detectó **1 de 2** errores reales, con 6 falsos positivos de 7 flags. | `eval/results-v0.3/informe-v0.3.es.md` |
| v0.4cmp: protocolo **preregistrado, sin ninguna llamada a un LLM**. No existe evidencia real de que `registerComposition` y la instrucción «no sumar» corrijan E5/E6. | `eval/cases-v0.4cmp.json` |

## 2. Premisas desafiadas

1. **«Claude mejora la presentación» no tiene criterio sin pregunta.** Studio v0.1 no recibe pregunta; ordenar «por relevancia» sin objetivo es indefinido. El experimento introduce una pregunta *solo en la capa offline* (no se modifica la interfaz). Si el producto no va a tener pregunta, B carece de objeto.
2. **El techo de B es minúsculo.** Con las restricciones necesarias (§4) quedan **12 órdenes válidos por caso** (3,6 bits), o **2** si las licencias se abstienen (medido en los 17 casos: 15 × 12, 2 × 2). Es decir: ámbito-antes-que-licencias y el orden de tres familias.
3. **Un orden «razonable» lo hace una regla de 25 líneas.** El proveedor simulado `well-behaved-orderer` (regex sobre la pregunta) reordena 10 de 17 casos. Cualquier mejora de B solo cuenta si supera a ese control determinista (A+), no solo a A. Sin A+ el resultado confunde «reordenar» con «Claude».
4. **La fidelidad factual de B es una tautología, no un hallazgo.** El texto es siempre el determinista; que B tenga 0 errores factuales por construcción no mide la fiabilidad de Claude. Lo que sí puede fallar es **el énfasis**: abrir con un recuento y relegar «concedida ≠ construida», o enterrar una abstención. Ese riesgo no lo cierra ningún validador de ids; por eso las restricciones agrupan cada hecho con sus límites y la evaluación debe medir énfasis con revisión humana.
5. **La omisión engaña igual que la invención.** Un contrato «el modelo elige ids» permite descartar la limitación y quedarse con el dato. De ahí la regla de completitud (§4).
6. **Coste desproporcionado.** La petición mide **11–50 KB** (medido) para escoger entre ≤12 órdenes; el modelo ve valores que no necesita para ordenar y eso amplía la superficie de inyección. Una proyección mínima (títulos, estado y tipo por afirmación) es el primer factor a probar, no se ha implementado.

## 3. Alternativas

| | **A. Determinista v0.1** | **B. Claude selector de ids** | **C. Claude con explicación restringida** |
|---|---|---|---|
| Qué produce el modelo | nada | ids ordenados (JSON estricto, 4 claves) | texto libre acotado |
| Hechos nuevos posibles | no | no (el texto es el del paquete) | **sí**, salvo que un verificador lo impida |
| Riesgo residual | ninguno de modelo | énfasis/orden; inyección solo puede alterar el orden permitido | E3/E5/E6 pragmáticos (ver abajo) |
| Verificable offline | sí | **sí** (implementado, 23 pruebas) | **no hay mecanismo sólido disponible** |
| Valor máximo | línea base | ≤12 órdenes por caso | alto en teoría, indemostrable hoy |
| Estado | publicado | prototipo experimental, **OFF** | **NO autorizado**; solo hipótesis |

**Por qué C no se autoriza.** Un verificador léxico atrapa «383» porque ese número no está en ninguna fuente, pero no atrapa el E6 implícito (v0.4cmp S3: «¿más de 200 en total?» no introduce ninguna cifra nueva) ni el E5 de LIC-05 (una frase de contenido de la fuente sin cifras). La evidencia del repositorio es que los filtros léxicos fallan justo en las clases críticas: en v0.3 el scorer detectó 1 de 2 errores. La puerta semántica de GeoImpact (ADR 0005) funciona porque solo admite esqueletos de frase aprobados, o sea, no es texto libre. Una variante verificable de C que no es LLM: **plantillas con huecos ligados a ítems**, que ya es lo que hace la interfaz. Condición mínima para reabrir C: un mecanismo que rechace por construcción cualquier frase que no sea un esqueleto aprobado, más un ADR aparte.

## 4. Arquitectura mínima implementada (alternativa B)

```
respuesta MCP (v0.1) ──buildView──► ítems con puntero JSON ──► buildClaimPackage
                                                                  │  claims (id estable c-…), items (id i-…, value_sha256),
                                                                  │  constraints, baseline_order, package_sha256
              pregunta (no confiable) ──► buildSelectionRequest ──► proveedor INYECTADO (por defecto: ninguno)
                                                                  │ salida cruda
                                          validateSelection ◄─────┘   esquema · digests · ids · completitud · restricciones
                                                  │ ok                       │ cualquier fallo
                                                  ▼                          ▼
                                evidencePreservationProblems        orden determinista v0.1
                                  (mismo conjunto, mismos objetos, cada valor re-resuelto contra el MCP crudo)
                                                  │ ok / fallo ► fallback
                                                  ▼
                                      applyOrder: los ítems ORIGINALES, reordenados
```

- **Salida del modelo** (`studio-claim-selection/1`): exactamente `schema`, `package_sha256`, `question_sha256`, `claim_ids`. Sin texto, cifras ni citas. Cualquier otra clave (incluida `__proto__`) se rechaza.
- **Unidad de afirmación**: una sección de la vista; las licencias se parten en una afirmación de alcance/límites (ventana, cobertura, techos, `registerComposition` como CONTEXT) y **una por familia**. Los ítems nunca cambian de afirmación; el modelo no puede mover un valor a otra.
- **Restricciones** (`BLOCK`, `TAIL`): ámbito→fases→diferencia→capa consultada forman un bloque fijo; licencias = alcance primero, luego las tres familias en cualquier orden; procedencia al final. Los bloques se ordenan libremente entre sí. Así ningún recuento se separa de su ventana, cobertura y «sin total entre familias».
- **Completitud**: deben aparecer todas las afirmaciones, una vez. Ninguna abstención, error, nota o límite puede omitirse.
- **Puerta final independiente del validador**: comprueba sobre lo que se va a mostrar (acepte o no) que el conjunto y los objetos son los de la línea base, que las abstenciones no aparecen ni desaparecen, y re-traza cada valor contra el registro MCP crudo (`verifyPackageTrace`). Un paquete corrompido cae a fallback aunque el proveedor acierte.
- **Fallback**: cualquier rechazo, error, tiempo agotado o pregunta inválida devuelve `baselineOrder`, idéntico a `allItems(buildView(...))`. Sin proveedor (el estado por defecto) nunca se llama a nada. El texto de un error del proveedor no se propaga.
- **No se tocó**: `server.mjs` ni `studio/public/*` no importan el selector (lo comprueba un test). El selector no se sirve.

### Archivos

Nuevos: `studio/selector/claim-package.mjs`, `studio/selector/selection-contract.mjs`, `studio/selector/eval/{run.mjs,cases.json,simulated-providers.mjs}`, `tests/studio-selector.test.mjs`, este documento.
Modificado: `package.json` (solo dos scripts: `test:studio-selector`, `eval:studio-selector`). `package-lock.json` sin cambios (los locks v0.3/v0.4cmp lo hashean).

## 5. Qué es cada cosa

| Nivel | Qué es aquí | Qué prueba | Qué **no** prueba |
|---|---|---|---|
| **Prueba funcional** | 23 pruebas offline sobre el MCP real + proveedores simulados; 8 mutaciones del contrato detectadas (más un mutante equivalente, sin efecto observable) | que el contrato rechaza lo que debe y que el fallback conserva la evidencia | nada sobre Claude |
| **Evaluación experimental** | 17 casos nuevos + runner con modo `--replay` y paquete ciego; **0 ejecuciones reales** | nada todavía | — |
| **Validación científica** | inexistente | — | utilidad, claridad, ausencia de énfasis engañoso, generalización |

Los casos son del mismo autor que el sistema: separados del conjunto sellado, **no independientes**. Los puntos se eligieron *después* de ver los datos (máxima actividad de licencias entre candidatos elegibles); la elección no es ciega. Un test garantiza que ningún círculo intersecta uno sellado y que ningún código de ámbito aparece en ficheros sellados (la primera versión falló ese test: dos de mis puntos estaban a 50–100 m de Nuevos Ministerios, que usan S1/B2).

## 6. Cobertura de casos

| Requisito | Casos |
|---|---|
| Evidencia urbanística válida | SEL-01, 09, 10, 15 |
| `NO_EVIDENCE_FOR_SCOPE` | SEL-02, 16 |
| Licencias por familias independientes | SEL-03, 09 |
| `PLAN_ORIGIN_MARKER` | SEL-04 (la precondición se verifica contra los datos) |
| Ámbitos temporales y espaciales | SEL-05 a 08 (en cobertura, recortada, fuera de cobertura, fecha no calendario); radios 250/500/1000 |
| Campos `null` / cobertura incompleta | SEL-03, 11 |
| E6 (agregar familias) | SEL-12 (petición explícita), 13 (umbral implícito), 17 (concedida≠construida) |
| `registerComposition` vs círculo | SEL-14 |
| Instrucciones adversariales en datos | SEL-15 (en `denomination`), 16 (en el mensaje de abstención), y en la pregunta SEL-12/17 |

Cada caso declara `requires` y un test comprueba que los datos reales aún lo cumplen, de modo que un caso no deja de cubrir su etiqueta sin avisar.

## 7. Resultados observados (solo contrato, proveedores simulados)

Los hechos que sí se midieron: 23/23 pruebas en verde; los 20 comportamientos defectuosos simulados (orden inverso, omitir límites, id inventado, duplicado, total extra, texto en ids, JSON con valla, prosa, digest erróneo, clave `__proto__`, exceso de tamaño, excepción, silencio) reciben **exactamente** el veredicto esperado en los 17 casos; el fallback es idéntico a la vista v0.1 en todos; el «modelo» que obedece instrucciones inyectadas cae a fallback en los 4 casos con directiva y no cambia nada visible. Eso verifica el **contrato**. No hay latencia, coste ni calidad de modelo: no se han medido.

## 8. Qué exigiría una evaluación real con Claude

Condiciones previas (todas, antes de gastar nada):

1. **Autorización explícita de coste y acceso**, y decisión sobre el canal: la práctica del repositorio (v0.3/v0.4cmp) es `claude -p` sin SDK; ADR 0007 prohíbe SDK/clave/red hasta su gate y habría que enmendarlo con un ADR si se quiere otra vía. Las cifras de coste del CLI no son lo que se factura.
2. **Control A+**: promover el orderer determinista a brazo oficial. Comparar B contra A+ y A.
3. **Pregunta con dueño**: decidir si el producto tendrá pregunta; si no, B no tiene objeto y el experimento se cierra.
4. **Casos no escritos por el autor del sistema** y preregistro con lock (hash de casos, contrato, constructor de petición, modelo, versión de CLI), como `protocol-lock-v0.3.json`. El CLI no expone temperatura: documentarlo.
5. **Revisión humana ciega** de pares A/B (el runner ya genera `packet.json` y `key.json` aparte) con la rúbrica: ¿más claro?, ¿más útil?, ¿énfasis engañoso? (p. ej. recuento antes que sus límites, abstención relegada). Mínimo dos revisores en una muestra, desacuerdo reportado.
6. **Tamaño**: con n = 17 y cero errores críticos el límite superior Wilson 95 % es **18,4 %**; con 51 ejecuciones, 7,0 %; solo con 300, 1,26 %. Una preferencia de 12/17 tiene intervalo 47–87 %. Con 17 casos nada se puede afirmar; el umbral del gate GeoImpact (≥300 independientes) sigue vigente.
7. Probar la **proyección mínima** de entrada como factor, y registrar latencia, tokens y coste solo si se miden (el runner reporta «not recorded» si falta cualquiera de ellos; nunca estima).

Métricas: tasa de aceptación/fallback por motivo (Wilson), cambio de orden respecto de A y de A+, errores críticos (esperados 0 por construcción: cualquiera ≠ 0 es un fallo del sistema, no del modelo), preferencia humana ciega, latencia p50/p95, coste. No reportar «fidelidad factual» de B como mérito del modelo.

## 9. Riesgos pendientes

- **Énfasis posicional**: una abstención puede quedar tras una evidencia de otra consulta; no está fijada y la evaluación humana debe medirlo. Se podría imponer «abstenciones primero», a costa de reducir aún más el valor de B.
- **Ordenar familias puede leerse como ranking.** La interfaz declara que no se suman, pero el orden libre es una decisión de producto; la alternativa conservadora es fijar el orden de familias (quedan 2 órdenes por caso).
- **Cadenas no confiables en los datos** llegan tal cual al modelo (y a la pantalla como texto). En producción están fijadas por hash, así que SEL-15/16 simulan un compromiso del dato; no un riesgo observado.
- **El validador acepta JSON con espacios y claves duplicadas** (`JSON.parse` conserva la última); el resultado se valida entero, no afecta a la integridad, pero la auditoría de un duplicado no queda registrada.
- **Los ids de afirmación dependen de la estructura de la vista**; un cambio de `evidence-view.mjs` cambia `package_sha256` y requiere repetir la evaluación.
- **La prueba nueva no está en CI** (`.github/workflows/validate.yml` no se modificó): `test:studio-selector` debe añadirse junto a `test:studio` antes de tratarlo como regresión protegida.
- El entorno de esta sesión tiene una build de Chromium distinta de la que Playwright 1.64.1 espera; `test:studio-browser` pasa con `PLAYWRIGHT_CHROMIUM` apuntando al Chromium preinstalado.

## 10. Reproducción

```bash
export MADRID_LENS_ROOT=/ruta/al/lens-en-f67cd47
npm run test:studio-selector                     # 23 pruebas, offline
npm run eval:studio-selector                     # matriz simulada (NO mide ningún modelo)
node studio/selector/eval/run.mjs --replay runs.json [--review-packet out/]   # puntúa salidas grabadas de un modelo real
```

Formato de `runs.json`: `{ "model": "...", "runs": [ { "caseId": "SEL-01", "raw": "<texto devuelto>", "meta": { "latencyMs": 0, "inputTokens": 0, "outputTokens": 0, "costUsd": 0 } } ] }`. `meta` es opcional y cada estadística se informa solo si todas las ejecuciones la traen.
