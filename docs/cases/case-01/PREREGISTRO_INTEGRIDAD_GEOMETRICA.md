# CASE-01 — Prerregistro prospectivo de integridad geométrica

**Versión documental:** 0.1.0
**Estado:** DRAFT — NO CONGELADO
**Preparado:** 2026-10-26 (Europe/Madrid)
**Repositorio de destino:** `soroushkarahrodi79-oss/sk-spatial-intelligence-lab`
**Aprobación científica:** pendiente; no se registra firma ni aprobación
**Alcance de esta versión:** diseño y revisión documental. No autoriza adquirir datos, ejecutar el análisis, cambiar builders, publicar resultados, desplegar ni modificar otros repositorios.

> El prerregistro solo quedará congelado cuando una persona revisora apruebe explícitamente esta versión exacta y su SHA-256. Hasta entonces, los métodos y criterios siguientes son una propuesta de protocolo y la decisión para cualquier adquisición es **HOLD**.

## 1. Pregunta, alcance y separación temporal

### Pregunta de investigación

Para una captura futura, identificada por sus bytes, de la capa municipal de ámbitos de planeamiento, ¿qué cambios de validez geométrica, medidas métricas y asignaciones punto-en-polígono aparecen entre la geometría de entrada, la transformación de CRS, las políticas candidatas de precisión y la serialización, y cuál de las tres estrategias conserva la integridad topológica y las decisiones espaciales bajo criterios aprobados antes de la captura?

La unidad primaria de análisis es cada entidad identificada por su código oficial exacto. La pregunta no pretende determinar si los límites municipales representan la realidad territorial, explicar por qué fueron publicados, ni inferir impactos de negocio.

### Hipótesis falsables

| Hipótesis | Evidencia que la apoya | Evidencia que la refuta | Resultado que obliga a HOLD |
|---|---|---|---|
| H-A — invalidez heredada | La entidad ya es inválida en S0; esa condición se registra como heredada y la causa GEOS se informa por separado en cada etapa. | S0 es válida para esa entidad. | CRS, código o geometría S0 no pueden identificarse sin ambigüedad. |
| H-B — invalidez por reproyección | S0 es válida y S1 pasa a inválida antes de aplicar precisión reducida. | S0 y S1 tienen el mismo estado de validez y no aparece una invalidez nueva. | No se puede reconstruir la operación de CRS o el entorno de proyección. |
| H-C — invalidez por precisión | S1 es válida y una operación de precisión declarada en S2 la vuelve inválida; la transición se reproduce sobre la misma entidad. | La invalidez aparece antes de S2 o no aparece tras repetir la operación declarada. | El orden de operaciones, la precisión efectiva o la serialización no están fijados. |
| H-D — invalidez por serialización u otra operación | S2 es válida y S3 es inválida, o una operación intermedia identificada reproduce el cambio. | S2 y S3 conservan estado, coordenadas y estructura. | Hay divergencias sin localizar entre etapas. |
| H-E — cambio de asignación espacial | En puntos de referencia independientes, una estrategia cambia la asignación frente a S1 bajo un predicado y CRS predeclarados. | No hay cambios en el universo congelado y bajo el predicado declarado. | No existe un conjunto independiente de puntos, el predicado no está definido o no hay fundamento para clasificar puntos próximos al límite. |

Las hipótesis se evalúan por entidad y por transición; un recuento agregado no sustituye la lista de códigos ni demuestra causalidad.

### Evidencia retrospectiva, no resultado prospectivo

El historial recibido para K0.1 describe una observación local de 10.412.891 bytes, SHA-256 `272ae4fe5dadebd2e96422210bf942744c9fb3401df77024eacab991ec911adc`, 765 entidades, 724 admitidas y los conteos S0–S3 incluidos en el contexto de CASE-01. El derivado disponible se reprodujo byte por byte desde esa respuesta. Esos datos son **observaciones retrospectivas de esa captura**, no el resultado de este protocolo prospectivo.

