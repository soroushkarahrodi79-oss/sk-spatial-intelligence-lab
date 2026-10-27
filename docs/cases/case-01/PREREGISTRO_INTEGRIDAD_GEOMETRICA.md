# CASE-01 — Prerregistro prospectivo de integridad geométrica

**Versión documental:** 0.5.0 — revisión K1-R8 (cero con signo derivado)
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

1. **Hash de bytes WFS:** SHA-256 del cuerpo original, antes de decodificar o parsear. Identifica únicamente esa secuencia recibida.
2. **Fingerprint estructural JCS:** SHA-256 de los bytes canónicos producidos después de parser y validaciones estrictas, para la colección fuente o derivada según se declare. No identifica los bytes fuente ni un archivo GeoJSON S3.
3. **Hash de bytes S3:** SHA-256 de todos los bytes del GeoJSON serializado —incluido el LF final—. Identifica exactamente ese archivo, incluidas estructura, orden, representación numérica y formato.
4. **Fingerprint JCS del derivado:** fingerprint estructural calculado separadamente sobre la colección derivada, ordenando solo `features` por el `ambito_code` exacto. No sustituye al SHA-256 de bytes S3.

Son operaciones e identidades distintas; sus resultados no se igualan ni se reutilizan entre sí. El manifiesto de procedencia enlazará el hash WFS, los fingerprints JCS etiquetados por etapa, el SHA-256 S3, las respuestas de metadatos, revisión Git y SHA del código ejecutado, parámetros, entorno, conteos y excepciones. Si el parser o la validación de IDs falla, se conserva el hash WFS si los bytes están disponibles, pero no se emite fingerprint JCS ni se admite el derivado.

### 3.1 Parser estricto previo a JCS

El candidato de canonicalización es **`rfc8785==0.1.4`**, wheel `rfc8785-0.1.4-py3-none-any.whl`, SHA-256 `520d690b448ecf0703691c76e1a34a24ddcd4fc5bc41d589cb7c58ec651bcd48`, obtenido del archivo de esa versión en PyPI. Se importó directamente desde el wheel verificado en procesos CPython **3.14.5** aislados, sin instalar ni extraerlo; la API ensayada es `rfc8785.dumps(value) -> bytes` (UTF-8 canónico). El metadata indica Python `>=3.8`, licencia Apache-2.0, wheel universal `py3-none-any` y ninguna dependencia base; los extras de desarrollo sí declaran dependencias opcionales. PyPI no publica provenance para este artefacto, por lo que el hash verifica coincidencia con el checksum de release, no una attestación del proceso de construcción. Es un candidato fijado y probado, aún sujeto a aprobación explícita.

Antes de llamar a JCS sobre la fuente, leer solo bytes UTF-8 estrictos, rechazar BOM y parsear con `json.loads(..., strict=True, object_pairs_hook=..., parse_int=..., parse_float=..., parse_constant=...)`. `object_pairs_hook` debe detectar nombres duplicados **después de desescapar** y antes de formar cada `dict`; nunca aplicar política “último valor gana”. `parse_constant` rechaza `NaN`, `Infinity` y `-Infinity`; `parse_float` inspecciona el token original con decimal exacto y su conversión binary64, rechazando overflow/no finito y cualquier decimal no cero que se convierta en cero; `parse_int` y `parse_float` rechazan cero negativo cuando el token comienza con `-` y representa cero. Aplicar también el límite de proyecto de enteros matemáticamente integrales dentro de ±(2⁵³−1), incluidos tokens con punto decimal o exponente. La prueba documental ejercitó `1e30` como vector RFC directamente contra JCS; el parser del proyecto lo rechaza por ese límite más estricto. Los números finitos admitidos se representan como binary64 antes de canonicalizar. Esta es exclusivamente la política estricta de bytes WFS externos: no se relaja para JSON no confiable.

Para un derivado S3 reconocido como producido por la ejecución controlada de §5.3, el parser de lectura usa la política derivada distinta: conserva las comprobaciones estructurales, Unicode, claves duplicadas, tipos, finitud y rango, pero permite `+0.0` y `-0.0` binary64 generados internamente y conserva su bit de signo. Un documento solo se reconoce como S3 controlado si sus bytes, incluido el LF final, coinciden con el SHA-256 S3 del manifiesto de la misma ejecución, y ese manifiesto enlaza el hash WFS, hashes de código de parser/validador/construcción, perfil runtime y entrada S2. En ausencia de esa cadena de procedencia, el documento se trata como JSON externo y se aplica la política estricta de fuente; un hash aislado no concede esa condición.

Recorrer recursivamente claves y valores de tipo string y rechazar surrogates aislados; un par UTF-16 válido se conserva como su punto de código Unicode. No aplicar NFC/NFD, recorte, case-folding, conversión de tipos ni ninguna otra normalización. Antes de canonicalizar, validar además el árbol de valores: solo `dict` con claves de tipo string exacto, `list`, strings Unicode válidos, `null`, booleanos, enteros admitidos y floats finitos; rechazar tuplas, objetos personalizados, claves no string y ciclos. Para el árbol derivado reconocido se admiten ambos signos de cero; para la fuente continúa el rechazo léxico anterior. Esto importa porque `rfc8785` acepta tuplas y las emite como arrays: la librería no reemplaza este validador.

Validar el objeto raíz como `FeatureCollection`; cada feature debe tener el campo ID acordado, de tipo string exacto, no nulo y único después de decodificar escapes (`properties.Etiqueta` en fuente; `properties.ambito_code` en derivado). IDs ausentes, duplicados, nulos o no string causan rechazo y **HOLD**. La ordenación contractual del array `features` es por el valor exacto del ID usando bytes UTF-16BE —equivalente al orden lexicográfico de unidades UTF-16—, sin locale. No se reordenan propiedades por una regla CASE-01: JCS ordena recursivamente las claves de objetos. Se preserva el orden de todos los arrays salvo el `features` preparado expresamente; vértices, anillos, componentes y demás arrays permanecen intactos. `rfc8785.dumps()` produce los bytes JCS; el fingerprint es SHA-256 de esos bytes, sin BOM, espacios ni LF final. La ordenación previa de `features` es del contrato CASE-01, no del RFC.

### 3.2 Calificación sintética del candidato JCS

En memoria se verificaron el vector numérico/string de RFC 8785 §3.2.2–3.2.3 y el vector de orden de propiedades UTF-16, incluido un par surrogate válido. Dos FeatureCollections con las mismas entidades en distinto orden obtuvieron los mismos bytes JCS y fingerprint después de ordenar `features`. Cambiar coordenada, ID o estructura cambió el fingerprint; invertir el orden de vértices también lo cambió, sin normalización topológica. NFC y NFD se conservaron como strings distintas. Un ID con surrogate escape `"a"`/`"\u0061"` se decodificó al mismo string y fue rechazado como duplicado.

