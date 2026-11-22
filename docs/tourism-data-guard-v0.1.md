# Tourism Data Guard v0.1 — diseño

**Estado:** aprobada con modificaciones el 2026-11-22 (ver §9, que prevalece sobre el resto donde haya conflicto). Sobre `main` en `d0b7742`. Se implementa paso a paso, una PR por paso.

**Qué es:** fichas de *límites de interpretación* de estadísticas turísticas públicas (qué mide cada fuente, qué no, dónde se rompe la serie, bajo qué licencia se reutiliza, hasta qué tipo de afirmación llega), consultables desde la web estática y desde un MCP local.

**Qué no es:** una calificación de fiabilidad. Ninguna ficha mide la calidad estadística de su fuente. Documenta lo que la fuente declara y dónde. Por eso este documento no usa «fiable», «validado» ni «verificado» como atributo de una fuente (ver §6, punto 6).

---

## 1. Punto de partida (lo que ya existe y se reutiliza)

| Pieza | Cómo funciona hoy | Qué hereda Tourism Data Guard |
|---|---|---|
| `scripts/evidence-catalog.mjs` | Ajv 2020 *strict* contra un esquema cerrado, más comprobaciones semánticas en código, más JSON embebido en `space/index.html` entre marcadores y comparado byte a byte | Mismo patrón: esquema + validador + embebido generado (`--write`) + `--online` opcional |
| Esquema del catálogo | `additionalProperties:false`, enums cerrados, textos `{en, es}` obligatorios; no puede expresar «validated» | Textos bilingües; vocabulario cerrado; el esquema impide por construcción lo que la política prohíbe |
| `scripts/claim-trace.mjs` | Comprueba que las líneas citadas contienen los términos y cifras de la afirmación | Mismo principio: una afirmación sin ancla comprobable no entra |
| `mcp/madrid-evidence/` | Servidor stdio con el SDK oficial, `z.strictObject`, `readOnlyHint`, respuesta `structuredContent` + texto idéntico, arranque que falla cerrado, abstención en vez de adivinar | Mismo contrato de respuesta y mismo vocabulario de abstención |
| `tests/madrid-evidence-mcp.test.mjs` | Levanta el servidor real, cliente MCP, compara con una consulta directa independiente; falla (no se omite) si falta la precondición | Mismo estilo para D |

---

## 2. Alcance v0.1

Cinco entregas, **una PR por paso**, en este orden: A → B → (C, D) → E.

| Paso | Entrega | Depende de |
|---|---|---|
| A | `data/source-card.schema.json` + `data/sources/*.json` (máx. 8 fuentes) | — |
| B | `scripts/source-cards.mjs` + `check:source-cards` en `npm test` y en `validate.yml` | A |
| C | Sección `#sources` en `space/index.html` (buscador, ficha, comparador), ES/EN | A, B |
| D | `mcp/tourism-data-guard/` con `get_source_card`, `compare_sources`, `list_method_breaks` | A, B |
| E | `data/claim-ceiling-badge.schema.json` + generador SVG + `docs/claim-ceiling-badge.md` | A (vocabulario de techo) |

Fuentes iniciales (7, tope 8): MITMS estudios básicos, MITMS estudios completos, INE estadística experimental de turismo con móviles, FRONTUR, EOH, SIT Madrid (Flujo de Visitantes), uso público del PN Sierra de Guadarrama. La asignación de identificadores y la existencia exacta de cada producto se comprueban contra la web oficial en A, no aquí (§5).

## 3. No-objetivos

