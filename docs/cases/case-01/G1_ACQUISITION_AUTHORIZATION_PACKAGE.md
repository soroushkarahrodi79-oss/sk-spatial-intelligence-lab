# CASE-01 — Paquete de autorización de adquisición G1

**Estado:** BORRADOR PARA REVISIÓN — **G1 permanece en HOLD**.
**Preparado:** 2026-11-07 (Europe/Madrid).
**Naturaleza:** solicitud de decisión y lista de verificación. Este documento **no autoriza** ninguna consulta de red, descarga, ejecución, publicación ni despliegue. No modifica el prerregistro aprobado ni sus criterios científicos.

## 1. Diseño aprobado al que se refiere

| Campo | Valor |
|---|---|
| Documento | `docs/cases/case-01/PREREGISTRO_INTEGRIDAD_GEOMETRICA.md`, v0.5.0 (K1-R8) |
| Commit aprobado | `aa1877b8c0e543ad35fe34736563eba8dddb1f35` |
| SHA-256 documental | `1DC71D28DA79FC899145CD53341207959B1D3F811C53223496AFC28AC0C1ECB4` |
| Aprobación G0 | Interna, reportada por la persona usuaria; ver `G0_INTERNAL_APPROVAL_RECORD.md`. No es revisión externa. |
| Alcance | Q-GEO descriptivo. Q-PIP y H3 histórico quedan fuera y en HOLD. |

Cualquier cambio al prerregistro invalida la correspondencia con este paquete y exige repetir G0 y rehacer este documento.

## 2. Qué se pide decidir

Este paquete solicita, en orden y por separado, dos decisiones. Aprobar la primera no aprueba la segunda.

- **G1a — Preflight documental (solo metadatos).** Autorizar las peticiones de lectura de `GetCapabilities`, `DescribeFeatureType`, ficha de catálogo y licencia/condiciones vigentes, y el `GetFeature resultType=hits` de §2 paso 2 del prerregistro. Sin cuerpo de entidades.
- **G1b — Captura de datos.** Autorizar la única petición `GetFeature` de §2 paso 3, tras revisar la evidencia de G1a.

> Nota de diseño: el prerregistro describe el preflight como parte de la secuencia de captura y exige verificar fuente, licencia, límite y CRS *antes* de autorizar la adquisición. Con un solo G1 esa verificación sería circular, porque requiere consultar el servicio. Separar G1a y G1b resuelve esa circularidad sin cambiar el método. **Esta separación es una propuesta; la persona aprobadora debe aceptarla o rechazarla expresamente (§8).**

## 3. Lista de verificación G1 (fuente, versión, licencia, límite, CRS, contrato)

Estado posible: `PENDIENTE` · `CUMPLIDO (offline)` · `CUMPLIDO (evidencia archivada)` · `HOLD`.

### 3.1 Fuente e identidad del recurso

| # | Verificación | Evidencia exigida | Estado |
|---|---|---|---|
| F1 | Identidad de la capa `PLANEAMIENTO_URBANISTICO:Ámbitos_Ordenación` en el WFS municipal | `GetCapabilities` archivado como bytes con SHA-256, endpoint, versión WFS, `updateSequence` si existe, namespace | PENDIENTE (requiere G1a) |
| F2 | Reconciliar la discrepancia K0 entre `docuUId` / referencia de reutilización de la metadata local y los campos de la ficha de catálogo | Ficha de catálogo archivada y comparada campo a campo; identificador, titularidad y versión del registro vigentes | PENDIENTE (requiere G1a) |
| F3 | Ruta de descarga inequívoca | URL canónica de §2 del prerregistro coincide con la anunciada por catálogo/capabilities | PENDIENTE (requiere G1a) |

### 3.2 Licencia y derechos

| # | Verificación | Evidencia exigida | Estado |
|---|---|---|---|
| L1 | Licencia/condiciones vigentes de la capa de planeamiento | Texto de condiciones archivado con SHA-256 y fecha | PENDIENTE (requiere G1a) |
| L2 | Distinguir licencia de la capa WFS de la licencia CC BY 4.0 declarada para los metadatos del AOI (distritos/barrios) | Dos registros separados; no se hereda uno del otro | PENDIENTE |
| L3 | Derechos de redistribución y privacidad | Confirmación documentada antes de publicar bytes, geometrías o resultados por entidad. La atribución por sí sola no es licencia | PENDIENTE; **no necesaria para G1a/G1b**, sí para cualquier publicación posterior |