El parser estricto de fuente de calificación rechazó claves duplicadas literales y escapadas, `NaN`/`Infinity`/`-Infinity`, overflow, underflow no cero a cero, enteros fuera del límite, `-0`/`-0.0`/`-0e7`/`-0.00E-12`, surrogate aislado, BOM, UTF-8 inválido e IDs ausentes, duplicados, nulos o no string. El fingerprint de fixture `187bd6ad953ffa0c18b3727cac5d9ef720c00ad8aa2fa459e5319d4c4dcd6162` fue idéntico en dos procesos aislados; es solo un resultado sintético y no un hash de fuente CASE-01. Los vectores y fixtures seleccionados pasaron; no se afirma haber ejecutado el corpus exhaustivo de conformidad RFC.

### 3.3 Compatibilidad con el fingerprint legacy

El builder histórico fijado en `madrid-tourism-intelligence-lens`, commit `ba83f3ae4c2180dfa5f955ddd4b634b018b6f6ea`, archivo `scripts/build_planning_ambitos.py` (Git blob SHA `22513cc81549f8d1d80e7d97d913afa8b7d7c7cc`), usa `json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")` para su fingerprint legacy. Ordena el array derivado por `ambito_code` con el orden lexicográfico de Python. Ese método se denomina aquí `legacy-json-dumps-sort-keys-v1`; el nuevo es `case01-jcs-rfc8785-0.1.4-v1`. Una fixture sintética con claves BMP/suplementaria demostró que `sort_keys=True` de Python y JCS pueden producir órdenes y bytes distintos. No se compararon hashes de artefactos reales ni se afirma compatibilidad automática.

## 4. Entorno reproducible

Perfil candidato, observado en la reproducción K0.1 y aún sujeto a congelación explícita:

| Componente | Versión candidata |
|---|---:|
| Python | 3.14.5 |
| Shapely | 2.1.2 |
| GEOS | 3.13.1 |
| PyProj | 3.7.2 |
| PROJ | 9.5.1 |

Las versiones de la tabla describen la reproducción K0.1; no se atribuyen al proceso que produjo el snapshot histórico. K1-R4 verificó dos contextos PyProj en procesos hijos de corta duración. El padre pasó a cada hijo un diccionario `env` de `subprocess`; no se alteraron variables globales de Windows, PostgreSQL/PostGIS, el registro ni perfiles de PowerShell.

**Perfil A, ambiente heredado.** El hijo recibió la configuración PROJ heredada, salvo `PYTHONDONTWRITEBYTECODE=1` y la codificación de salida. `PROJ_LIB` apuntaba a `C:\Program Files\PostgreSQL\18\share\contrib\postgis-3.6\proj`; `GDAL_DATA` apuntaba a PostgreSQL; `PROJ_DATA`, `PROJ_AUX_DB` y `PROJ_NETWORK` estaban sin definir. Sin embargo, PyProj 3.7.2 resolvió `datadir.get_data_dir()` al directorio empaquetado de PyProj y consultó `proj.db` EPSG v11.022, SHA-256 `47A7205D83BA6B7774B763F276AB57331F4DADE2B2CFBCC0D486677E6543350B`. La base indicada por `PROJ_LIB` es distinta (EPSG v10.041, SHA-256 `DB22DE2BDDF7F5473C606C20CDD94E543DCAEA005EB4E1595BDDBC90A9FB453D`), pero no fue la base efectiva de esos procesos PyProj. `PROJ_NETWORK` heredado estaba sin definir y la red efectiva resultó desactivada; el `proj.ini` empaquetado declara `network=off`.

**Perfil B, runtime de estudio aislado.** El padre creó un segundo diccionario de entorno sin `PROJ_DATA`, `PROJ_LIB`, `PROJ_AUX_DB`, otras variables `PROJ_*`/`PYPROJ_*`, rutas `GDAL_*`/`CPL_*`, `PYTHONPATH`/`PYTHONHOME` ni rutas PostgreSQL/PostGIS de `PATH`; no había entradas de PostgreSQL en `PATH` que retirar. Añadió `PROJ_NETWORK=OFF` y `PYTHONDONTWRITEBYTECODE=1`. Dentro de cada hijo se llamó a la API soportada `pyproj.datadir.set_data_dir()` con `pyproj/proj_dir/share/proj` y a `pyproj.network.set_network_enabled(False)`. No se heredó una ruta de base auxiliar y la inspección de módulos cargados no encontró DLL de PostgreSQL/PostGIS. El directorio B efectivo contiene cero grids; la operación seleccionada no requiere grids. Su `proj.ini` SHA-256 `4AF3BE139976ECD3A5CC56563CA321BB5012163C0B89DF0807BEF78A7DD2B41E` declara `network=off`, `only_best_default=off` y `tmerc_default_algo=poder_engsager`.

El host de la comprobación B fue Windows 11 `10.0.26300-SP0`, AMD64; Python fue CPython 3.14.5, build `tags/v3.14.5:5607950`, compilador MSC v.1944 de 64 bits. PyProj fue 3.7.2, PROJ 9.5.1 y la versión EPSG de la base efectiva fue v11.022. El directorio de datos efectivo fue `C:\Users\Dell\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\pyproj\proj_dir\share\proj`; `proj.db` está en ese directorio y su SHA-256 es `47A7205D83BA6B7774B763F276AB57331F4DADE2B2CFBCC0D486677E6543350B`. `proj.ini` está junto a esa base. El Perfil B usó `PROJ_NETWORK=OFF`, llamó también a `pyproj.network.set_network_enabled(False)` y verificó `is_network_enabled() == False`. La lista de grids presentes en ese directorio fue vacía; ninguna grid se requiere para esta operación.

El inventario del ambiente heredado no encontró otras variables `PROJ_*`, `PYPROJ_*`, `GDAL_*` o `CPL_*` además de `PROJ_LIB` y `GDAL_DATA`; tampoco estaban definidas `PYTHONPATH`, `PYTHONHOME` ni variables de entorno Conda/venv. En el `proj.ini` de B también aparecen `cdn_endpoint=https://cdn.proj.org`, caché habilitada de 300 MB y TTL de 86400 s; son inertes para la operación ensayada porque el acceso de red se desactivó tanto en el entorno como en PyProj. `ca_bundle_path` está comentado y no se observó override ambiental. `only_best_default=off` se registró, pero la selección se auditó con `allow_ballpark=False`, `best_available=True`, ninguna operación no disponible y luego se instanció la definición enumerada; no se permitió una sustitución automática silenciosa. La versión candidata Shapely 2.1.2/GEOS 3.13.1 de la tabla procede de la reproducción K0.1: K1-R4 no importó ni usó Shapely/GEOS y no verifica el entorno de geometría completo.

