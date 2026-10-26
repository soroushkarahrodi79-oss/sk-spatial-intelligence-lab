# CASE-01 — Prerregistro prospectivo de integridad geométrica

**Versión documental:** 0.2.0 — revisión K1-R1
**Estado:** DRAFT — NO CONGELADO
**Preparado:** 2026-10-26 (Europe/Madrid)
**Repositorio de destino:** `soroushkarahrodi79-oss/sk-spatial-intelligence-lab`
**Aprobación científica:** pendiente; no se registra firma ni aprobación
**Alcance de esta versión:** diseño y revisión documental. No autoriza adquirir datos, ejecutar el análisis, cambiar builders, publicar resultados, desplegar ni modificar otros repositorios.

> El prerregistro solo quedará congelado cuando una persona revisora apruebe explícitamente esta versión exacta y su SHA-256. Hasta entonces, los métodos y criterios siguientes son una propuesta de protocolo y la decisión para cualquier adquisición es **HOLD**.

## 1. Pregunta, alcance y separación temporal

### Pregunta de investigación

La investigación separa dos preguntas y dos poblaciones de inferencia:

1. **Q-GEO, endpoint primario:** para una respuesta WFS concreta, identificada por sus bytes, ¿qué cambios por entidad de validez, estructura y métricas geométricas se producen entre entrada, reproyección, operación explícita de precisión y serialización? Esta pregunta se limita a las entidades admitidas y a los subconjuntos válidos comparables; no afirma representatividad territorial.
2. **Q-PIP, endpoint secundario e independiente:** con una fuente externa de puntos congelada por separado, ¿cómo varían los conjuntos de ámbitos que contienen, cubren o limitan cada punto entre las estrategias, incluyendo cero, una o varias coincidencias?

Q-PIP no es requisito para responder Q-GEO. Sin puntos no se responde Q-PIP ni se afirma pertenencia, cobertura, asignación o impacto territorial.

La unidad primaria de análisis es cada entidad identificada por su código oficial exacto. La pregunta no pretende determinar si los límites municipales representan la realidad territorial, explicar por qué fueron publicados, ni inferir impactos de negocio.

### Hipótesis falsables

| Hipótesis | Evidencia que la apoya | Evidencia que la refuta | Resultado que obliga a HOLD |
|---|---|---|---|
| H-A — invalidez heredada | La entidad ya es inválida en S0; esa condición se registra como heredada y la causa GEOS se informa por separado en cada etapa. | S0 es válida para esa entidad. | CRS, código o geometría S0 no pueden identificarse sin ambigüedad. |
| H-B — invalidez por reproyección | S0 es válida y S1 pasa a inválida antes de aplicar precisión reducida. | S0 y S1 tienen el mismo estado de validez y no aparece una invalidez nueva. | No se puede reconstruir la operación de CRS o el entorno de proyección. |
| H-C — invalidez por precisión | S1 es válida y una operación de precisión declarada en S2 la vuelve inválida; la transición se reproduce sobre la misma entidad. | La invalidez aparece antes de S2 o no aparece tras repetir la operación declarada. | El orden de operaciones, la precisión efectiva o la serialización no están fijados. |
| H-D — invalidez por serialización u otra operación | S2 es válida y S3 es inválida, o una operación intermedia identificada reproduce el cambio. | S2 y S3 conservan estado, coordenadas y estructura. | Hay divergencias sin localizar entre etapas. |
| H-E — cambio de asignación espacial (Q-PIP) | En puntos independientes, una estrategia cambia el conjunto de IDs frente a S1 entre los mismos IDs válidos y bajo predicados predeclarados. | No hay diferencias de conjuntos en ese universo y bajo esos predicados. | La falta de puntos o umbral detiene Q-PIP; no detiene Q-GEO. CRS, predicado o identidad de puntos ambiguos bloquean esa prueba. |

Las hipótesis se evalúan por entidad y por transición; un recuento agregado no sustituye la lista de códigos ni demuestra causalidad.

### Evidencia retrospectiva, no resultado prospectivo

