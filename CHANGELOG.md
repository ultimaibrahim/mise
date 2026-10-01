# 🛠️ Changelog Técnico — MISE Engine & Platform
**La Crêpe Parisienne · Grupo MYT / Corporativo Alancar**  
**Arquitecto de Producto y Software**: Ibrahim García (`ultimaibrahim`)

Este documento contiene el historial técnico y arquitectónico oficial de la plataforma **MISE**, detallando optimizaciones de Google Apps Script (V8 runtime), llamadas RPC, reducción de latencia, esquemas de base de datos relacionales y especificaciones de frontend.

---

## Época Atlas (v2.0.0 - Presente) [PREVIEW OPERATIVO / ARQUITECTURA INDEPENDIENTE]

Representa la generación de soporte estructural, robustez y arquitectura desacoplada de alto rendimiento. Introduce la WebApp PWA con Sistema de Diseño Crystal & Squircle, el Ledger Relacional Inmutable y la sincronización bidireccional con Google Sheets.

### Version 2.0.0-alpha Atlas — Arquitectura WebApp PWA MISE 2.0, Ledger Relacional Inmutable y Sheets Mirror Worker (Septiembre 2026)
* **Scaffold Frontend PWA Crystal & Squircle (`mise-web/`)**:
  - Implementación del sistema de diseño luxury hospitality en `src/styles.css` con paleta corporativa Parisienne: Deep Emerald (`#1A281F`, `#0C130F`), Pine (`#2D4836`), Sage (`#7A9E8A`) y Cream Sand (`#F5EFE6`).
  - Geometría de curvas suaves squircle (`border-radius: 14px - 28px`), glassmorphism hiper nítido (`backdrop-filter: blur(20px)`), sombras difusas multicapa y eliminación de controles nativos toscos.
  - Modo 1: **Tienda Móvil (Mobile Ordering & Blind Count)** con selección rápida de sucursal (Andares `pda` vs Mercado `pdm`), filtro de categorías, contadores elásticos y Floating Action Dock.
  - Modo 2: **Matriz de Despacho Central (Commissary Matrix)** para Bodega General, consolidando demandas de sucursales en una sola vista de picking por estantería.
  - Modo 3: **Ledger FIFO Stream**, visualizando en tiempo real transacciones inmutables con hashes criptográficos.
* **Modelo Relacional de Base de Datos (`database/001_initial_ledger_schema.sql`)**:
  - Migración lista para **PostgreSQL / Supabase**.
  - Creación de tabla `inventory_transactions` inmutable con hash de idempotencia (`idempotency_hash` SHA-256) para evitar duplicidades por doble clic o reintentos de red.
  - Módulo de auditoría física ciega (`blind_counts` y `blind_count_items`) inspirado en Restaurant365.
  - Tablas de sucursales (`branches`), categorías (`product_categories`), productos maestros con niveles par (`products`), y órdenes de despacho (`orders`, `order_items`).
  - Vista agregada en tiempo real `v_current_stock` con cálculo instantáneo de inventario teórico frente a puntos de reorden.
* **Motor Espejo Bidireccional (`scripts/sheets_mirror_worker.js`)**:
  - Worker de sincronización entre la base relacional y los spreadsheets activos.
  - Serializador de matrices 2D y generación de hashes deterministas con latencia de ejecución validada de **15 ms**.

---

## Época Altair (v1.0.0 - v1.7.5) [MOTOR GOOGLE APPS SCRIPT V8]

Representa la era fundacional y de optimizaciones sub-segundo del motor sobre Google Sheets y Google Apps Script V8, culminando en la suite desacoplada de picking, concurrencia, reconciliación inteligente y logística peer-to-peer.

### Version 1.7.6u Altair — UX del Inventario y del Pedido Diario (Octubre 2026) [EN PRUEBAS · DEV]
* **📦 Inventario** (`_reglasVisualesInventario`, vía `_simplificarVistaKardex`): la **columna de HOY** (ENT/SAL/SLD y su encabezado) se resalta sola, solo si la semana activa (G4) incluye hoy; **SLD negativo en rojo**; **SLD en cero atenuado** (formato condicional, sin cambiar el formato numérico para no dejar "5." en cantidades decimales). Conserva las reglas previas de columnas < J.
* **📋 Pedido Diario** (`_estiloTactilPedido`, vía `_aplicarFormatosCondicionales`): filas de 34 px, PRODUCTO a 12 pt y CANT. A PEDIR a 13 pt en negritas, centrada. (La "cantidad sugerida" propuesta se descartó por decisión de Ibrahim.)
* **Testing**: reglas del Inventario verificadas (hoy con la condición de semana, negativo en las 7 columnas SLD, ceros); estilo táctil del Pedido; el emulador de Bodega ahora registra las reglas de formato condicional.

### Version 1.7.6t Altair — Menús por Uso y Sugeridor de Factores Afinado (Octubre 2026) [EN PRUEBAS · DEV]
* **Tres menús en lugar de uno con 34 opciones**: `⚙️ Mise` (uso diario: Configurar, Powerhouse, traspaso, página de estado, Acerca de y "▸ Más opciones" con Semana, Descuentos, Catálogo y Seguridad), `🛠 Técnico` (diagnóstico, activadores, mantenimiento, blindaje, reconstrucciones, restablecer) y `🧪 Mise DEV` (solo si `MiseDevTools.js` está en el proyecto: libros DEV). En tiendas: `⚙️ Mise` (Surtido Rápido, reordenar, "▸ Más opciones"), `🛠 Técnico` (Configurar, activadores, protección, conexión, contraseña, restablecer) y `🧪 Mise DEV`. Se unificó "Sincronizar semana actual" dentro de 📅 Semana.
* **Sugeridor de factores** probado contra el formato real del Catálogo (`MAN 453 G`, `BOT 1.89 LT`, `CAJ 700 PZA`, `ROLL 1000 PZA`…): ahora reconoce `HOJAS` (= piezas) y metros (`m`, `cm`); cuando la bodega cuenta por pieza y la presentación trae volumen o peso, el aviso explica que no hace falta factor.
* **Testing**: casos de hojas, metros y aviso de pieza; limpieza valida que toda opción de los tres menús exista (y las de DEV tras su guarda).

### Version 1.7.6s Altair — Encabezado del Inventario Rediseñado (Octubre 2026) [EN PRUEBAS · DEV]
* **Filas 2–5 del 📦 Inventario** (pendiente histórico de Ibrahim): desde la simplificación (1.7.6d) el título arrancaba en una columna oculta (se veía "ISE — KARDEX…"), las etiquetas SEMANA/FECHA/SUCURSAL quedaron desfasadas de sus valores y la fila 5 decía "DATOS DEL PRODUCTO" dos veces. Ahora (`_actualizarBadgeEstadoSemana`, `_limpiarEncabezadoInventario`): fila 2 = `📦 Inventario Andares` · `✅ Semana 40 · 28/09 al 04/10` (o `⏳ … falta avanzar`) · leyenda "ENT = entró · SAL = salió · SLD = lo que queda"; filas 3–4 limpias y ocultas; fila 5 "PRODUCTO". Sin el 🟢 que algunas fuentes dibujaban como un cuadro vacío.
* **G4 como única fuente de la semana**: el número de semana y el domingo se calculan desde G4 (`_isoWeek`) en configurar/avanzar semana y en el auto-avance; E4/I4 (decorativas) ya no se leen ni se escriben.
* **Retiradas las casillas de la fila 4** (Avanzar semana, Recrear vista, Nuevo producto, Anular producto) y sus funciones `agregarProducto`/`anularProducto`: el avance es automático, la vista la recrea 🚀 Configurar y altas/bajas van en el Powerhouse.
* Se aplica en 🚀 Configurar (paso "Kardex simplificado"), en el mantenimiento semanal y al reconstruir un Inventario.
* **Testing**: `kardex_vista.test.js` con el encabezado viejo real (combinaciones, casillas, E4) → limpio, filas ocultas, G4 intacta; `semana.test.js` al encabezado nuevo; emulador con `requireDate`.

### Version 1.7.6r Altair — Monitor de Progreso, Powerhouse al Día y Administradores (Octubre 2026) [EN PRUEBAS · DEV]
* **⏳ Monitor de progreso en diálogo sin bloqueo** (`ProgresoDialog.html`, `showModelessDialog`): 🚀 Configurar ya no espera en silencio a un alert final; abre una ventana que lanza el proceso (`ejecutarConMonitor`) y consulta su avance cada ~0.7 s (`leerProgreso`, `CacheService` 10 min): cada paso con ⏳/✅/❌, tiempo y detalle, barra de avance y "Cerrar" al terminar. Solo corren procesos de la lista `PROCESOS_MONITOREADOS`. `configurarEsteLibroBDG` → `_configurarBDGCore(rep)`.
* **⚡ Powerhouse**: edita unidad de pedido y factor (todos los campos habilitados, a pedido de Ibrahim); el servidor guarda el factor solo si es > 0 (si no, vacío = sin conversión); presentación y nombre en avisos escapados; textos con los nombres nuevos.
* **👥 Administradores** (`ADMINISTRADORES`, menú Protección): correos que, además del dueño, editan todo lo protegido (`_agregarAdministradores` en todas las protecciones). Sin esto, el Powerhouse usado por otra cuenta choca con el blindaje.
* **Roadmap 1.7.7** en `documentacion/plan_v1.7.7.md` ("Datos para decidir": reportes con tablas dinámicas, Mise Móvil, alertas).
* **Testing**: `progreso.test.js` (11 pasos con estado y tiempo, lista permitida, script real del diálogo con DOM mínimo, Powerhouse con unidad/factor e inválido → vacío); limpieza incluye el diálogo nuevo.

### Version 1.7.6q Altair — Catálogo: Presentación Visible y Factor Sugerido (Octubre 2026) [EN PRUEBAS · DEV]
* **Catálogo más limpio**: fila 3 (nombres técnicos) y CATEGORÍA ocultas (el código sigue leyendo la fila 3; la categoría la agrupa el Powerhouse); **PRESENTACIÓN visible** con etiqueta y ejemplo.
* **Factor sugerido desde la presentación** (`_sugerirFactorDesdePresentacion`, `_aplicarFactoresSugeridos`): "Domo 454 g" con unidad de bodega kg → unidad de pedido `domo`, factor `0.454`; convierte g/kg, ml/lt y piezas (con sinónimos y coma decimal), nombres de varias palabras ("Bolsa de polvo 800 g"). **Nunca pisa** una unidad o factor ya puestos; unidades incompatibles (g contra pz) van a revisión en el `🗒 Registro`, sin inventar. Corre al escribir una presentación (onEdit, con aviso), en 🚀 Configurar y desde el menú "⚖️ Llenar factores desde la presentación".
* **Testing**: `catalogo.test.js` — casos de conversión, no pisar, incompatibles y sin contenido; visibles/ocultas actualizadas.