- Ninguna puntuación, ranking ni «semáforo de fiabilidad» de fuentes.
- Ninguna serie de datos ni cifra estadística. Las fichas contienen metadatos: fechas de rupturas, cobertura, licencia. Toda cifra que aparezca lleva URL oficial y fecha de consulta.
- Sin LLM, sin scraping, sin actualización automática desde las fuentes, sin backend, sin alojamiento.
- Sin tablas copiadas del SIT ni de ninguna fuente: se cita y se enlaza.
- La ficha de licencia recoge condiciones declaradas por el productor con enlace; no es una opinión jurídica sobre si un uso concreto es lícito.
- Sin afirmaciones de causalidad, validación o resiliencia. Ninguna ficha de v0.1 puede tener techo causal.
- No se modifica `data/evidence-catalog.json`, sus trazas ni los resultados de `mcp/madrid-evidence/eval/`.
- No se despliega el Space ni se publica nada sin tu aprobación expresa.

---

## 4. Esquema de la ficha (paso A)

Un fichero JSON por fuente (§9: se descartó YAML), validado por `data/source-card.schema.json` (JSON Schema 2020-12, `additionalProperties:false`, mismo Ajv *strict* que el catálogo). Campos de texto libre como `{es, en}`; los campos estructurados (enums, fechas, URLs) no llevan idioma.

### 4.1 Unidad de afirmación citada

Toda afirmación sobre el mundo (qué mide, qué no mide, cobertura, licencia, cada ruptura) es un objeto con una de dos formas, y no hay una tercera:

```json
// Forma comprobada
{ "status": "checked", "text": { "es": "…", "en": "…" },
  "url": "https://…",          // https, host dentro de producer.officialHosts
  "consultedOn": "2026-11-22" } // fecha real en que se leyó esa URL

// Forma pendiente
{ "status": "pending", "text": "[X]",
  "pendingReason": "URL oficial no localizada / extracto no aportado" }
```

Los campos estructurados (cobertura, método, licencia, rupturas) siguen el mismo patrón por bloque: o todos sus campos están comprobados y comparten `url` + `consultedOn`, o todos son `[X]` con `pendingReason`. (Los comentarios `//` son solo ilustrativos; JSON no los admite.)

`pending` solo admite el literal `[X]`. No existe «valor aproximado a confirmar».

### 4.2 Campos de la ficha

| Campo | Contenido | Notas |
|---|---|---|
| `schemaVersion`, `id` | `1`, `^[a-z0-9-]+$` único | |
| `name`, `producer` | nombre bilingüe; `producer.{name, url, officialHosts[]}` | `officialHosts` es la lista de dominios aceptables para las URL de esta ficha |
| `measures` | `population`, `unit` (texto citado) + `unitClass` (enum) + `method` (enum) | `unitClass` y `method` alimentan el comparador (§5.3) |
| `doesNotMeasure[]` | mínimo 1 afirmación citada | Obligatorio: una ficha sin límites no entra |
| `coverage.temporal` | `from`, `to` (`YYYY-MM` o `ongoing` o `[X]`), `resolution` (enum) | |
| `coverage.spatial` | extensión (texto) + `granularity` (enum) | |
| `methodBreaks[]` | `date`, `description`, `documentedEffect`, `url`, `consultedOn`, `status` | `documentedEffect` es lo que el **productor** documenta. Si no documenta efecto, el valor es el literal `"no documentado"`, nunca una estimación nuestra |
| `license` | `name`, `reuseConditions`, `url`, `consultedOn`, `status` | Incluye la condición de citar y enlazar (SIT) |
| `claimCeiling` | `level` ∈ {`descriptive`, `associative`} + `rationale` citada | Ver §6, punto 7 |
| `evidenceLinks[]` | opcional: enlaces a registros del catálogo (`EV-…`) | Solo lectura; no altera estados |

Enums cerrados (`unitClass`, `method`, `granularity`, `resolution`) se documentan valor por valor en el propio esquema; añadir uno es un cambio de esquema, no de ficha.

### 4.3 Fecha de consulta, no «de verificación»

El campo se llama `consultedOn`. Significa «alguien leyó esa URL ese día y la afirmación coincide con lo leído». No prueba que el productor tenga razón, ni que la URL siga vigente después. La política del repositorio trata «verified/verificado» como lenguaje de sobreafirmación (el catálogo lo bloquea por regex), así que el campo y las respuestas del MCP usan «consulta».