El historial recibido para K0.1 describe una observación local de 10.412.891 bytes, SHA-256 `272ae4fe5dadebd2e96422210bf942744c9fb3401df77024eacab991ec911adc`, 765 entidades, 724 admitidas y los conteos S0–S3 incluidos en el contexto de CASE-01. El derivado disponible se reprodujo byte por byte desde esa respuesta. Esos datos son **observaciones retrospectivas de esa captura**, no el resultado de este protocolo prospectivo.

La captura histórica esperada del 6-oct-2026 —10.412.932 bytes, SHA-256 `9b14c9ad842ad84f72d4b89b9e1a0611a63e319a770b721cf17a4b6cd3e282a7`— no está disponible. La equivalencia funcional del derivado no establece identidad histórica. **H3 histórico permanece HOLD**, cualquiera que sea el resultado de un estudio nuevo.

## 2. Contrato de fuente para una futura captura

Ninguna solicitud se realiza bajo esta versión. Antes de una futura captura deben aprobarse el presente documento, la identidad vigente del registro de catálogo, la licencia aplicable y el procedimiento técnico.

### Identidad del recurso

La referencia técnica observada es la capa `PLANEAMIENTO_URBANISTICO:Ámbitos_Ordenación`, CRS de origen EPSG:25830, servida por el WFS municipal catalogado. La identidad del recurso se comprobará en una respuesta GetCapabilities archivada y en la ficha de catálogo archivada; no se inferirá solo del nombre del archivo o de la semejanza geométrica.

K0 dejó anotada una discrepancia entre el `docuUId` y la referencia de reutilización de la metadata local y los campos que mostraba el catálogo consultado entonces. Antes de una futura adquisición se deben reconciliar y archivar la versión exacta del registro, su identificador, su titularidad y sus condiciones. Si la licencia, el registro o la ruta de descarga quedan ambiguos, la decisión es **HOLD**.

### CRS, GeoJSON y orden de ejes

RFC 7946 define GeoJSON interoperable en WGS 84, coordenadas geográficas en grados y orden longitud/latitud (equivalente a `OGC:CRS84`); no se asumirá que una respuesta WFS `outputFormat=GEOJSON` cumple RFC 7946 cuando se pide EPSG:25830. Mientras el servicio declare EPSG:25830, la entrada se tratará como JSON con geometrías de forma GeoJSON bajo la convención WFS verificada, no como GeoJSON RFC 7946. La presencia o ausencia de un miembro `crs` en el payload se archivará, pero no resuelve por sí sola la semántica.

Antes de admitir S0 se contrastarán: `srsName` solicitado; `DefaultCRS` y `OtherCRS` del tipo de entidad en GetCapabilities; tipo y propiedad geométrica de DescribeFeatureType; metadatos del catálogo; Content-Type y cualquier declaración de CRS de la respuesta; dimensiones; `bbox` disponible; y rangos plausibles de easting/northing EPSG:25830 para la extensión documentada. El orden fuente esperado es X=easting, Y=northing. Los rangos y el `bbox` son controles de plausibilidad, no prueba del CRS ni de que el servidor honró `srsName`. Si la declaración efectiva o el orden no se pueden establecer sin ambigüedad, **HOLD**.

Las salidas GeoJSON RFC 7946 usarán posiciones X=longitud, Y=latitud en `OGC:CRS84`. No se etiquetarán coordenadas EPSG:25830 como RFC 7946 ni se interpretará EPSG:4326 formalmente como orden lon/lat sin declarar el convenio de interfaz `always_xy=True`.

### Secuencia de solicitudes y paginación

1. **Preflight documental:** archivar como bytes GetCapabilities, DescribeFeatureType, ficha de catálogo y licencia/condiciones vigentes. Registrar sus SHA-256, endpoint, versión WFS, `updateSequence` si existe, nombre y namespace del tipo, CRS por defecto/alternativos, esquema y propiedad geométrica, formatos, operaciones, restricciones, `CountDefault`, `DefaultMaxFeatures`, límites específicos del proveedor y paginación. La ausencia de límite declarado no prueba que no exista uno.
2. **Conteo orientativo:** si está soportado, solicitar `GetFeature resultType=hits` para el mismo `typeNames`; registrar request, respuesta y `numberMatched`. Es una observación de una petición distinta, no un lock, token de versión ni prueba de snapshot atómico. Si el conteo no es interpretable o contradice capabilities/schema sin explicación, **HOLD**.
3. **Una entidad de respuesta:** emitir una sola petición `GetFeature`, sin filtros, `count`, `startIndex`, paginación ni concatenación. Registrar `numberMatched`, `numberReturned`, cantidad parseada, cabeceras y flags del proveedor como `exceededTransferLimit`. Exigir consistencia entre campos que la respuesta realmente ofrezca y no detectar truncamiento. Si se alcanza un límite, hay flags de truncamiento, el conteo no concuerda o la completitud es ambigua, **HOLD**; no se improvisa paginación.