| Binario/perfil B | Ruta o identidad observada | SHA-256 |
|---|---|---|
| Python 3.14.5 x64 | `C:\Users\Dell\AppData\Local\Python\pythoncore-3.14-64\python.exe` | `3ADBBF2AF609E206E3CA18CD55FC7C4B52F5C8BB8218DD99FD5A9E50D7A193CD` |
| PyProj transformer extension | `C:\Users\Dell\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\pyproj\_transformer.cp314-win_amd64.pyd` | `F7D0041EC735B12EBEBC4459BC7C9CC8D0BDB4358D0820A5DCF5746E4B7DD326` |
| PROJ DLL cargada | `C:\Users\Dell\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\pyproj.libs\proj_9-c635a7dcf1c2f5308514f46a54311e70.dll` | `F7C0E557890E501E33545C3406F167810FAED118C79B6C0DE25100B29058AF80` |
| SQLite DLL cargada | `C:\Users\Dell\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\pyproj.libs\sqlite3-fe7be31bbec5a4ba375dbf7916a37e96.dll` | `FE7BE31BBEC5A4BA375DBF7916A37E96084DEFDCE56B0D41C09A59C563394147` |
| PyProj context extension | `C:\Users\Dell\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\pyproj\_context.cp314-win_amd64.pyd` | `D5F434501E725890C595936FD0E43161C2D4D774714EEB9B13B8BF73FA959B35` |

El perfil B se repitió en dos procesos independientes con la misma versión de Python, base y definición. Estos hashes identifican binarios instalados en este host, no un wheel ni un paquete de redistribución. No se encontró un hash de wheel y no se afirma portabilidad universal ni reconstrucción en otra máquina. Si una captura futura no reproduce las rutas, versiones, hashes, configuración y operación B aquí registradas, el gate es HOLD; queda prohibido resolverlo cambiando variables globales o la instalación de PostgreSQL/PostGIS.

## 5. Etapas y estrategias candidatas

Todas las etapas operan sobre copias en memoria y conservan el S0 inmutable.

- **S0 — entrada:** bytes preservados, respuesta WFS cuyo CRS/orden de ejes pasó los controles de §2, entidad por código exacto. Fuente en EPSG:25830 significa X=easting, Y=northing según declaración WFS verificada; no es RFC 7946 solo por ser JSON con `coordinates`.
- **S1 — reproyección:** EPSG:25830 → `OGC:CRS84` (WGS 84 lon/lat) con precisión binary64, interfaz X/Y (`always_xy=True` al enumerar la operación), usando exclusivamente el pipeline congelado en §5.1 y ejecución con `errcheck=True`. Los ceros binary64 derivados conservan su signo IEEE-754; no se normalizan. Sin reparación, redondeo ni simplificación; errores, no finitos o coordenadas fuera del rango del CRS causan HOLD.
- **S2 — política de coordenadas:** aplicar por separado cada estrategia candidata, nunca encadenar una estrategia sobre la salida de otra. Para la estrategia B, redondear con la función incorporada `round(valor, 7)` cada ordenada X e Y de S1, de forma independiente, según la semántica de Python congelada para la ejecución. Si esta operación produce `-0.0`, se preserva su bit de signo; no se normaliza a `+0.0`. Antes de congelar se debe confirmar que las coordenadas son XY; una dimensión Z/M activa HOLD hasta que una regla se apruebe. No aplicar rejillas ni alterar la topología como operación de precisión.
- **S3 — serialización y lectura:** usar exclusivamente el contrato explícito de §5.3. No se permite una segunda reducción de precisión. Volver a leer con el parser derivado controlado de §3.1 y comparar estructura, coordenadas, conteos, tipos, orden y validez con S2; calcular SHA-256 sobre todos los bytes S3, LF final incluido.

### 5.1 Operación de coordenadas y control de selección PROJ

La operación seleccionada por este diseño para la conversión es la composición ordenada: inversa de la conversión Transverse Mercator de EPSG:25830 (UTM 30N), seguida de EPSG **1149**, `ETRS89 to WGS 84 (1)`, con tres traslaciones geocéntricas nulas y salida X/Y compatible con `OGC:CRS84` mediante `always_xy=True`. EPSG:1149 declara exactitud de 1 m y no requiere grid de datum. Esa cifra publicada no es tolerancia del estudio ni evidencia de precisión centimétrica. La selección es metodológica y no afirma que K0.1 o el builder usaran esta operación.

La enumeración K1-R4 se hizo en Perfil B con el AOI de estudio fijado en §5.2 —no con una supuesta extensión de la capa WFS— y `TransformerGroup(EPSG:25830, OGC:CRS84, always_xy=True, allow_ballpark=False, allow_superseded=False)`. El grupo devolvió una única operación disponible, cero no disponibles y `best_available=True`; Perfil A resolvió la misma operación y definición. El área de uso es Europa, `[west=-16.1°, south=33.26°, east=38.01°, north=84.73°]`, e incluye el AOI administrativo. La definición PROJJSON completa se incluye abajo; su SHA-256 es `2823A5E372D7C8B746B190E02AFA59DDB0F987291E977FF80DA67D53A84358F5`, calculado sobre UTF-8 de `json.dumps(to_json_dict(), sort_keys=True, separators=(",", ":"), ensure_ascii=False)`. El SHA-256 del WKT devuelto por `to_wkt()` codificado en UTF-8 es `D18080B9B82108BB612EC93D5CDC02AD3E31DCF318F792E725BE692EC22BF105`. Estos son hashes de serializaciones generadas por PyProj 3.7.2, no hashes de bytes de un archivo de catálogo. Este resultado comprueba cobertura del AOI por la operación en el `proj.db` B; no certifica la extensión de la capa WFS.

La operación efectiva es `Inverse of UTM zone 30N + ETRS89 to WGS 84 (1) + axis order change (2D)`, exactitud declarada 1 m. El PROJJSON conserva la composición y el paso `DERIVED_FROM(EPSG):1149`, método `Geocentric translations (geog2D domain)`, con traslaciones X/Y/Z nulas, exactitud 1 m y sin grids. El pipeline numérico simplificado es `proj=pipeline step inv proj=utm zone=30 ellps=GRS80 step proj=unitconvert xy_in=rad xy_out=deg`: PROJ no expresa como paso numérico separado una transformación de datum con tres traslaciones nulas; por eso el pipeline no sustituye el PROJJSON ni los metadatos de operación. La definición inversa CRS84→EPSG:25830 observada fue `axis order change (2D) + Inverse of ETRS89 to WGS 84 (1) + UTM zone 30N`, pipeline `proj=pipeline step proj=unitconvert xy_in=deg xy_out=rad step proj=utm zone=30 ellps=GRS80`; `has_inverse=True`.

El pipeline seleccionado se instanció con `Transformer.from_pipeline(definition)`, sin `always_xy` (esa API no lo acepta); su definición coincidió exactamente con la enumerada y sus salidas binarias coincidieron con el transformer seleccionado. La salida X/Y está gobernada por el pipeline explícito y por los CRS/ejes incluidos en el PROJJSON. Para cada transformación se exigió `errcheck=True`. Como prueba sintética se usaron exclusivamente `(440000.0, 4480000.0)` y `(500000.0, 4480000.0)` en EPSG:25830. El primero produjo `(-3.707765785287993, 40.46851104523366)` en CRS84 y la inversa `(440000.00000000006, 4479999.999999999)`, con residuo de cierre planar `9.331397911231848e-10 m`; el segundo produjo `(-2.9999999999999916, 40.47067797549126)` y la inversa `(500000.0, 4479999.999999999)`, con residuo `9.313225746154785e-10 m`. Ambos procesos B independientes dieron salidas binary64 idénticas bit a bit, tanto para el transformer enumerado como para `Transformer.from_pipeline`. Esa política de igualdad exacta se fijó antes de comparar las salidas; no se aplicó epsilon. Los residuos son solo cierre numérico de ida y vuelta en puntos sintéticos, no exactitud geodésica ni tolerancia, y no se comparan con la exactitud publicada de 1 m. La distorsión cartográfica es una magnitud distinta: el muestreo exploratorio del AOI ya registrado en §7 es independiente de esta prueba; la distorsión sobre geometrías WFS solo podrá calcularse tras una futura captura admitida.

