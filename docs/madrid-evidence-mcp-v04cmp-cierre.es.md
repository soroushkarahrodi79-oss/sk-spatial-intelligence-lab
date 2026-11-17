# Madrid Evidence MCP: cierre de la comparación preregistrada v0.3 frente a v0.4 (`v0.4cmp`)

**Estado: cerrado. Veredicto preregistrado: MODIFY.** Estudio exploratorio de comportamiento de un agente, no validación científica de los datos de Lens ni un banco de seguridad del MCP. Cierre del 17 de noviembre de 2026.

> No se concluye que v0.4 sea globalmente superior a v0.3, ni existe evidencia de una mejora estadísticamente significativa ni de causalidad. Los recuentos son descriptivos.

## 1. Diseño

- Protocolo preregistrado antes de ejecutar: [`protocol-lock-v0.4cmp.json`](../mcp/madrid-evidence/eval/protocol-lock-v0.4cmp.json), [casos y reglas de decisión](../mcp/madrid-evidence/eval/cases-v0.4cmp.json) y [referencias](../mcp/madrid-evidence/eval/references-v0.4cmp.json), todos con SHA-256 fijados.
- 10 casos nuevos (8 dirigidos y 2 de regresión, R1 y R4) × 2 repeticiones × 2 brazos = 40 ejecuciones, en 20 pares con orden determinista.
- Mismo modelo (`claude-sonnet-5-5`), prompt de sistema y parámetros en ambos brazos; solo cambia el servidor MCP. Entorno bloqueado: Claude CLI 2.1.322, Node v22.23.4, MCP SDK 1.32.2, Lens `f67cd47`.
- El tratamiento de v0.4 es un **paquete de dos cambios** (una frase en la descripción de `licences_in_lens` que prohíbe totales entre familias, y el campo `registerComposition`). La comparación no puede decir cuál de los dos actúa.
- Las 40 ejecuciones se completaron sin fallos de infraestructura ni de sistema; los 20 pares son válidos.

## 2. Resultados agregados

| | v0.3 | v0.4 |
|---|---|---|
| Ejecuciones con error crítico | 5/20 | 2/20 |
| Intervalo de Wilson 95 % (descriptivo) | 11,2 %–46,9 % | 2,8 %–30,1 % |
| Errores E1, E2 o E9 | 0 | 0 |
| Atribuciones locales sin soporte (C1, C2, B2) | 0 | 2 |
| Criterio de regresión R1 / R4 | se cumple / **falla** | se cumple / **falla** |

Por caso (críticos sobre 2 ejecuciones por brazo): S1 2/2 en v0.3 y 0/2 en v0.4; S3 2/2 y 0/2; B2 0/2 y 1/2; R4 1/2 y 1/2; sin críticos en ninguna versión en T1, T2, C1, C2, R1 y B1. De los 20 pares, 5 son discordantes: 4 (S1 y S3) con el crítico solo en v0.3 y 1 (B2) con el crítico solo en v0.4.

**Decisión preregistrada: MODIFY**, por (a) errores críticos en ejecuciones válidas de v0.4 (2), (b) el fallo del criterio R4 en v0.4 (que también falló en v0.3) y (c) dos atribuciones locales sin soporte en v0.4. GO queda excluido; HOLD no aplica porque no hay una regresión nueva en R1 o R4 ni errores E1, E2 o E9.

## 3. Hallazgos principales

1. **Menos agregaciones indebidas entre familias (S1 y S3).** En los casos que invitan a sumar licencias de familias distintas, v0.3 produjo la suma o una comparación sobre el total en las 4 ejecuciones y v0.4 en ninguna. Es compatible con un efecto de la instrucción «no total», pero con 2 repeticiones por caso, casos no aleatorios y un tratamiento combinado no puede atribuirse a ella.
2. **Riesgo de atribución local de información que solo existe a escala global (B2).** Con v0.4, ante la pregunta sobre edificios terminados, una ejecución describió una mezcla de tipos de licencia dentro del círculo (error E5: el resultado de la herramienta describe la composición de todo el registro localizado, no la del círculo) y otra hizo una atribución local verdadera pero sin soporte. v0.3 no mostró este patrón. Una hipótesis coherente es que exponer la composición global del registro invita a trasladarla al ámbito local; no está demostrada.
3. **R4 falla en ambas versiones.** En el círculo vacío de la Casa de Campo, una de las dos ejecuciones de cada versión explicó los ceros por una causa no respaldada por la herramienta (el parque). El fallo es independiente del tratamiento.

## 4. Limitaciones

- **Adjudicación:** el primer lector fue un modelo de lenguaje (GPT-6), no una persona independiente. El usuario revisó y confirmó 16 de las 40 ejecuciones; las otras 24 son lectura del modelo sin revisión humana independiente.
- **Revisión no ciega:** cinco de esas 16 revisiones se hicieron después de conocer el resultado agregado por brazos y no son ciegas. La segunda etapa de lectura revela el brazo por diseño (ciego parcial declarado) y al menos una respuesta de la primera etapa nombraba el campo del tratamiento.
- **Muestra:** 10 casos no aleatorios, repeticiones no independientes, un único modelo, sin temperatura ni semilla controlables. Los intervalos se solapan ampliamente y el protocolo prohíbe inferir significación.
- **Entorno:** en Windows se necesitó un shim externo (fuera del candado) que sustituye un symlink de `node_modules` por una junction; no altera código ni resultados. Stage 2 usó el CLI 2.1.323 y esta comparación el 2.1.322 del candado.

## 5. Artefactos y verificación

Los datos brutos (trazas, respuestas, clave de cegamiento, paquetes de lectura y adjudicaciones individuales) **no se publican**. Se conservan privadamente. Para verificar la integridad se publican los SHA-256 de los artefactos agregados:

| Artefacto privado | SHA-256 |
|---|---|
| `adjudication.json` (final) | `6bc34a94434b6ec189708f0f2fdec3db4b59027933de4fa49311566b59a22d1d` |
| `results.json` (salida de `score`) | `e205ac55e100d218ba624a3bc5ef4fc7952ee87267a2f704db362da0bce34b14` |
| Acta de revisión humana (11 decisiones) | `3180497a17e4ce33a924bb7fc64d4c2fd374624275cf153a10eb6f45f1bdd80f` |
| Acta complementaria (5 decisiones) | `bff03ea5b588e43c199db3acd166ec693ef079238b5c4e0505033fca7fb66754` |

## 6. Recomendación

Dar el experimento por terminado con MODIFY y no reinterpretarlo como GO. Cualquier cambio posterior del MCP requeriría un protocolo nuevo y prospectivo que separe los dos componentes del tratamiento, evalúe el riesgo de atribución local y añada un segundo lector humano ciego.