---

## 5. Validación, comparador y MCP

### 5.1 `scripts/source-cards.mjs` (paso B)

Modos: por defecto (estructura), `--release` (puerta de publicación), `--online` (red), `--write` (regenera lo embebido en C).

Falla si:
1. el JSON no valida contra el esquema;
2. alguna ruptura o afirmación `checked` carece de `url` o `consultedOn`; la URL no es `https`, o su host no está en `producer.officialHosts`; la fecha no es una fecha de calendario real o es futura (no hay límite inferior: una consulta anterior a la creación del repositorio es válida);
3. un `pending` no es exactamente `[X]` o no tiene `pendingReason`;
4. hay `id` duplicados, o `doesNotMeasure`/`methodBreaks` no existen como claves;
5. el texto contiene lenguaje de causalidad, validación o resiliencia afirmativo (lista ES/EN, reutilizando el patrón del catálogo). Es un detector de tropiezos, no una garantía: no puede demostrar que un texto no contiene causalidad. Se testea con casos positivos y negativos («no soporta inferencia causal» debe pasar).

`--release` además falla si queda **cualquier** `[X]`. La puerta de C, D y E es `--release`; el modo por defecto lo usa `npm test` y cuenta los pendientes en la salida.

`--online` hace HEAD/GET de cada URL y reporta; no se usa en `check:links` (las webs oficiales rechazan con frecuencia HEAD y bots, y volverían inestable el CI). Una URL que responde 200 no demuestra que la afirmación siga siendo cierta. `--online` solo detecta enlaces rotos.

### 5.2 Comparabilidad (D y C comparten reglas)

La regla vive en un módulo único (`scripts/lib/compare-sources.mjs`); D lo importa y C embebe la misma función, con un test de paridad en navegador sobre todos los pares.

Entrada: fichas `a`, `b`, `period` (`YYYY-MM/YYYY-MM`), `claimLevel` opcional (§5.4).

| Veredicto | Condición |
|---|---|
| `not-evaluable` | falta (`[X]`) algún campo que la regla necesita en cualquiera de las dos fichas |
| `no` | `unitClass` distinto, o la cobertura de alguna no solapa con `period` |
| `caution` | misma `unitClass` pero distinto `method`, `granularity` o `resolution`, **o** hay una ruptura de método dentro de `period` en alguna |
| `yes` | mismo `unitClass`, `method`, `granularity`, `resolution`, ambas cubren `period` y ninguna tiene ruptura dentro |

La respuesta lista cada razón con la dimensión, los dos valores y la URL de las afirmaciones citadas. Dos salvedades que van **en la propia respuesta**: (1) `yes` significa compatibilidad de metadatos declarados, no que las cifras sean intercambiables ni equivalencia estadística; (2) `not-evaluable` es un cuarto estado que el encargo no contempla pero que es necesario: sin él habría que inventar un sí/no con datos pendientes.

### 5.3 `mcp/tourism-data-guard/` (paso D)

Servidor **separado** de `madrid-evidence`. Tocar `server.mjs` o `lens-adapter.mjs` de Madrid rompería el sello de la evaluación (`eval.mjs verify` falla ante cualquier cambio en ellos) y mezclaría dos contratos (uno exige `MADRID_LENS_ROOT`).

| Herramienta | Entrada | Salida |
|---|---|---|
| `get_source_card` | `id` | ficha completa, con `consultedOn` por afirmación, `claimCeiling` y lista de pendientes |
| `list_method_breaks` | `source` | rupturas con fecha, efecto documentado, URL y `consultedOn`; las `[X]` se devuelven como pendientes, nunca omitidas |
| `compare_sources` | `a`, `b`, `period`, `claimLevel?` | veredicto (§5.2), razones, techo común, citas |