Una respuesta HTTP única identifica el cuerpo exacto recibido, no demuestra que el servidor leyera una versión transaccionalmente atómica ni que todas sus entidades pertenezcan a una misma revisión del origen. `ETag`, `Last-Modified`, `Date`, `updateSequence` o igualdad con `resultType=hits` solo se interpretarán como identidad/versión si el proveedor documenta ese significado y el control se conserva. Registrar inicio y fin UTC, versión de servicio/capa, revisión o token de snapshot si existe, y cualquier señal de cambio concurrente. Si la pregunta exige una revisión oficial coherente y no hay mecanismo para identificarla, **HOLD**. Si se autoriza analizar exclusivamente el cuerpo capturado como artefacto de bytes, la conclusión se limitará a ese cuerpo y declarará que su consistencia temporal interna no está demostrada.

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
2. **Fingerprint estructural de fuente:** SHA-256 de la representación canónica descrita en §3.1. No sustituye al hash de bytes fuente.
3. **Hash de bytes del derivado:** SHA-256 del GeoJSON de salida serializado. Identifica el archivo exacto, incluyendo estructura, orden y formato.
4. **Fingerprint estructural del derivado:** la misma regla canónica aplicada al derivado, ordenando entidades por el código exacto `ambito_code`; conserva el esquema aprobado y no sustituye al hash de bytes.

Ninguno sustituye a otro ni se presenta como identidad histórica. El manifiesto de procedencia enlazará los hashes de entrada, las respuestas de metadatos, revisión Git y SHA del código ejecutado, parámetros, entorno, conteos por etapa, excepciones y hashes de cada derivado. Si hay códigos ausentes, nulos o duplicados, se conserva el hash de bytes pero no se admite el fingerprint estructural ni pasa el gate de admisión.

### 3.1 Algoritmo de fingerprint estructural

Se usará RFC 8785 (JCS) como serializador canónico de objetos JSON, sujeto a las reglas adicionales siguientes. Decodificar UTF-8 de forma estricta y rechazar BOM. El parser deberá detectar claves duplicadas después de desescapar sus nombres y antes de construir mapas; cualquier clave duplicada causa rechazo y **HOLD**, nunca “último valor gana”. Rechazar tokens no JSON (`NaN`, `Infinity`), overflow/no finito, underflow de token no-cero a cero, y cualquier token numérico cuyo signo sea negativo y cuyo valor parseado sea cero (`-0`, `-0.0`, `-0eN`, etc.); la detección usa el token numérico original, antes de perder su léxico. Rechazar cadenas Unicode inválidas y enteros fuera del rango seguro ±(2⁵³−1). Otros números finitos se interpretan y serializan como IEEE-754 binary64 conforme a ECMAScript/JCS. No se normaliza Unicode (NFC/NFD), no se cambia mayúsculas, no se recortan ni convierten IDs, y no se aceptan coerciones entre número y cadena.

Para el fingerprint de colección: exigir `FeatureCollection` y que cada entidad tenga un identificador JSON de tipo string, no nulo, único y exacto (`properties.Etiqueta` en fuente; `properties.ambito_code` en derivado). Ordenar únicamente el array `features` por el valor de ID usando orden lexicográfico de unidades de código UTF-16 sin dependencia de locale, conforme al comparador de strings de JCS. Mantener el orden original de todo otro array: coordenadas, anillos, vértices, componentes y valores. Después aplicar JCS recursivamente al objeto FeatureCollection completo, preservar los restantes miembros y emitir UTF-8 sin BOM ni whitespace entre tokens. El fingerprint se define como SHA-256 de esos bytes canónicos.