### Version 1.7.6p Altair — Traspasos desde Registrar Entradas y Motor de Conversión Completo (Octubre 2026) [EN PRUEBAS · DEV]
* **🔄 Modo traspaso en `📥 Registrar entradas`** (celular): A2 pasa a ser el selector de modo (`📥 Entrada` · `🔄 Andares → Mercado` · `🔄 Mercado → Andares`; antes era la etiqueta "Día de carga"). En traspaso se usa una sola columna **TRASPASAR** (unidad de bodega): resta en el origen (SAL) y suma en el destino (ENT) el día elegido, todo dentro del libro de Bodega, con validación de semana activa de **ambas** bodegas, existencia en ambos inventarios y todo o nada; un folio por producto en `🔄 Traspasos` (`_procesarTraspasoEntradas`). Capturar en la otra columna en modo traspaso se rechaza. A2 entra en los rangos libres del blindaje; `_numEntrada` compartido.
* **⚖️ Motor de conversión (existía desde 1.7.4) completado**:
  - **Bug de unidades en la vista para tiendas**: `VISTA_MOVIL` mandaba el saldo/ENT/SAL del Kardex (p. ej. kg) con la etiqueta de la unidad de pedido (p. ej. domo) → la tienda veía otra escala y **el semáforo comparaba kg contra el mínimo en domos**. Ahora `_buildVista` divide entre el factor (fórmula viva sobre el Catálogo, `ROUND(…, 2)`).
  - **Regla única**: el factor solo aplica si el producto tiene `UNIDAD_TIENDA` (antes el descuento multiplicaba aunque la tienda viera y pidiera en la unidad de bodega).
  - **Catálogo**: "Unidad de pedido" y "1 de pedido = ¿cuánto en bodega?" visibles con ejemplos (fresa 0.454 kg/domo, guantes 100 pz/caja, conos 50 pz/paquete), validación (número > 0) y **solo el administrador** los cambia (protegidos 🔒): un factor mal puesto descuadra el inventario.
* **Testing**: `conversion_traspaso.test.js` — traspaso real (rechazo de la otra columna, SAL/ENT, folio, modo conservado); descuento real 24 domos → 10.896 kg, 2 cajas → 200 pz, factor sin unidad de pedido ignorado; fórmula de la vista con la división.

### Version 1.7.6o Altair — Bodega Para Todos: Pestañas por Tarea y Catálogo Híbrido (Octubre 2026) [EN PRUEBAS · DEV]
* **Pestañas con nombres por tarea**: `MAESTRO` → `📋 Catálogo`, `KARDEX_BA/BM` → `📦 Inventario Andares/Mercado`, `HISTORIAL_BA/BM` → `🗄 Semanas pasadas Andares/Mercado`, `📥 ENTRADAS` → `📥 Registrar entradas`, `🔄 TRASPASOS` → `🔄 Traspasos`, `🗒 LOG` → `🗒 Registro del sistema`. Las técnicas ocultas (`VISTA_MOVIL_*`, `_SYNC_*`, `_…`) no cambian: las tiendas las leen por IMPORTRANGE.
* **Compatibilidad durante el cambio**: `_hoja(libro, nombre)` acepta el nombre nuevo o el anterior (`NOMBRES_ANTERIORES`); todos los `getSheetByName` de Bodega pasan por ahí. `_nombreCanonico()` en onEdit/listas. `_renombrarHojasBDG()` (idempotente) corre en 🚀 Configurar, `onOpenBodegaInstalable` y el cierre de las 23:00. Las fórmulas que el código arma usan el **nombre real actual** (`_refHoja`, memorizado): nunca `#REF!` a mitad del renombrado, y las reglas con `INDIRECT("'KARDEX_BA'!…")` (que Google no actualiza al renombrar) ya no tienen el nombre escrito. `SHEET_TRASPASOS` se movió a `miseAuthBDG.js` (la usaba `HOJAS_TECNICAS_BDG` al cargar: error de orden de carga).
* **📋 Catálogo híbrido (tableta)** (`_prepararCatalogoAmigable`): fila 2 con **etiquetas claras** por columna ("Andares · bodega · mín.", "¿Activo?"…) y notas de ayuda, bandas de color Andares/Mercado; fila 3 técnica intacta. **Validaciones que rechazan**: ACTIVO solo SÍ/NO; MÍN/MÁX número ≥ 0 y en orden (`requireFormulaSatisfied`). Visibles solo categoría, producto, unidad, ACTIVO y los 8 MÍN/MÁX (bodega y tienda de cada sucursal); lo técnico oculto; anchos y alto de fila para tableta. **Protección**: solo ACTIVO + 8 MÍN/MÁX editables (`CATALOGO_EDITABLES`). Altas, bajas, nombres, picking y los mismos MÍN/MÁX siguen en ⚡ Powerhouse.
* **Retirados** (criterio *keep it simple*): botones por lote de la fila 2 (Desactivar/Activar/Eliminar/Limpiar seleccionados), la casilla SELECCIONAR visible y "Eliminar productos seleccionados" del menú — eso se hace en el Powerhouse.
* **Testing**: `nombres.test.js` (antes/después del renombrado, fórmulas con nombre real, idempotente, sin nombres viejos escritos en el código) y `catalogo.test.js` (libro con la fila 2 vieja combinada: etiquetas sin combinaciones, validaciones, visibles/ocultas, solo editables). Emulador con `setName`, notas y validaciones por fórmula; la suite de migración ya no reemplaza `setName` en el prototipo compartido (contaminaba otras suites).

### Version 1.7.6n Altair — Traspasos Solo desde Bodega (Septiembre 2026) [EN PRUEBAS · DEV]
* **Retirado el traspaso desde la tienda** (decisión de Ibrahim, 29/sep): `abrirDialogoTraspasoTiendaHTML`, `obtenerCatalogoParaTraspasoTienda`, `registrarTraspasoTiendaRPC`, `tienda/TraspasoTiendaDialog.html` y su opción de menú. Escribía en el Kardex y en `🔄 TRASPASOS` de Bodega con la cuenta de la tienda (chocaba con el blindaje), sin guarda de semana ni idempotencia, y como modal no aparecía en la app móvil. Los traspasos se registran desde Bodega (`🔄 Registrar Traspaso entre Sucursales`).
* `build-tienda` ya no copia el diálogo; pruebas de fuente única y limpieza actualizadas.

### Version 1.7.6m Altair — Revisión de HTML y Modales (Septiembre 2026) [EN PRUEBAS · DEV]
* **Inventario**: 4 HTML (`PickingDialog` 1,220 líneas · Powerhouse; `TraspasoDialog` Bodega; `TraspasoTiendaDialog` tienda; `EstadoSistema` página de estado) + el Reconciliador de huérfanos (HTML embebido en `abrirReconciliadorInteligenteHTML`). Todas sus llamadas `google.script.run` apuntan a funciones existentes. Única dependencia externa: SortableJS (jsDelivr) en el Powerhouse.
* **Escape de datos**: los diálogos insertaban nombres, categorías y unidades de productos como HTML sin escapar (un nombre con comillas o `<` rompía la lista o el campo de edición). `esc()` en los 3 diálogos; prueba en `limpieza.test.js` que impide insertar datos crudos.
* **Código muerto a nivel objeto**: `MiseReconciler` completo (sin ningún llamador; la cuarentena real la maneja `_ordenarYRenumerarTodo` con `MiseMatchingEngine`) y `MiseIdempotencyLedger.has` (reemplazado por `cargar()` en 1.7.6f). Encabezado de `MiseKardexEngine.js` corregido (mencionaba un `MiseMaintenance` inexistente).
* **Hallazgo pendiente de decisión**: `registrarTraspasoTiendaRPC` (diálogo de traspaso en la tienda) escribe directamente en `KARDEX_*` y `🔄 TRASPASOS` de **Bodega** con la cuenta de quien lo usa: con el blindaje de 1.7.6c probablemente falla para cuentas de tienda, no tiene guarda de semana ni idempotencia, y los modales no se muestran en la app móvil de Sheets.

### Version 1.7.6l Altair — Auditoría del Descuento: Reconciliación No Destructiva y Guarda de Semana (Septiembre 2026) [EN PRUEBAS · DEV]
* **`reconciliarSemanaCompleta` era destructiva**: corría el descuento completo 7 veces desde el lunes; en la primera corrida leía el **pedido en curso de HOY** de cada tienda, lo descontaba **como si fuera del lunes** y **vaciaba el pedido y borraba el Surtido Rápido** en plena operación. Además usaba la semana de Andares para ambas bodegas y reconstruía vistas + push 7 veces (~5 min, junto al límite de 6). Ahora: solo los **días pasados** de la semana activa de **cada** Kardex, solo desde `🗒 LOG_SURTIDO` (idempotente), vistas y push una sola vez y solo si hubo descuentos; no se anota como cierre nocturno.
* **`ejecutarDescuento(silent, fecha, opciones)`**: `soloRegistros` (nunca lee ni vacía el pedido en curso), `sinVistas`, `sinHistorial`; devuelve `fueraDeSemana`.
* **Guarda de semana por bodega**: si la fecha objetivo no está en la semana activa de ese Kardex (`_lunesSemanaActivaKardex`), no se descuenta **ni se vacía el pedido** (WARN en el LOG y aviso en el resumen). Antes caía en la columna del mismo día de otra semana; aplica también al cierre de las 23:00.
* **Corrección a 1.7.6j**: "Descontar pedidos de ayer" tomaba el pedido **en curso** como si fuera de ayer y lo vaciaba; ahora usa `soloRegistros` (lo de ayer lo registró la tienda en su reset de las 00:00).
* **Testing**: `smartsync.test.js` con semana activa fija (antes dependía de la fecha real de la máquina), guarda de semana (falla con 1.7.6k), reconciliación que respeta pedido y Surtido en curso y no duplica, "ayer" sin tocar el pedido de hoy.

### Version 1.7.6k Altair — Esquema 3 de Tiendas y Push Remoto Solo Cuando Hace Falta (Septiembre 2026) [EN PRUEBAS · DEV]
* **Esquema 3 de 📋 PEDIDO DIARIO** (`MISE_SCHEMA_TIENDA = 3`): la migración nocturna **borra físicamente la columna J reservada** (ex ADICIÓN) con respaldo nativo y capturas en RAM; MÍN|MÁX pasa de K a J y las auxiliares de L:O a K:N (Google recorre contenido y ajusta rangos). Idempotente y segura en reintento.
* **Estructura detectada por el encabezado, no por constantes** (`_layoutPedido(sheet)`, caché por ejecución): el código nuevo opera igual sobre una tienda que aún no migra (esquema 2), a media migración o en reintento. Anchos, columnas ocultas, alineación, encabezado, constructor de filas (`_filaPedido`), auxiliares y **reglas de formato condicional** (letras calculadas: `=$K4="NO"`, semáforo sobre L/M/N) salen del layout. `NUM_COLS` y `COL_AUX` fijos desaparecen.
* **Bodega respeta la estructura de cada tienda**: `_reordenarPedidoRemotoDirecto` detecta el esquema por el encabezado remoto y escribe A:J (3) o A:K con J vacía (2), sin pisar las auxiliares. El cierre nocturno ya **no limpia la columna J** (en el esquema 3 es MÍN|MÁX) y restaura fondos solo en A:J.
* **Push remoto solo cuando hace falta** (`sincronizarRemotamenteTiendasPush`): compara la columna de productos de `_SYNC` (antes de refrescar) con la vista nueva; si las **posiciones** no cambiaron (picking, activos, renombres en su lugar, cierre nocturno) solo refresca el enlace y la tienda se reordena sola por huella (1.7.6i). Con altas/bajas (el Kardex se reconstruye y recorre filas) sigue reordenando **antes** de refrescar, para no pegar capturas al producto equivocado. Menos escritura cruzada; el push del cierre y del Powerhouse debería bajar (medir en la página de estado).
* **Emulador más fiel**: `deleteColumns`/`insertColumnsAfter` recorren celdas y combinaciones como Google (antes `deleteColumns` no hacía nada).
* **Testing**: migración 2→3 con libro realista (encabezado con MÍN|MÁX en K y auxiliares L:O): J eliminada, MÍN|MÁX de cada producto en J, auxiliares K:N, reglas recorridas, reintento; compatibilidad **antes** de migrar (reglas en L:O, MÍN|MÁX intacto en K); push con posiciones iguales vs cambiadas; escritor remoto con tiendas en esquema 2 y 3.