**PROJJSON íntegro generado en Perfil B** (misma definición en los dos procesos B; el digest del contenido corresponde al algoritmo descrito arriba):

```json
{
  "$schema": "https://proj.org/schemas/v0.7/projjson.schema.json",
  "type": "ConcatenatedOperation",
  "name": "Inverse of UTM zone 30N + ETRS89 to WGS 84 (1) + axis order change (2D)",
  "source_crs": {
    "type": "ProjectedCRS",
    "name": "ETRS89 / UTM zone 30N",
    "base_crs": {
      "name": "ETRS89",
      "datum_ensemble": {
        "name": "European Terrestrial Reference System 1989 ensemble",
        "members": [
          {
            "name": "European Terrestrial Reference Frame 1989",
            "id": {
              "authority": "EPSG",
              "code": 1178
            }
          },
          {
            "name": "European Terrestrial Reference Frame 1990",
            "id": {
              "authority": "EPSG",
              "code": 1179
            }
          },
          {
            "name": "European Terrestrial Reference Frame 1991",
            "id": {
              "authority": "EPSG",
              "code": 1180
            }
          },
          {
            "name": "European Terrestrial Reference Frame 1992",
            "id": {
              "authority": "EPSG",
              "code": 1181
            }
          },
          {
            "name": "European Terrestrial Reference Frame 1993",
            "id": {
              "authority": "EPSG",
              "code": 1182
            }
          },
          {
            "name": "European Terrestrial Reference Frame 1994",
            "id": {
              "authority": "EPSG",
              "code": 1183
            }
          },
          {
            "name": "European Terrestrial Reference Frame 1996",
            "id": {
              "authority": "EPSG",
              "code": 1184
            }
          },
          {
            "name": "European Terrestrial Reference Frame 1997",
            "id": {
              "authority": "EPSG",
              "code": 1185
            }
          },
          {
            "name": "European Terrestrial Reference Frame 2000",
            "id": {
              "authority": "EPSG",
              "code": 1186
            }
          },
          {
            "name": "European Terrestrial Reference Frame 2005",
            "id": {
              "authority": "EPSG",
              "code": 1204
            }
          },
          {
            "name": "European Terrestrial Reference Frame 2014",
            "id": {
              "authority": "EPSG",
              "code": 1206
            }
          },
          {
            "name": "European Terrestrial Reference Frame 2020",
            "id": {
              "authority": "EPSG",
              "code": 1382
            }
          }
        ],
        "ellipsoid": {
          "name": "GRS 1980",
          "semi_major_axis": 6378137,
          "inverse_flattening": 298.257222101
        },
        "accuracy": "0.1",
        "id": {
          "authority": "EPSG",
          "code": 6258
        }
      },
      "coordinate_system": {
        "subtype": "ellipsoidal",
        "axis": [
          {
            "name": "Geodetic latitude",
            "abbreviation": "Lat",
            "direction": "north",
            "unit": "degree"
          },
          {
            "name": "Geodetic longitude",
            "abbreviation": "Lon",
            "direction": "east",
            "unit": "degree"
          }
        ]
      },
      "id": {
        "authority": "EPSG",
        "code": 4258
      }
    },
    "conversion": {
      "name": "UTM zone 30N",
      "method": {
        "name": "Transverse Mercator",
        "id": {
          "authority": "EPSG",
          "code": 9807
        }
      },
      "parameters": [
        {
          "name": "Latitude of natural origin",
          "value": 0,
          "unit": "degree",
          "id": {
            "authority": "EPSG",
            "code": 8801
          }
        },
        {
          "name": "Longitude of natural origin",
          "value": -3,
          "unit": "degree",
          "id": {
            "authority": "EPSG",
            "code": 8802
          }
        },
        {
          "name": "Scale factor at natural origin",
          "value": 0.9996,
          "unit": "unity",
          "id": {
            "authority": "EPSG",
            "code": 8805
          }
        },
        {
          "name": "False easting",
          "value": 500000,
          "unit": "metre",
          "id": {
            "authority": "EPSG",
            "code": 8806
          }
        },
        {
          "name": "False northing",
          "value": 0,
          "unit": "metre",
          "id": {
            "authority": "EPSG",
            "code": 8807
          }
        }
      ]
    },
    "coordinate_system": {
      "subtype": "Cartesian",
      "axis": [
        {
          "name": "Easting",
          "abbreviation": "E",
          "direction": "east",
          "unit": "metre"
        },
        {
          "name": "Northing",
          "abbreviation": "N",
          "direction": "north",
          "unit": "metre"
        }
      ]
    },
    "id": {
      "authority": "EPSG",
      "code": 25830
    }
  },
  "target_crs": {
    "type": "GeographicCRS",
    "name": "WGS 84 (CRS84)",
    "datum_ensemble": {
      "name": "World Geodetic System 1984 ensemble",
      "members": [
        {
          "name": "World Geodetic System 1984 (Transit)",
          "id": {
            "authority": "EPSG",
            "code": 1166
          }
        },
        {
          "name": "World Geodetic System 1984 (G730)",
          "id": {
            "authority": "EPSG",
            "code": 1152
          }
        },
        {
          "name": "World Geodetic System 1984 (G873)",
          "id": {
            "authority": "EPSG",
            "code": 1153
          }
        },
        {
          "name": "World Geodetic System 1984 (G1150)",
          "id": {
            "authority": "EPSG",
            "code": 1154
          }
        },
        {
          "name": "World Geodetic System 1984 (G1674)",
          "id": {
            "authority": "EPSG",
            "code": 1155
          }
        },
        {
          "name": "World Geodetic System 1984 (G1762)",
          "id": {
            "authority": "EPSG",
            "code": 1156
          }
        },
        {
          "name": "World Geodetic System 1984 (G2139)",
          "id": {
            "authority": "EPSG",
            "code": 1309
          }
        },
        {
          "name": "World Geodetic System 1984 (G2296)",
          "id": {
            "authority": "EPSG",
            "code": 1383
          }
        }
      ],
      "ellipsoid": {
        "name": "WGS 84",
        "semi_major_axis": 6378137,
        "inverse_flattening": 298.257223563
      },
      "accuracy": "2.0",
      "id": {
        "authority": "EPSG",
        "code": 6326
      }
    },
    "coordinate_system": {
      "subtype": "ellipsoidal",
      "axis": [
        {
          "name": "Geodetic longitude",
          "abbreviation": "Lon",
          "direction": "east",
          "unit": "degree"
        },
        {
          "name": "Geodetic latitude",
          "abbreviation": "Lat",
          "direction": "north",
          "unit": "degree"
        }
      ]
    },
    "id": {
      "authority": "OGC",
      "code": "CRS84"
    }
  },
  "steps": [
    {
      "type": "Conversion",
      "name": "Inverse of UTM zone 30N",
      "method": {
        "name": "Inverse of Transverse Mercator",
        "id": {
          "authority": "INVERSE(EPSG)",
          "code": 9807
        }
      },
      "parameters": [
        {
          "name": "Latitude of natural origin",
          "value": 0,
          "unit": "degree",
          "id": {
            "authority": "EPSG",
            "code": 8801
          }
        },
        {
          "name": "Longitude of natural origin",
          "value": -3,
          "unit": "degree",
          "id": {
            "authority": "EPSG",
            "code": 8802
          }
        },
        {
          "name": "Scale factor at natural origin",
          "value": 0.9996,
          "unit": "unity",
          "id": {
            "authority": "EPSG",
            "code": 8805
          }
        },
        {
          "name": "False easting",
          "value": 500000,
          "unit": "metre",
          "id": {
            "authority": "EPSG",
            "code": 8806
          }
        },
        {
          "name": "False northing",
          "value": 0,
          "unit": "metre",
          "id": {
            "authority": "EPSG",
            "code": 8807
          }
        }
      ],
      "id": {
        "authority": "INVERSE(EPSG)",
        "code": 16030
      }
    },
    {
      "type": "Transformation",
      "name": "ETRS89 to WGS 84 (1)",
      "source_crs": {
        "type": "GeographicCRS",
        "name": "ETRS89",
        "datum_ensemble": {
          "name": "European Terrestrial Reference System 1989 ensemble",
          "members": [
            {
              "name": "European Terrestrial Reference Frame 1989",
              "id": {
                "authority": "EPSG",
                "code": 1178
              }
            },
            {
              "name": "European Terrestrial Reference Frame 1990",
              "id": {
                "authority": "EPSG",
                "code": 1179
              }
            },
            {
              "name": "European Terrestrial Reference Frame 1991",
              "id": {
                "authority": "EPSG",
                "code": 1180
              }
            },
            {
              "name": "European Terrestrial Reference Frame 1992",
              "id": {
                "authority": "EPSG",
                "code": 1181
              }
            },
            {
              "name": "European Terrestrial Reference Frame 1993",
              "id": {
                "authority": "EPSG",
                "code": 1182
              }
            },
            {
              "name": "European Terrestrial Reference Frame 1994",
              "id": {
                "authority": "EPSG",
                "code": 1183
              }
            },
            {
              "name": "European Terrestrial Reference Frame 1996",
              "id": {
                "authority": "EPSG",
                "code": 1184
              }
            },
            {
              "name": "European Terrestrial Reference Frame 1997",
              "id": {
                "authority": "EPSG",
                "code": 1185
              }
            },
            {
              "name": "European Terrestrial Reference Frame 2000",
              "id": {
                "authority": "EPSG",
                "code": 1186
              }
            },
            {
              "name": "European Terrestrial Reference Frame 2005",
              "id": {
                "authority": "EPSG",
                "code": 1204
              }
            },
            {
              "name": "European Terrestrial Reference Frame 2014",
              "id": {
                "authority": "EPSG",
                "code": 1206
              }
            },
            {
              "name": "European Terrestrial Reference Frame 2020",
              "id": {
                "authority": "EPSG",
                "code": 1382
              }
            }
          ],
          "ellipsoid": {
            "name": "GRS 1980",
            "semi_major_axis": 6378137,
            "inverse_flattening": 298.257222101
          },
          "accuracy": "0.1",
          "id": {
            "authority": "EPSG",
            "code": 6258
          }
        },
        "coordinate_system": {
          "subtype": "ellipsoidal",
          "axis": [
            {
              "name": "Geodetic latitude",
              "abbreviation": "Lat",
              "direction": "north",
              "unit": "degree"
            },
            {
              "name": "Geodetic longitude",
              "abbreviation": "Lon",
              "direction": "east",
              "unit": "degree"
            }
          ]
        },
        "id": {
          "authority": "EPSG",
          "code": 4258
        }
      },
      "target_crs": {
        "type": "GeographicCRS",
        "name": "WGS 84",
        "datum_ensemble": {
          "name": "World Geodetic System 1984 ensemble",
          "members": [
            {
              "name": "World Geodetic System 1984 (Transit)",
              "id": {
                "authority": "EPSG",
                "code": 1166
              }
            },
            {
              "name": "World Geodetic System 1984 (G730)",
              "id": {
                "authority": "EPSG",
                "code": 1152
              }
            },
            {
              "name": "World Geodetic System 1984 (G873)",
              "id": {
                "authority": "EPSG",
                "code": 1153
              }
            },
            {
              "name": "World Geodetic System 1984 (G1150)",
              "id": {
                "authority": "EPSG",
                "code": 1154
              }
            },
            {
              "name": "World Geodetic System 1984 (G1674)",
              "id": {
                "authority": "EPSG",
                "code": 1155
              }
            },
            {
              "name": "World Geodetic System 1984 (G1762)",
              "id": {
                "authority": "EPSG",
                "code": 1156
              }
            },
            {
              "name": "World Geodetic System 1984 (G2139)",
              "id": {
                "authority": "EPSG",
                "code": 1309
              }
            },
            {
              "name": "World Geodetic System 1984 (G2296)",
              "id": {
                "authority": "EPSG",
                "code": 1383
              }
            }
          ],
          "ellipsoid": {
            "name": "WGS 84",
            "semi_major_axis": 6378137,
            "inverse_flattening": 298.257223563
          },
          "accuracy": "2.0",
          "id": {
            "authority": "EPSG",
            "code": 6326
          }
        },
        "coordinate_system": {
          "subtype": "ellipsoidal",
          "axis": [
            {
              "name": "Geodetic latitude",
              "abbreviation": "Lat",
              "direction": "north",
              "unit": "degree"
            },
            {
              "name": "Geodetic longitude",
              "abbreviation": "Lon",
              "direction": "east",
              "unit": "degree"
            }
          ]
        },
        "id": {
          "authority": "EPSG",
          "code": 4326
        }
      },
      "method": {
        "name": "Geocentric translations (geog2D domain)",
        "id": {
          "authority": "EPSG",
          "code": 9603
        }
      },
      "parameters": [
        {
          "name": "X-axis translation",
          "value": 0,
          "unit": "metre",
          "id": {
            "authority": "EPSG",
            "code": 8605
          }
        },
        {
          "name": "Y-axis translation",
          "value": 0,
          "unit": "metre",
          "id": {
            "authority": "EPSG",
            "code": 8606
          }
        },
        {
          "name": "Z-axis translation",
          "value": 0,
          "unit": "metre",
          "id": {
            "authority": "EPSG",
            "code": 8607
          }
        }
      ],
      "accuracy": "1.0",
      "id": {
        "authority": "DERIVED_FROM(EPSG)",
        "code": 1149
      },
      "remarks": "ETRS89 and WGS 84 are realizations of ITRS coincident to within 1 metre. This transformation has an accuracy equal to the coincidence figure."
    },
    {
      "type": "Conversion",
      "name": "axis order change (2D)",
      "method": {
        "name": "Axis Order Reversal (2D)",
        "id": {
          "authority": "EPSG",
          "code": 9843
        }
      },
      "id": {
        "authority": "EPSG",
        "code": 15498
      }
    }
  ],
  "accuracy": "1",
  "area": "Europe - onshore and offshore: Albania; Andorra; Austria; Belgium; Bosnia and Herzegovina; Bulgaria; Croatia; Czechia; Denmark; Estonia; Faroe Islands; Finland; France; Germany; Gibraltar; Greece; Hungary; Ireland; Italy; Kosovo; Latvia; Liechtenstein; Lithuania; Luxembourg; Malta; Moldova; Monaco; Montenegro; Netherlands; North Macedonia; Norway including Svalbard and Jan Mayen; Poland; Portugal - mainland; Romania; San Marino; Serbia; Slovakia; Slovenia; Spain - mainland and Balearic islands; Sweden; Switzerland; United Kingdom (UK) including Channel Islands and Isle of Man; Vatican City State.",
  "bbox": {
    "south_latitude": 33.26,
    "west_longitude": -16.1,
    "north_latitude": 84.73,
    "east_longitude": 38.01
  }
}
```