IDs ausentes, duplicados o de tipo distinto a string y cualquiera de los casos inválidos anteriores hacen inadmisible el fingerprint estructural de colección; el hash de bytes original aún se conserva. El orden de entidades en la respuesta se ignora solo para este fingerprint; ningún orden de coordenadas se altera. JCS normaliza la representación JSON, no la forma geométrica: no prueba equivalencia topológica, igualdad de geometrías, identidad de snapshot ni identidad del archivo fuente. Una implementación y versión conformes, la política de errores y su SHA se fijarán antes de congelar.

## 4. Entorno reproducible

Perfil candidato, observado en la reproducción K0.1 y aún sujeto a congelación explícita:

| Componente | Versión candidata |
|---|---:|
| Python | 3.14.5 |
| Shapely | 2.1.2 |
| GEOS | 3.13.1 |
| PyProj | 3.7.2 |
| PROJ | 9.5.1 |

Estas versiones describen la reproducción K0.1; no se atribuyen al proceso que produjo el snapshot histórico ni certifican que la configuración esté instalada actualmente. Antes de congelar se registrarán sistema operativo, arquitectura, build, wheels/hashes, `proj.db` y su SHA-256, configuración/data directory PROJ, locale, `PROJ_NETWORK=OFF` y lista/hash de grids disponibles. Las operaciones no descargarán grids automáticamente. Una grid requerida que falte, `best_available=false`, una selección distinta o un fallback ballpark causan HOLD. Un cambio de biblioteca, base EPSG/PROJ o grid requiere enmienda y nueva aprobación antes de la captura.

## 5. Etapas y estrategias candidatas

Todas las etapas operan sobre copias en memoria y conservan el S0 inmutable.

- **S0 — entrada:** bytes preservados, respuesta WFS cuyo CRS/orden de ejes pasó los controles de §2, entidad por código exacto. Fuente en EPSG:25830 significa X=easting, Y=northing según declaración WFS verificada; no es RFC 7946 solo por ser JSON con `coordinates`.
- **S1 — reproyección:** EPSG:25830 → `OGC:CRS84` (WGS 84 lon/lat) con precisión binary64, interfaz X/Y (`always_xy=True` al enumerar la operación), usando exclusivamente el pipeline congelado en §5.1 y ejecución con `errcheck=True`. Sin reparación, redondeo ni simplificación; errores, no finitos o coordenadas fuera del rango del CRS causan HOLD.
- **S2 — política de coordenadas:** aplicar por separado cada estrategia candidata, nunca encadenar una estrategia sobre la salida de otra. Para la estrategia B, redondear con la función incorporada `round(valor, 7)` cada ordenada X e Y de S1, de forma independiente, según la semántica de Python congelada para la ejecución. Antes de congelar se debe confirmar que las coordenadas son XY; una dimensión Z/M activa HOLD hasta que una regla se apruebe. No aplicar rejillas ni alterar la topología como operación de precisión.
- **S3 — serialización y lectura:** congelar el serializador concreto, opciones, codificación UTF-8, tratamiento de valores no finitos, orden de propiedades, representación numérica y salto final antes de la captura. No se permite una segunda reducción de precisión. Volver a parsear y comparar estructura, coordenadas, conteos y validez con S2; calcular hash de bytes. S3 debe poder atribuir toda diferencia a la serialización declarada.

### 5.1 Operación de coordenadas y control de selección PROJ

La operación seleccionada por este diseño para la conversión es la composición ordenada: inversa de la conversión Transverse Mercator de EPSG:25830 (UTM 30N), seguida de EPSG **1149**, `ETRS89 to WGS 84 (1)`, con tres traslaciones geocéntricas nulas y salida X/Y compatible con `OGC:CRS84` mediante `always_xy=True`. EPSG:1149 declara exactitud de 1 m y no requiere grid de datum. Esa cifra publicada no es tolerancia del estudio ni evidencia de precisión centimétrica. La selección es metodológica y no afirma que K0.1 o el builder usaran esta operación.