La captura histórica esperada del 6-oct-2026 —10.412.932 bytes, SHA-256 `9b14c9ad842ad84f72d4b89b9e1a0611a63e319a770b721cf17a4b6cd3e282a7`— no está disponible. La equivalencia funcional del derivado no establece identidad histórica. **H3 histórico permanece HOLD**, cualquiera que sea el resultado de un estudio nuevo.

## 2. Contrato de fuente para una futura captura

Ninguna solicitud se realiza bajo esta versión. Antes de una futura captura deben aprobarse el presente documento, la identidad vigente del registro de catálogo, la licencia aplicable y el procedimiento técnico.

### Identidad del recurso

La referencia técnica observada es la capa `PLANEAMIENTO_URBANISTICO:Ámbitos_Ordenación`, CRS de origen EPSG:25830, servida por el WFS municipal catalogado. La identidad del recurso se comprobará en una respuesta GetCapabilities archivada y en la ficha de catálogo archivada; no se inferirá solo del nombre del archivo o de la semejanza geométrica.

K0 dejó anotada una discrepancia entre el `docuUId` y la referencia de reutilización de la metadata local y los campos que mostraba el catálogo consultado entonces. Antes de una futura adquisición se deben reconciliar y archivar la versión exacta del registro, su identificador, su titularidad y sus condiciones. Si la licencia, el registro o la ruta de descarga quedan ambiguos, la decisión es **HOLD**.

### Secuencia de solicitudes y paginación

1. **Preflight de metadatos:** una petición `GetCapabilities` de WFS 2.0.0 y captura de la ficha del catálogo para confirmar nombre de tipo, CRS por defecto, formato de salida, restricciones de acceso y reutilización. Conservar cada respuesta de metadatos como bytes y registrar su SHA-256.
2. **Conteo previo:** solicitar `GetFeature` con `resultType=hits` para el mismo `typeNames`; guardar el valor de `numberMatched` y la respuesta de conteo. Si el servidor no soporta esta operación o no devuelve un conteo interpretable, no iniciar la descarga: **HOLD** hasta una enmienda revisada del protocolo.
3. **Una respuesta de datos:** emitir una sola petición `GetFeature`, sin filtros espaciales ni de atributos y sin `count`, `startIndex`, paginación o concatenación de páginas. La cantidad de entidades parseadas debe coincidir con `numberMatched`. Una diferencia, truncamiento o límite del servidor detiene el estudio; no se cambia a paginación durante la ejecución.

La cantidad histórica 765/724 es una observación de referencia, no una cuota contractual que deba permanecer fija. Un cambio de universo, esquema, duplicados o clases activa revisión y HOLD antes de clasificar resultados; no se recortan entidades para recuperar el recuento anterior.

### Petición de datos propuesta

Método: `GET` sobre TLS con validación normal del certificado. La URL canónica se construirá con estos parámetros, codificados en UTF-8 mediante un codificador URL estándar:

```text
https://sigma.madrid.es/hosted/services/DESARROLLO_URBANO_ACTUALIZADO/PLANEAMIENTO_URBANISTICO/MapServer/WFSServer?service=WFS&version=2.0.0&request=GetFeature&typeNames=PLANEAMIENTO_URBANISTICO%3A%C3%81mbitos_Ordenaci%C3%B3n&outputFormat=GEOJSON&srsName=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A25830
```

Cabeceras de petición propuestas:

- `Accept: application/json`
- `Accept-Encoding: identity`
- `User-Agent: CASE-01-integrity-protocol/0.1.0`
- Sin `Authorization`, cookies ni credenciales personales.

Condiciones de captura: un intento; no seguir redirecciones ni reintentar silenciosamente; esperar HTTP 200. Cualquier redirección, respuesta no-200, codificación comprimida pese a `identity`, error de certificado o incompatibilidad de Content-Type se registra y detiene la captura para revisión. Una excepción requiere enmienda previa, no improvisación.