### Version 1.7.6j Altair — Fase 2: Limpieza, Herramientas Solo en DEV y Contraseña de Administrador Rotada (Septiembre 2026) [EN PRUEBAS · DEV]
* **🔐 Contraseña de administrador fuera del código**: se eliminó el respaldo escrito en el código (y su mención en la documentación) de `setupCompleto` en Bodega y tiendas. Ahora vive solo como huella SHA-256 (`ADMIN_PASSWORD_HASH`, `_hashAdmin`); solo el dueño del libro la define o cambia (`cambiarPasswordAdmin`, menú 🔐, mínimo 10 caracteres, exige la actual); sin contraseña definida lo destructivo queda bloqueado (`_validarPasswordAdmin`). La propiedad en texto plano `ADMIN_PASSWORD` se borra al definir la nueva. La contraseña anterior sigue en el historial público de git, pero ya no abre nada.
* **Bug: el restablecimiento de la tienda ignoraba la confirmación final** (con "No" borraba igual). Ahora aborta; y el restablecimiento conserva enlace con Bodega, contraseña y `MISE_ENV` (antes un libro DEV quedaba sin su marca de entorno).
* **Herramientas de desarrollo solo en DEV** (`bdg/MiseDevTools.js`, `tienda/MiseDevTools.js`; `IGNORE_PROD` las excluye, `build-tienda` las copia): plantilla e inyección de recuperación forense (Bodega), datos aleatorios y forzar LOG_SURTIDO (tienda). Sus opciones de menú aparecen solo si el archivo existe (guarda `typeof`). `verificar_prod.sh` las ignora.
* **Código muerto fuera** (quitado con parser, no con regex): 9 funciones en Bodega (`crearVistaMovilBA/BM` duplicadas, `runTests`, `limpiarProps`, `crearHojaCargaMasiva`, `crearHojaEdicionMasiva`, `abrirPowerhouse`, `obtenerProductosPickingHTML`, `_validarOAvanzarSemanaBDG`), 5 en tiendas (`invalidarCache`, `instalarTriggers`, `desinstalarTriggers`, `avanzarSemanaInfo`, `sincronizarEstados`) y la reconciliación de un solo uso del 7/sep (`reconciliarLunes7Septiembre*`). ~1,000 líneas menos. `crearVistaMóvilBA/BM` → nombres ASCII.
* **Logs unificados en `MiseLogger`**: fuera las envolturas `_log` (Bodega, 21 usos) y `registrarLog` (tienda, 14 usos; registraba los `WARN` como `INFO`).
* **Menú**: "Descontar pedidos de ayer (Manual)" descontaba HOY; ahora `descontarSurtidoAyerManualmente` usa la fecha de ayer (idempotente).
* **Testing**: `limpieza.test.js` (toda opción de menú apunta a una función que existe en PROD o está tras la guarda de DevTools; sin funciones sin referencias ni duplicadas; DevTools excluido de PROD) y `password.test.js` (bloqueo sin contraseña, solo el dueño, huella cifrada, la anterior ya no sirve, "No" en la tienda no borra, la contraseña anterior no aparece en código ni documentación).

### Version 1.7.6i Altair — Fase 3: Tiendas Suscritas al Catálogo por Huella (Septiembre 2026) [EN PRUEBAS · DEV]
* **🔔 Suscripción sin `_META` ni activadores**: el catálogo ya viaja a cada tienda por el `IMPORTRANGE` de `_SYNC`, así que la tienda calcula localmente una **huella** (`_huellaCatalogo`: producto · activo · picking, ordenada; el saldo no cuenta) y, si difiere de la última aplicada (`CATALOGO_HUELLA`), corre `ordenarPedido()` (orden de picking + inactivos) por su cuenta (`_sincronizarSiCambioCatalogo`). Corre al abrir (instalable) y en el reset de las 00:00; **no** al editar, para no mover filas mientras alguien captura. Nunca reordena si `_SYNC` está cargando o con error (`_leerCatalogoSync` → `null`).
* **Bodega compara sin abrir tiendas de más**: `bdg/MiseEstado.js` calcula la misma huella desde `VISTA_MOVIL_*` y la contrasta con la que reporta el latido (`CATALOGO_HUELLA`, `CATALOGO_APLICADO`): componente **Catálogo (orden y activos)** al día / pendiente en la página de estado.
* **🚀 Configurar** registra la huella tras ordenar (no reordena dos veces al abrir).
* El push remoto del Powerhouse se mantiene por ahora (aplica el cambio al instante); la suscripción es la red que garantiza que la tienda converja aunque el push falle o la tienda esté cerrada.
* **Testing**: misma huella en tienda y Bodega (código real de ambos), el saldo no altera la huella, reordena solo ante cambios, nunca con el enlace cargando, semáforo del catálogo.

### Version 1.7.6h Altair — Fase 3: Página de Estado (Webapp de Bodega) (Septiembre 2026) [EN PRUEBAS · DEV]
* **🌐 Página de estado** (`bdg/EstadoSistema.html`, `doGet` en `MiseEstado.js`): webapp de Bodega tipo Downdetector, publicada como *Ejecutar como: yo · Acceso: solo yo* (`appsscript.json → webapp`). Muestra estado general, semáforo por componente (Bodega, Andares, Mercado), cierres nocturnos con barras apiladas por fase, incidentes de 7 días (Bodega + tiendas), productos bajo mínimo, próximas ejecuciones, minutos de ejecución del día contra el límite de 90 y accesos directos (Bodega, Entradas, ambos Kardex, Maestro, Log y las dos tiendas): lo que era 🏠 INICIO. Paleta LCP, Crystal & Squircle, modo oscuro automático y diseño móvil primero.
* **Datos**: `obtenerEstadoWeb(forzar)` devuelve el resumen de `obtenerEstadoSistema()` + accesos como **texto JSON** (google.script.run no transporta objetos `Date` anidados). Todo texto de datos se escapa (`esc()`) antes de insertarse en la página.
* **Menú**: `🌐 Abrir página de estado` (usa `ScriptApp.getService().getUrl()`; si aún no se publica, explica cómo).
* **Tiendas**: 🚀 Configurar ahora late al terminar (el estado se ve al día al momento).
* **Testing**: la suite de estado ejecuta el script real de la página con un DOM mínimo y el resumen real (todas las secciones, sin `undefined`/`NaN`, HTML de un log escapado) y verifica que las funciones llamadas por `google.script.run` existan; emulador con `getUrl`, `getId`, `getSheetId` y `addMetaTag`.

### Version 1.7.6g Altair — Fase 3: Latido de Tiendas y Resumen de Salud en Bodega (Septiembre 2026) [EN PRUEBAS · DEV]
* **💓 Latido por eventos, sin activador nuevo** (`_latidoTienda`): cada tienda escribe su hoja técnica `_ESTADO` (clave/valor: versión, esquema, entorno, último latido y su origen, último reset y su error, activadores, `_SYNC` vivo). Late en el reset de las 00:00 y el respaldo de las 04:00 (forzado), y al abrir y editar con los instalables (como máximo 1 escritura cada 10 min; el resto solo compara `LATIDO_TS`). Se descartó el activador cada 10 min (~10–15 min/día de cuota compartida entre los 3 libros).
* **Reset con constancia**: `_resetearPedidoSilencioso` envuelve al núcleo (`…Core`) y registra `ULTIMO_RESET_TS` / `ULTIMO_RESET_ERROR`, para distinguir "no corrió" de "corrió con error".
* **🩺 Resumen de salud** (`bdg/MiseEstado.js`): `obtenerEstadoSistema(forzar)` devuelve un JSON con Bodega (versión, activadores, historial de 14 cierres con fases, semana de cada Kardex, productos bajo mínimo, incidentes WARN/ERROR de 7 días, minutos del día aprox.), cada tienda (su `_ESTADO`, incidentes y minutos de `_LOGS`) y un semáforo por componente (`_evaluarComponentes`, reglas: latido ≤24 h/≤48 h, reset y cierre ≤26 h, activadores esperados, `_SYNC`, versión igual a Bodega). Bodega **solo lee** las tiendas; el resumen se guarda en `_ESTADO_SISTEMA` (hoja técnica, oculta y blindada) con vigencia de 10 min. Se recolecta al final del cierre de las 23:00.
* **Historial de cierres** (`_registrarCierre`): `MiseSmartSync` guarda éxito/error, duración, fases, insumos y si fue manual (`HISTORIAL_CIERRES`).
* **Menú**: `🩺 Estado del sistema` en Automatizaciones (vista en alerta mientras llega la página de estado, 1.7.6h).
* **Testing**: `estado.test.js` (integración tienda → Bodega con el `_ESTADO` real, semáforo, caché sin abrir tiendas, reglas de antigüedad); emulador con `getFormula`.

### Version 1.7.6f Altair — Descuento Nocturno: Sin Doble Descuento al Reintentar y Menos Llamadas (Septiembre 2026) [EN PRUEBAS · DEV]
* **Bug latente de doble descuento** (`MiseSmartSync.ejecutarDescuento`): la vía de respaldo relee `🗒 LOG_SURTIDO` y solo descartaba los renglones descontados *en la misma corrida*. Al re-ejecutar la misma fecha (reintento de 00:00–05:00 o botón manual), los renglones que escribió la 1a corrida se descontaban otra vez (prueba: Fresa 3 → 5). Ahora también se descartan si su hash directo (`…_pedido`) ya está en el ledger.
* **Lista de idempotencia cargada una vez** (`MiseIdempotencyLedger.cargar()` → `Set`): antes se leía de Script Properties y se decodificaba (hasta 2000 hashes) por cada renglón procesado.
* **Kardex sin lecturas intercaladas**: una lectura de la columna SAL del día por bodega y escrituras solo en las celdas que cambian; el nombre del producto sale de la lectura ya hecha. Antes: 3 llamadas por producto alternando lectura/escritura (cada lectura obliga a aplicar las escrituras pendientes).
* **`🗒 LOG_SURTIDO` por cola** (`SMARTSYNC_LOG_VENTANA = 400`): solo los últimos renglones; el índice absoluto del renglón se conserva en el hash, así que los hashes ya registrados siguen siendo válidos.
* **Tiempo por fase en el `🗒 LOG`**: `tiendas · log · kardex · vistas · push`, para decidir la siguiente optimización con datos (114 s el 28/sep).
* **Testing**: `smartsync.test.js` (tiendas remotas emuladas por ID): cantidades por regla, re-ejecución idempotente (falla con 1.7.6e), respaldo desde el log una sola vez y ≤ 2 lecturas del ledger por corrida (antes 7).