Antes de congelar se inspeccionará, sin adquirir la fuente, el inventario de operaciones para EPSG:25830→`OGC:CRS84` en la versión y `proj.db` candidatos, con AOI oficial documentada para la capa, `allow_ballpark=False`, `allow_superseded=False` y red PROJ desactivada. Se archivarán para cada candidata su autoridad/código, nombre, definición completa (PROJJSON/WKT y pipeline si está disponible), `description`, `accuracy`, `area_of_use`, `best_available`, operaciones no disponibles y grids requeridas, disponibles y sus hashes. La composición seleccionada solo se congela si PROJ demuestra que cubre el AOI y puede instanciarse sin sustitución silenciosa; cualquier incompatibilidad produce HOLD, no selección automática de alternativa. Se conserva explícitamente que EPSG:1149 no requiere grid de datum; cualquier grid listada para otras etapas compuestas se registra por nombre, versión y hash. La inversa usada para devolver S1–S3 al CRS de métricas será la inversa de la misma operación fijada; si no está definida, se seleccionará y congelará una operación inversa explícita por separado.

La operación ejecutada se construirá desde su definición congelada, no mediante selección automática de `Transformer.from_crs` en cada ejecución. El manifiesto comparará la operación efectiva con el identificador y definición aprobados; cualquier diferencia, grid inesperada, operación alternativa, fallback, área fuera de uso o falta de exactitud declarada produce HOLD. EPSG:1149 tiene exactitud declarada de 1 m y alcance de aproximación; por ello los resultados son sobre cambios computacionales/topológicos del flujo, no una validación de posición absoluta submétrica. Si Q-GEO requiriera esa última afirmación, se necesitaría una operación con base de exactitud adecuada antes de congelar.

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

Las áreas, distancias y operaciones métricas se calcularán en un único CRS proyectado común. **EPSG:25830 es el CRS métrico candidato para geometría local de Madrid**: ETRS89 / UTM zona 30N, ejes easting/northing en metros, proyección Transverse Mercator con meridiano central −3° y factor de escala central 0,9996; el registro EPSG incluye España peninsular en su área de uso. Esto lo hace una elección razonable para métricas locales de escala municipal, no un plano sin distorsión ni una garantía de que la extensión real del snapshot esté completamente dentro del área de uso.

Antes de congelar se contrastará la extensión de la capa con el área de uso EPSG y se cuantificará la distorsión de escala/área sobre esa extensión, describiendo también cómo las áreas proyectadas difieren de medidas elipsoidales. No se fija tolerancia numérica sin fundamento previo. Si la extensión cruza límites de zona/área de uso o el error de proyección es material para una decisión científica aún no definida, EPSG:25830 queda en HOLD y se justifica otro método/CRS antes de adquirir. Para comparar S0–S1, S1–S2 y S2–S3 se transformarán copias de ambos extremos al CRS común mediante las operaciones congeladas; S0 permanece en EPSG:25830 y S1–S3 se llevarán de vuelta con la inversa fijada. Se conservarán definición, exactitud, AOI y errores. Está prohibido expresar áreas en m² a partir de coordenadas en grados.

Para cada comparación S0–S1, S1–S2 y S2–S3 se publicarán por separado:

- conjunto exacto de IDs comparables;
- cantidad válida en ambos extremos y cantidad excluida por invalidez en cada extremo;
- suma y distribución de cambios de área, en m², solo para geometrías válidas en ambos extremos;
- área de diferencia simétrica `A(G Δ H)` y denominador normalizado `A(G ∪ H)`; reportar `ΣA(Gᵢ Δ Hᵢ) / ΣA(Gᵢ ∪ Hᵢ) × 100` para el mismo conjunto de IDs;
- desplazamiento de vértices, distancia de Hausdorff y cambios de límite, siempre con CRS, unidad y estadístico definidos;
- errores de operación y entidades no comparables, sin eliminarlos silenciosamente.

No se calculan porcentajes de área ni diferencias topológicas sobre geometrías inválidas. Las reparaciones `make_valid`, `buffer(0)`, `snap`, `set_precision` y simplificación quedan prohibidas en esta fase. Cualquier diagnóstico alternativo debe usar copias y denominarse expresamente diagnóstico; no puede sustituir el resultado principal.

El universo de denominadores se fija por comparación: 688 no puede usarse como denominador de una métrica S1–S2 si solo 684 IDs son válidos en ambos extremos. Las cifras se muestran con el `n` exacto de cada par; no se mezclan conjuntos ni se imputan casos excluidos como cero.