Registrar en UTC, sin completar valores ausentes: inicio y fin de cada solicitud, URL efectiva, método, parámetros, status, cadena de redirecciones, intentos, versión del cliente, `Date`, `Content-Type`, `Content-Length`, `Content-Encoding`, `ETag`, `Last-Modified`, `Cache-Control`, `Expires`, `Vary`, `Server` y cualquier cabecera de paginación o límite. Conservar los valores ausentes como `null`; no derivar una fecha de referencia de la hora de descarga o de una cabecera.

El cuerpo de respuesta se conserva exactamente como bytes de entidad antes de decodificar JSON. No se reserializa el original. Si el transporte impide conservar esa representación o hay compresión no prevista, se preservan por separado los bytes recibidos y cualquier forma decodificada, con sus hashes y la transformación documentada; la captura no se admite hasta revisar la diferencia.

## 3. Identidad de snapshots y procedencia

Se mantendrán separados estos identificadores:

1. **Hash de bytes de fuente:** SHA-256 del cuerpo WFS original, antes de parsear. Identifica esa secuencia exacta de bytes, no una geometría equivalente.
2. **Fingerprint estructural de fuente:** SHA-256 del JSON canónico parseado. Ordenar las claves de objetos y ordenar las entidades únicamente por el código oficial exacto `Etiqueta`; conservar todas las propiedades, CRS, coordenadas, orden de anillos, orden de vértices, números y nulos. Codificar como UTF-8, sin ASCII-escaping y con separadores compactos. No redondear, normalizar códigos, reorientar anillos ni canonicalizar topología. Este fingerprint ignora el orden externo de entidades, pero no es un hash topológico.
3. **Hash de bytes del derivado:** SHA-256 del GeoJSON de salida serializado. Identifica el archivo exacto, incluyendo estructura, orden y formato.
4. **Fingerprint estructural del derivado:** la misma regla canónica aplicada al derivado, pero ordenando entidades por el código exacto `ambito_code`; conserva el esquema aprobado y no sustituye al hash de bytes.

Ninguno sustituye a otro ni se presenta como identidad histórica. El manifiesto de procedencia enlazará los hashes de entrada, las respuestas de metadatos, revisión Git y SHA del código ejecutado, parámetros, entorno, conteos por etapa, excepciones y hashes de cada derivado. Si hay códigos ausentes, nulos o duplicados, el fingerprint puede conservarse para diagnóstico, pero la captura no pasa el gate de admisión.

## 4. Entorno reproducible

Perfil candidato, observado en la reproducción K0.1 y aún sujeto a congelación explícita:

| Componente | Versión candidata |
|---|---:|
| Python | 3.14.5 |
| Shapely | 2.1.2 |
| GEOS | 3.13.1 |
| PyProj | 3.7.2 |
| PROJ | 9.5.1 |

Estas versiones describen la reproducción K0.1; no se atribuyen al proceso que produjo el snapshot histórico. Antes de congelar el protocolo se registrarán también sistema operativo, arquitectura, build de Python, wheels o hashes de dependencias, configuración de PROJ y locale. La falta de esos datos bloquea la afirmación de reproducibilidad exacta. Cualquier actualización de una biblioteca requiere una ejecución pareada y revisión aprobada antes de adquirir la futura fuente.

## 5. Etapas y estrategias candidatas

Todas las etapas operan sobre copias en memoria y conservan el S0 inmutable.

