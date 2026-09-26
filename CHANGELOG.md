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

## Época Altair (v1.0.0 - v1.7.4) [MOTOR GOOGLE APPS SCRIPT V8]

Representa la era fundacional y de optimizaciones sub-segundo del motor sobre Google Sheets y Google Apps Script V8, culminando en la suite desacoplada de picking, concurrencia, reconciliación inteligente y logística peer-to-peer.

### Version 1.7.5c Altair — Surtido Rápido con CANT. FINAL y Coloreado por Fila (Septiembre 2026) [EN PRUEBAS · DEV]
* **Nueva columna H `CANT. FINAL` en `🚚 SURTIDO RÁPIDO` (`pda`, `pdm`)**: fórmula por fila `=IF($G=TRUE,0,IF($E<>"",$E,IF($F=TRUE,$D,"")))`. Es la fuente de verdad de lo recibido y no depende de que `onEdit()` inyecte valores (raíz del bug de fila pintada sin cantidad).
* **Una sola fuente activa por fila en `onEdit()`**: escribir en `CANT. RECIBIDA` (E) desmarca ✅/❌; marcar ✅ o ❌ limpia E y desmarca la otra casilla. Se conserva el sincronizado de `CANT. RECIBIDA`/`ESTADO` (H/I) en `📋 PEDIDO DIARIO` vía `_estadoRecepcion()`.
* **Coloreado de fila completa (A:H) según `CANT. FINAL` vs `CANT. PEDIDA`**: exacto (verde), no llegó = 0 (rojo), de menos (naranja), de más (azul), sin registrar (amarillo). Resumen reubicado a `J:K` con 5 conteos `SUMPRODUCT` sobre H.
* **Columnas congeladas A:D** (hasta `CANT. PEDIDA`); anchos ajustados para móvil (PRODUCTO 170 px, CANT. PEDIDA 70 px).
* **Bodega (`bdg/MiseKardexEngine.js`)**: el descuento lee 8 columnas del Surtido remoto y prioriza `CANT. FINAL` cuando trae número; conserva el doble candado anterior como respaldo para tiendas sin la columna.
* **Testing**: `tests/suites/surtido.test.js` ejecuta el código real de PDA y PDM en VM (estructura, fórmula, reglas de color, protección y captura/sincronizado).

### Version 1.7.5b Altair — Auto-Avance Semanal Confiable en ambos Kardex (Septiembre 2026) [EN PRUEBAS · SOLO BDG]
* **Candado reentrante en `_ejecutarAvanzarSemanaSilencioso()`**: usa `lock.hasLock()`; si el llamador (mantenimiento dominical) ya tiene el candado no lo re-adquiere ni lo libera. Devuelve `true/false`.
* **Sin avances fantasma en `_autoVerificarYAvanzarSemanaSilencioso()`**: antes, si `tryLock` fallaba, el avance se contaba como hecho y el bucle repetía hasta 4 veces sin avanzar. Ahora corta, registra `WARN` en `🗒 LOG` y devuelve el número real de bodegas avanzadas.
* **Presupuesto de tiempo en `onOpen()` (trigger simple de 30 s)**: tope de 18 s; si se agota tras Andares, Mercado se deja intacta para la siguiente corrida en lugar de quedar a medias (historial archivado sin mover `G4`).
* **`ejecutarMantenimientoSemanalBDG()`**: corregida la `ReferenceError` por `semanasAvanzadas` no declarada, que hacía terminar cada mantenimiento dominical en error.
* **Testing**: `tests/suites/semana.test.js` (candado del mantenimiento, candado ocupado, presupuesto de onOpen) + helper `tests/mocks/bdgVm.js`.

### Version 1.7.5a Altair — Hoja de Entradas Móvil hacia Kardex (Septiembre 2026) [EN PRUEBAS · SOLO BDG]
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