Si la licencia, el registro o la ruta quedan ambiguos: **HOLD** (prerregistro §2).

### 3.3 Versión y completitud

| # | Verificación | Evidencia exigida | Estado |
|---|---|---|---|
| V1 | Límites del servicio: `CountDefault`, `DefaultMaxFeatures`, límites del proveedor, paginación | Registrados desde capabilities; la ausencia de límite declarado no prueba que no exista | PENDIENTE (requiere G1a) |
| V2 | Conteo orientativo `resultType=hits` | Request, respuesta y `numberMatched` archivados; no se interpreta como lock ni snapshot | PENDIENTE (requiere G1a) |
| V3 | Semántica de versión (`ETag`, `Last-Modified`, `updateSequence`) | Solo se trata como versión si el proveedor documenta ese significado; si no, la conclusión se limita al cuerpo capturado y se declara que su consistencia temporal interna no está demostrada | PENDIENTE |
| V4 | Regla de truncamiento | Una sola petición sin `count`/`startIndex`; si hay límite alcanzado, flags de truncamiento o conteos incoherentes: HOLD, sin paginación improvisada | Definida en diseño; se verifica en G1b |

### 3.4 Límite espacial

| # | Verificación | Evidencia exigida | Estado |
|---|---|---|---|
| E1 | AOI de estudio fijado | Geometría municipal de §5.2 (commit `ba83f3ae…`, hashes del archivo y del token `geometry`) | CUMPLIDO (offline), según prerregistro §5.2 |
| E2 | Extensión declarada por el servicio/catálogo para la capa, con su CRS | Evidencia archivada desde capabilities/catálogo. Si no está declarada, el CRS es ambiguo o se anuncia fuera del AOI sin explicación: **HOLD** | PENDIENTE (requiere G1a) |
| E3 | Señal diagnóstica de borde (el derivado histórico sobresale 0,0000748° al este del AOI) | Se comprueba con geometrías e IDs en G2; no se recorta ni se amplía el AOI post hoc | Registrada; sin acción en G1 |

La extensión oficial del WFS permanece **NO DEMOSTRADA** hasta que E2 tenga evidencia.

### 3.5 CRS y contrato de datos

| # | Verificación | Evidencia exigida | Estado |
|---|---|---|---|
| C1 | `srsName` solicitado frente a `DefaultCRS`/`OtherCRS` de capabilities | Contraste archivado | PENDIENTE (requiere G1a) |
| C2 | Tipo y propiedad geométrica en `DescribeFeatureType`; presencia de campos `Etiqueta` y `Denominación` | Esquema archivado y comparado con las reglas de admisión de §6 | PENDIENTE (requiere G1a) |
| C3 | Orden de ejes X=easting, Y=northing y dimensiones XY | Se contrasta tras G1b con rangos plausibles; los rangos son control de plausibilidad, no prueba del CRS | Definida; se ejecuta en G1b→G2 |
| C4 | Operación de coordenadas EPSG:25830 → CRS84 | Definición PROJJSON de §5.1 con SHA-256 `2823A5E3…58F5`; ejecución desde esa definición, no por selección automática | CUMPLIDO (diseño, Perfil B); la ejecución debe repetirse (§4) |
| C5 | Contrato S3 y JCS | `rfc8785==0.1.4` con wheel fijado, `json.dumps` con opciones congeladas | CUMPLIDO (diseño y fixtures sintéticos); falta identificar el código que se ejecute (§4.2) |

## 4. Precondiciones técnicas que siguen abiertas

Estas condiciones están escritas en el prerregistro como requisitos previos a cualquier ejecución. Este paquete **no las da por cumplidas**.

### 4.1 Entorno

- Repetir, el día de la captura, el control de versiones y hashes del Perfil B de §4 (Python 3.14.5, PyProj 3.7.2, PROJ 9.5.1, `proj.db` EPSG v11.022, hashes de binarios, `PROJ_NETWORK=OFF`, cero grids). Si no se reproduce: HOLD.
- La discrepancia con `PROJ_LIB` apuntando a una base PostGIS distinta (EPSG v10.041) sigue vigente en el host. No se modifica; el Perfil B la aísla. Debe quedar anotada en el manifiesto.
- Shapely 2.1.2 / GEOS 3.13.1 proceden de la reproducción K0.1 y **no** fueron verificados en K1-R4. Deben verificarse y registrarse antes de G2.