- **S0 — entrada:** bytes preservados, JSON parseado, CRS declarado EPSG:25830, entidad por código exacto. Registrar geometría vacía, tipo, componentes, anillos y validez inicial.
- **S1 — reproyección:** EPSG:25830 → EPSG:4326 con PyProj `Transformer.from_crs(..., always_xy=True)` y precisión de punto flotante completa. Sin reparación, redondeo ni simplificación.
- **S2 — política de coordenadas:** aplicar por separado cada estrategia candidata, nunca encadenar una estrategia sobre la salida de otra. Para la estrategia B, redondear con la función incorporada `round(valor, 7)` cada ordenada X e Y de S1, de forma independiente, según la semántica de Python congelada para la ejecución. Antes de congelar se debe confirmar que las coordenadas son XY; una dimensión Z/M activa HOLD hasta que una regla se apruebe. No aplicar rejillas ni alterar la topología como operación de precisión.
- **S3 — serialización y lectura:** congelar el serializador concreto, opciones, codificación UTF-8, tratamiento de valores no finitos, orden de propiedades, representación numérica y salto final antes de la captura. No se permite una segunda reducción de precisión. Volver a parsear y comparar estructura, coordenadas, conteos y validez con S2; calcular hash de bytes. S3 debe poder atribuir toda diferencia a la serialización declarada.

### Estrategias que se compararán

| Estrategia | Definición | Límite de uso propuesto |
|---|---|---|
| A — precisión completa | Mantener la precisión que produce la reproyección en S1; sin redondeo decimal deliberado. | Candidata analítica, sujeta a cero nuevas invalideces, validación de decisiones y umbrales aprobados. |
| B — precisión reducida | Reproducir 7 decimales como caso diagnóstico. Las sensibilidades a 8, 9, 10 y 12 decimales son exploratorias, no candidatas aprobadas. | No se aprueba por “más decimales”; cualquier invalidez nueva la excluye. Medir desplazamiento y efectos con umbrales que aún deben justificarse. |
| C — separación analítica/visualización | Conservar una geometría analítica sin redondeo y producir una copia de visualización separada en CRS/formato de pantalla. | La copia visual nunca alimenta selección, intersección, área, asignación ni otros cálculos. Debe superar igualmente el gate de cero nuevas invalideces para distribuirse como geometría. |

Las precisiones decimales son decisiones de representación, no una escala de exactitud. No se presupone que 12 decimales sean más exactos que 8 ni que una salida visual sea apta para análisis.

## 6. Admisión, geometría y relaciones topológicas

La regla de admisión se congela aquí como criterio, y su implementación y hash de código deberán registrarse antes de una futura captura. El campo fuente es `Etiqueta`; el campo de denominación es `Denominación`. La clasificación de clases se aplica al texto de `Etiqueta` convertido a cadena y recortado solo para decidir la clase:

```text
NORMA_ZONAL_GRADE:        ^\d+(?:\.\d+)*(?:\.[A-Za-z]+)?$
NON_DEVELOPABLE_LAND:     ^(?:NUC|NUP)(?:\.\d+)?$
PLANNING_AMBITO:          ^(?:APE|API|APR|AOE|AOD|AE|UZP|UZPp|UZI|UNP|UNS|US)\.
```

Las expresiones de clases son insensibles a mayúsculas/minúsculas, como en la regla observada. La clase `PLANNING_AMBITO` se admite; las otras dos clases documentadas se excluyen con su código y razón. Todo código vacío o que no coincida con una clase documentada es `UNCLASSIFIED_SOURCE_RECORD` y detiene la admisión hasta revisión. El recorte sirve solo para clasificar: el código de unión emitido conserva `Etiqueta` sin normalizar, sin cambiar mayúsculas, formato ni sufijo `-RP`. No se usa `OBJECTID`, nombre, área de atributo ni orden de respuesta para admitir o unir entidades.

El baseline 765 registros/724 admitidos es una observación, no una cuota futura. La lista completa de entidades admitidas y excluidas, con código y razón, forma parte de cada resultado; cualquier cambio de clase/universo exige revisar el gate antes de comparar geometrías.

Para cada entidad y etapa se registrarán: tipo geométrico, vacío/finito, códigos y duplicados, componentes de `MultiPolygon`, número de anillos y vértices, cierres, área cuando sea válida, envolvente, razón y ubicación de invalidez GEOS, y estado válido/inválido. Las diferencias se enlazan por el mismo ID exacto y se clasifican como heredadas en S0 o nuevas en S1, S2 o S3.