### Version 1.7.6e Altair — Hotfix 1.7.5s Integrado, Retiro de ADICIÓN y de 🏠 INICIO (Septiembre 2026) [EN PRUEBAS · DEV]
* **Integra el hotfix 1.7.5s** en la fuente única: `setValues` en las tablas mixtas de PEDIDO DIARIO (tienda y escritura remota de Bodega), estado del `🗒 LOG_SURTIDO` normalizado y deducido, encabezado garantizado (`_asegurarEncabezadoLogSurtido`).
* **Retiro de la función ADICIÓN** (heredada, en desuso desde 1.6.1): sin regla de formato `$J4="🚨 ADICIÓN"`, sin resaltado naranja en Surtido, sin captura/restauración de la columna J y **sin columna `EsAdición` en `🗒 LOG_SURTIDO`** (7 columnas; el encabezado antiguo se limpia). La columna J de PEDIDO DIARIO queda **reservada vacía** (sin desplazar índices); su eliminación física va con la migración de esquema 3.
* **Bug: borrar CANT. A PEDIR no sacaba el producto de Surtido Rápido**: `onEdit` terminaba al vaciar la celda (solo limpiaba la marca de ADICIÓN) y el producto cancelado seguía por surtir. Ahora continúa y regenera el Surtido.
* **Retiro de la hoja `🏠 INICIO`** (por decisión de producto; la idea pasa a la Web App, plan Fase 4). `🚀 Configurar` la elimina si existía y conserva el orden/color de pestañas.
* **Testing**: `log_surtido.test.js` (filas reales del 28/sep); `kardex_vista.test.js` (antes `inicio.test.js`); migración sin ADICIÓN; emulador con `setFormulas` → `#NAME?` e `insertRowBefore`.

### Version 1.7.6d Altair — Kardex Simplificado y Portada 🏠 INICIO en Bodega (Septiembre 2026) [EN PRUEBAS · DEV]
* **Kardex simplificado** (`_simplificarVistaKardex`, `KARDEX_COLS_OCULTAS = [1,2,4,6,7,8]`): visibles solo PRODUCTO (C), UNIDAD (E), SALDO ANT (I) y las 21 columnas de los 7 días; se ocultan No, CATEGORÍA, PRESENTACIÓN, CADUCIDAD, LOTE (incluida la fecha G4) y 🚦, que siguen existiendo porque el código las usa por posición. Se aplica al construir el Kardex, en `🚀 Configurar` y en el mantenimiento dominical. La semana se lee en el badge (L2) y en E4/I4.
* **`🏠 INICIO`** (primera pestaña): enlaces internos `HYPERLINK("#gid=…")` a Entradas, Kardex BA/BM, MAESTRO y LOG (funcionan en la app móvil); **acciones con casillas** (avanzar semana, enviar catálogo a tiendas, recargar Entradas, actualizar estado) procesadas por `_onEditBodega` en el `onEdit` instalable (como el dueño), con resultado y hora junto a cada acción; **estado del sistema en la hoja** (`_estadoSistemaBDG`: versión, entorno, semana de cada Kardex, último cierre, activadores, conexiones), refrescado también en el cierre nocturno. Hoja blindada salvo las casillas.
* **Pestañas ordenadas y coloreadas por uso** (`_organizarPestanasBDG`): INICIO → Entradas → Kardex → MAESTRO → historial/traspasos/LOG.
* **Testing**: `tests/suites/inicio.test.js`; el emulador de Bodega registra protecciones (`_proteccion.libres`) como el de tiendas.

### Version 1.7.6c Altair — Blindaje por Capas: Instalables como Dueño y Hojas Técnicas Protegidas (Septiembre 2026) [EN PRUEBAS · DEV]
* **Causa raíz del histórico "Surtido se pinta pero PEDIDO no recibe cantidad/estado"**: el `onEdit` simple corre con los permisos de **quien edita**; las cuentas de tienda (propias, no el dueño) no pueden escribir en celdas protegidas (`PEDIDO DIARIO` H/I, Surtido D, hojas técnicas) y esas escrituras fallaban en silencio. Mismo riesgo en Bodega (casillas de MAESTRO/KARDEX, Enviar de `📥 ENTRADAS`).
* **Todo el manejo de edición/apertura en instalables (corren como el dueño)**: tiendas `onEditTiendaInstalable` + `onOpenTiendaInstalable` (reset del día y aviso de conexión); Bodega `onEditBodegaInstalable` ahora ejecuta toda la lógica de `_onEditBodega` (antes solo el push). Los `onEdit`/`onOpen` simples no hacen nada si existe su instalable (`ONEDIT_INSTALABLE` / `ONOPEN_INSTALABLE`), evitando duplicados; sin instalable conservan el comportamiento anterior. `🚀 Configurar` crea 4 activadores por libro.
* **Hojas técnicas blindadas** (`_blindarHoja`): Bodega — VISTA_MOVIL_*, HISTORIAL_*, _HISTORIAL_RESPALDO, 🗒 LOG, _DICCIONARIO_ALIAS, ⚠️ REVISIÓN_HUÉRFANOS, _SYNC_LOG_*, 🔄 TRASPASOS (solo el dueño; las de sistema, ocultas). Tiendas — toda hoja que empiece con `_`, `🗒` o `🔄` (`_SYNC_*`, `_LOGS`, `_RESPALDO_*`, `🗒 LOG_SURTIDO`), ocultas las `_`. **`📥 ENTRADAS`** protegida salvo cantidades (C:D), día (B2) y Enviar (D2).
* **KARDEX**: se elimina el desbloqueo heredado de F:G (eran CADUCIDAD/LOTE, ya no existen como tales) y **G4 queda protegida** (la semana avanza sola).
* **`🔐 Auditoría de permisos`** (Bodega y tiendas): por hoja, si está protegida, quién edita, qué rangos quedan libres y si está oculta; también en `🗒 LOG`. `🚀 Configurar` incluye el paso "Blindaje" y reporta hojas sin protección.
* **Testing**: `tests/suites/blindaje.test.js` (simple se abstiene / instalable sincroniza H/I; hojas técnicas protegidas y ocultas); `nivel1.test.js` con 4 activadores de tienda.

### Version 1.7.6b Altair — Fase 2: Fuente Única de Tiendas y Constructor Único del Pedido (Septiembre 2026) [EN PRUEBAS · DEV]
* **Fuente única `tienda/miseTienda.js`** (+ `TraspasoTiendaDialog.html`, `appsscript.json`): `pda/miseAuthPDA.js` y `pdm/miseAuthPDM.js` eran dos copias de ~2,000 líneas que solo diferían en la cabecera, los valores por defecto de sucursal (`"BA"/"Andares"` vs `"BM"/"Mercado"`), el nombre del instalador y espacios, y aun así se habían desincronizado antes (log de surtido). Ahora `scripts/build-tienda.js` **genera** ambos (gitignored) con su cabecera y `const MISE_SUCURSAL_DEFAULT`; la sucursal real sigue saliendo de las propiedades `BODEGA_KEY`/`BODEGA_NOMBRE`. La cabecera generada indica el desfase de líneas para ubicar trazas (`miseAuthPDA:N` → línea N + 1 en la fuente).
* **Instalador unificado**: `instalarActivadoresMedianochePDA/PDM` → `instalarActivadoresTienda`.
* **Constructor único de filas `_filaPedido(r, sr, no, capturas)`**: reemplaza 3 copias idénticas de las fórmulas A:K en `_actualizarAvisoPedido`, `ordenarPedido` y `_reconstruirPedidoDiarioCore`. (El escritor remoto de Bodega, `_reordenarPedidoRemotoDirecto`, desaparece en la Fase 3.)
* **Integración**: `mise-env.js` (gen y push), `tests/run_all.js`, `check_syntax.js` y `verificar_prod.sh` generan las tiendas antes de actuar.
* **Testing**: `tests/suites/tienda_unica.test.js` (las copias solo difieren en cabecera, guía de trazas y sucursal por defecto); las suites de migración verifican el texto exacto de las fórmulas del constructor único.

### Version 1.7.6a Altair — Fase 1: Entradas por Bodega y Retiro del Registro Rápido (Septiembre 2026) [EN PRUEBAS · DEV]
* **Bug: `📥 ENTRADAS` validaba la semana solo contra `KARDEX_BA!G4`** (`_lunesSemanaActivaKardex`). Con Mercado atrasada (caso real hasta el 28/sep), sus entradas caían en la columna del día de otra semana. Ahora `_lunesSemanaActivaKardex(ss, key)` y `_resolverDiaEntradas(ss, seleccion, key)` validan **por bodega**: con `HOY`, cada bodega usa su propia semana activa; con un día elegido, la bodega debe estar en la misma semana que muestra el selector. Si una bodega con capturas está desfasada, el envío completo se bloquea nombrándola (todo o nada).
* **Retiro de `⚡ Registro Rápido (PC)`**: función retirada por decisión de producto (Bodega pasa a flujo mobile-first con `📥 ENTRADAS`). Eliminados `abrirRegistroRapidoHTML`, `obtenerCatalogoKardexParaRegistro`, `registrarMovimientoRapidoKardex` (reemplazaba ENT/SAL con `setValue` en lugar de sumar y podía pisar el SAL del descuento nocturno), su opción de menú y `bdg/RegistroRapidoDialog.html`.
* **Testing**: `entradas.test.js` con Mercado una semana atrás (bloqueo con su nombre, sin escribir) y Andares al día (se envía).

### Version 1.7.5 Altair — Operación Autónoma: Entradas Móviles, Semana Indestructible, Descuento Real y Tiendas que se Actualizan Solas (Septiembre 2026) [VERSIÓN OFICIAL · PROD]
Consolida 19 iteraciones (`1.7.5a`–`1.7.5s`, 24–29/sep) validadas en operación real en BDG, PDA y PDM.

* **📥 Entradas móviles → Kardex** (a, i, j): hoja `📥 ENTRADAS` que **suma** a ENT del día elegido (selector de día, validación de semana activa), filas táctiles; apertura de libros tolerante (`_abrirLibro` por ID); aviso de conexión fuera de la tabla y estados normalizados (`_normalizarEstado`).
* **📅 Avance de semana confiable** (b, n, o, p, q, r): ambos Kardex avanzan en el cierre dominical y en `onOpenBodegaInstalable`; badge de semana visible; bloques huérfanos de HISTORIAL limpiados hasta el final de la hoja; `_archivarSemanaSeguro` como red; causa raíz de KARDEX_BM: error **diferido** del `breakApart` del badge de BA que cortaba parte de una combinación (`_separarCombinaciones` + `flush()` dentro del `try`).
* **🎯 Solo se descuenta lo recibido** (c, d, s): Surtido Rápido con CANT. FINAL y color por fila; descuento nocturno 23:00 sin registro → 0 (`SIN_REGISTRO`), idempotente; `setValues` en tablas mixtas (adiós `#NAME?`); estado del `🗒 LOG_SURTIDO` normalizado/deducido y encabezado garantizado.
* **🔗 Tiendas autónomas** (e, g, h, m): motor de migración versionado (`MISE_SCHEMA_TIENDA`, respaldo `copyTo`, capturas en RAM por nombre, reintento y verificación); `🚀 Configurar este libro` en un clic; `onEdit`/`onOpen` instalables (corren como dueño); enlace `_SYNC` vivo; celdas combinadas respetan la frontera congelada; push remoto reordena antes de refrescar el enlace.
* **⚡ Powerhouse y picking** (f, k, l): enlaces **por nombre de producto** (fin de "se pinta/desactiva otro producto" con picking personalizado); guardado por fases en paralelo (~30 s, antes 1–2 min) sin reconstruir Kardex salvo altas; *Acerca de* con versión única (`MISE_VERSION`) y estado del sistema (activadores, último cierre, conexión).
* **🧪 Ingeniería**: pruebas del código real en VM con emulador fiel (combinaciones vs congeladas, errores diferidos, `#NAME?`); `scripts/mise-env.js` DEV/PROD con candado de pruebas y verificación de contenedor; `version.test.js`, `metodos.test.js` (métodos inexistentes de Apps Script).