La operación ejecutada se construirá desde su definición congelada, no mediante selección automática de `Transformer.from_crs` en cada ejecución. El manifiesto comparará la operación efectiva con el identificador y definición aprobados; cualquier diferencia, grid inesperada, operación alternativa, fallback, área fuera de uso o falta de exactitud declarada produce HOLD. EPSG:1149 tiene exactitud declarada de 1 m y alcance de aproximación; por ello los resultados son sobre cambios computacionales/topológicos del flujo, no una validación de posición absoluta submétrica. Si Q-GEO requiriera esa última afirmación, se necesitaría una operación con base de exactitud adecuada antes de congelar.

### 5.2 AOI administrativo de estudio y cobertura de la capa

El AOI prospectivo para delimitar el estudio municipal de Q-GEO queda definido por la geometría `Polygon` del único feature de `data/geography/madrid_admin.geojson` que satisface exactamente `properties.geography_level == "municipality"` y `properties.official_id == "28079"`. No se usa el `Feature.id` ni el nombre como clave. La fuente está fijada en `soroushkarahrodi79-oss/madrid-tourism-intelligence-lens`, commit `ba83f3ae4c2180dfa5f955ddd4b634b018b6f6ea`; SHA-256 de `madrid_admin.meta.json` `2184C315AA6036D967E8A4C0CC7E69A7B0D322A87D8518ABEE905F6A5A5DF27D`; SHA-256 del GeoJSON completo `F3D53ABD3E8638B7F6C2EA12FBD8BD9C8D3D5C4A613F564815DF4794BC141ACB`; SHA-256 del valor JSON bruto de `geometry` `57C129EE3F41FA42501F38845FADB4FBD1CCB39A425F8B945939D302BEB9A51E`. Este último hash se calcula sobre los bytes UTF-8 exactos del token JSON `geometry`, incluidas sus llaves, sin parsearlo y volverlo a serializar. La geometría queda identificada por ese commit, hashes de archivo, selector y hash del token; su CRS declarado es `urn:ogc:def:crs:OGC:1.3:CRS84`, convenio X=longitud, Y=latitud. El miembro `crs` explícito se conserva como declaración de este artefacto y no implica por sí solo conformidad completa con RFC 7946.

