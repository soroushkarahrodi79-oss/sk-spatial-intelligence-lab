# Madrid Evidence MCP — Case Study 01: Nuevo Mahou-Calderón

*Estado: prototipo de investigación, no validado científicamente. Versión aprobada para publicación como demostrador técnico, 2026-11-12.*

## 1. Problema profesional

Cuando un asistente de IA responde sobre planeamiento, la cita de la fuente suele perderse. Una fase administrativa se lee como obra ejecutada o una licencia concedida como edificio existente. Este caso examina un diseño que reduce ese riesgo: el modelo dispone de cuatro herramientas que devuelven evidencia con su procedencia, sus límites de interpretación y abstenciones explícitas.

## 2. Área de estudio

- **Ámbito:** `APE.02.27`. La geometría lo denomina «NUEVO MAHOU-CALDERÓN» y la tabla de estado «MAHOU - VICENTE CALDERÓN». Distrito de Arganzuela, uso característico residencial.
- **Superficie:** 193 804,42 m². Es un valor administrativo publicado en la columna «Superficie (m²)» de la tabla de estado. No se ha medido a partir de la geometría.
- **Centro de consulta:** lon -3.7184, lat 40.4026 (WGS84). Es la media de los vértices del polígono, calculada para este estudio. No es un centroide ponderado por área ni un punto oficial.
- **Círculo de licencias:** 500 m en torno a ese centro. Es una unidad analítica distinta del ámbito.

## 3. Arquitectura y garantías

Claude (modelo de lenguaje) → servidor MCP ([`mcp/madrid-evidence`](../../mcp/madrid-evidence/README.md)) → módulos de Lens en un checkout local fijado.

El servidor expone cuatro herramientas deterministas. Al arrancar comprueba el SHA-256 de los 11 archivos que lee contra el pin y verifica el commit con git. Esa comprobación acredita que código y datos son los fijados. No acredita que los resultados de Lens sean correctos ni que coincidan con el portal oficial.

Que el modelo se apoye en las salidas de las herramientas o añada afirmaciones propias depende de sus instrucciones y de su comportamiento. La arquitectura no lo impone, y este caso no evalúa ese comportamiento.

## 4. Consultas y herramientas

| Pregunta | Herramienta |
|---|---|
| ¿Qué ámbito contiene el punto y cuál es su estado? | `ambito_snapshot_at_point` |
| ¿Qué cambió entre las ediciones de julio de 2025 y enero de 2026? | `ambito_snapshot_at_point` |
| Licencias concedidas por familia en 500 m | `licences_in_lens` |

La herramienta del ámbito compone `AMBITO_AT_POINT`, `AMBITO_PHASES` y `AMBITO_EDITION_DIFF`. Las salidas citadas proceden de llamadas directas a las herramientas en una sesión de Claude Code, no de una conversación completa con el modelo.

## 5. Estado urbanístico y comparación de ediciones

**Edición de enero de 2026.** Las cuatro fases publicadas (planeamiento, gestión, proyecto de urbanización y obras de urbanización) figuran como «Finalizado».

**Comparación con julio de 2025** (`COMPARABLE_WITHIN_SCHEMA_ERA`):

- **S1 (fases):** `STATE_TRANSITION`. Solo cambia `urbanizacion_obras`, de «En Ejecución» a «Finalizado».
- **S2 (edificabilidad remanente):** `NO_CHANGE`. Solo hay una diferencia cosmética de texto en observaciones.
- **Edificabilidad residencial colectiva:** 19 428,5 m² edificables en ambas ediciones, sin diferencia.
- **Unifamiliar, industrial y terciario:** `WITHHELD`. En 2025 constaban con valor 0 y en 2026 como «no publicado». Lens no trata el blanco como cero ni compara esas celdas.

## 6. Licencias concedidas por familia (círculo de 500 m)

La llamada se hizo **sin parámetro `window`**. Lens aplicó su ventana por defecto y la informó: 2025-10-01 a 2026-09-30 (`clamped:false`), que son los 12 meses hasta la última concesión del registro, no hasta la fecha actual.

| Familia | Concedidas |
|---|---|
| Edificación / urbanística | 8 |
| Actividad | 3 |
| Actividad temporal | 0 |

Las familias no se suman: son universos distintos y Lens no ofrece un total.

**Cobertura:** el registro tiene 11 498 filas y 11 265 están localizadas (97,97 %). Las 233 restantes no se cuentan como ceros. La capa cubre de 2023-01-13 a 2026-09-30.

Un recuento ad hoc sobre el JSON del registro, con cálculo propio de distancia, coincidió con las cifras de 8 y 3. Esa comprobación es externa a las herramientas MCP y no se conservó como procedimiento reproducible.

## 7. Procedencia y versiones