Todas: `readOnlyHint`, `z.strictObject`, `structuredContent` + texto idéntico, y siempre fuente, `consultedOn` y techo. Al arrancar valida todas las fichas con el mismo código que B y **no arranca** si alguna falla (fail-closed, como el adaptador de Lens). Lee los JSON de `data/sources/` directamente (§9).

**Rehusar por encima del techo.** El encargo pide rehusar «si se le pide una inferencia por encima del techo», pero `compare_sources(a, b, period)` no tiene dónde expresarla. Clasificar texto libre sería heurística, y el repositorio abstiene antes que adivinar. Propuesta: parámetro opcional `claimLevel` ∈ {`descriptive`, `associative`, `causal`}, por defecto `descriptive`. Si supera el techo mínimo de las dos fuentes, la respuesta es una abstención (`kind: "ABSTENTION"`, `reason: "ABOVE_CLAIM_CEILING"`, vocabulario de Lens) con el techo y lo que sí se puede afirmar. `causal` se rehúsa siempre en v0.1. Limitación explícita: el servidor no puede impedir que el agente haga la inferencia después, con los datos que ya tiene. Solo se niega a avalarla.

### 5.4 Página (paso C)

Sección `#sources` dentro de `space/index.html`, con las fichas embebidas como JSON entre marcadores generados (`--write`), igual que el catálogo. Motivo en §6, punto 4. Buscador (texto, sin distinguir mayúsculas ni acentos, filtros por productor, método y techo), ficha por fuente con **límites visibles por defecto** (como el explorador de evidencias) y comparador de dos fuentes con selector de periodo. El veredicto se anuncia con `aria-live` y no depende del color. Sin dependencias externas; objetivos táctiles de 44 px; contraste AA con los tokens existentes; claves ES/EN comprobadas por `scripts/validate.mjs`; comprobación de desbordamiento a 360–1440 px como el explorador.

### 5.5 Insignia (paso E)

`data/claim-ceiling-badge.schema.json` define el objeto de insignia (`subject`, `level`, `declaredOn`, `basisUrl`, `selfDeclared: true` constante). El generador produce un SVG determinista (sin fuentes externas, texto escapado, contraste AA) con el texto «claim ceiling: descriptive». Es una **declaración propia**, no una certificación; el SVG lo dice y la documentación también. Se aplica al README de este repositorio y a ningún otro desde esta sesión (§6, punto 9).

---

## 6. Premisas puestas a prueba (decisiones que necesito de ti)