### 4.2 Código que se ejecutará

El prerregistro exige (§11, fila «Condicional a evidencia previa») que el SHA de los módulos de parser, validación y construcción quede en el manifiesto antes de G1/G2, y que sin implementación identificable no haya comparación admisible.

- **Estado: PENDIENTE.** Este paquete no identifica un commit ni un SHA de esos módulos, y no verifica que el código exista en el repositorio.
- Antes de G1b debe fijarse: ruta, commit y SHA-256 del parser estricto de fuente, el parser derivado controlado, el validador S3, el constructor del derivado y el clasificador de admisión.
- Ese código debe pasar los fixtures de §3.2 y §5.3 del prerregistro en dos procesos aislados.

### 4.3 Captura

- Un intento, sin redirecciones ni reintentos, HTTP 200 esperado, `Accept-Encoding: identity`, sin credenciales.
- Los bytes se guardan fuera del repositorio (el prerregistro prohíbe incorporar respuestas WFS) en una ubicación a decidir (§8, D3).
- Registro UTC de inicio/fin, cabeceras y cadena de redirecciones; valores ausentes como `null`.

## 5. Condiciones de HOLD y NO-GO durante G1

Cualquiera de estas detiene el avance y exige informe a la persona aprobadora; ninguna se resuelve de forma improvisada.

- Licencia, registro de catálogo, titularidad o ruta de descarga ambiguos (F2, F3, L1).
- CRS efectivo, orden de ejes o dimensiones no establecidos sin ambigüedad (C1–C3).
- Extensión no declarada, CRS ambiguo o extensión fuera del AOI sin explicación (E2).
- Límite alcanzado, flags de truncamiento, conteos incoherentes o completitud ambigua (V1, V2, V4).
- Redirección, respuesta no-200, compresión no prevista, error de certificado o `Content-Type` incompatible.
- Cambio de universo, esquema, duplicados o clases respecto de la referencia 765/724: se revisa antes de clasificar; no se recortan entidades para recuperar la cifra.
- Entorno que no reproduce el Perfil B, o código sin SHA identificado.

**NO-GO:** fuente no autorizada, incorrecta o con integridad comprometida.

## 6. Qué no autoriza este paquete aunque se apruebe

- G2 (ejecución geométrica): requiere gate propio tras identificar el snapshot.
- Q-PIP y cualquier fuente de puntos.
- Reconstrucción o sustitución del snapshot histórico del 6-oct-2026 (H3 sigue HOLD).
- Publicación o redistribución de bytes, geometrías o resultados.
- Despliegue, cambio de builders o cambios en otros repositorios.
- Selección de estrategia por aceptabilidad espacial: no hay umbrales aprobados.
- Revisión externa (G3).

## 7. Límites de lo que respalda este documento

- Redactado y revisado por una sola línea de trabajo. No existe revisión independiente de datos, método o resultados.
- La licencia, el registro de catálogo y las propiedades reales del servicio **no han sido consultados** al preparar este paquete; todo lo marcado PENDIENTE se desconoce.
- Las cifras del prerregistro (hashes, versiones, conteos) se citan tal como están en el documento aprobado; este paquete no las ha recalculado.

## 8. Decisiones solicitadas a la persona aprobadora

Dejar en blanco hasta que exista decisión humana. No completar por inferencia.

| # | Decisión | Respuesta |
|---|---|---|
| D1 | ¿Se acepta separar G1 en G1a (metadatos) y G1b (captura)? | _pendiente_ |
| D2 | ¿Se autoriza G1a? Si sí, indicar endpoints permitidos y fecha/ventana. | _pendiente_ |
| D3 | Ubicación de custodia de bytes WFS y manifiesto (fuera del repositorio). | _pendiente_ |
| D4 | Commit y SHA-256 del código de parser/validación/construcción que se ejecutará (§4.2). | _pendiente_ |
| D5 | ¿Se autoriza G1b tras revisar la evidencia de G1a? | _pendiente; no decidible antes de G1a_ |

### Registro de decisión

- **Decisión:** _pendiente_
- **Persona que decide / atestación:** _pendiente (no se infiere ni se inventa)_
- **Documento y SHA-256 de este paquete aprobado:** _se fija al aprobar_
- **Fecha/hora:** _pendiente_

Estado actual de gates: G0 aprobado internamente (alcance limitado) · **G1 HOLD** · G2-GEO, Q-PIP y G3 sin iniciar · H3 histórico HOLD.