Se inspeccionarán adyacencias, contactos, solapamientos y huecos entre entidades. Un contacto o solapamiento observado no se declarará error municipal por sí mismo. La detección de huecos necesita una extensión de cobertura o una regla de cobertura aprobada; mientras no exista esa referencia no se afirmará completitud ni defecto de cobertura. Las operaciones por pares usarán un índice espacial reproducible y conservarán IDs de ambos miembros, CRS y predicado usados.

## 7. Métricas comparativas

Las áreas, distancias y operaciones métricas se calcularán en un único CRS proyectado común, justificado y aprobado antes de la captura. Para comparar etapas se transformarán copias de ambos extremos a ese CRS con una operación de coordenadas identificada; se registrarán su definición y exactitud disponible. EPSG:25830 es candidato por el ámbito geográfico, pero no queda aprobado sin revisión de adecuación. Está prohibido expresar áreas en m² a partir de coordenadas en grados.

Para cada comparación S0–S1, S1–S2 y S2–S3 se publicarán por separado:

- conjunto exacto de IDs comparables;
- cantidad válida en ambos extremos y cantidad excluida por invalidez en cada extremo;
- suma y distribución de cambios de área, en m², solo para geometrías válidas en ambos extremos;
- área de diferencia simétrica `A(G Δ H)` y denominador normalizado `A(G ∪ H)`; reportar `ΣA(Gᵢ Δ Hᵢ) / ΣA(Gᵢ ∪ Hᵢ) × 100` para el mismo conjunto de IDs;
- desplazamiento de vértices, distancia de Hausdorff y cambios de límite, siempre con CRS, unidad y estadístico definidos;
- errores de operación y entidades no comparables, sin eliminarlos silenciosamente.

No se calculan porcentajes de área ni diferencias topológicas sobre geometrías inválidas. Las reparaciones `make_valid`, `buffer(0)`, `snap`, `set_precision` y simplificación quedan prohibidas en esta fase. Cualquier diagnóstico alternativo debe usar copias y denominarse expresamente diagnóstico; no puede sustituir el resultado principal.

El universo de denominadores se fija por comparación: 688 no puede usarse como denominador de una métrica S1–S2 si solo 684 IDs son válidos en ambos extremos. Las cifras se muestran con el `n` exacto de cada par; no se mezclan conjuntos ni se imputan casos excluidos como cero.

## 8. Asignación punto-en-polígono independiente

Antes de la futura captura se debe seleccionar una fuente independiente de puntos, con identificadores estables, procedencia, fecha, CRS y licencia documentados. No puede derivarse de la misma geometría ni usarse para construirla. Se congelarán bytes y hash de esa fuente y el diseño de muestra antes de calcular asignaciones. Si no se encuentra una fuente independiente adecuada, la hipótesis H-E queda bloqueada; no se reemplaza por puntos inventados o escogidos tras ver resultados.

Se ejecutarán y reportarán por separado los predicados `contains`, `within` y `covers`, indicando dirección y software. `contains`/`within` excluyen puntos exactamente sobre el límite; `covers` los incluye. Los casos de frontera exacta se informan como categoría propia y no se mezclan con interiores. Para cada punto se calculará distancia al límite en CRS métrico y se conservará como medida continua. No se etiquetará un punto como “próximo al límite” hasta justificar y aprobar un umbral con base científica; cualquier conclusión que requiera ese umbral permanece HOLD.

Los cambios de asignación son sensibilidad del predicado bajo geometrías distintas; no demuestran por sí solos que la fuente de puntos o los límites sean territorialmente verdaderos.

## 9. Política de invalidez y datos

**Cero nuevas invalideces** es criterio duro para cualquier geometría derivada candidata. Las invalideces que ya existan en S0 se mantienen identificadas y en cuarentena para toda operación que dependa de topología válida. No se reparan, descartan ni convierten en válidas silenciosamente.