<details>
<summary>Detalle por iteración (1.7.5a – 1.7.5s)</summary>

### Version 1.7.5s Altair — Hotfix: ESTADO "#NAME?" en PEDIDO DIARIO y Log de Surtido (Septiembre 2026) [PROD]
* **Causa del semáforo de PEDIDO DIARIO sin colores tras la migración**: las reconstrucciones de la tabla (`ordenarPedido`, `_reconstruirPedidoDiarioCore`, inserción de filas nuevas en tiendas y `_reordenarPedidoRemotoDirecto` en Bodega) escribían la matriz completa con `setFormulas()`. Google interpreta los textos sin `=` ("COMPLETO", "PARCIAL", "🚨 ADICIÓN") como fórmulas inválidas → `#NAME?`; las reglas `$I4="COMPLETO"` dejaban de cumplirse y el `🗒 LOG_SURTIDO` registraba `#NAME?`. Ahora se usa `setValues()`, que conserva como fórmula lo que empieza con `=` y como texto lo demás.
* **Estado del log deducido**: tienda (`_registrarLogSurtidoDiario`) y Bodega (`_estadoLogSurtido`) normalizan el estado; si falta o está roto, lo toman de ✅/❌ o lo deducen de la cantidad (`COMPLETO`/`PARCIAL`/`EXCEDENTE`). `SIN_REGISTRO` solo cuando no hay nada registrado (antes: "0 pedido · 1 recibido · SIN_REGISTRO").
* **Encabezado de `🗒 LOG_SURTIDO`** (`_asegurarEncabezadoLogSurtido`): Bodega escribía en `getLastRow()+1`; con la hoja vacía caía en la fila 1 y sustituía el encabezado (se veía una hora en lugar de "Fecha"). Ahora se repone el encabezado (insertando una fila arriba si hacía falta) y se escribe desde la fila 2.
* **Testing**: el emulador convierte en `#NAME?` el texto enviado con `setFormulas` (como Google); la suite de migración falla con 1.7.5r y pasa con el hotfix.

### Version 1.7.5r Altair — Causa Raíz Real de KARDEX_BM: Error Diferido del Badge de BA (Septiembre 2026) [PROD]
* **Diagnóstico con la traza de PROD** (`miseAuthBDG:5066:37`, el `getValue()` de `G4` de KARDEX_BM): Apps Script aplica las escrituras en lote y **un fallo de `merge()`/`breakApart()` aparece en la SIGUIENTE lectura**, no donde se originó. BA se procesa primero y al final dibuja su badge; `_actualizarBadgeEstadoSemana` separaba `L2:P2`, un **pedazo** del título combinado `D2:AD2`. El error diferido escapaba del `try/catch` del badge y reventaba al leer `G4` de BM. Desde 1.7.5o lo destapó el cambio de `breakAtMerge` (inexistente, no hacía nada) a `breakApart` (sí ejecuta).
* **`_separarCombinaciones(range)`**: separa cada combinación que toque el rango, completa (`getMergedRanges().forEach(breakApart)`), nunca un pedazo. Aplicado al badge, a la fila 2 de MAESTRO, la fila 1 de VISTA, la fila 5 del Kardex y la limpieza de huérfanos del HISTORIAL.
* **Badge con `SpreadsheetApp.flush()` dentro del `try`**: cualquier error futuro del dibujo se atrapa ahí (WARN en LOG) y no afecta el avance.
* **Emulador fiel a Apps Script**: los conflictos de `merge()`/`breakApart()` se difieren hasta la siguiente lectura o `flush()`, igual que en Google.
* **Testing**: `semana.test.js` reproduce el título `D2:AD2` de PROD (falla con `f505803`, pasa con el fix).

### Version 1.7.5q Altair — Avance de Semana Indestructible (Septiembre 2026) [PROD]
* **1.7.5p no bastó en PROD** (mismo error): cada intento fallido alcanzaba a ejecutar `insertColumnsAfter(startCol - 1, 16)` **dentro** del encabezado huérfano antes de fallar en `merge()`, y Google ensanchaba la combinación 16 columnas por intento (fue creciendo a cientos). La limpieza de 1.7.5p separaba solo 16 columnas → "separar parte de una combinación" → mismo error. Ahora se separa y limpia desde el huérfano **hasta el final de la hoja**.
* **Red de seguridad `_archivarSemanaSeguro()`**: si `_guardarHistHorizontal` falla por cualquier causa, la semana se respalda en `_HISTORIAL_RESPALDO` (filas simples: bodega, semana, lunes, producto, ENT/SAL por día, SLD FIN; sin combinaciones) y el avance continúa (saldos → SALDO ANT, limpieza, G4). Aplica al avance silencioso y al manual.
* **Diagnóstico**: el error de `_autoVerificarYAvanzarSemanaSilencioso` indica la función donde ocurrió (desde `e.stack`) y queda en `🗒 LOG` como `ERROR`.
* **Testing**: `semana.test.js` simula el huérfano ensanchado por 3 intentos (falla con `9c4f728`, pasa con el fix) y el respaldo cuando el historial falla.

### Version 1.7.5p Altair — HISTORIAL: Bloques Huérfanos ya no Bloquean el Avance (Septiembre 2026) [PROD]
* **Causa raíz de "KARDEX_BM no avanza"**: un archivado interrumpido (p. ej., el `onOpen` simple cortado a los 30 s) dejó en `HISTORIAL_BM` un encabezado combinado de 15 columnas **sin datos debajo**. `_guardarHistHorizontal` calculaba el siguiente bloque con `getLastColumn()+1`, que solo ve la primera celda con texto de esa combinación: el bloque nuevo caía dentro de ella, `insertColumnsAfter` la ensanchaba y la nueva `merge()` fallaba con "Debes seleccionar todas las celdas de un intervalo combinado…". El error se repetía en cada intento, así que Mercado no volvía a avanzar sola; Andares nunca tuvo un archivado interrumpido.
* **`_siguienteColumnaHistorial(hSheet, numRows)`**: detecta bloques huérfanos al final (encabezado combinado en fila 2 sin datos en filas 5+), los separa y limpia (con `WARN` en `🗒 LOG`), y calcula la columna siguiente con el fin de las celdas combinadas (`getMergedRanges`) además de la última columna con contenido.
* **Emulador**: combinar o separar encima de una combinación parcial lanza el mismo error que Google; `getMergedRanges`, `insertColumnsAfter` ensancha/desplaza combinaciones; `getMaxColumns/Rows` nunca menores que el contenido o las combinaciones.
* **Testing**: `semana.test.js` reproduce el `HISTORIAL_BM` con bloque huérfano (falla con `9c22c48`, pasa con el fix).

### Version 1.7.5o Altair — Badge de Semana Visible (método inexistente) (Septiembre 2026) [PROD]
* **Bug heredado (desde 1.6.2a): el badge de semana del Kardex nunca se pintaba**. `_actualizarBadgeEstadoSemana`, `_buildVista` y otras 3 rutinas llamaban `Range.breakAtMerge()`, que **no existe** en Apps Script (el método es `breakApart()`). Al estar en `try/catch`, fallaba en silencio: las combinaciones previas de la fila 2 no se deshacían y la combinación `L2:P2` del badge chocaba con el título original, error también silenciado. 5 reemplazos por `breakApart()`.
* **Testing**: el emulador tenía un `breakAtMerge` falso que ocultaba el bug (eliminado). Nueva suite `tests/suites/metodos.test.js` con una lista de métodos inexistentes conocidos que falla si aparecen en `bdg/`, `pda/` o `pdm/`.

### Version 1.7.5n Altair — onOpen Instalable: Ambos Kardex Avanzan al Abrir (Septiembre 2026) [PROD]
* **Bug: KARDEX_BM no avanzaba solo** (sí BA): el avance al abrir corría en el `onOpen` simple (límite de 30 s) con tope de 18 s desde 1.7.5b; Andares consumía el tiempo y Mercado quedaba "para la siguiente apertura". Además, `_actualizarBadgeEstadoSemana` se llamaba con `true` aunque la bodega no hubiera avanzado, así que BM mostraba "🟢 SEMANA ACTUALIZADA" estando atrasada.
* **`onOpenBodegaInstalable`**: activador `onOpen` instalable (6 min, permisos completos) creado por `_reiniciarActivadoresBDG` / `🚀 Configurar`; ejecuta `_autoVerificarYAvanzarSemanaSilencioso` sin tope (ambos Kardex en la misma apertura) y prepara `📥 ENTRADAS` si falta. Con la propiedad `ONOPEN_INSTALABLE = "1"`, el `onOpen` simple omite ese trabajo; sin ella, conserva el respaldo con tope.
* **Badge honesto**: "🟢 SEMANA XX ACTUALIZADA" solo si la semana activa está al día; si no, "⏳ SEMANA XX PENDIENTE DE AVANZAR".
* `ACTIVADORES_ESPERADOS_BDG` incluye `onOpenBodegaInstalable` (diagnóstico y Acerca de avisan si falta).
* **Testing**: `semana.test.js` (badge pendiente, avance de ambos con el instalable) y `nivel1.test.js` (4 activadores).

### Version 1.7.5m Altair — Push a Tiendas: Reordenar antes de Refrescar el Enlace (Septiembre 2026) [PROD]
* **Riesgo de pérdida de capturas introducido en 1.7.5g** (`sincronizarRemotamenteTiendasPush`): el push refrescaba `_SYNC!A4` (clear + `setFormula`) y **después** `_reordenarPedidoRemotoDirecto` leía los nombres del pedido (fórmulas hacia `_SYNC`) para conservar CANT. A PEDIR / RECIBIDA / ESTADO. Con el `IMPORTRANGE` recargando, los nombres podían leerse vacíos, todos los productos se trataban como nuevos y el pedido se reescribía sin las cantidades del día. Ahora el orden es: reordenar (lee capturas con `_SYNC` estable; las referencias `sr` se calculan con la VISTA fresca) → refrescar el enlace al final.
* **Testing**: `nivel1.test.js` fija el orden "reordenar → refrescar".