## 8. Asignación punto-en-polígono: gate independiente Q-PIP

Esta prueba no presume que los ámbitos formen una partición, que sean exhaustivos ni que sean mutuamente exclusivos. Antes de abrir Gate P se debe identificar una fuente independiente de puntos con IDs, procedencia, fecha, CRS, licencia y diseño muestral aprobados; congelar sus bytes/hash; y justificar su independencia. La falta de puntos bloquea Q-PIP, pero no bloquea Q-GEO ni autoriza inventar, simular o seleccionar puntos tras conocer los resultados.

Para cada punto y etapa, sobre el mismo código exacto de ámbito, registrar tres conjuntos:

- `interior_ids`: polígonos válidos que contienen estrictamente el punto (`polygon.contains(point)`).
- `boundary_ids`: polígonos válidos que cubren el punto pero no lo contienen estrictamente (`polygon.covers(point) AND NOT polygon.contains(point)`).
- `match_ids = interior_ids ∪ boundary_ids`, con cardinalidad explícita `0`, `1` o `>1`.

Reportar además `inherited_invalid_ids`, `newly_invalid_ids` por etapa y su unión `quarantined_ids`; no ejecutarles predicados topológicos ni contarlos como “no coincide”. Señalar resultado incompleto si hay entidades admitidas en cuarentena que no pudieron evaluarse. Definir `interior_overlap` cuando dos o más IDs de interior coexisten; `multiple_boundary` cuando la frontera corresponde a dos o más IDs; `assignment_conflict` cuando `cardinality(match_ids)>1` y no existe una regla externa aprobada que resuelva la multiplicidad; y `strategy_discordance` cuando cambia `match_ids` entre estrategias tras restringir ambos conjuntos a `comparable_valid_ids = valid_ids(stage_a) ∩ valid_ids(stage_b)`. Un cambio de validez se informa por separado y nunca como una pérdida de asignación. Estos rótulos no declaran conflicto administrativo ni error territorial.

`contains`/`within` excluyen puntos exactamente sobre el límite; `covers` los incluye. La frontera exacta es una categoría propia según el predicado DE-9IM del software congelado. Informar distancia al límite en CRS métrico como variable continua; no clasificar “cercanía” sin umbral con fundamento y aprobación previos. No presentar el conjunto sobre geometrías válidas como asignación completa del territorio si hay entidades en cuarentena. Las diferencias de conjunto describen sensibilidad computacional y no validan la verdad territorial de límites o puntos.

## 9. Política de invalidez y datos

**Cero nuevas invalideces** es requisito duro para admitir cualquier geometría derivada candidata para uso analítico o distribución geométrica. El análisis descriptivo puede contar y localizar fallos de una estrategia como resultado, pero esa estrategia queda NO-GO para su uso. Las invalideces que ya existan en S0 se mantienen identificadas y en cuarentena para toda operación que dependa de topología válida. No se reparan, descartan ni convierten en válidas silenciosamente. Las estadísticas de Q-GEO se limitan a IDs explícitos y no permiten atribuir representatividad territorial a entidades admitidas, inválidas o en cuarentena.

La fuente, sus condiciones y la atribución se verifican en la versión vigente del catálogo antes de una captura. No se incorporan respuestas WFS, datos privados, credenciales ni puntos de referencia al repositorio. La publicación de bytes, geometrías o resultados por entidad requiere confirmación documentada de derechos de redistribución y privacidad; atribución por sí sola no se considera licencia. El informe debe incluir límites, software, hashes y procedimientos, sin afirmar independencia científica si no existe una revisión independiente registrada.

## 10. Métricas primarias, exploratorias y reglas de decisión

### Endpoints y criterios de admisión

Los endpoints primarios de Q-GEO son (a) el estado de validez GEOS y la lista de IDs por transición S0→S1→S2→S3 y (b) preservación íntegra del universo/IDs, sin pérdida, duplicado, coerción o descarte silencioso. Cero nuevas invalideces es un requisito duro para que una geometría derivada candidata sea GO de uso analítico. Una estrategia que genere una invalidez nueva puede describirse como hallazgo, pero es NO-GO para uso.