Los metadatos identifican la geometría municipal como `DERIVED_FROM_OFFICIAL_GEOMETRY`: es la unión `unary_union` de Shapely de los 21 polígonos oficiales de distrito, pues, según el registro, el servicio municipal ofrece `TERMINO MUNICIPAL` como polilínea y no un polígono municipal publicado. Los metadatos declaran los distritos v3.2.1 y los barrios v3.4.1, licencia CC BY 4.0 y recuperación el 2026-09-29T13:51:41Z; no declaran fecha efectiva de la geometría. La fecha de modificación de la ficha de catálogo (2026-07-27) no se interpreta como fecha de vigencia. El registro de fuente clasifica los barrios como unidad nativa y distrito/municipio como agregados derivados. En este prerregistro, por tanto, el AOI es un marco administrativo versionado y reproducible, no una afirmación de actualidad jurídica ni un límite municipal publicado directamente.

La verificación local offline K1-R3-B con Shapely 2.1.2/GEOS 3.13.1 encontró exactamente una geometría municipal con ese selector y 21 distritos únicos `01`–`21`, concordantes con los metadatos. El AOI y los 21 distritos son geometrías no vacías, finitas, válidas y de tipo `Polygon`; el AOI tiene un componente y ningún anillo interior. La unión diagnóstica en memoria de los 21 distritos es topológicamente igual a la geometría municipal archivada y su diferencia simétrica está vacía; no se reparó ni modificó ninguna geometría. Su envolvente CRS84 (west, south, east, north; lon/lat) es `[-3.8889634, 40.3120648, -3.5181257, 40.6432795]`. La inspección de vértices de la capa municipal de planificación o de una envolvente derivada no sustituye este AOI ni prueba la extensión completa de un WFS.

Este AOI de estudio no equivale a la extensión oficial de `Ámbitos_Ordenación`. `madrid_ambitos.meta.json` registra metadatos —incluidos tamaño y hash declarados de una respuesta WFS histórica— y métricas de un derivado que contiene 724 entidades admitidas de 765 registros brutos; sus `bounds_4326` describen ese derivado. Su bbox registrada `[-3.8341627, 40.3192213, -3.5180509, 40.5527462]` sobresale 0.0000748° al este del bbox AOI, una señal diagnóstica que debe comprobarse con geometrías e IDs en G1/G2, no evidencia de que alguna entidad cruce el límite. El cuerpo bruto WFS no forma parte de los cinco artefactos fijados en esta auditoría. `l5_geometry.json` documenta una auditoría de una ruta REST. El valor `madrid_city_area` de `data/source_registry.json` es una etiqueta `expected_spatial_scope`, no una geometría certificada. Ninguno de esos elementos permite inferir la extensión oficial íntegra del WFS por coincidencia de envolventes; esa extensión permanece **NO DEMOSTRADA**.

Regla prospectiva de cobertura, sin recorte ni exclusión: en G1 se archivarán, para la capa y versión identificadas, la evidencia de extensión espacial que el servicio o su catálogo declaren, su CRS y el schema que permita identificar la geometría; si la extensión no está declarada, su CRS es ambiguo o se anuncia fuera del AOI sin explicación de alcance, G1 queda **HOLD** hasta justificarlo con evidencia de fuente. En G2, tras una futura adquisición autorizada y verificación de CRS, cada ID exacto se clasificará frente al AOI como cubierto, parcialmente fuera, disjunto/fuera o no clasificable por invalidez. Se conservarán bytes e IDs y se informará cada discrepancia; está prohibido recortar, descartar o ampliar el AOI post hoc. Un elemento parcial/fuera o no clasificable sin explicación documentada mantiene en **HOLD** la inferencia de cobertura municipal y el avance del gate correspondiente. Esta regla no cambia el universo ni la admisión geométrica predeclarados de Q-GEO.