1. **No puedo verificar URLs oficiales desde este entorno.** Pruebas `curl` a `ine.es`, `transportes.gob.es`, `mitma.gob.es`, `madrid.es`, `comunidad.madrid`, `parquenacionalsierraguadarrama.es`, `miteco.gob.es` y `datos.gob.es` no devolvieron respuesta HTTP (código 000). No he diagnosticado la causa (lo más probable es la lista de hosts permitidos del entorno). Con tu regla («no inventes cifras; si no verificas, `[X]`»), sin acceso la entrega A saldría casi toda en `[X]`. Un armazón vacío demuestra que el esquema funciona; no demuestra que el producto sirva. Opciones: **(a)** autorizar esos hosts en el entorno; **(b)** pasarme tú las URL y extractos y yo estructuro; **(c)** aceptar A como armazón con `[X]` y completar después.
2. **La ruptura del 1-jul-2025 en MITMS es una premisa tuya que no puedo confirmar.** Entra en la ficha solo si existe URL oficial que la documente; hasta entonces es `[X]`. Lo mismo para cualquier otra ruptura. El efecto lo tiene que documentar el productor; no lo estimamos nosotros.
3. **«SIT Madrid (Flujo de Visitantes)» es ambiguo.** No sé si es el Sistema de Información Turística de la Comunidad o un producto del Ayuntamiento, ni qué mide exactamente. ¿URL o nombre completo del producto? Hasta entonces, `[X]`.
4. **La página va dentro de `index.html`, no como fichero nuevo.** `scripts/space-plan.mjs` exige que `space/` contenga exactamente `README.md`, `index.html`, `style.css` (y `.gitattributes`) y el despliegue tiene una lista blanca de tres ficheros. Una página nueva exigiría cambiar esa política de despliegue, que es tu decisión de seguridad, no un detalle de la PR C. El coste de embeber: `index.html` crece y ya es denso.
5. **(Resuelto en §9: JSON, sin `yaml`.) `yaml` hoy es `devDependency`.** El MCP lo necesita en ejecución. Mover `yaml` a `dependencies` no añade paquete nuevo pero cambia qué instala quien consume el MCP. La alternativa (generar JSON y que el MCP lea JSON) incumple tu «lea los mismos YAML». Propongo mover `yaml` a `dependencies`.
6. **Vocabulario.** El repositorio bloquea «verified/validated» en el catálogo, y «fichas de fiabilidad» promete una calificación que ninguna ficha hace. Propongo mantener el nombre «Tourism Data Guard» y subtitularlo «fichas de límites de interpretación», y usar `consultedOn` («fecha de consulta»).
7. **Techo de afirmación: tus tres valores no están en el mismo eje.** «Causal no soportado» no es un nivel por encima de «asociativo»: es la negativa. Propongo `level` ∈ {`descriptive`, `associative`} y causal rehusado siempre. Más duro: ¿qué fuente de las siete justificaría `associative`? Las siete son agregadas y observacionales; el riesgo de falacia ecológica es real. Mi propuesta es que todas salgan `descriptive` salvo que justifiques `associative` con una razón citada en `rationale`.
8. **`not-evaluable` y `claimLevel`** (§5.2, §5.3) amplían el contrato que describiste. Requieren tu visto bueno.
9. **La insignia solo puede aplicarse a este repo.** Mi acceso está limitado a `sk-spatial-intelligence-lab`; no puedo editar los README de Lens, GeoImpact-CI ni Salmas. E entrega esquema, generador y documentación, y los demás repos se hacen en sesiones aparte. Además, una insignia en un README se lee como sello. Debe decir «autodeclarado» y enlazar a la base.
10. **Flujo de PRs.** Una PR por paso con la rama única que me asignan (`claude/zen-volta-jd4p8j`) implica que tú fusionas cada una antes de que empiece la siguiente (la rama se reinicia desde `main`). Apilar PRs en ramas distintas requiere tu permiso para empujar a otros nombres de rama. Yo no fusiono nada.

## 7. Efectos sobre el repositorio

- Archivos nuevos: `data/source-card.schema.json`, `data/sources/*.json`, `scripts/source-cards.mjs`, `scripts/lib/compare-sources.mjs`, `mcp/tourism-data-guard/`, tests, `docs/claim-ceiling-badge.md`, esquema y generador de la insignia.
- Archivos modificados: `package.json` (scripts; sin dependencias nuevas ni cambios de dependencias), `.github/workflows/validate.yml` (pasos nuevos), `space/index.html` (C), `README.md` y `CHANGELOG.md` (estado honesto del componente, sin venderlo como validado).
- Intactos: `data/evidence-catalog*`, `data/claim-excerpts.json`, `mcp/madrid-evidence/**` (incluidos `eval/` y el sello), `backups/`, `space/README.md`, `space/style.css`, `deploy-space.yml`.

## 8. Qué demuestra y qué no cada entrega (plantilla de cada PR)

| Paso | Demuestra | No demuestra |
|---|---|---|
| A | Que cada afirmación tiene un lugar para su URL y su fecha de consulta | Que las afirmaciones sean correctas, ni que la fuente sea de calidad |
| B | Que ninguna ficha publicable carece de URL, fecha o límites, y que `[X]` no se cuela | Que la URL diga lo que la ficha afirma; que un texto esté libre de causalidad |
| C | Que un lector llega a límites y rupturas en dos interacciones, en ES y EN, accesible | Que el veredicto del comparador sea estadísticamente cierto |
| D | Que un agente recibe fuente, consulta y techo, y que se le rehúsa por encima del techo | Que el agente no cometa la inferencia por su cuenta; sin evaluación independiente |
| E | Que el techo declarado se expresa de forma consistente | Que el repositorio o su contenido estén certificados |