Área, cambio de área, diferencia simétrica, Hausdorff, distancia de frontera, adyacencia, overlap y huecos son métricas **exploratorias** mientras no haya tolerancias con justificación científica externa y aprobación previa. Se informan con CRS/unidad, IDs exactos y denominadores idénticos; no se convierten retrospectivamente en endpoints primarios. La ausencia de tolerancias no impide describirlas ni responder si una transición de validez ocurrió, pero bloquea elegir una estrategia por aceptabilidad espacial, proclamar equivalencia o aprobar uso de producto. No se inventan buffers ni márgenes.

Cada comparación geométrica usa el conjunto exacto de IDs válidos en ambos extremos para las métricas que requieren topología válida; reporta por separado los excluidos y la razón. Las entidades inválidas heredadas siguen en el inventario, pero no contribuyen a denominadores de área/diferencia ni a conclusiones de representatividad. Una comparación descriptiva limitada al subconjunto válido no se presenta como resultado de todo el universo.

### Gates metodológicos separados

| Gate | GO | HOLD | NO-GO |
|---|---|---|---|
| **Diseño (G0)** | Revisión/aprobación explícita de la versión exacta; quedan resueltas las decisiones necesarias para el gate pretendido o se excluyen expresamente los endpoints/afirmaciones bloqueados. | Operación/CRS requerida para Q-GEO sin fijar, o criterio pendiente que se necesitaría para una decisión pretendida. Q-PIP ausente no bloquea aprobar un alcance Q-GEO limitado; métricas sin umbral solo son descriptivas. | Diseño internamente contradictorio, reparación implícita o inferencia no identificable. |
| **Autorización de adquisición (G1)** | Autorización explícita posterior a verificar fuente, versión, licencia, límite, CRS y contrato. | Falta autorización, licencia, identidad o consistencia/completitud suficiente. | Fuente no autorizada, incorrecta o de integridad comprometida. |
| **Ejecución geométrica (G2-GEO)** | Snapshot exacto e íntegro identificado; esquema/CRS/operación PROJ y entorno fijados; reproducibilidad documentada. Reporte descriptivo permitido en subconjuntos y métricas definidos. | Consistencia temporal del servicio relevante pero no demostrada; cambio silencioso de CRS/operación; esquema, bytes o denominadores ambiguos. | S0 alterado, pérdida/normalización silenciosa de IDs o resultados fabricados. |
| **Admisión de estrategia** | Cero nuevas invalideces, mismo universo admitido y criterios de decisión previamente aprobados. | Falta tolerancia espacial si se pretende decidir aceptabilidad/uso. | Nueva invalidez en la geometría que se propone usar. |
| **Asignación independiente (G2-PIP)** | Fuente de puntos independiente, IDs, licencia, muestra, CRS, predicados y tratamiento de cuarentena aprobados. | No hay puntos independientes; existe cuarentena o ambigüedad que limita cobertura de asignación. No bloquea G2-GEO. | Puntos derivados/post hoc, o asignaciones presentadas como completas cuando hubo IDs no evaluables. |
| **Revisión externa (G3)** | Revisión independiente registrada de datos, método, resultados y limitaciones. | Revisión externa pendiente. | Revisor, firma o aprobación inventados; objeciones materiales sin resolver. |

GO solo avanza al gate nombrado. La aprobación de diseño no equivale a autorización de adquisición; la autorización no ejecuta datos; la ejecución no implica aprobación de resultados. Ningún GO autoriza producto, redistribución, publicación o despliegue. CI verde no es validación científica. El H3 histórico sigue HOLD en todos los gates.

## 11. Matriz de decisiones K1-R1