### 5.3 Contrato S3 de serialización y lectura

El runtime ensayado fue CPython 3.14.5, build `tags/v3.14.5:5607950`, MSC v.1944, 64-bit AMD64, en Windows 11 `10.0.26300-SP0`; se usa el módulo `json` de esa distribución estándar. El objeto JSON se construye explícitamente con `dict`/`list` y tipos JSON nativos. El orden de claves procede del orden de inserción declarado por el constructor del schema; el array `features` se prepara antes de serializar, ordenado por el ID exacto mediante el comparador UTF-16BE de §3.1. Se rechazan IDs duplicados. Ningún otro array, en particular coordenadas, anillos o componentes, se reordena.

Antes de `json.dumps`, el validador S3 recorre el árbol derivado controlado y exige claves de tipo `str` exacto, `dict`, `list`, `str` Unicode válida, `null`, booleanos, enteros dentro del rango aprobado y floats finitos, incluidos `+0.0` y `-0.0`. Conserva el bit de signo de cero; no normaliza, redondea, ajusta ni repara coordenadas. Rechaza claves no string, tuplas, tipos personalizados, ciclos, surrogates aislados, NaN/Infinity y cualquier coerción o valor numérico fuera de política. Esta excepción de signo se limita al árbol derivado reconocido según §3.1; el parser WFS externo sigue rechazando tokens léxicos de cero negativo. Esta validación es necesaria incluso con `skipkeys=False`: `json` convierte claves básicas `int`/`float`/`bool`/`None` a strings, y serializa tuplas como arrays. No se usa `default` ni encoder personalizado.

Opciones congeladas para la candidatura S3:

```python
json.dumps(
    objeto,
    ensure_ascii=False,
    separators=(",", ":"),
    sort_keys=False,
    allow_nan=False,
    skipkeys=False,
    indent=None,
    check_circular=True,
    default=None,
    cls=None,
)
```

`json.dumps` produce `str`; codificarla como UTF-8 estricto sin BOM y añadir exactamente un `b"\n"` final define el archivo S3. El SHA-256 de S3 se calcula sobre esos bytes completos. No se llama a JCS para escribir S3, no se redondean coordenadas durante S3 y su hash no se sustituye por ningún fingerprint JCS. `-0.0` se serializa como `-0.0` bajo el runtime congelado. Releer el contenido anterior al LF exclusivamente mediante el parser derivado controlado de §3.1 y aplicar su validación; comparar tipos, orden de claves y features, IDs, componentes y arrays con la estructura de entrada a S3. Las coordenadas float se comparan por patrón binary64 exacto —incluido el bit de signo de cero—, no por igualdad numérica ordinaria.

En fixtures sintéticos en memoria, cambiar `allow_nan=True` a `False` dejó idénticos los bytes de todos los valores válidos probados; `False` lanzó `ValueError` para NaN y ±Infinity. El round-trip `json.dumps`/`json.loads` conservó tipos, coordenadas, orden de claves, orden de features, y estructura `Polygon`/`MultiPolygon`. En dos procesos aislados, `round(-1e-9, 7)` produjo `-0.0` con patrón binary64 `8000000000000000`; S3 lo emitió como `-0.0` y la lectura derivada conservó el mismo patrón. Los bytes S3 `{"coordinates":[-0.0]}\n` y `{"coordinates":[0.0]}\n` tuvieron SHA-256 distintos (`4704d97122a8139da3a715ef4a92ba6ca297aa01c9748c09b59bd74f6811d3d7` y `245108266319d7629b95a472858754d6f6b04ec0cd73a7e61f9b4adad39e831e`); JCS emitió en ambos casos `{"n":0}`. Por tanto, el fingerprint JCS es insensible al signo de cero y no se usa para demostrar su preservación: esa distinción corresponde al SHA-256 de bytes S3 y a la comparación binary64. El parser WFS estricto siguió rechazando `-0`, `-0.0`, `-0e7` y `-0.00E-12`, además de NaN, ±Infinity, overflow y los demás casos malformados. En dos procesos aislados se obtuvo la misma salida de 477 bytes con SHA-256 sintético `c4fb84d6a1f4dbfd5828ba9d2d8e71806e75675a6efe65367357bf2d57904892`; es una fixture de calificación, no un hash de respuesta WFS ni del derivado CASE-01.

S3 puede cambiar bytes por escapes Unicode (`ensure_ascii`), espacios/separadores, orden de claves, sangría, número de LF finales, serialización binary64 o cambios de orden durante la construcción. Con `allow_nan=True` puede emitir tokens no JSON; sin validador, claves de tipos básicos se convierten y tuplas cambian a arrays. Estas opciones y conversiones son parte del formato y no equivalen a una transformación geométrica ni a canonicalización JCS. El builder histórico de §3.3 usaba `ensure_ascii=False`, separadores compactos y LF final, pero dejaba `allow_nan=True` por defecto; el contrato prospectivo S3 lo hace explícito y estricto.

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

Las áreas, distancias y operaciones métricas se calcularán en un único CRS proyectado común. **EPSG:25830 es el CRS métrico candidato para geometría local de Madrid**: ETRS89 / UTM zona 30N, ejes easting/northing en metros, proyección Transverse Mercator con meridiano central −3° y factor de escala central 0,9996; el registro EPSG incluye España peninsular en su área de uso. La envolvente del AOI administrativo fijado en §5.2 queda dentro del área de uso local de EPSG:25830 `[west=-6°, south=35.26°, east=0.01°, north=80.49°]` y del área declarada para EPSG:1149 `[west=-16.1°, south=33.26°, east=38.01°, north=84.73°]`. Esto justifica EPSG:25830 como candidato de métricas locales para ese AOI, no como plano sin distorsión ni como prueba de que la capa WFS tenga igual extensión.

En la inspección offline K1-R3-B, PyProj 3.7.2/PROJ 9.5.1 con la base empaquetada `proj.db` EPSG v11.022 (SHA-256 `47A7205D83BA6B7774B763F276AB57331F4DADE2B2CFBCC0D486677E6543350B`) seleccionó, sin ballpark, una operación disponible con `best_available=True`, exactitud declarada de 1 m y área que cubre el AOI: de EPSG:25830 a CRS84, `Inverse of UTM zone 30N + ETRS89 to WGS 84 (1) + axis order change`, pipeline `proj=pipeline step inv proj=utm zone=30 ellps=GRS80 step proj=unitconvert xy_in=rad xy_out=deg`; la transformación CRS84→EPSG:25830 usada para las métricas fue `axis order change (2D) + Inverse of ETRS89 to WGS 84 (1) + UTM zone 30N`, pipeline `proj=pipeline step proj=unitconvert xy_in=deg xy_out=rad step proj=utm zone=30 ellps=GRS80`. Ambas operaciones tuvieron `best_available=True`, una candidata disponible, cero no disponibles y exactitud declarada de 1 m. La comprobación del AOI no congela esas operaciones. En el mismo entorno, `PROJ_LIB` apunta a otra base PostGIS `proj.db` (EPSG v10.041; SHA-256 `DB22DE2BDDF7F5473C606C20CDD94E543DCAEA005EB4E1595BDDBC90A9FB453D`); esta discrepancia independiente sigue siendo HOLD para congelar el entorno y no se resuelve ni modifica aquí.