### Version 1.7.5l Altair — Powerhouse: Guardado en Paralelo y Picking tras Renombrar (Septiembre 2026) [PROD]
* **Bug: el producto renombrado perdía su posición de picking** (`guardarPowerhouseBatch`): el diálogo manda el orden con el nombre anterior; el servidor aplicaba el renombre y luego buscaba el rank con el nombre nuevo, y al no encontrarlo le asignaba su número de fila en MAESTRO. Ahora el rank se traduce por el mapa de renombres y un producto sin rank en la lista **conserva el suyo**.
* **Lentitud (1–2 min por guardado)**: el diálogo manda el producto completo en cada edición (incluido `activo` sin cambios), lo que disparaba `_ordenarYRenumerarTodo()` (reconstrucción de ambos Kardex) en **cada** guardado. Ahora solo cuenta lo que cambia de verdad: renombres → `_renombrarEnKardex()` (una escritura por Kardex); cambios reales de ACTIVO → ocultar/mostrar esa fila por nombre; la reconstrucción completa queda solo para altas.
* **Guardado en 2 fases con tiendas en paralelo (ALT-101)**: `powerhouseGuardarCatalogo(key, payload)` (con candado) y `powerhouseActualizarTienda(k)` (VISTA_MOVIL_k + push a la tienda k, sin candado global porque cada tienda toca hojas distintas). `PickingDialog.html` las orquesta con `Promise.all` (dos ejecuciones simultáneas) y muestra el tiempo de cada fase. `guardarPowerhouseBatch` queda como envoltorio secuencial de compatibilidad.
* **Testing**: `tests/suites/powerhouse.test.js` (renombre + picking, desactivación sin reconstruir, altas).

### Version 1.7.5k Altair — Acerca de con Versión Única y Estado del Sistema (Septiembre 2026) [PROD]
* **Versión única por libro**: `const MISE_VERSION` (BDG, PDA, PDM) alimenta `acercaDe()`; antes el texto estaba escrito a mano y mostraba `v1.5.0` (BDG) y `v1.6.0` (tiendas). Nueva suite `tests/suites/version.test.js` falla si la cabecera (línea 2) y `MISE_VERSION` divergen o si queda una versión literal en el diálogo.
* **`acercaDe()` = Acerca de + estado**: entorno (PROD/DEV), activadores (faltantes según `ACTIVADORES_ESPERADOS_BDG` / conteo en tiendas), conexiones por nombre (`_diagnosticarConexionesBDG` / `_diagnosticarConexionTienda`), estructura de tienda (`MISE_SCHEMA_VERSION` vs `MISE_SCHEMA_TIENDA`), último cierre nocturno (nueva propiedad `ULTIMO_CIERRE` escrita por `descontarSurtidoAutomatico`) o último reinicio diario (`LAST_AUTO_RESET_DATE`) y novedades de la versión (`MISE_NOVEDADES`).

### Version 1.7.5j Altair — Aviso de Conexión fuera de la Tabla y Estados Normalizados (Septiembre 2026) [PROD]
* **Bug heredado en `_actualizarAvisoPedido()` (`pda`, `pdm`, corre en cada `onOpen`)**: usaba `H4` como celda de aviso, pero `H4` es `CANT. RECIBIDA` del primer producto de la lista. Cada apertura la borraba y, sin enlace con Bodega, escribía "⚠️ CONECTAR BDG" en ella. El aviso pasa a `D2` (barra de acciones) y la tabla ya no se toca.
* **Estados normalizados al restaurar** (`_normalizarEstado`): cualquier variante (`✅ COMPLETO`, minúsculas, etc.) se guarda como `COMPLETO` / `PARCIAL` / `EXCEDENTE` / `INEXISTENTE`, que es lo que leen las reglas de color de PEDIDO DIARIO.
* **`📥 ENTRADAS`**: la fila 3 (línea de estado) muestra la instrucción cuando no hay un resultado reciente, en lugar de quedar en blanco.
* **Tooling (`ccb0c37`)**: `scripts/mise-env.js push prod` también exige `tests/run_all.js` en verde antes de subir (antes solo `push dev`); el emulador incorpora `Sheet.setRowHeights`.

### Version 1.7.5i Altair — Apertura de Libros Tolerante y Entradas Táctil (Septiembre 2026) [PROD]
* **Fix diagnóstico de conexión en tiendas**: `openByUrl` rechaza URLs que `IMPORTRANGE` sí acepta (`/u/0/`, `?usp=`, `#gid=`); el diagnóstico reportaba "No se pudo abrir el libro de Bodega" aunque el enlace funcionaba. Nuevo `_abrirLibro(ref)` (BDG, PDA, PDM) extrae el ID de cualquier formato y usa `openById`; el mensaje de error ahora incluye la causa real. Aplicado también a traspasos (tienda → Bodega), descuento nocturno y push (Bodega → tiendas).
* **`📥 ENTRADAS` táctil**: PRODUCTO 205 px con ajuste de texto y fuente 11, UNIDAD 40 px (2–3 caracteres), cantidades 72 px con fuente 12, filas de 38 px; los anchos se actualizan también en hojas ya creadas.
* **Testing**: formatos de URL en `nivel1.test.js`.

### Version 1.7.5h Altair — Hotfix: Celdas Combinadas vs Columnas Congeladas (Septiembre 2026) [PROD]
* **Hotfix `🚚 SURTIDO RÁPIDO` (`pda`, `pdm`)**: el encabezado combinaba `D1:H1`/`D2:H2` y la hoja congela `A:D`; Google rechaza congelar columnas que corten una celda combinada ("No se pueden inmovilizar columnas que solo contengan parte de una celda combinada"). La migración a esquema 2 falló en producción al regenerar el Surtido (respaldos intactos; queda pendiente de reintento). Ahora el encabezado se parte exactamente en la frontera (`A1:D1` | `E1:H1`, `A2:D2` | `E2:H2`) y antes se descongela y se deshacen las combinaciones del diseño previo (`breakApart`).
* **Hotfix `📥 ENTRADAS` (`bdg`)**: mismo conflicto (`A1:D1`/`A3:D3` combinadas con la columna A congelada). Solo se congelan filas; anchos ajustados a 390 px. Si una hoja quedó a medias por un intento previo, se reconstruye el encabezado completo.
* **Testing**: el emulador (`tests/mocks/gasMocks.js`) ahora valida celdas combinadas contra filas/columnas congeladas igual que Google Sheets; la suite de migración incluye el Surtido del diseño viejo con sus combinaciones (falla con `2b813a3`, pasa con el fix).

### Version 1.7.5g Altair — Configuración en un Clic, onEdit Instalable y Enlace Vivo (Septiembre 2026) [PROD]
* **Bug crítico de stock: el push de Bodega congelaba `_SYNC` en tiendas** (`sincronizarRemotamenteTiendasPush`): escribía la VISTA como valores fijos sobre `A4`, borrando el `IMPORTRANGE`; desde ese guardado de picking los saldos de la tienda dejaban de actualizarse (el autorreparador solo actuaba con `A4` vacía o en error). Ahora re-escribe la fórmula (rompe caché) y, si encuentra valores fijos, restaura el `IMPORTRANGE` hacia la VISTA de Bodega.
* **Autorreparación nocturna del enlace** (`_asegurarSyncVivo`, `pda`/`pdm`): el reset de las 00:00 restaura el `IMPORTRANGE` si `_SYNC` quedó con valores fijos.
* **`onEditBodegaInstalable`**: activador `onEdit` instalable (permisos de quien lo instala) que empuja a las tiendas al instante los cambios de ACTIVO en MAESTRO; el `onEdit` simple conserva la parte local.
* **`🚀 Configurar este libro`** (menú principal en los 3 libros): un clic ejecuta en orden y reporta cada paso —
  - Bodega: reinicio total de activadores (incluye el `onEdit` instalable), `📥 ENTRADAS`, vistas BA/BM, push a tiendas y diagnóstico de conexiones.
  - Tiendas: reinicio total de activadores, enlace vivo con Bodega, migración de estructura pendiente, orden de picking e inactivos y diagnóstico de conexión.
* **Diagnóstico de conexiones** (`_diagnosticarConexionesBDG`, `_diagnosticarConexionTienda`): muestra a qué libro apunta cada propiedad **por nombre**, marca nombres sospechosos (prueba, domingo, copia, staging) fuera de DEV y verifica que `_SYNC` esté enlazado en vivo.
* Núcleos silenciosos `_reiniciarActivadoresBDG` / `_reiniciarActivadoresTienda` reutilizados por el menú y por el configurador.
* **Testing**: `tests/suites/nivel1.test.js` (reinicio de activadores en BDG y tienda, push sin congelar `_SYNC` y des-congelado).

### Version 1.7.5f Altair — Enlaces por Producto: Picking Custom y Desactivación Correctos (Septiembre 2026) [PROD]
* **Bug: desactivar un producto apagaba OTRO en tiendas (`pda`, `pdm`)**: la regla de formato de inactivo y las 5 del semáforo de saldo usaban `INDIRECT("'_SYNC'!…" & ROW())`, que lee la misma POSICIÓN en `_SYNC`; con el pedido ordenado por picking esa fila es otro producto. Nuevas columnas auxiliares ocultas `L:O` (`_ACTIVO`, `_SALDO`, `_MÍN`, `_MÁX`) con una sola `ARRAYFORMULA` en `L4` que busca por NOMBRE (`VLOOKUP(C4:C, '_SYNC'!C4:K, {7,3,8,9})`); las reglas leen `$L4…$O4` de su propia fila (sin `INDIRECT`, sin volatilidad). Se auto-instala en `_aplicarFormatosCondicionales()` (reset nocturno, reordenamiento, reparación).
* **Bug: picking custom / ACTIVO de otro producto desde Bodega (`bdg`)**: `_buildVista()` calculaba la fila de MAESTRO como `kr - KARDEX_START + MAESTRO_START` (supone MAESTRO y KARDEX alineados fila a fila). Ahora usa un mapa por nombre (`_mapaFilasPorProducto`). Igual en `onEdit` de ACTIVO (ocultar en Kardex) y `anularProducto()`.
* **Bug: `anularProducto()`** usaba el diseño viejo de MAESTRO: buscaba el nombre en PRESENTACIÓN y escribía "NO" en la columna 7 (hoy `MÍN_BA`). Ahora usa el mapa de encabezados.
* **`onEdit` de ACTIVO en MAESTRO**: el push remoto a tiendas no tiene permisos en un `onEdit` simple y abortaba en silencio; ahora está aislado. Las tiendas pintan el inactivo al instante (vía `IMPORTRANGE` + columna `_ACTIVO`) y lo ocultan en el siguiente reordenamiento o reset nocturno.
* **Reconstrucción (`_reconstruirPedidoDiarioCore`) en orden de picking** (`_ordenPickingSync`): antes escribía en el orden de `_SYNC` y la migración/reparación perdía el orden custom.
* **Testing**: `tests/suites/vista.test.js` (reproduce el caso Ranch/Concentrado; falla con el código anterior) y casos de picking/inactivo en `migracion.test.js`.