| Estado | Decisión | Consecuencia metodológica |
|---|---|---|
| Resuelta en el diseño documental | Q-GEO y Q-PIP son preguntas/gates distintos; la prueba de puntos no es precondición de geometría. | Sin puntos, solo puede emitirse conclusión geométrica limitada; no pertenencia ni representatividad territorial. |
| Resuelta en el diseño documental | `hits` y conteo igual no prueban atomicidad ni versión; el hash identifica bytes recibidos. | No se atribuye identidad temporal al servicio sin token y semántica documentados. |
| Resuelta en el diseño documental | GeoJSON RFC 7946 se separa de la respuesta WFS con CRS EPSG:25830 y de los ejes de cada CRS. | CRS/orden efectivos deben superar controles; un payload llamado GeoJSON no basta. |
| Resuelta en el diseño documental | SHA de bytes, fingerprint JCS estructural, fingerprint de derivado y equivalencia topológica tienen significados separados. | Ninguna equivalencia estructural o funcional reemplaza identidad de snapshot. |
| Resuelta en el diseño documental | Cero nuevas invalideces es requisito duro para admitir una geometría candidata; inválidas S0 se ponen en cuarentena. | Métricas topológicas y asignaciones incompletas se marcan; no hay reparación implícita. |
| Condicional a evidencia previa | EPSG:25830 es CRS métrico candidato para Madrid local; falta validar extensión efectiva y documentar distorsión sobre ella. | CRS definitivo y decisiones sensibles a tolerancias quedan HOLD si la extensión no es apropiada. |
| Condicional a revisión técnica previa | La operación metodológica seleccionada es inversa UTM EPSG:25830 seguida de EPSG:1149 (exactitud publicada 1 m, sin grid de datum); falta confirmar el compuesto PROJ, AOI, `proj.db`, pipeline efectivo y entorno antes de congelar. | No afirmar exactitud posicional submétrica; cualquier operación distinta o fallback produce HOLD. |
| Condicional a evidencia previa | Identidad vigente de capa, licencia/condiciones, schema, CRS declarado/efectivo, límite máximo, completitud y semántica de revisión del servicio. | Si inconsistencia temporal o límite afecta la inferencia, adquisición HOLD. No se consultó el servicio en K1-R1. |
| Condicional a evidencia previa | Reglas de admisión/clasificación predeclaradas deben contrastarse con schema y fuente autorizados; serializer y entorno exactos deben congelarse. | Sin coincidencia de esquema/IDs, no hay comparación admisible. |
| Bloqueada | Snapshot H3 histórico esperado del 6-oct-2026, su manifiesto/contrato y respuesta WFS original. | H3 histórico **HOLD** permanente para esta versión; un snapshot distinto no lo sustituye. |
| Bloqueada | Umbrales de área, desplazamiento, Hausdorff, cercanía al límite o cambio de asignación y elección de estrategia por aceptabilidad. | Se pueden presentar métricas exploratorias; no se selecciona precisión ni se declara error admisible sin base científica y aprobación previa. |
| Bloqueada solo para Q-PIP | Fuente de puntos independiente, licencia, muestreo y tratamiento de puntos próximos a frontera. | Gate Q-PIP HOLD; Q-GEO puede seguir como estudio puramente geométrico bajo alcance limitado. |
| Bloqueada | Aprobación explícita de esta versión exacta, autorización independiente de adquisición y revisión externa de resultados. | El documento permanece DRAFT; ninguna de esas etapas se presume ni se autoriza por el texto. |

## 12. Referencias técnicas

- IETF, [RFC 7946 — The GeoJSON Format](https://www.rfc-editor.org/rfc/rfc7946.html): referencia para WGS 84, grados y orden de posiciones GeoJSON; no valida la conformidad de una respuesta WFS concreta.
- IETF, [RFC 8785 — JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html), y [errata verificada 7920](https://www.rfc-editor.org/errata/eid7920): referencia de representación canónica, I-JSON y tratamiento de menos cero.
- PyProj, [Transformer API 3.7.2](https://pyproj4.github.io/pyproj/3.7.2/api/transformer.html): referencia para `always_xy`, operaciones, área de uso, exactitud, `TransformerGroup`, operaciones no disponibles y estado `best_available`.
- Fichas del dataset EPSG mostradas por [EPSG:25830](https://epsg.io/25830) y [EPSG:1149](https://epsg.io/1149): definiciones técnicas consultadas de ETRS89 / UTM zone 30N y ETRS89 to WGS 84 (1). Son referencia CRS/operación, no evidencia de licencia del dataset municipal ni sustituto del registro oficial de catálogo.

Hasta resolver las condiciones de diseño que afectan a la inferencia y obtener aprobación explícita de esta versión exacta, este documento **no está congelado y no autoriza adquisición**.