Como diagnóstico, se proyectó en memoria la geometría AOI a EPSG:25830: área `603979221.169 m²` y perímetro `174022.844 m`. El muestreo de factores PROJ en todos los vértices y una malla interior cubierta por el AOI (5248 puntos) observó escala lineal meridional/paralela entre −376,21 y −330,31 ppm y escala de área entre −752,27 y −660,51 ppm. Son extremos de una muestra, no cotas matemáticas ni tolerancias de aceptación, exactitud posicional o error del WFS. La geometría administrativa se almacena con 7 decimales y sus metadatos atribuyen la transformación de salida a `outSR=4326` en servidor; no se dispone aquí de la geometría de origen ni de su pipeline histórico. La distorsión sobre geometrías WFS solo se medirá después de una captura admitida. Para comparar S0–S1, S1–S2 y S2–S3 se transformarán copias de ambos extremos al CRS común mediante las operaciones congeladas; S0 permanece en EPSG:25830 y S1–S3 se llevarán de vuelta con la inversa fijada. Se conservarán definición, exactitud, AOI y errores. Está prohibido expresar áreas en m² a partir de coordenadas en grados.

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
| Candidato JCS/S3 calificado en K1-R5; DRAFT | `rfc8785` 0.1.4 con wheel SHA fijado, parser/validador previo y contrato CPython S3 explícito; fixtures RFC y sintéticos repetidos en dos procesos. | No se congela el diseño ni autoriza G1; debe aprobarse esta versión exacta y, antes de cualquier ejecución, identificarse el SHA del validador/construcción que efectivamente se ejecute. |
| Resuelta en el diseño documental | Cero nuevas invalideces es requisito duro para admitir una geometría candidata; inválidas S0 se ponen en cuarentena. | Métricas topológicas y asignaciones incompletas se marcan; no hay reparación implícita. |
| Resuelta para el marco de estudio | AOI Q-GEO fijado por la geometría municipal versionada de §5.2; su topología y ajuste al área de uso de EPSG:25830/1149 se verificaron offline. La distorsión local se documenta como muestreo exploratorio. | No certifica extensión WFS, vigencia efectiva municipal ni exactitud posicional. Cobertura efectiva y entidades fuera/parciales se revisan en G1/G2 conforme a §5.2. |
| Verificada en runtime aislado; aún no congelada | El Perfil B de §4 fija en este host Python/PyProj/PROJ, `proj.db`, binarios, red, grids y operación; A y dos procesos B seleccionaron la misma definición. El `PROJ_LIB` externo de PostgreSQL no participa en B. | El control de versiones/hashes exactos debe repetirse antes de una captura; no es una declaración de portabilidad. G0 sigue HOLD hasta revisión científica y aprobación explícita. No afirmar exactitud posicional submétrica ni usar 1 m como tolerancia numérica. |
| Condicional a evidencia previa | Identidad vigente de capa, licencia/condiciones, schema, CRS declarado/efectivo, límite máximo, completitud y semántica de revisión del servicio. | Si inconsistencia temporal o límite afecta la inferencia, adquisición HOLD. No se consultó el servicio en K1-R1. |
| Condicional a evidencia previa | Reglas de admisión/clasificación predeclaradas deben contrastarse con schema y fuente autorizados; el SHA de los módulos de parser, validación y construcción que se ejecuten debe quedar en el manifiesto antes de G1/G2. | Sin coincidencia de esquema/IDs o sin implementación identificable, no hay comparación admisible. |
| Bloqueada | Snapshot H3 histórico esperado del 6-oct-2026, su manifiesto/contrato y respuesta WFS original. | H3 histórico **HOLD** permanente para esta versión; un snapshot distinto no lo sustituye. |
| Bloqueada | Umbrales de área, desplazamiento, Hausdorff, cercanía al límite o cambio de asignación y elección de estrategia por aceptabilidad. | Se pueden presentar métricas exploratorias; no se selecciona precisión ni se declara error admisible sin base científica y aprobación previa. |
| Bloqueada solo para Q-PIP | Fuente de puntos independiente, licencia, muestreo y tratamiento de puntos próximos a frontera. | Gate Q-PIP HOLD; Q-GEO puede seguir como estudio puramente geométrico bajo alcance limitado. |
| Bloqueada | Aprobación explícita de esta versión exacta, autorización independiente de adquisición y revisión externa de resultados. | El documento permanece DRAFT; ninguna de esas etapas se presume ni se autoriza por el texto. |

## 12. Referencias técnicas

- IETF, [RFC 7946 — The GeoJSON Format](https://www.rfc-editor.org/rfc/rfc7946.html): referencia para WGS 84, grados y orden de posiciones GeoJSON; no valida la conformidad de una respuesta WFS concreta.
- IETF, [RFC 8785 — JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html), y [errata verificada 7920](https://www.rfc-editor.org/errata/eid7920): referencia de representación canónica, I-JSON y tratamiento de menos cero.
- PyPI, [rfc8785 0.1.4](https://pypi.org/project/rfc8785/0.1.4/): metadata de Python mínimo, licencia, API, wheel universal y SHA-256 de release; el release no aporta provenance.
- Python Software Foundation, [módulo `json` de CPython 3.14](https://docs.python.org/3.14/library/json.html): opciones de `dumps`, order preservation, claves que se convierten, y `allow_nan`.
- Madrid Lens, [builder en el commit `ba83f3ae4c2180dfa5f955ddd4b634b018b6f6ea`](https://github.com/soroushkarahrodi79-oss/madrid-tourism-intelligence-lens/blob/ba83f3ae4c2180dfa5f955ddd4b634b018b6f6ea/scripts/build_planning_ambitos.py): referencia solo lectura del fingerprint legacy y writer histórico; no se ejecutó ni modificó.
- PyProj, [Transformer API 3.7.2](https://pyproj4.github.io/pyproj/3.7.2/api/transformer.html): referencia para `always_xy`, operaciones, área de uso, exactitud, `TransformerGroup`, operaciones no disponibles y estado `best_available`.
- Fichas del dataset EPSG mostradas por [EPSG:25830](https://epsg.io/25830) y [EPSG:1149](https://epsg.io/1149): definiciones técnicas consultadas de ETRS89 / UTM zone 30N y ETRS89 to WGS 84 (1). Son referencia CRS/operación, no evidencia de licencia del dataset municipal ni sustituto del registro oficial de catálogo.

Hasta resolver las condiciones de diseño que afectan a la inferencia y obtener aprobación explícita de esta versión exacta, este documento **no está congelado y no autoriza adquisición**.