- **Lens:** commit `f67cd4709d1319f5685aaa184326330a5d535088`.
- **SK Lab:** `main` en `3c5fa02` (merge de la PR #12).
- **Estado de ámbitos:** edición `S1:2026-01:585db074c122`. Referencia 2026-01-01, publicada 2026-03-24, recuperada 2026-10-06, CC BY 4.0, periodicidad semestral. Edición previa: `S1:2025-07:e1ff3e0e0f63`, sin fecha de publicación declarada.
- **Edificabilidad remanente:** `S2:2025-07:09f6859a2541` y `S2:2026-01:326edf48d221`.
- **Geometría de ámbitos:** fecha de referencia no declarada. Su vigencia es desconocida y no debe inferirse de la fecha de recuperación.
- **Licencias:** recuperadas el 2026-10-06, periodicidad mensual, con fecha de referencia y de publicación no declaradas (`NOT_DECLARED_BY_PUBLISHER`).

## 8. Límites científicos e interpretativos

1. **Estado administrativo no es obra física.** El paso a «Finalizado» es un cambio publicado en una tabla y no acredita ejecución.
2. **Concedida no es construida.** El registro solo recoge concesiones. No hay solicitudes ni denegaciones, y por tanto no existe tasa de aprobación.
3. **Círculo no es ámbito.** Los recuentos son del círculo. Las cifras del ámbito describen el ámbito entero y no se reparten al círculo. Este estudio no cuantifica la intersección entre ambos y ninguna herramienta MCP lo hace.
4. **Sin contraste oficial.** No se han cotejado los datos con el portal.
5. **Cobertura parcial** del 2,03 % de filas sin localizar.

## 9. Reproducibilidad

1. Obtener Lens en el commit fijado y apuntar `MADRID_LENS_ROOT` a ese checkout. Véase [`mcp/madrid-evidence/README.md`](../../mcp/madrid-evidence/README.md).
2. Arrancar el servidor. Si un hash no coincide, no arranca.
3. Repetir las llamadas: `ambito_snapshot_at_point` con `{lon:-3.7184, lat:40.4026}` y `licences_in_lens` con `{lon:-3.7184, lat:40.4026, radiusM:500}`. Esta última es la que produjo las cifras de la sección 6.
4. Como alternativa, fijar `window:{from:"2025-10-01", to:"2026-09-30"}`. No se ha ejecutado para este centro, aunque cabe esperar el mismo resultado.

Con el mismo pin, las herramientas son deterministas. No se ha repetido el procedimiento en otro entorno. La evaluación del comportamiento del modelo queda pendiente.

## 10. Valor práctico y líneas de investigación

El caso ofrece un patrón de cita: edición, fecha, identificador de versión, hash y límite de uso acompañan cada cifra. Permite estudiar cómo se comunican estados administrativos sin sugerir avance físico, cómo responde un modelo a preguntas que ninguna herramienta cubre, cómo se tratan celdas `WITHHELD` y fechas no declaradas, y cómo comparar asistentes con y sin herramientas de evidencia.

## Conclusión crítica

**Demuestra** que con las herramientas actuales se obtienen, para este caso, resultados con procedencia declarada, hashes de archivos fijados y límites de uso explícitos.

**No demuestra** que el sistema esté validado, que las cifras coincidan con el portal, que las licencias o la fase indiquen construcción, ni que el modelo se comporte de forma fiable en una conversación.

## Referencias verificadas (HTTP 200, 2026-11-12)

- [Estado de desarrollo de los ámbitos (PGOUM 97)](https://datos.madrid.es/dataset/203200-0-desarrollo-ambitos)
- [Edificabilidad remanente en ámbitos](https://datos.madrid.es/dataset/203182-0-ambitos-remanente)
- [`madrid_ambito_state.json`](https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens/blob/f67cd4709d1319f5685aaa184326330a5d535088/data/planning/madrid_ambito_state.json)
- [`madrid_urban_licences.json`](https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens/blob/f67cd4709d1319f5685aaa184326330a5d535088/data/planning/madrid_urban_licences.json)
- [`madrid_ambitos.geojson`](https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens/blob/f67cd4709d1319f5685aaa184326330a5d535088/data/planning/madrid_ambitos.geojson)
- [`source_registry.json`](https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens/blob/f67cd4709d1319f5685aaa184326330a5d535088/data/source_registry.json)
- [`js/urban-licences.js`](https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens/blob/f67cd4709d1319f5685aaa184326330a5d535088/js/urban-licences.js)
- [`js/ambito-change.js`](https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens/blob/f67cd4709d1319f5685aaa184326330a5d535088/js/ambito-change.js)
- [Merge de la PR #12 en SK Lab](https://github.com/soroushkarahrodi79-oss/sk-spatial-intelligence-lab/commit/3c5fa02db08404940bbfeb48736471dab24ca4db)

Se comprobó que los archivos existen en el commit de Lens y que las URL responden. No se comprobó que el contenido de los datasets del portal coincida con las ediciones citadas.