### Version 1.7.5e Altair — Motor de Migración Automática de Estructura en Tiendas (Septiembre 2026) [PROD]
* **`_migrarEsquemaTienda()` (`pda`, `pdm`)**: versión de estructura en la propiedad `MISE_SCHEMA_VERSION` vs constante `MISE_SCHEMA_TIENDA` (= 2: DIFERENCIA intra-fila + Surtido con CANT. FINAL). Corre sola en los activadores nocturnos (`_resetearPedidoSilencioso` 00:00 y `_checkAutoResetNuevoDia` 04:00) detectando `e.triggerUid`; nunca en `onOpen` (límite 30 s).
* **Respaldo doble**: copia nativa oculta (`sheet.copyTo`) de `📋 PEDIDO DIARIO` y `🚚 SURTIDO RÁPIDO` como `_RESPALDO_*_v2` + capturas en RAM por nombre de producto (F pedir, H recibida, I estado, J adición; SURTIDO E/F/G con prioridad por ser captura directa).
* **Reintento seguro**: bandera `MISE_SCHEMA_MIGRANDO`; si una corrida falla, la siguiente toma las capturas del respaldo original y no de la hoja a medio reconstruir. Idempotente.
* **Verificación post-migración**: compara capturas respaldadas vs restauradas y registra en `🗒 LOG` las no restauradas y las de productos ya no vigentes.
* **Refactor**: `repararSistemaTienda()` delega en `_reconstruirPedidoDiarioCore()` (sin UI) y ahora respalda también ESTADO y ADICIÓN (antes se perdían al reparar). Menú: `🔄 Aplicar actualización de estructura pendiente`.
* **Reinicio total de activadores** (`instalarActivadoresNocturnosBDG`, `instalarActivadoresMedianochePDA/PDM`): borran TODOS los activadores del proyecto (viejos, duplicados, `sincronizarEstados` cada 10 min, funciones inexistentes) y crean exactamente el juego esperado — BDG: descuento diario 23:00 + mantenimiento domingo 23:00; tiendas: reset 00:00 + respaldo 04:00. Menú corregido (decía "23:00" en tiendas pero instalaba 00:00).
* **Testing**: `tests/suites/migracion.test.js` + helper `tests/mocks/tiendaVm.js` (estructura vieja con capturas, respaldo, restauración, idempotencia y reintento).

### Version 1.7.5d Altair — Sin Descuento Fantasma, Entradas Automáticas y Diagnóstico de Activadores (Septiembre 2026) [PROD]
* **Fix crítico en `MiseSmartSync` (`bdg/MiseKardexEngine.js`)**: eliminado el fallback `else if (cantPed > 0) cantDeducir = cantPed`. Si la tienda no registró recepción (sin cantidad, sin ✅, sin ❌) **no se descuenta nada**; el log remoto marca `SIN_REGISTRO` en lugar de `SURTIDO_AUTO`.
* **`_registrarLogSurtidoDiario()` homologado en PDA y PDM**: misma regla que el descuento (PDA registraba lo pedido como recibido con estado `PEDIDO`; PDM omitía filas). Ahora ambos registran todo lo pedido con la cantidad realmente recibida y estado `SIN_REGISTRO` cuando aplica.
* **`📥 ENTRADAS` automática**: se crea en `onOpen()` si falta y el cierre diario (`descontarSurtidoAutomatico`) la re-sincroniza con el catálogo conservando capturas; ya no requiere menú.
* **`diagnosticarActivadores()`**: lista los activadores instalados, faltantes y duplicados (menú Automatizaciones y `🗒 LOG`).
* **`scripts/mise-env.js push <env> <proyecto>`**: despliegue de un solo proyecto (`npm run push:prod:bdg`).

### Version 1.7.5c Altair — Surtido Rápido con CANT. FINAL y Coloreado por Fila (Septiembre 2026) [PROD]
* **Nueva columna H `CANT. FINAL` en `🚚 SURTIDO RÁPIDO` (`pda`, `pdm`)**: fórmula por fila `=IF($G=TRUE,0,IF($E<>"",$E,IF($F=TRUE,$D,"")))`. Es la fuente de verdad de lo recibido y no depende de que `onEdit()` inyecte valores (raíz del bug de fila pintada sin cantidad).
* **Una sola fuente activa por fila en `onEdit()`**: escribir en `CANT. RECIBIDA` (E) desmarca ✅/❌; marcar ✅ o ❌ limpia E y desmarca la otra casilla. Se conserva el sincronizado de `CANT. RECIBIDA`/`ESTADO` (H/I) en `📋 PEDIDO DIARIO` vía `_estadoRecepcion()`.
* **Coloreado de fila completa (A:H) según `CANT. FINAL` vs `CANT. PEDIDA`**: exacto (verde), no llegó = 0 (rojo), de menos (naranja), de más (azul), sin registrar (amarillo). Resumen reubicado a `J:K` con 5 conteos `SUMPRODUCT` sobre H.
* **Columnas congeladas A:D** (hasta `CANT. PEDIDA`); anchos ajustados para móvil (PRODUCTO 170 px, CANT. PEDIDA 70 px).
* **Bodega (`bdg/MiseKardexEngine.js`)**: el descuento lee 8 columnas del Surtido remoto y prioriza `CANT. FINAL` cuando trae número; conserva el doble candado anterior como respaldo para tiendas sin la columna.
* **Testing**: `tests/suites/surtido.test.js` ejecuta el código real de PDA y PDM en VM (estructura, fórmula, reglas de color, protección y captura/sincronizado).

### Version 1.7.5b Altair — Auto-Avance Semanal Confiable en ambos Kardex (Septiembre 2026) [PROD]
* **Candado reentrante en `_ejecutarAvanzarSemanaSilencioso()`**: usa `lock.hasLock()`; si el llamador (mantenimiento dominical) ya tiene el candado no lo re-adquiere ni lo libera. Devuelve `true/false`.
* **Sin avances fantasma en `_autoVerificarYAvanzarSemanaSilencioso()`**: antes, si `tryLock` fallaba, el avance se contaba como hecho y el bucle repetía hasta 4 veces sin avanzar. Ahora corta, registra `WARN` en `🗒 LOG` y devuelve el número real de bodegas avanzadas.
* **Presupuesto de tiempo en `onOpen()` (trigger simple de 30 s)**: tope de 18 s; si se agota tras Andares, Mercado se deja intacta para la siguiente corrida en lugar de quedar a medias (historial archivado sin mover `G4`).
* **`ejecutarMantenimientoSemanalBDG()`**: corregida la `ReferenceError` por `semanasAvanzadas` no declarada, que hacía terminar cada mantenimiento dominical en error.
* **Testing**: `tests/suites/semana.test.js` (candado del mantenimiento, candado ocupado, presupuesto de onOpen) + helper `tests/mocks/bdgVm.js`.

### Version 1.7.5a Altair — Hoja de Entradas Móvil hacia Kardex (Septiembre 2026) [PROD]
* **Nueva hoja persistente `📥 ENTRADAS` (`bdg/miseAuthBDG.js`)**:
  - Lista de productos activos en el orden del Kardex (A: PRODUCTO congelada, B: UNIDAD de Kardex, C: ENT ANDARES, D: ENT MERCADO). Captura en unidad de Kardex (kg, lt, pza), sin conversión.
  - Selector de día en `B2` con `HOY (automático)` por default más `LUN..DOM` con fechas de la semana activa (`KARDEX_BA!G4`). Tras cada envío regresa a HOY.
  - Checkbox `D2` "Enviar ➜" procesado en `onEdit()` (reset inmediato anti doble ejecución). Sin `toast`/`alert`: el resultado se escribe en `A3`, compatible con la app nativa de Sheets.
* **`procesarEntradasKardex()` — escritura atómica todo-o-nada**:
  - Valida todas las celdas (acepta coma decimal, rechaza negativos/texto marcándolos en rojo) y que cada producto exista en su Kardex antes de escribir.
  - Suma sobre la `ENT` existente del día (`col 10 + día×3`) con 1 lectura + 1 escritura por Kardex, redondeo a 4 decimales, `LockService` y registro en `🗒 LOG`.
  - Si HOY no pertenece a la semana activa del Kardex, bloquea el envío y pide avanzar semana (evita escribir en la columna de otra semana).
* **Menú**: `⚙️ Mise ➔ 📥 Preparar hoja de Entradas (móvil)` crea o re-sincroniza la hoja con el catálogo vigente.
* **Testing**: nueva suite `tests/suites/entradas.test.js` que ejecuta el código real de `miseAuthBDG.js` en VM (5 casos: generación, suma a HOY, día manual, todo-o-nada, semana vencida).

</details>

---

### Version 1.7.4 Altair — Conversión de Unidades Automática, Sistema de Traspasos Inter-Tiendas & Surtido Numérico Desacoplado (Septiembre 2026) [VERSIÓN FINAL EN PRODUCCIÓN GAS]
* **Desacoplamiento Total de Fórmulas en `CANT. RECIBIDA` (`pda/miseAuthPDA.js`, `pdm/miseAuthPDM.js`)**:
  - **Erradicación de Fórmulas Volátiles**: Eliminación total de la inyección de `=IF(G{row}=TRUE, 0, IF(F{row}=TRUE, D{row}, ""))` en la columna E de `🚚 SURTIDO RÁPIDO`.
  - **Captura Numérica Pura**: La columna E pasa a ser un campo numérico limpio que acepta valores custom (ej. 17 domos, 1.5 kg) sin que refrescos de página ni limpiezas accidentales restauren fórmulas corruptas.
  - **Event-Driven Checkbox Swapping**: Los checkboxes `✅ COMPLETO` (Col F) y `❌ INEXISTENTE` (Col G) ahora operan como interruptores directos en el evento `onEdit()`, inyectando la cantidad pedida o 0 numérico puro y sincronizando atómicamente con las columnas ocultas H e I de `📋 PEDIDO DIARIO`.
* **Módulo Automático de Conversión de Unidades (`bdg/miseAuthBDG.js`, `bdg/MiseKardexEngine.js`)**:
  - **Columnas Dinámicas en `MAESTRO`**: Incorporación y autodetección en `_asegurarColumnasQuioscoEnMaestro()` de `UNIDAD_TIENDA` (ej. `DOMO`, `CAJA`, `PAQ`) y `FACTOR_CONVERSION` (ej. `0.454` para Domo Fresa ➔ Kg; `100` para Caja Guantes ➔ Piezas).
  - **Normalización Automática en Kardex (`MiseSmartSync`)**: Al ejecutar el descuento diario (23:00 hrs) o la reconciliación por log, el motor calcula la deducción real con precisión milimétrica: `cantDeducirKardex = Math.round(cantDeducir * factor * 1000) / 1000`.
  - **Cero Cálculo Mental en Tienda**: Las tiendas piden en unidades de uso de mostrador (12 domos) y Bodega deduce la masa neta real en Kardex (5.448 kg) sin requerir conversiones manuales.
* **Sistema de Traspasos Inter-Tiendas Mobile-First (Andares ⇄ Mercado) (`bdg`, `pda`, `pdm`)**:
  - **Arquitectura Híbrida Distribuida**: El encargado de tienda registra el traspaso directamente desde su celular mediante un modal Crystal & Squircle táctil (`TraspasoTiendaDialog.html`), mientras que el libro mayor autoritativo se centraliza en la hoja `🔄 TRASPASOS` en Bodega General.
  - **Transacción Atómica Simétrica en Kardex (`MiseTraspasos.registrar()`)**: Descuenta en tiempo real la salida en el Kardex de la tienda que entrega y acredita la entrada en el Kardex de la tienda que recibe en la columna del día activo (`ENT` / `SAL`), generando un folio inmutable `TRP-YYYYMMDD-HHmmss`.
* **Diálogo Crystal & Squircle para Bodega (`bdg/TraspasoDialog.html`)**:
* **Blindaje Esencial, Cuarentena de Menús y Visibilidad de Unidad en Móvil (`pda`, `pdm`, `bdg`)**:
  - **Cuarentena de Acciones Críticas en Menús**: Reorganización de `onOpen()` aislando funciones destructivas (`setupCompleto`), reseteos manuales y herramientas de simulación bajo el submenú restringido `⚠️ Mantenimiento Avanzado y Zona de Riesgo`. La superficie visible para tiendas queda reducida a acciones operativas directas (Surtido Rápido, Traspasos, Picking y Sincronización).
  - **Visibilidad Mandatoria de Unidad en Tienda**: Corrección en `_aplicarOcultamientoColumnas()` para mostrar permanentemente la Columna D (`UNIDAD TIENDA`) junto a Columna C (`PRODUCTO`) y Columna F (`CANT. A PEDIR`). La Columna E (`SALDO TEÓRICO`) se mantiene oculta para evitar lag de recálculo en la app móvil.
  - **Anchos Táctiles Calibrados**: Ajuste ergonómico de columnas en móvil (Col C: 240px, Col D: 75px, Col F: 115px) permitiendo lectura clara de unidades de mostrador (Domo, Caja, Kg) en pantallas pequeñas.