La fuente, sus condiciones y la atribución se verifican en la versión vigente del catálogo antes de una captura. No se incorporan respuestas WFS, datos privados, credenciales ni puntos de referencia al repositorio. La publicación de bytes, geometrías o resultados por entidad requiere confirmación documentada de derechos de redistribución y privacidad; atribución por sí sola no se considera licencia. El informe debe incluir límites, software, hashes y procedimientos, sin afirmar independencia científica si no existe una revisión independiente registrada.

## 10. Matriz de decisión predefinida

| Gate | GO para continuar al siguiente gate | HOLD | NO-GO para la estrategia evaluada |
|---|---|---|---|
| Identidad/licencia/completitud de fuente | Registro, tipo, CRS, licencia y conteo verificables; respuesta íntegra y hash archivado. | `docuUId`, licencia, tipo, paginación, integridad o completitud ambiguos. | Captura alterada, no autorizada, incompleta o que no corresponde al recurso aprobado. |
| Admisión y códigos | Regla preaprobada; IDs exactos, sin duplicados, pérdidas ni registros sin clasificar. | Regla o clase no documentada; diferencia de universo sin explicación revisada. | Normalización, descarte o admisión silenciosa de entidades. |
| Validez S0–S3 | Cero nuevas invalideces; las heredadas están listadas y en cuarentena para operaciones topológicas. | Razón/etapa no localizable o geometría fuente ambigua. | Una invalidez nueva en la geometría candidata que se pretende usar. |
| Métricas/precisión | Mismos IDs válidos en ambos extremos; CRS y denominadores declarados; umbrales de error justificados y aprobados antes de la captura. | Falta base científica para un umbral espacial, área, distancia o cambio admisible. | Se mezclan denominadores, se mide área en grados o se presenta área de inválidos como métrica territorial. |
| Puntos independientes | Fuente independiente congelada; predicados, frontera y muestreo aprobados; cambios reportados por ID. | Fuente, significado de frontera o umbral de proximidad pendiente. | Puntos derivados de los polígonos o selección post hoc para favorecer un resultado. |
| Integridad/reproducibilidad | Entorno, scripts, bytes y manifiesto reproducibles; revisión científica registrada. | Falta versión, hash, dependencia, evidencia independiente o autorización requerida. | Se altera S0, se ocultan fallos o una salida depende de reparación prohibida. |

Un **GO** autoriza únicamente el siguiente gate científico. No autoriza automáticamente adquisición, integración de producto, redistribución, publicación, despliegue ni una afirmación sobre el H3 histórico. CI verde es una comprobación de ingeniería y nunca sustituye estos gates.

## 11. Decisiones que permanecen bloqueadas

1. H3 histórico y su snapshot original: **HOLD**, sin sustitución por la respuesta actual.
2. Resolución de la discrepancia de identidad/licencia del registro observada en K0: pendiente de captura y revisión de la versión oficial aplicable.
3. Fuente de puntos independiente, su licencia, cobertura y diseño de muestreo: no seleccionados.
4. Umbrales admisibles de desplazamiento, área, Hausdorff y cambio de asignación: pendientes de justificación científica; no se inventan aquí.
5. CRS métrico definitivo para cada métrica y tratamiento de distorsión: se confirmará y justificará antes de la captura.
6. Precisión aceptable para análisis o visualización: ninguna estrategia ha sido aprobada; la exploración 8/9/10/12 decimales no constituye aprobación.
7. Expectativa autorizada de adyacencia/cobertura para interpretar huecos y solapamientos: pendiente de fuente y definición.
8. Build exacto del entorno, hashes de dependencias, aprobación de la versión documental y revisión independiente: pendientes.

Hasta resolver las decisiones que afectan al diseño y obtener aprobación explícita de esta versión exacta, este documento **no está congelado y no autoriza adquisición**.