## 9. Decisiones del titular (2026-11-22)

Estas decisiones responden a §6 y prevalecen sobre el texto anterior.

1. **Acceso (opción c + b).** Armazón con `[X]`. v0.1 solo se considera completo con **2 fichas rellenadas, MITMS y SIT**, a partir de extractos que pegará el titular (precisado en §10: SIT y *un* producto MITMS elegido de forma explícita). No se piden más hosts.
2. **Aprobado:** sección embebida en `index.html`; `claimLevel` y `not-evaluable`; todas las fichas en `descriptive` salvo razón citada; campo `consultedOn`; subtítulo «fichas de límites de interpretación»; modos normal y `--release`.
3. **Rechazado:** `yaml` como dependencia. Las fichas son **JSON** (`data/sources/*.json`), validadas con Ajv, sin dependencias nuevas. *Pendiente para D:* Ajv también es `devDependency`. Si el servidor MCP ha de validar fichas al arrancar con Ajv, o se acepta que ese servidor se ejecute desde el repositorio tras `npm ci` (como el MCP de Madrid), o hace falta una validación sin Ajv. Se decide en D, no antes.
4. **SIT.** Lo publica Madrid Destino (Ayuntamiento de Madrid), `https://www.esmadrid.com/sit`, módulo «Turismo en cifras: Flujos de movimiento», botón «FLUJO DE VISITANTES»; fuente declarada: «datos procedentes de las redes de comunicación móviles». **Todo ello es dato aportado por el titular, no leído por el agente**: en la ficha queda como `[X]` con esa información en `pendingReason`, hasta que haya extracto y fecha de consulta. Condiciones de uso: `[X]`.
5. **Ruptura MITMS (1-jul-2025) y toda cifra asociada:** `[X]` hasta que se pegue el extracto oficial.
6. **Una rama, una PR por paso.** El titular fusiona cada una antes de que empiece la siguiente. Insignia (E) solo en este repositorio.

## 10. Criterio de completitud de v0.1 (precisado 2026-11-22)

1. v0.1 solo se considera completa cuando están rellenadas, **a partir de extractos aportados por el titular**: **(a)** la ficha SIT (`sit-madrid-flujo-visitantes`) y **(b)** **un único producto MITMS, seleccionado de forma explícita por el titular**: `mitms-estudios-basicos` o `mitms-estudios-completos`.
2. **La selección del producto MITMS no está hecha.** Mientras no la haga el titular, v0.1 no está completa y no se describe como tal.
3. **Sin suposiciones.** Ninguna ficha se rellena por inferencia:
   - la ficha del producto MITMS no seleccionado, las tres de INE y la del PN Sierra de Guadarrama permanecen en `[X]` y se muestran como pendientes;
   - no se copia contenido de una ficha MITMS a la otra ni se infiere de un producto lo que corresponde al otro;
   - la premisa de ruptura en torno al 2025-07-01 sigue siendo `[X]` en ambas fichas MITMS hasta que un extracto oficial diga qué productos afecta.
4. **Puerta de publicación.** Cuando exista la selección, la comprobación es `node scripts/source-cards.mjs --release --cards sit-madrid-flujo-visitantes,<id-mitms-seleccionado>`. `--release` sin `--cards` exigiría las 7 fichas y no es la puerta de v0.1. Hasta entonces ningún paso de CI ejecuta `--release`.
5. **Límite.** Pasar esa puerta demuestra que esas dos fichas no tienen `[X]` y que cada afirmación tiene URL de host declarado y fecha de consulta real. No demuestra que lo rellenado coincida con la fuente ni que la fuente sea correcta.