* **Blindaje de Adiciones en Surtido y Doble Candado de Deducción (`pda`, `pdm`, `bdg`)**:
  - **Gestión Quirúrgica de Adiciones en O(1)**: En `onEdit()`, la edición de la columna F en Pedido Diario ya no borra ni reconstruye ciegamente la hoja de Surtido Rápido. Si el producto ya estaba en la lista, se actualiza directamente su celda en milisegundos; solo se regenera la hoja cuando se detecta un insumo nuevo para respetar la secuencia de picking.
  - **Escrituras Atómicas en Lote (Anti-Timeout)**: Sustitución de 5 llamadas remotas `.setValue()` por 2 escrituras continuas en bloque (`getRange(row, 5, 1, 3)` y `getRange(rowInPedido, 8, 1, 2)`), erradicando el bug de celdas no inyectadas por saturación de red.
  - **Doble Candado de Ground Truth en Bodega**: El motor de descuento lee directamente la pestaña de Surtido Rápido de la tienda. Si la celda numérica quedó vacía por fallo de script pero el checkbox `COMPLETO` está activo, Bodega deduce la cantidad pedida. Si se marca `INEXISTENTE`, deduce exactamente 0.

### Version 1.7.3 Altair — Optimización Sheets Turbo Sub-Second, Erradicación de VLOOKUP y Blindaje Horario 23:00 hrs (Septiembre 2026)
* **Erradicación de 858 Evaluaciones Volátiles de Formato Condicional (`pda/miseAuthPDA.js`, `pdm/miseAuthPDM.js`)**:
  - **Diagnóstico de Causa Raíz**: La función `_aplicarFormatosCondicionales()` inyectaba 5 reglas condicionales basadas en `INDIRECT("'🚚 SURTIDO RÁPIDO'!C:G")` con `VLOOKUP`. Con 143 filas por tienda, cada pulsación táctil en la app móvil de Google Sheets disparaba 858 escaneos de rangos externos, provocando congelamientos de 1.2 a 2.0 segundos.
  - **Refactorización Determinista O(1)**: Sustitución total de las fórmulas indirectas por lecturas atómicas de la celda de estado local en Columna I (`COL_ESTADO`):
    - `ruleCompleto`: `=$I4="COMPLETO"` (Verde pastel `#E8F5E9`)
    - `ruleInexistente`: `=$I4="INEXISTENTE"` (Rojo suave `#FFEBEE`)
    - `ruleParcial`: `=$I4="PARCIAL"` (Naranja `#FFF3E0`)
    - `ruleExcedente`: `=$I4="EXCEDENTE"` (Azul claro `#E1F5FE`)
    - `rulePendiente`: `=AND($F4>0, $I4="")` (Amarillo suave)
    - `ruleInactivo`: `=INDIRECT("'${SHEET_SYNC}'!$I" & ROW())="NO"`
  - **Resultado**: Cero lag táctil en dispositivos iOS y Android.
* **Eliminación de `VLOOKUP` Cruzado en Columna G (`DIFERENCIA`) (`pda`, `pdm`, `bdg`)**:
  - Sustitución de la fórmula legada `=IF(F4="", "", IFERROR(VLOOKUP(C4, '🚚 SURTIDO RÁPIDO'!C:E, 3, FALSE), 0) - F4)` por la fórmula intra-fila:  
    `=IF(OR(F4="", H4=""), "", H4 - F4)`.
  - Aprovecha la columna H (`COL_RECIBIDA`) que ya es actualizada en tiempo real por el evento `onEdit()` de la hoja de surtido rápido.
  - Reducción del tiempo de evaluación por celda de ~15 ms a **0.0001 ms**.
* **Matriz Rectangular 2D Unificada en Llamadas RPC (`_setupSync()` y `sincronizarConCatalogo()`)**:
  - Sustitución del patrón fragmentado de 8 a 10 llamadas remotas `.setValues()` y `.setFormulas()` por columna individual por un arreglo 2D unificado (`outputGrid`).
  - Reducción de latencia de red de Google Cloud RPC de ~1,800 ms a **<100 ms**.
* **Blindaje de Horarios Nocturnos a las 23:00 hrs (`bdg/miseAuthBDG.js`)**:
  - Reubicación de los activadores basados en tiempo `descontarSurtidoAutomatico()` y `ejecutarMantenimientoSemanalBDG()` desde las 00:00 / 01:00 AM hacia las **23:00 hrs del día en curso**.
  - Eliminación de la condición de carrera (*race condition*) que borraba los pedidos diarios de las tiendas antes de que Bodega General ejecutara el descuento.
  - Corrección del bug de sellado temporal matutino en `pda` y `pdm` para evitar registrar transacciones con la fecha del día siguiente.
* **Módulo de Reconciliación Determinista de Lunes 07 de Septiembre (`bdg/MiseKardexEngine.js`)**:
  - Implementación de `reconciliarLunes7Septiembre()` para recuperar los 49 insumos de Andares y 2 de Mercado desde `🗒 LOG_SURTIDO` directamente a la Columna 11 (`SAL LUN`) de `KARDEX_BA` y `KARDEX_BM` en una sola llamada Batch 2D.
  - Adición de disparador manual en menú de interfaz:  
    `⚙️ Mise ➔ 🧪 Automatizaciones Autónomas ➔ ⚡ Reconciliar directamente salidas del Lunes 07 de Septiembre`.
* **Corrección de Excepción por Celdas Combinadas en Plantilla (`bdg/miseAuthBDG.js`)**:
  - Corrección de `setFrozenColumns(4)` en `prepararPlantillaRecuperacionSemana()`, solventando la colisión con la cabecera combinada `A1:K1`.
* **Despliegue y Validación**:
  - Validación sintáctica al 100% mediante `node -c` (0 errores).
  - Sincronización a producción vía `clasp push` en los 3 proyectos (`bdg`, `pda`, `pdm`).

### Version 1.7.2 Altair — Blindaje de Seguridad Integral, Motor Matemático de Alias & Reconstrucción Resiliente (Agosto 2026)
* **Blindaje Estructural en Hojas de Inventario**:
  - `MAESTRO`, `KARDEX_BA` y `KARDEX_BM` protegidas a nivel rango y hoja contra alteraciones estructurales, preservando la editabilidad de casillas y celdas de Entrada (`ENT`) y Salida (`SAL`).
  - `📋 PEDIDO DIARIO` (PDA / PDM): Protección estricta dejando editables únicamente la celda táctil `F2` (Surtido Rápido) y la columna `CANT. A PEDIR` (Columna F).
  - `🚚 SURTIDO RÁPIDO`: Protección estricta limitando la captura a `CANT. RECIBIDA` (Columna E) y checkboxes de estado `✅ COMPLETO` / `❌ INEXISTENTE` (Columnas F y G).
* **Motor Matemático de Reconciliación (`MiseMatchingEngine`)**:
  - Algoritmo de normalización de cadenas, n-gramas y token-sort ratio para emparejar automáticamente alias de insumos, gramajes y marcas (`.450`, `1 kg`, etc.) contra el catálogo oficial sin listas fijas.
  - Derivación segura de insumos dudosos a la hoja de telemetría `⚠️ REVISIÓN_HUÉRFANOS`.
* **Reconciliador Asistido Visual (Modal HTML)**:
  - Interfaz gráfica en Google Apps Script (`⚙️ Mise > 📊 Mantenimiento y Blindaje > 🧠 Reconciliador Inteligente de Huérfanos`) con previsualización de porcentajes de coincidencia y guardado permanente en `_DICCIONARIO_ALIAS`.
* **Reconstructores Resilientes con Respaldo en RAM**:
  - Rutinas `reconstruirKardexBA()`, `reconstruirKardexBM()` y `reconstruirMaestro()` que respaldan matrices de inventario en memoria V8, purgan columnas huérfanas y reconstruyen la cuadrícula limpia.
* **Idempotencia y SmartSync Nocturno**:
  - Deducción nocturna protegida contra doble cobro mediante registro transaccional único y corrección de la ventana de medianoche (01:00 AM).

### Version 1.7.1 Altair — Concurrencia Multi-Hilo, Batch I/O Extremo & Zoom Crystal (Agosto 2026)
* **Arquitectura Concurrente Multi-Hilo (`Promise.all`)**:
  - Descomposición en 5 micro-servicios paralelos en contenedores V8 independientes (`workerGuardarMaestro`, `workerSyncKardexYVista` BA/BM, `workerPushTiendaRemota` BA/BM), reduciendo el guardado de 68s a **~3 a 10 segundos**.
* **Consolidación Batch I/O de 1 Sola Llamada**:
  - Reescritura matricial unificada reduciendo guardado de catálogo de **103 segundos a <2.5 segundos** y vaciado automático de tabla de altas.
* **UI Polishing & Zoom Crystal (`PickingDialog.html`)**:
  - Zoom persistente en `localStorage` (100%, 115% Normal, 130%, 145%), cabecera sin títulos redundantes e inputs numéricos sin spinners nativos.

### Version 1.7.0 Altair — Mise Powerhouse: Suite Unificada de Catálogo & Picking (Agosto 2026)
* **Suite Unificada Powerhouse (`PickingDialog.html`)**:
  - Diálogo modal desacoplado de 1050×700px con estética *Crystal Squircle*: Secuencia de picking con drag & drop (SortableJS), Alta en Lote sin pestañas temporales, Edición Rápida en caliente y escáner de duplicados.
* **Backend Atómico y Push Remoto**:
  - Endpoints `obtenerDatosPowerhouse` y `guardarPowerhouseBatch` con `LockService` y reordenamiento push en caliente a hojas remotas de tienda.

### Version 1.6.0 - Version 1.6.4 Altair — Sincronización Remota de Picking y Captura Rápida en PC (Agosto 2026)
* **Reacomodo de Picking 100% Automático en Tiendas**: Propagación atómica del orden de surtido desde Bodega hacia las hojas satélite de Pedido Diario en PDA y PDM.
* **Registro Rápido en PC (`RegistroRapidoDialog.html`)**: Modal con atajo de teclado (`Ctrl + Shift + F`) y autocompletado para capturar Entradas y Salidas sin desplazamiento horizontal.
* **Depuración Visual**: Eliminación definitiva de columnas obsoletas de caducidad en el Kardex para acercar los semáforos de stock al nombre del insumo.

### Version 1.3.0 - Version 1.5.0 Altair — Cimientos del Motor Hub-and-Spoke (Julio - Agosto 2026)
* **Protocolo de Sincronización `_SYNC` (Rango A4:L)**: Enlace de 12 columnas desacoplado para importar saldos y catálogo maestro mediante `IMPORTRANGE`.
* **Estructuración Mobile-First**: Adaptación de las hojas de tienda para captura táctil desde teléfonos móviles, minimizando recálculos pesados.

